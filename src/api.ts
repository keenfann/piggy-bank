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
const REQUEST_TIMEOUT_MS = 15_000;

export async function ensureCsrf(): Promise<string | null> {
  if (csrfToken) return csrfToken;
  if (!csrfPromise) {
    csrfPromise = fetch('/api/csrf', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Kunde inte hämta CSRF-token');
        return res.json();
      })
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
  return apiFetchWithCsrfRetry(path, options, true);
}

async function apiFetchWithCsrfRetry<T>(path: string, options: RequestInit, retryOnInvalidCsrf: boolean): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  if (method !== 'GET' && method !== 'HEAD') {
    headers.set('content-type', headers.get('content-type') || 'application/json');
    const token = await ensureCsrf();
    if (token) headers.set('x-csrf-token', token);
  }
  const response = await fetchWithTimeout(path, { ...options, headers, credentials: 'include' });
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof data === 'object' && data && 'error' in data ? String(data.error) : 'Begäran misslyckades';
    if (retryOnInvalidCsrf && response.status === 403 && message === 'Ogiltig CSRF-token' && method !== 'GET' && method !== 'HEAD') {
      resetCsrf();
      await ensureCsrf();
      return apiFetchWithCsrfRetry<T>(path, options, false);
    }
    throw new Error(message);
  }
  if (typeof data === 'object' && data && 'csrfToken' in data && typeof data.csrfToken === 'string') {
    csrfToken = data.csrfToken;
  }
  return data as T;
}

export function resetCsrf(): void {
  csrfToken = null;
}

async function fetchWithTimeout(path: string, options: RequestInit): Promise<Response> {
  if (options.signal) return fetch(path, options);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(path, { ...options, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Begäran tog för lång tid. Försök igen.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
