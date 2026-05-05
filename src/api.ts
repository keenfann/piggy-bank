export type Role = 'parent' | 'child';
export type AccountType = 'cash' | 'fund';
export type TransactionType = 'deposit' | 'withdrawal';

export interface User {
  id: number;
  username: string;
  role: Role;
  childId: number | null;
}

export interface Child {
  id: number;
  name: string;
  photoUrl: string | null;
  cashBalanceOre: number;
  fundBalanceOre: number;
  childLogin: User | null;
}

export interface Transaction {
  id: number;
  account_id: number;
  child_id: number;
  account_type: AccountType;
  type: TransactionType;
  amount_ore: number;
  date: string;
  comment: string;
  created_by_user_id: number;
  created_at: string;
  updated_at: string;
}

export interface ImportResult {
  imported: number;
  errors: Array<{ row: number; error: string }>;
  rows?: Array<unknown>;
}

let csrfToken: string | null = null;
let csrfPromise: Promise<string | null> | null = null;

export async function ensureCsrf(): Promise<string | null> {
  if (csrfToken) return csrfToken;
  if (!csrfPromise) {
    csrfPromise = fetch('/api/csrf', { credentials: 'include' })
      .then((res) => res.json())
      .then((data: { csrfToken?: string }) => {
        csrfToken = data.csrfToken || null;
        return csrfToken;
      })
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  if (method !== 'GET' && method !== 'HEAD') {
    headers.set('content-type', headers.get('content-type') || 'application/json');
    const token = await ensureCsrf();
    if (token) headers.set('x-csrf-token', token);
  }
  const response = await fetch(path, { ...options, headers, credentials: 'include' });
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(typeof data === 'object' && data && 'error' in data ? String(data.error) : 'Begäran misslyckades');
  }
  if (typeof data === 'object' && data && 'csrfToken' in data && typeof data.csrfToken === 'string') {
    csrfToken = data.csrfToken;
  }
  return data as T;
}

export function resetCsrf(): void {
  csrfToken = null;
}
