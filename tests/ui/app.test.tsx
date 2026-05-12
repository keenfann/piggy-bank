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
    expect(screen.getByRole('heading', { name: 'Historik' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Fond20,00/ }));
    expect(await screen.findByRole('heading', { name: 'Historik' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/children/1/transactions?account=fund', expect.any(Object));
    await userEvent.click(screen.getByRole('button', { name: 'Ny transaktion' }));
    expect(screen.getByLabelText('Belopp (kr)')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Kommentar'), 'Present');
    expect(screen.getByDisplayValue('Present')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Användare parent' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Inställningar' }));
    expect(screen.getByText('Version 1.0.0')).toBeInTheDocument();
  });

  it('shows delete confirmation inside the unfolded transaction comment', async () => {
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
    await userEvent.click(screen.getByRole('button', { name: 'Visa kommentar för transaktion 2026-05-05' }));
    const deleteButton = screen.getByRole('button', { name: 'Ta bort transaktion' });

    await userEvent.click(deleteButton);
    expect(fetchMock).not.toHaveBeenCalledWith('/api/transactions/10', expect.objectContaining({ method: 'DELETE' }));
    expect(screen.queryByRole('button', { name: 'Ta bort transaktion' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bekräfta borttagning' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Bekräfta borttagning' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/transactions/10', expect.objectContaining({ method: 'DELETE' }));
  });

  it('unfolds and folds a transaction comment when clicking a transaction card', async () => {
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
    await screen.findByText('50,00 kr');
    const card = screen.getByRole('button', { name: 'Visa kommentar för transaktion 2026-05-05' });
    const comment = screen.getByText('Födelsedagspresent');

    expect(comment).not.toBeVisible();

    await userEvent.click(card);

    expect(card).toHaveAttribute('aria-expanded', 'true');
    expect(comment).toBeVisible();

    await userEvent.click(card);

    expect(card).toHaveAttribute('aria-expanded', 'false');
    expect(comment).not.toBeVisible();
  });
});
