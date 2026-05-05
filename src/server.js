import http from 'node:http';
import { parse } from 'node:url';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { SV } from './texts-sv.js';

const db = {
  users: [
    { id: 'u1', username: 'parent', password: 'parent123', role: 'parent', childId: null },
    { id: 'u2', username: 'anna', password: 'anna123', role: 'child', childId: 'c1' },
    { id: 'u3', username: 'elsa', password: 'elsa123', role: 'child', childId: 'c2' }
  ],
  children: [
    { id: 'c1', name: 'Anna', photoUrl: '' },
    { id: 'c2', name: 'Elsa', photoUrl: '' }
  ],
  transactions: []
};

function json(res, code, payload) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data ? JSON.parse(data) : {}));
  });
}

function auth(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  return db.users.find((u) => u.id === token) ?? null;
}

function balance(childId, account) {
  return db.transactions
    .filter((t) => t.childId === childId && t.account === account)
    .reduce((sum, t) => sum + (t.type === 'deposit' ? t.amountOre : -t.amountOre), 0);
}

const server = http.createServer(async (req, res) => {
  const { pathname } = parse(req.url, true);

  if (req.method === 'GET' && pathname === '/health') return json(res, 200, { ok: true });

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const body = await readBody(req);
    const user = db.users.find((u) => u.username === body.username && u.password === body.password);
    if (!user) return json(res, 401, { error: SV.errors.loginFailed });
    return json(res, 200, { token: user.id, role: user.role, childId: user.childId });
  }

  const user = auth(req);
  if (pathname.startsWith('/api/') && !user) return json(res, 401, { error: SV.errors.unauthorized });

  if (req.method === 'GET' && pathname === '/api/children') {
    const children = user.role === 'parent' ? db.children : db.children.filter((c) => c.id === user.childId);
    const payload = children.map((c) => ({
      ...c,
      kontantOre: balance(c.id, 'cash'),
      fondOre: balance(c.id, 'fund')
    }));
    return json(res, 200, payload);
  }

  if (req.method === 'POST' && pathname === '/api/transactions') {
    if (user.role !== 'parent') return json(res, 403, { error: SV.errors.forbidden });
    const body = await readBody(req);
    const required = ['childId', 'account', 'type', 'amountOre', 'date', 'comment'];
    for (const k of required) if (!body[k] && body[k] !== 0) return json(res, 400, { error: `Saknar ${k}` });
    if (!body.comment.trim()) return json(res, 400, { error: SV.errors.commentRequired });
    const tx = { id: `t${db.transactions.length + 1}`, ...body, createdBy: user.id };
    db.transactions.push(tx);
    return json(res, 201, tx);
  }

  
  if (req.method === 'POST' && pathname === '/api/import') {
    if (user.role !== 'parent') return json(res, 403, { error: SV.errors.forbidden });
    const body = await readBody(req);
    const lines = String(body.csv || '').trim().split('\n').filter(Boolean);
    const [header, ...rows] = lines;
    if (!header) return json(res, 400, { error: 'Tom fil' });
    let imported = 0;
    const errors = [];
    for (const [idx, row] of rows.entries()) {
      const [childId, account, type, amountOre, date, comment] = row.split(',');
      if (!childId || !account || !type || !amountOre || !date || !comment) { errors.push({ row: idx + 2, error: 'Ogiltig rad' }); continue; }
      db.transactions.push({ id: `t${db.transactions.length + 1}`, childId, account, type, amountOre: Number(amountOre), date, comment, createdBy: user.id });
      imported++;
    }
    return json(res, 200, { imported, errors });
  }

  if (req.method === 'POST' && pathname === '/api/children/photo') {
    if (user.role !== 'parent') return json(res, 403, { error: SV.errors.forbidden });
    const body = await readBody(req);
    const child = db.children.find((c) => c.id === body.childId);
    if (!child) return json(res, 404, { error: 'Barn hittades inte' });
    child.photoUrl = body.photoUrl || '';
    return json(res, 200, child);
  }

  if (req.method === 'GET' && pathname === '/api/export.csv') {
    const rows = ['childId,account,type,amountOre,date,comment'];
    for (const t of db.transactions) rows.push([t.childId, t.account, t.type, t.amountOre, t.date, JSON.stringify(t.comment)].join(','));
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8' });
    return res.end(rows.join('\n'));
  }

  
  if (req.method === 'GET' && (pathname === '/' || pathname === '/manifest.webmanifest' || pathname === '/sw.js')) {
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    const fp = path.join(process.cwd(), 'public', file);
    try {
      const data = await readFile(fp);
      const ct = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'application/javascript' : 'application/manifest+json';
      res.writeHead(200, { 'Content-Type': ct + '; charset=utf-8' });
      return res.end(data);
    } catch {}
  }

  return json(res, 404, { error: SV.errors.notFound });
});

if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(3000, () => console.log('Server on http://localhost:3000'));
}

export { server, db, balance };
