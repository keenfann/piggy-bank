import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { FaChartLine, FaCheck, FaTrashCan, FaWallet } from 'react-icons/fa6';
import { apiFetch, ensureCsrf, resetCsrf, type AccountType, type Child, type ImportResult, type Transaction, type TransactionType, type User } from './api';

declare const __APP_VERSION__: string;

type ViewState = 'loading' | 'setup' | 'login' | 'app';
type AppSection = 'dashboard' | 'settings';

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
const TRANSACTION_SAVE_TIMEOUT_MS = 6_000;

export function App() {
  const [view, setView] = useState<ViewState>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<AccountType>('cash');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [flashMessage, setFlashMessage] = useState<{ type: 'error' | 'notice'; text: string } | null>(null);
  const [appSection, setAppSection] = useState<AppSection>('dashboard');
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [savingTransaction, setSavingTransaction] = useState(false);
  const [expandedTransactionId, setExpandedTransactionId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [setupForm, setSetupForm] = useState({ username: 'parent', password: '' });
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [parentForm, setParentForm] = useState({ username: '', password: '' });
  const [childName, setChildName] = useState('');
  const [txForm, setTxForm] = useState<TxForm>(emptyTxForm());
  const [childLogin, setChildLogin] = useState({ username: '', password: '' });
  const [photoDataUrl, setPhotoDataUrl] = useState('');
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
      loadTransactions(selectedChild.id, selectedAccount);
      setChildLogin({ username: selectedChild.childLogin?.username || '', password: '' });
      setPhotoDataUrl('');
      setExpandedTransactionId(null);
      resetDeleteConfirmation();
    }
  }, [selectedChild?.id, selectedAccount]);

  useEffect(() => {
    if (!error && !notice) {
      setFlashMessage(null);
      return;
    }

    setFlashMessage({
      type: error ? 'error' : 'notice',
      text: error || notice,
    });

    const timer = setTimeout(() => {
      setFlashMessage(null);
      setError('');
      setNotice('');
    }, 8000);

    return () => clearTimeout(timer);
  }, [error, notice]);

  useEffect(() => {
    if (!txModalOpen) return;
    setSavingTransaction(false);

    function closeTransactionModal(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setTxModalOpen(false);
      }
    }

    document.addEventListener('keydown', closeTransactionModal);
    return () => document.removeEventListener('keydown', closeTransactionModal);
  }, [txModalOpen]);

  useEffect(() => {
    if (!savingTransaction) return;
    const timer = setTimeout(() => {
      setSavingTransaction(false);
      setError('Sparandet tog för lång tid. Försök igen.');
    }, TRANSACTION_SAVE_TIMEOUT_MS + 500);
    return () => clearTimeout(timer);
  }, [savingTransaction]);

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

  async function loadTransactions(childId: number, account = selectedAccount) {
    const data = await apiFetch<{ transactions: Transaction[] }>(`/api/children/${childId}/transactions?account=${account}`);
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
      setSelectedAccount('cash');
      setAppSection('dashboard');
      setTxModalOpen(false);
      setSavingTransaction(false);
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

  async function addParent(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const data = await apiFetch<{ user: User }>('/api/parents', {
        method: 'POST',
        body: JSON.stringify(parentForm),
      });
      setParentForm({ username: '', password: '' });
      setNotice(`Föräldern ${data.user.username} skapades.`);
    });
  }

  async function addTransaction(event: FormEvent) {
    event.preventDefault();
    if (!selectedChild || savingTransaction) return;
    setSavingTransaction(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), TRANSACTION_SAVE_TIMEOUT_MS);
    try {
      await run(async () => {
        await apiFetch(`/api/children/${selectedChild.id}/transactions`, {
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify({
            account: txForm.account,
            type: txForm.type,
            amountOre: Math.round(Number(txForm.amount) * 100),
            date: txForm.date,
            comment: txForm.comment,
          }),
        });
        setTxForm(emptyTxForm());
        const [childrenData, transactionsData] = await Promise.all([
          apiFetch<{ children: Child[] }>('/api/children', { signal: controller.signal }),
          apiFetch<{ transactions: Transaction[] }>(`/api/children/${selectedChild.id}/transactions?account=${selectedAccount}`, { signal: controller.signal }),
        ]);
        setChildren(childrenData.children);
        setSelectedChildId((current) => current || childrenData.children[0]?.id || null);
        setTransactions(transactionsData.transactions);
        setTxModalOpen(false);
        setNotice('Transaktionen sparades.');
      });
    } finally {
      window.clearTimeout(timeout);
      setSavingTransaction(false);
    }
  }

  function toggleTransactionComment(id: number) {
    setExpandedTransactionId((current) => current === id ? null : id);
    resetDeleteConfirmation();
  }

  async function deleteTransaction(id: number) {
    if (!selectedChild) return;
    await run(async () => {
      await apiFetch(`/api/transactions/${id}`, { method: 'DELETE' });
      await loadChildren();
      await loadTransactions(selectedChild.id);
      setExpandedTransactionId((current) => current === id ? null : current);
      resetDeleteConfirmation();
      setNotice('Transaktionen togs bort.');
    });
  }

  async function requestTransactionDelete(id: number) {
    if (confirmDeleteId === id) {
      await deleteTransaction(id);
      return;
    }
    setConfirmDeleteId(id);
  }

  function resetDeleteConfirmation() {
    setConfirmDeleteId(null);
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
    const payload: { photoDataUrl?: string } = {};
    if (photoDataUrl) {
      payload.photoDataUrl = photoDataUrl;
    }
    await run(async () => {
      await apiFetch(`/api/children/${selectedChild.id}/photo`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setPhotoDataUrl('');
      await loadChildren();
      setNotice('Bilden sparades.');
    });
  }

  function handlePhotoFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setPhotoDataUrl('');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Filen måste vara en bild.');
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/jpg'].includes(file.type)) {
      setError('Tillåtna bildformat: PNG, JPEG, JPG och WEBP.');
      return;
    }
    if (file.size > 2_000_000) {
      setError('Bilden får vara högst 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhotoDataUrl(reader.result);
      }
    };
    reader.onerror = () => setError('Kunde inte läsa bilden.');
    reader.readAsDataURL(file);
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

  if (view === 'loading') return <Shell><div className="panel app-view app-view-loading">Laddar...</div></Shell>;
  if (view === 'setup') {
    return (
      <Shell>
        <Message message={flashMessage} />
        <AuthPanel title="Skapa föräldrakonto" description="Kom igång med ett tryggt sparflöde för barnens konton." onSubmit={submitSetup}>
          <TextInput label="Användarnamn" value={setupForm.username} onChange={(value) => setSetupForm({ ...setupForm, username: value })} />
          <TextInput label="Lösenord" type="password" value={setupForm.password} onChange={(value) => setSetupForm({ ...setupForm, password: value })} />
          <button className="primary">Kom igång</button>
        </AuthPanel>
      </Shell>
    );
  }
  if (view === 'login') {
    return (
      <Shell>
        <Message message={flashMessage} />
        <AuthPanel title="Logga in" description="Välkommen tillbaka till barnens sparöversikt." onSubmit={submitLogin}>
          <TextInput label="Användarnamn" value={loginForm.username} onChange={(value) => setLoginForm({ ...loginForm, username: value })} />
          <TextInput label="Lösenord" type="password" value={loginForm.password} onChange={(value) => setLoginForm({ ...loginForm, password: value })} />
          <button className="primary">Logga in</button>
        </AuthPanel>
      </Shell>
    );
  }

  const isParent = user?.role === 'parent';
  const showChildPicker = children.length > 0 && (appSection === 'dashboard' || isParent);
  const childPicker = showChildPicker ? (
    <section className="toolbar child-picker motion-strip" aria-label="Barn">
      {children.map((child) => (
        <button
          key={child.id}
          className={child.id === selectedChild?.id ? 'tab child-tab active' : 'tab child-tab'}
          onClick={() => setSelectedChildId(child.id)}
        >
          <ChildAvatar child={child} size="small" />
          <span>{child.name}</span>
        </button>
      ))}
    </section>
  ) : null;

  return (
    <Shell
      user={user}
      onLogout={logout}
      onNavigate={setAppSection}
      headerAction={isParent && selectedChild ? (
        <button
          className="icon-button add-transaction-button"
          type="button"
          aria-label="Ny transaktion"
          title="Ny transaktion"
          onClick={() => setTxModalOpen(true)}
        >
          +
        </button>
      ) : null}
      >
      <Message message={flashMessage} />
      {childPicker}
      {appSection === 'settings' ? (
        <div key="settings" className="section-swap section-swap-settings">
          <div className="view-heading">
            <div>
              <p className="eyebrow">Inställningar</p>
              <h2>Hantera appen</h2>
            </div>
          </div>

          {isParent ? (
            <>
              <main className="grid">
                <section className="panel add-child-panel">
                  <h3>Barn</h3>
                  <form className="stack add-child-form" onSubmit={addChild}>
                    <TextInput label="Nytt barn" value={childName} onChange={setChildName} />
                    <button className="secondary">Lägg till</button>
                  </form>
                </section>

                <section className="panel add-parent-panel">
                  <h3>Förälder</h3>
                  <form className="stack add-parent-form" onSubmit={addParent}>
                    <TextInput label="Användarnamn" value={parentForm.username} onChange={(value) => setParentForm({ ...parentForm, username: value })} />
                    <TextInput label="Lösenord" type="password" value={parentForm.password} onChange={(value) => setParentForm({ ...parentForm, password: value })} />
                    <button className="secondary">Lägg till förälder</button>
                  </form>
                </section>

                {selectedChild ? (
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
                        <label>
                          Ladda upp bild
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/webp"
                            onChange={handlePhotoFileChange}
                          />
                        </label>
                        {photoDataUrl && (
                          <img className="photo-preview motion-reveal" src={photoDataUrl} alt="Förhandsvisning av vald bild" />
                        )}
                        <button className="secondary">Spara bild</button>
                      </form>
                    </section>
                  </>
                ) : (
                  <section className="panel">Skapa ett barn för att hantera barninställningar.</section>
                )}

                <section className="panel wide import-export-panel">
                  <h3>Import</h3>
                  <label>
                    CSV-import
                    <textarea value={csv} onChange={(event) => setCsv(event.target.value)} rows={7} />
                  </label>
                  <div className="actions">
                    <button className="secondary" type="button" onClick={validateImport}>Validera</button>
                    <button className="primary" type="button" onClick={commitImport}>Importera</button>
                  </div>
                  {importResult && (
                    <div className="result motion-reveal">
                      <strong>{importResult.imported} giltiga rader</strong>
                      {importResult.errors.map((row) => (
                        <p key={`${row.row}-${row.error}`}>Rad {row.row}: {row.error}</p>
                      ))}
                    </div>
                  )}
                </section>
              </main>
            </>
          ) : (
            <section className="panel">Det finns inga barninställningar för barnkonton.</section>
          )}
          <p className="settings-version">Version {__APP_VERSION__}</p>
        </div>
      ) : (
        <div key="dashboard" className="section-swap section-swap-dashboard">
          <div className="view-heading">
            <div>
              <p className="eyebrow">Översikt</p>
              <h2>{selectedChild ? `${selectedChild.name}s sparande` : 'Sparkonto Barn'}</h2>
            </div>
          </div>

          {selectedChild ? (
            <main className="grid">
              <section
                className={selectedChild.photoUrl ? 'panel child-hero has-photo' : 'panel child-hero'}
                data-initial={selectedChild.name.slice(0, 1).toUpperCase()}
                style={selectedChild.photoUrl ? ({ '--child-hero-photo': `url("${selectedChild.photoUrl}")` } as React.CSSProperties) : undefined}
              >
                <div className="child-summary">
                  <div className="balances">
                    <Balance
                      account="cash"
                      label="Kontant"
                      amountOre={selectedChild.cashBalanceOre}
                      active={selectedAccount === 'cash'}
                      onSelect={setSelectedAccount}
                    />
                    <Balance
                      account="fund"
                      label="Fond"
                      amountOre={selectedChild.fundBalanceOre}
                      active={selectedAccount === 'fund'}
                      onSelect={setSelectedAccount}
                    />
                  </div>
                </div>
              </section>

              <section className="panel wide">
                <h3 className={`history-heading ${selectedAccount}`}>
                  {selectedAccount === 'cash' ? <FaWallet aria-hidden="true" /> : <FaChartLine aria-hidden="true" />}
                  <span>Historik</span>
                </h3>
                <div key={`${selectedChild.id}-${selectedAccount}`} className="transaction-list motion-list">
                  {transactions.map((tx) => {
                    const isExpanded = expandedTransactionId === tx.id;
                    const isDeleteConfirming = confirmDeleteId === tx.id;
                    const commentId = `transaction-comment-${tx.id}`;
                    return (
                      <article
                        key={tx.id}
                        className={[
                          'transaction-card',
                          isExpanded ? 'expanded' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        <button
                          type="button"
                          className="transaction-card-toggle"
                          aria-expanded={isExpanded}
                          aria-controls={commentId}
                          aria-label={`${isExpanded ? 'Dölj' : 'Visa'} kommentar för transaktion ${tx.date}`}
                          onClick={() => toggleTransactionComment(tx.id)}
                        >
                          <span className="transaction-card-date">{tx.date}</span>
                          <strong className={`transaction-card-amount amount ${tx.type}`}>{formatTransactionAmount(tx)}</strong>
                          <strong className="transaction-card-balance">{formatSek(tx.balance_ore)}</strong>
                        </button>
                        <div
                          id={commentId}
                          className="transaction-card-comment"
                          aria-hidden={!isExpanded}
                          hidden={!isExpanded}
                        >
                          <p>{tx.comment || 'Ingen kommentar'}</p>
                          {isParent && (
                            <button
                              className={isDeleteConfirming ? 'comment-delete confirming' : 'comment-delete'}
                              type="button"
                              aria-label={isDeleteConfirming ? 'Bekräfta borttagning' : 'Ta bort transaktion'}
                              title={isDeleteConfirming ? 'Bekräfta borttagning' : 'Ta bort transaktion'}
                              onClick={() => requestTransactionDelete(tx.id)}
                            >
                              {isDeleteConfirming ? <FaCheck aria-hidden="true" /> : <FaTrashCan aria-hidden="true" />}
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                  {!transactions.length && (
                    <p className="transaction-empty">Inga transaktioner för {selectedAccount === 'cash' ? 'kontantkontot' : 'fondkontot'} ännu.</p>
                  )}
                </div>
              </section>
            </main>
          ) : (
            <section className="panel">Öppna inställningar för att skapa ett barn.</section>
          )}

        </div>
      )}
      {isParent && selectedChild && txModalOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setTxModalOpen(false)}>
          <section
            className="panel modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="transaction-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <h3 id="transaction-modal-title">Ny transaktion</h3>
            </div>
            <form className="stack" onSubmit={addTransaction} aria-busy={savingTransaction}>
              <label>
                Typ
                <select value={txForm.type} onChange={(event) => setTxForm({ ...txForm, type: event.target.value as TransactionType })}>
                  <option value="deposit">Insättning</option>
                  <option value="withdrawal">Uttag</option>
                </select>
              </label>
              <label>
                Konto
                <select value={txForm.account} onChange={(event) => setTxForm({ ...txForm, account: event.target.value as AccountType })}>
                  <option value="cash">Kontant</option>
                  <option value="fund">Fond</option>
                </select>
              </label>
              <TextInput label="Belopp (kr)" inputMode="decimal" value={txForm.amount} onChange={(value) => setTxForm({ ...txForm, amount: value })} />
              <TextInput label="Datum" type="date" value={txForm.date} onChange={(value) => setTxForm({ ...txForm, date: value })} />
              <TextInput label="Kommentar" value={txForm.comment} onChange={(value) => setTxForm({ ...txForm, comment: value })} />
              <div className="actions">
                <button className="secondary" type="button" onClick={() => setTxModalOpen(false)}>Avbryt</button>
                <button className="primary save-transaction-button" disabled={savingTransaction}>{savingTransaction ? 'Sparar...' : 'Spara'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </Shell>
  );
}

function Shell({
  children,
  user,
  onLogout,
  onNavigate,
  headerAction,
}: {
  children: React.ReactNode;
  user?: User | null;
  onLogout?: () => void;
  onNavigate?: (section: AppSection) => void;
  headerAction?: React.ReactNode;
}) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userMenuOpen) return;

    function closeUserMenu(event: MouseEvent) {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }

    function closeUserMenuWithEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setUserMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', closeUserMenu);
    document.addEventListener('keydown', closeUserMenuWithEscape);
    return () => {
      document.removeEventListener('mousedown', closeUserMenu);
      document.removeEventListener('keydown', closeUserMenuWithEscape);
    };
  }, [userMenuOpen]);

  return (
    <div className={user ? 'app-shell is-authed' : 'app-shell is-auth'}>
      <header>
        <div className="title-row">
          <div className="brand-lockup">
            <BrandMark />
            <div>
              <h1>Piggy Bank</h1>
              <p>Barnens sparande</p>
            </div>
          </div>
          {user && (
            <div className="header-controls">
              {headerAction}
              <div className="user-menu" ref={userMenuRef}>
                <button
                  className="icon-button user-menu-trigger"
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  onClick={() => setUserMenuOpen((open) => !open)}
                  aria-label={`Användare ${user.username}`}
                >
                  {user.username ? user.username.charAt(0).toUpperCase() : ''}
                </button>
                {userMenuOpen && (
                  <div className="user-popover" role="menu">
                    {onNavigate && (
                      <>
                        <button
                          className="menu-item"
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onNavigate('dashboard');
                            setUserMenuOpen(false);
                          }}
                        >
                          Översikt
                        </button>
                        <button
                          className="menu-item"
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onNavigate('settings');
                            setUserMenuOpen(false);
                          }}
                        >
                          Inställningar
                        </button>
                      </>
                    )}
                    <button className="menu-item" type="button" role="menuitem" onClick={onLogout}>
                      Logga ut
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}

function AuthPanel({
  title,
  description,
  onSubmit,
  children,
}: {
  title: string;
  description: string;
  onSubmit: (event: FormEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <main className="auth-wrap">
      <section className="auth-hero" aria-hidden="true">
        <BrandMark />
      </section>
      <form className="panel auth" onSubmit={onSubmit}>
        <BrandMark />
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="stack">{children}</div>
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

function Balance({
  account,
  label,
  amountOre,
  active,
  onSelect,
}: {
  account: AccountType;
  label: string;
  amountOre: number;
  active: boolean;
  onSelect: (account: AccountType) => void;
}) {
  const type = account === 'fund' ? 'fund' : 'cash';
  const Icon = account === 'fund' ? FaChartLine : FaWallet;

  return (
    <button
      className={active ? `balance ${type} active` : `balance ${type}`}
      type="button"
      aria-pressed={active}
      onClick={() => onSelect(account)}
    >
      <span className="balance-icon" aria-hidden="true">
        <Icon />
      </span>
      <span>{label}</span>
      <strong>{formatSek(amountOre)}</strong>
    </button>
  );
}

function ChildAvatar({ child, size }: { child: Child; size: 'small' | 'large' }) {
  const sizeClass = size === 'large' ? 'avatar-large' : 'avatar-small';
  return child.photoUrl ? (
    <span className={`avatar ${sizeClass}`}>
      <img className="avatar-photo" src={child.photoUrl} alt="" />
    </span>
  ) : (
    <span className={`avatar ${sizeClass}`}>{child.name.slice(0, 1).toUpperCase()}</span>
  );
}

function BrandMark() {
  return <img className="brand-mark" src="/icon-192.png" alt="" />;
}

function Message({ message }: { message: { type: 'error' | 'notice'; text: string } | null }) {
  if (!message) return null;
  return (
    <div
      className={`message-popover ${message.type}`}
      role={message.type === 'error' ? 'alert' : 'status'}
    >
      {message.text}
    </div>
  );
}

function formatSek(amountOre: number): string {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(amountOre / 100);
}

function formatTransactionAmount(transaction: Transaction): string {
  return transaction.type === 'withdrawal' ? `-${formatSek(transaction.amount_ore)}` : formatSek(transaction.amount_ore);
}
