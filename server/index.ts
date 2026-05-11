import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase, resolveDbPath } from './db.js';
import SqliteSessionStore from './session-store.js';
import { csvEscape, isIsoDate, normalizeAccount, normalizeType, validateTransactionsCsv } from './csv.js';
import type { AccountRow, AccountType, AppDb, AuthUser, ChildRow, TransactionRow, TransactionType, UserRow } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const CSRF_HEADER = 'x-csrf-token';
const CSRF_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface CreateAppOptions {
  db?: AppDb;
  staticDir?: string;
  uploadDir?: string;
}

interface TransactionInput {
  account?: unknown;
  type?: unknown;
  amountOre?: unknown;
  date?: unknown;
  comment?: unknown;
}

export function createApp(options: CreateAppOptions = {}): express.Express {
  const db = options.db || createDatabase();
  const app = express();
  const uploadDir = options.uploadDir || process.env.UPLOAD_DIR || path.resolve(path.dirname(resolveDbPath()), 'uploads');

  app.disable('x-powered-by');
  app.use(express.json({ limit: '10mb' }));
  app.use(
    session({
      secret: resolveSessionSecret(),
      store: new SqliteSessionStore(db),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        maxAge: SESSION_MAX_AGE_MS,
      },
    })
  );

  app.use((req, res, next) => {
    if (!CSRF_METHODS.has(req.method)) return next();
    const sessionToken = req.session.csrfToken;
    const headerToken = req.get(CSRF_HEADER);
    if (!sessionToken || !headerToken || sessionToken !== headerToken) {
      return res.status(403).json({ error: 'Ogiltig CSRF-token' });
    }
    return next();
  });

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/csrf', (req, res) => {
    const csrfToken = getCsrfToken(req);
    req.session.save((error) => {
      if (error) return res.status(500).json({ error: 'Kunde inte skapa CSRF-token' });
      return res.json({ csrfToken });
    });
  });
  app.get('/api/setup/status', (_req, res) => res.json({ needsSetup: needsSetup(db) }));

  app.post('/api/setup', async (req, res) => {
    if (!needsSetup(db)) return res.status(409).json({ error: 'Appen är redan konfigurerad' });
    const username = cleanText(req.body?.username);
    const password = String(req.body?.password || '');
    const validation = validateCredentials(username, password);
    if (validation) return res.status(400).json({ error: validation });

    const now = nowIso();
    const hash = await bcrypt.hash(password, 10);
    const result = db
      .prepare('INSERT INTO users (username, password_hash, role, child_id, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)')
      .run(username, hash, 'parent', now, now);
    req.session.userId = Number(result.lastInsertRowid);
    return res.status(201).json({ user: currentUser(db, req) });
  });

  app.post('/api/auth/login', async (req, res) => {
    const username = cleanText(req.body?.username);
    const password = String(req.body?.password || '');
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get<UserRow>(username);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Fel användarnamn eller lösenord' });
    }
    req.session.userId = user.id;
    return res.json({ user: toAuthUser(user), csrfToken: getCsrfToken(req) });
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => res.status(204).end());
  });

  app.get('/api/auth/me', (req, res) => {
    res.json({ user: currentUser(db, req), csrfToken: getCsrfToken(req) });
  });

  app.post('/api/auth/change-password', requireUser(db), async (req, res) => {
    const user = requireCurrentUser(db, req);
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
      return res.status(400).json({ error: 'Nuvarande lösenord stämmer inte' });
    }
    if (newPassword.length < 8) return res.status(400).json({ error: 'Nytt lösenord måste vara minst 8 tecken' });
    const hash = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, nowIso(), user.id);
    return res.status(204).end();
  });

  app.get('/api/children', requireUser(db), (req, res) => {
    const user = requireCurrentUser(db, req);
    const children =
      user.role === 'parent'
        ? db.prepare('SELECT * FROM children ORDER BY name COLLATE NOCASE').all<ChildRow>()
        : db.prepare('SELECT * FROM children WHERE id = ?').all<ChildRow>(user.child_id);
    return res.json({ children: children.map((child) => buildChildSummary(db, child)) });
  });

  app.post('/api/children', requireParent(db), (req, res) => {
    const name = cleanText(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Namn krävs' });
    const now = nowIso();
    const result = db.prepare('INSERT INTO children (name, photo_url, created_at, updated_at) VALUES (?, NULL, ?, ?)').run(name, now, now);
    const childId = Number(result.lastInsertRowid);
    db.prepare('INSERT INTO accounts (child_id, type, created_at) VALUES (?, ?, ?)').run(childId, 'cash', now);
    db.prepare('INSERT INTO accounts (child_id, type, created_at) VALUES (?, ?, ?)').run(childId, 'fund', now);
    const child = db.prepare('SELECT * FROM children WHERE id = ?').get<ChildRow>(childId);
    return res.status(201).json({ child: buildChildSummary(db, must(child)) });
  });

  app.patch('/api/children/:id', requireParent(db), (req, res) => {
    const child = findChild(db, paramId(req.params.id));
    if (!child) return res.status(404).json({ error: 'Barn hittades inte' });
    const name = cleanText(req.body?.name);
    const photoUrl = nullableText(req.body?.photoUrl);
    if (!name) return res.status(400).json({ error: 'Namn krävs' });
    db.prepare('UPDATE children SET name = ?, photo_url = ?, updated_at = ? WHERE id = ?').run(name, photoUrl, nowIso(), child.id);
    const updated = db.prepare('SELECT * FROM children WHERE id = ?').get<ChildRow>(child.id);
    return res.json({ child: buildChildSummary(db, must(updated)) });
  });

  app.post('/api/children/:id/photo', requireParent(db), (req, res) => {
    const child = findChild(db, paramId(req.params.id));
    if (!child) return res.status(404).json({ error: 'Barn hittades inte' });
    const photoUrl = savePhoto(uploadDir, child.id, req.body?.photoDataUrl) || nullableText(req.body?.photoUrl);
    db.prepare('UPDATE children SET photo_url = ?, updated_at = ? WHERE id = ?').run(photoUrl, nowIso(), child.id);
    const updated = db.prepare('SELECT * FROM children WHERE id = ?').get<ChildRow>(child.id);
    return res.json({ child: buildChildSummary(db, must(updated)) });
  });

  app.post('/api/children/:id/login', requireParent(db), async (req, res) => {
    const child = findChild(db, paramId(req.params.id));
    if (!child) return res.status(404).json({ error: 'Barn hittades inte' });
    const username = cleanText(req.body?.username);
    const password = String(req.body?.password || '');
    const validation = validateCredentials(username, password);
    if (validation) return res.status(400).json({ error: validation });
    const existing = db.prepare('SELECT * FROM users WHERE child_id = ? AND role = ?').get<UserRow>(child.id, 'child');
    const usernameOwner = db.prepare('SELECT * FROM users WHERE username = ?').get<UserRow>(username);
    if (usernameOwner && usernameOwner.id !== existing?.id) return res.status(409).json({ error: 'Användarnamnet används redan' });
    const hash = await bcrypt.hash(password, 10);
    const now = nowIso();
    if (existing) {
      db.prepare('UPDATE users SET username = ?, password_hash = ?, updated_at = ? WHERE id = ?').run(username, hash, now, existing.id);
    } else {
      db.prepare('INSERT INTO users (username, password_hash, role, child_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        username,
        hash,
        'child',
        child.id,
        now,
        now
      );
    }
    const user = db.prepare('SELECT * FROM users WHERE child_id = ? AND role = ?').get<UserRow>(child.id, 'child');
    return res.status(201).json({ childLogin: toAuthUser(must(user)) });
  });

  app.get('/api/children/:id/transactions', requireUser(db), (req, res) => {
    const user = requireCurrentUser(db, req);
    const child = findChild(db, paramId(req.params.id));
    if (!child) return res.status(404).json({ error: 'Barn hittades inte' });
    if (!canAccessChild(user, child.id)) return res.status(403).json({ error: 'Åtkomst nekad' });
    const account = req.query.account ? normalizeAccount(req.query.account) : null;
    if (req.query.account && !account) return res.status(400).json({ error: 'Ogiltig kontotyp' });
    return res.json({ transactions: listTransactions(db, child.id, account) });
  });

  app.post('/api/children/:id/transactions', requireParent(db), (req, res) => {
    const child = findChild(db, paramId(req.params.id));
    if (!child) return res.status(404).json({ error: 'Barn hittades inte' });
    const validation = validateTransactionInput(db, child.id, req.body);
    if ('error' in validation) return res.status(400).json({ error: validation.error });
    const now = nowIso();
    const result = db
      .prepare(
        `INSERT INTO transactions (account_id, type, amount_ore, date, comment, created_by_user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(validation.account.id, validation.type, validation.amountOre, validation.date, validation.comment, requireCurrentUser(db, req).id, now, now);
    return res.status(201).json({ transaction: getTransaction(db, Number(result.lastInsertRowid)) });
  });

  app.patch('/api/transactions/:id', requireParent(db), (req, res) => {
    const existing = getTransaction(db, Number(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Transaktion hittades inte' });
    const validation = validateTransactionInput(db, existing.child_id, req.body);
    if ('error' in validation) return res.status(400).json({ error: validation.error });
    db.prepare('UPDATE transactions SET account_id = ?, type = ?, amount_ore = ?, date = ?, comment = ?, updated_at = ? WHERE id = ?').run(
      validation.account.id,
      validation.type,
      validation.amountOre,
      validation.date,
      validation.comment,
      nowIso(),
      existing.id
    );
    return res.json({ transaction: getTransaction(db, existing.id) });
  });

  app.delete('/api/transactions/:id', requireParent(db), (req, res) => {
    const result = db.prepare('DELETE FROM transactions WHERE id = ?').run(Number(req.params.id));
    if (!result.changes) return res.status(404).json({ error: 'Transaktion hittades inte' });
    return res.status(204).end();
  });

  app.get('/api/export.json', requireParent(db), (_req, res) => {
    const children = db.prepare('SELECT * FROM children ORDER BY name COLLATE NOCASE').all<ChildRow>();
    res.json({
      version: 1,
      exportedAt: nowIso(),
      children: children.map((child) => ({
        ...buildChildSummary(db, child),
        transactions: listTransactions(db, child.id, null),
      })),
    });
  });

  app.get('/api/export/transactions.csv', requireParent(db), (_req, res) => {
    const rows = [['childId', 'childName', 'account', 'type', 'amountOre', 'date', 'comment'].join(',')];
    const children = db.prepare('SELECT id, name FROM children ORDER BY name COLLATE NOCASE').all<{ id: number; name: string }>();
    for (const child of children) {
      for (const tx of listTransactions(db, child.id, null)) {
        rows.push([child.id, child.name, tx.account_type, tx.type, tx.amount_ore, tx.date, tx.comment].map(csvEscape).join(','));
      }
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="piggy-bank-transaktioner.csv"');
    res.send(rows.join('\n'));
  });

  app.post('/api/import/transactions/validate', requireParent(db), (req, res) => {
    const validation = validateTransactionsCsv(db, String(req.body?.csv || ''));
    res.json({ imported: validation.validRows.length, errors: validation.errors, rows: validation.validRows });
  });

  app.post('/api/import/transactions/commit', requireParent(db), (req, res) => {
    const validation = validateTransactionsCsv(db, String(req.body?.csv || ''));
    if (validation.errors.length) return res.status(400).json({ imported: 0, errors: validation.errors });
    const user = requireCurrentUser(db, req);
    const insert = db.prepare(
      `INSERT INTO transactions (account_id, type, amount_ore, date, comment, created_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    db.exec('BEGIN;');
    try {
      for (const row of validation.validRows) {
        const account = findAccount(db, row.childId, row.account);
        if (!account) throw new Error(`Konto saknas för rad ${row.row}`);
        const now = nowIso();
        insert.run(account.id, row.type, row.amountOre, row.date, row.comment, user.id, now, now);
      }
      db.exec('COMMIT;');
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }
    res.json({ imported: validation.validRows.length, errors: [] });
  });

  fs.mkdirSync(uploadDir, { recursive: true });
  app.use('/uploads', express.static(uploadDir));
  const staticDir = options.staticDir ?? path.resolve(__dirname, '..', '..', 'dist');
  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(error);
    const message = error instanceof Error ? error.message : 'Oväntat fel';
    return res.status(500).json({ error: message });
  });

  return app;
}

function requireUser(db: AppDb) {
  return (req: Request, res: Response, next: () => void) => {
    if (!currentUser(db, req)) return res.status(401).json({ error: 'Ej inloggad' });
    return next();
  };
}

function requireParent(db: AppDb) {
  return (req: Request, res: Response, next: () => void) => {
    const user = currentUser(db, req);
    if (!user) return res.status(401).json({ error: 'Ej inloggad' });
    if (user.role !== 'parent') return res.status(403).json({ error: 'Endast förälder' });
    return next();
  };
}

function validateTransactionInput(db: AppDb, childId: number, body: TransactionInput):
  | { account: AccountRow; type: TransactionType; amountOre: number; date: string; comment: string }
  | { error: string } {
  const accountType = normalizeAccount(body.account);
  const type = normalizeType(body.type);
  const amountOre = Number(body.amountOre);
  const date = cleanText(body.date);
  const comment = cleanText(body.comment);
  if (!accountType) return { error: 'Ogiltig kontotyp' };
  if (!type) return { error: 'Ogiltig transaktionstyp' };
  if (!Number.isInteger(amountOre) || amountOre <= 0) return { error: 'Belopp i öre måste vara ett positivt heltal' };
  if (!isIsoDate(date)) return { error: 'Datum måste vara YYYY-MM-DD' };
  if (!comment) return { error: 'Kommentar krävs' };
  const account = findAccount(db, childId, accountType);
  if (!account) return { error: 'Konto hittades inte' };
  return { account, type, amountOre, date, comment };
}

function buildChildSummary(db: AppDb, child: ChildRow) {
  const balances = db
    .prepare(
      `SELECT a.type AS account_type,
              COALESCE(SUM(CASE WHEN t.type = 'deposit' THEN t.amount_ore ELSE -t.amount_ore END), 0) AS balance_ore
       FROM accounts a
       LEFT JOIN transactions t ON t.account_id = a.id
       WHERE a.child_id = ?
       GROUP BY a.type`
    )
    .all<{ account_type: AccountType; balance_ore: number }>(child.id);
  const byType = new Map(balances.map((row) => [row.account_type, row.balance_ore]));
  const childLogin = db
    .prepare('SELECT id, username, role, child_id, created_at, updated_at, password_hash FROM users WHERE child_id = ? AND role = ?')
    .get<UserRow>(child.id, 'child');
  return {
    id: child.id,
    name: child.name,
    photoUrl: child.photo_url,
    cashBalanceOre: byType.get('cash') || 0,
    fundBalanceOre: byType.get('fund') || 0,
    childLogin: childLogin ? toAuthUser(childLogin) : null,
  };
}

function listTransactions(db: AppDb, childId: number, accountType: AccountType | null): TransactionRow[] {
  const sql = `
    SELECT t.id,
           t.account_id,
           a.child_id,
           a.type AS account_type,
           t.type,
           t.amount_ore,
           t.date,
           t.comment,
           t.created_by_user_id,
           t.created_at,
           t.updated_at
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE a.child_id = ?
    ${accountType ? 'AND a.type = ?' : ''}
    ORDER BY t.date DESC, t.id DESC`;
  return accountType ? db.prepare(sql).all<TransactionRow>(childId, accountType) : db.prepare(sql).all<TransactionRow>(childId);
}

function getTransaction(db: AppDb, id: number): TransactionRow | undefined {
  return db
    .prepare(
      `SELECT t.id,
              t.account_id,
              a.child_id,
              a.type AS account_type,
              t.type,
              t.amount_ore,
              t.date,
              t.comment,
              t.created_by_user_id,
              t.created_at,
              t.updated_at
       FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       WHERE t.id = ?`
    )
    .get<TransactionRow>(id);
}

function findAccount(db: AppDb, childId: number, type: AccountType): AccountRow | undefined {
  return db.prepare('SELECT * FROM accounts WHERE child_id = ? AND type = ?').get<AccountRow>(childId, type);
}

function findChild(db: AppDb, id: string | number): ChildRow | undefined {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) return undefined;
  return db.prepare('SELECT * FROM children WHERE id = ?').get<ChildRow>(numericId);
}

function currentUser(db: AppDb, req: Request): AuthUser | null {
  if (!req.session.userId) return null;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get<UserRow>(req.session.userId);
  return user ? toAuthUser(user) : null;
}

function requireCurrentUser(db: AppDb, req: Request): UserRow {
  const userId = req.session.userId;
  if (!userId) throw new Error('Ej inloggad');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get<UserRow>(userId);
  return must(user);
}

function toAuthUser(user: UserRow): AuthUser {
  return { id: user.id, username: user.username, role: user.role, childId: user.child_id };
}

function canAccessChild(user: UserRow, childId: number): boolean {
  return user.role === 'parent' || user.child_id === childId;
}

function needsSetup(db: AppDb): boolean {
  const row = db.prepare('SELECT COUNT(*) AS count FROM users WHERE role = ?').get<{ count: number }>('parent');
  return !row || row.count === 0;
}

function validateCredentials(username: string, password: string): string | null {
  if (!username || username.length < 3) return 'Användarnamn måste vara minst 3 tecken';
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) return 'Användarnamn får bara innehålla bokstäver, siffror, punkt, bindestreck och understreck';
  if (password.length < 8) return 'Lösenord måste vara minst 8 tecken';
  return null;
}

function getCsrfToken(req: Request): string {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  return req.session.csrfToken;
}

function resolveSessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const dbPath = resolveDbPath();
  const secretPath = path.join(path.dirname(dbPath), '.piggy-bank-session-secret');
  try {
    const existing = fs.readFileSync(secretPath, 'utf8').trim();
    if (existing) return existing;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('Kunde inte läsa sessionshemlighet.', error);
  }
  const secret = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(path.dirname(secretPath), { recursive: true });
    fs.writeFileSync(secretPath, `${secret}\n`, { mode: 0o600 });
  } catch (error) {
    console.warn('Kunde inte spara sessionshemlighet, använder minnesvärde.', error);
  }
  return secret;
}

function savePhoto(uploadDir: string, childId: number, value: unknown): string | null {
  const dataUrl = String(value || '');
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) return null;
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const data = Buffer.from(match[2], 'base64');
  if (data.byteLength > 2_000_000) throw new Error('Bilden får vara högst 2 MB');
  fs.mkdirSync(uploadDir, { recursive: true });
  const filename = `child-${childId}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(uploadDir, filename), data);
  return `/uploads/${filename}`;
}

function cleanText(value: unknown): string {
  return String(value || '').trim();
}

function paramId(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function nullableText(value: unknown): string | null {
  const text = cleanText(value);
  return text || null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function must<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('Oväntat saknat värde');
  return value;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = createApp();
  const port = Number(process.env.PORT) || 4287;
  const host = process.env.HOST || '0.0.0.0';
  app.listen(port, host, () => console.log(`Piggy Bank kör på http://${host}:${port}`));
}
