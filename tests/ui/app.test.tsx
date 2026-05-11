/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('App', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders setup flow when the app needs setup', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/csrf')) return json({ csrfToken: 'token' });
      if (url.endsWith('/api/setup/status')) return json({ needsSetup: true });
      return json({});
    }));

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Skapa föräldrakonto' })).toBeInTheDocument();
  });

  it('shows parent dashboard and validates transaction form surface', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/csrf')) return json({ csrfToken: 'token' });
      if (url.endsWith('/api/setup/status')) return json({ needsSetup: false });
      if (url.endsWith('/api/auth/me')) return json({ user: { id: 1, username: 'parent', role: 'parent', childId: null }, csrfToken: 'token' });
      if (url.endsWith('/api/children')) return json({ children: [{ id: 1, name: 'Anna', photoUrl: null, cashBalanceOre: 1000, fundBalanceOre: 2000, childLogin: null }] });
      if (url.includes('/api/children/1/transactions')) return json({ transactions: [] });
      return json({});
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Annas sparande' })).toBeInTheDocument();
    expect(screen.getByText('10,00 kr')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Kontanthistorik' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Fond20,00/ }));
    expect(await screen.findByRole('heading', { name: 'Fondhistorik' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/children/1/transactions?account=fund', expect.any(Object));
    await userEvent.click(screen.getByRole('button', { name: 'Ny transaktion' }));
    expect(screen.getByLabelText('Belopp (kr)')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Kommentar'), 'Present');
    expect(screen.getByDisplayValue('Present')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Användare parent' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Inställningar' }));
    expect(screen.getByText('Version 1.0.0')).toBeInTheDocument();
  });

  it('requires confirmation before deleting a transaction', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/csrf')) return json({ csrfToken: 'token' });
      if (url.endsWith('/api/setup/status')) return json({ needsSetup: false });
      if (url.endsWith('/api/auth/me')) return json({ user: { id: 1, username: 'parent', role: 'parent', childId: null }, csrfToken: 'token' });
      if (url.endsWith('/api/children')) return json({ children: [{ id: 1, name: 'Anna', photoUrl: null, cashBalanceOre: 10000, fundBalanceOre: 0, childLogin: null }] });
      if (url.includes('/api/children/1/transactions')) {
        return json({
          transactions: [{ id: 10, child_id: 1, account_type: 'cash', type: 'withdrawal', amount_ore: 5000, balance_ore: 5000, date: '2026-05-05', comment: '' }],
        });
      }
      if (url.endsWith('/api/transactions/10') && init?.method === 'DELETE') return json({});
      return json({});
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    expect(await screen.findByText('-50,00 kr')).toBeInTheDocument();
    const deleteButton = await screen.findByRole('button', { name: 'Ta bort transaktion' });

    await userEvent.click(deleteButton);
    expect(fetchMock).not.toHaveBeenCalledWith('/api/transactions/10', expect.objectContaining({ method: 'DELETE' }));
    expect(screen.getByRole('button', { name: 'Bekräfta borttagning' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Bekräfta borttagning' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/transactions/10', expect.objectContaining({ method: 'DELETE' }));
  });

  it('shows a transaction comment popover when clicking a transaction', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/csrf')) return json({ csrfToken: 'token' });
      if (url.endsWith('/api/setup/status')) return json({ needsSetup: false });
      if (url.endsWith('/api/auth/me')) return json({ user: { id: 1, username: 'parent', role: 'parent', childId: null }, csrfToken: 'token' });
      if (url.endsWith('/api/children')) return json({ children: [{ id: 1, name: 'Anna', photoUrl: null, cashBalanceOre: 10000, fundBalanceOre: 0, childLogin: null }] });
      if (url.includes('/api/children/1/transactions')) {
        return json({
          transactions: [{ id: 10, child_id: 1, account_type: 'cash', type: 'deposit', amount_ore: 5000, balance_ore: 10000, date: '2026-05-05', comment: 'Födelsedagspresent' }],
        });
      }
      return json({});
    }));

    render(<App />);
    const amount = await screen.findByText('50,00 kr');
    const row = amount.closest('tr');
    expect(row).toBeTruthy();

    await userEvent.click(row as HTMLTableRowElement);

    expect(screen.getByRole('dialog', { name: 'Transaktionskommentar' })).toBeInTheDocument();
    expect(screen.getByText('Födelsedagspresent')).toBeInTheDocument();
  });
});
