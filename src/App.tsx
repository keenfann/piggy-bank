import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiFetch, ensureCsrf, resetCsrf, type AccountType, type Child, type ImportResult, type Transaction, type TransactionType, type User } from './api';

type ViewState = 'loading' | 'setup' | 'login' | 'app';

interface TxForm {
  account: AccountType;
  type: TransactionType;
  amount: string;
  date: string;
  comment: string;
}

const emptyTxForm = (): TxForm => ({
  account: 'cash',
  type: 'deposit',
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  comment: '',
});

export function App() {
  const [view, setView] = useState<ViewState>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [setupForm, setSetupForm] = useState({ username: 'parent', password: '' });
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [childName, setChildName] = useState('');
  const [txForm, setTxForm] = useState<TxForm>(emptyTxForm());
  const [childLogin, setChildLogin] = useState({ username: '', password: '' });
  const [photoUrl, setPhotoUrl] = useState('');
  const [csv, setCsv] = useState('childName,account,type,amountOre,date,comment\n');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const selectedChild = useMemo(
    () => children.find((child) => child.id === selectedChildId) || children[0] || null,
    [children, selectedChildId]
  );

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    if (selectedChild) {
      setSelectedChildId(selectedChild.id);
      loadTransactions(selectedChild.id);
      setChildLogin({ username: selectedChild.childLogin?.username || '', password: '' });
      setPhotoUrl(selectedChild.photoUrl || '');
    }
  }, [selectedChild?.id]);

  async function bootstrap() {
    try {
      await ensureCsrf();
      const setup = await apiFetch<{ needsSetup: boolean }>('/api/setup/status');
      if (setup.needsSetup) {
        setView('setup');
        return;
      }
      const me = await apiFetch<{ user: User | null }>('/api/auth/me');
      if (me.user) {
        setUser(me.user);
        setView('app');
        await loadChildren();
      } else {
        setView('login');
      }
    } catch (nextError) {
      showError(nextError);
      setView('login');
    }
  }

  async function loadChildren() {
    const data = await apiFetch<{ children: Child[] }>('/api/children');
    setChildren(data.children);
    setSelectedChildId((current) => current || data.children[0]?.id || null);
  }

  async function loadTransactions(childId: number) {
    const data = await apiFetch<{ transactions: Transaction[] }>(`/api/children/${childId}/transactions`);
    setTransactions(data.transactions);
  }

  async function submitSetup(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const data = await apiFetch<{ user: User }>('/api/setup', {
        method: 'POST',
        body: JSON.stringify(setupForm),
      });
      setUser(data.user);
      setView('app');
      await loadChildren();
    });
  }

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const data = await apiFetch<{ user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(loginForm),
      });
      setUser(data.user);
      setView('app');
      await loadChildren();
    });
  }

  async function logout() {
    await run(async () => {
      await apiFetch('/api/auth/logout', { method: 'POST' });
      resetCsrf();
      setUser(null);
      setChildren([]);
      setTransactions([]);
      setView('login');
      await ensureCsrf();
    });
  }

  async function addChild(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const data = await apiFetch<{ child: Child }>('/api/children', {
        method: 'POST',
        body: JSON.stringify({ name: childName }),
      });
      setChildName('');
      await loadChildren();
      setSelectedChildId(data.child.id);
      setNotice('Barnet skapades.');
    });
  }

  async function addTransaction(event: FormEvent) {
    event.preventDefault();
    if (!selectedChild) return;
    await run(async () => {
      await apiFetch(`/api/children/${selectedChild.id}/transactions`, {
        method: 'POST',
        body: JSON.stringify({
          account: txForm.account,
          type: txForm.type,
          amountOre: Math.round(Number(txForm.amount) * 100),
          date: txForm.date,
          comment: txForm.comment,
        }),
      });
      setTxForm(emptyTxForm());
      await loadChildren();
      await loadTransactions(selectedChild.id);
      setNotice('Transaktionen sparades.');
    });
  }

  async function deleteTransaction(id: number) {
    if (!selectedChild) return;
    await run(async () => {
      await apiFetch(`/api/transactions/${id}`, { method: 'DELETE' });
      await loadChildren();
      await loadTransactions(selectedChild.id);
      setNotice('Transaktionen togs bort.');
    });
  }

  async function saveChildLogin(event: FormEvent) {
    event.preventDefault();
    if (!selectedChild) return;
    await run(async () => {
      await apiFetch(`/api/children/${selectedChild.id}/login`, {
        method: 'POST',
        body: JSON.stringify(childLogin),
      });
      await loadChildren();
      setNotice('Barninloggningen sparades.');
    });
  }

  async function savePhoto(event: FormEvent) {
    event.preventDefault();
    if (!selectedChild) return;
    await run(async () => {
      await apiFetch(`/api/children/${selectedChild.id}/photo`, {
        method: 'POST',
        body: JSON.stringify({ photoUrl }),
      });
      await loadChildren();
      setNotice('Bilden sparades.');
    });
  }

  async function validateImport() {
    await run(async () => {
      const result = await apiFetch<ImportResult>('/api/import/transactions/validate', {
        method: 'POST',
        body: JSON.stringify({ csv }),
      });
      setImportResult(result);
    });
  }

  async function commitImport() {
    await run(async () => {
      const result = await apiFetch<ImportResult>('/api/import/transactions/commit', {
        method: 'POST',
        body: JSON.stringify({ csv }),
      });
      setImportResult(result);
      await loadChildren();
      if (selectedChild) await loadTransactions(selectedChild.id);
      setNotice(`${result.imported} rader importerades.`);
    });
  }

  async function run(action: () => Promise<void>) {
    setError('');
    setNotice('');
    try {
      await action();
    } catch (nextError) {
      showError(nextError);
    }
  }

  function showError(nextError: unknown) {
    setError(nextError instanceof Error ? nextError.message : 'Något gick fel');
  }

  if (view === 'loading') return <Shell><div className="panel">Laddar...</div></Shell>;
  if (view === 'setup') {
    return (
      <Shell>
        <AuthPanel title="Skapa föräldrakonto" onSubmit={submitSetup}>
          <TextInput label="Användarnamn" value={setupForm.username} onChange={(value) => setSetupForm({ ...setupForm, username: value })} />
          <TextInput label="Lösenord" type="password" value={setupForm.password} onChange={(value) => setSetupForm({ ...setupForm, password: value })} />
          <button className="primary">Kom igång</button>
          <Message error={error} notice={notice} />
        </AuthPanel>
      </Shell>
    );
  }
  if (view === 'login') {
    return (
      <Shell>
        <AuthPanel title="Logga in" onSubmit={submitLogin}>
          <TextInput label="Användarnamn" value={loginForm.username} onChange={(value) => setLoginForm({ ...loginForm, username: value })} />
          <TextInput label="Lösenord" type="password" value={loginForm.password} onChange={(value) => setLoginForm({ ...loginForm, password: value })} />
          <button className="primary">Logga in</button>
          <Message error={error} notice={notice} />
        </AuthPanel>
      </Shell>
    );
  }

  const isParent = user?.role === 'parent';

  return (
    <Shell user={user} onLogout={logout}>
      <Message error={error} notice={notice} />
      <section className="toolbar" aria-label="Barn">
        {children.map((child) => (
          <button
            key={child.id}
            className={child.id === selectedChild?.id ? 'tab active' : 'tab'}
            onClick={() => setSelectedChildId(child.id)}
          >
            {child.name}
          </button>
        ))}
      </section>

      {isParent && (
        <form className="inline-form" onSubmit={addChild}>
          <TextInput label="Nytt barn" value={childName} onChange={setChildName} />
          <button className="secondary">Lägg till</button>
        </form>
      )}

      {selectedChild ? (
        <main className="grid">
          <section className="panel child-hero">
            {selectedChild.photoUrl ? <img src={selectedChild.photoUrl} alt="" /> : <div className="avatar">{selectedChild.name.slice(0, 1).toUpperCase()}</div>}
            <div>
              <p className="eyebrow">Sparkonto</p>
              <h2>{selectedChild.name}</h2>
              <div className="balances">
                <Balance label="Kontant" amountOre={selectedChild.cashBalanceOre} />
                <Balance label="Fond" amountOre={selectedChild.fundBalanceOre} />
              </div>
            </div>
          </section>

          {isParent && (
            <section className="panel">
              <h3>Ny transaktion</h3>
              <form className="stack" onSubmit={addTransaction}>
                <label>
                  Konto
                  <select value={txForm.account} onChange={(event) => setTxForm({ ...txForm, account: event.target.value as AccountType })}>
                    <option value="cash">Kontant</option>
                    <option value="fund">Fond</option>
                  </select>
                </label>
                <label>
                  Typ
                  <select value={txForm.type} onChange={(event) => setTxForm({ ...txForm, type: event.target.value as TransactionType })}>
                    <option value="deposit">Insättning</option>
                    <option value="withdrawal">Uttag</option>
                  </select>
                </label>
                <TextInput label="Belopp (kr)" inputMode="decimal" value={txForm.amount} onChange={(value) => setTxForm({ ...txForm, amount: value })} />
                <TextInput label="Datum" type="date" value={txForm.date} onChange={(value) => setTxForm({ ...txForm, date: value })} />
                <TextInput label="Kommentar" value={txForm.comment} onChange={(value) => setTxForm({ ...txForm, comment: value })} />
                <button className="primary">Spara</button>
              </form>
            </section>
          )}

          <section className="panel wide">
            <h3>Historik</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Konto</th>
                    <th>Typ</th>
                    <th>Belopp</th>
                    {isParent && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>{tx.date}</td>
                      <td>{accountLabel(tx.account_type)}</td>
                      <td>{tx.type === 'deposit' ? 'Insättning' : 'Uttag'}</td>
                      <td>{formatSek(tx.amount_ore)}</td>
                      {isParent && (
                        <td>
                          <button className="danger small" onClick={() => deleteTransaction(tx.id)}>Ta bort</button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {!transactions.length && (
                    <tr>
                      <td colSpan={isParent ? 5 : 4}>Inga transaktioner ännu.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {isParent && (
            <>
              <section className="panel">
                <h3>Barninloggning</h3>
                <form className="stack" onSubmit={saveChildLogin}>
                  <TextInput label="Användarnamn" value={childLogin.username} onChange={(value) => setChildLogin({ ...childLogin, username: value })} />
                  <TextInput label="Nytt lösenord" type="password" value={childLogin.password} onChange={(value) => setChildLogin({ ...childLogin, password: value })} />
                  <button className="secondary">Spara inloggning</button>
                </form>
              </section>

              <section className="panel">
                <h3>Bild</h3>
                <form className="stack" onSubmit={savePhoto}>
                  <TextInput label="Bild-URL" value={photoUrl} onChange={setPhotoUrl} />
                  <button className="secondary">Spara bild</button>
                </form>
              </section>

              <section className="panel wide">
                <h3>Import och export</h3>
                <div className="actions">
                  <a className="button secondary" href="/api/export.json">Exportera JSON</a>
                  <a className="button secondary" href="/api/export/transactions.csv">Exportera CSV</a>
                </div>
                <label>
                  CSV-import
                  <textarea value={csv} onChange={(event) => setCsv(event.target.value)} rows={7} />
                </label>
                <div className="actions">
                  <button className="secondary" type="button" onClick={validateImport}>Validera</button>
                  <button className="primary" type="button" onClick={commitImport}>Importera</button>
                </div>
                {importResult && (
                  <div className="result">
                    <strong>{importResult.imported} giltiga rader</strong>
                    {importResult.errors.map((row) => (
                      <p key={`${row.row}-${row.error}`}>Rad {row.row}: {row.error}</p>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      ) : (
        <section className="panel">Skapa ett barn för att börja.</section>
      )}
    </Shell>
  );
}

function Shell({ children, user, onLogout }: { children: React.ReactNode; user?: User | null; onLogout?: () => void }) {
  return (
    <div className="app-shell">
      <header>
        <div>
          <p className="eyebrow">Piggy Bank</p>
          <h1>Sparkonto Barn</h1>
        </div>
        {user && (
          <div className="user-menu">
            <span>{user.username}</span>
            <button className="ghost" onClick={onLogout}>Logga ut</button>
          </div>
        )}
      </header>
      {children}
    </div>
  );
}

function AuthPanel({ title, onSubmit, children }: { title: string; onSubmit: (event: FormEvent) => void; children: React.ReactNode }) {
  return (
    <main className="auth-wrap">
      <form className="panel auth" onSubmit={onSubmit}>
        <h2>{title}</h2>
        {children}
      </form>
    </main>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = 'text',
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: 'text' | 'decimal';
}) {
  return (
    <label>
      {label}
      <input type={type} inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Balance({ label, amountOre }: { label: string; amountOre: number }) {
  return (
    <div className="balance">
      <span>{label}</span>
      <strong>{formatSek(amountOre)}</strong>
    </div>
  );
}

function Message({ error, notice }: { error: string; notice: string }) {
  if (!error && !notice) return null;
  return <div className={error ? 'message error' : 'message notice'}>{error || notice}</div>;
}

function accountLabel(account: AccountType): string {
  return account === 'cash' ? 'Kontant' : 'Fond';
}

function formatSek(amountOre: number): string {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(amountOre / 100);
}
