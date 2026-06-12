/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';
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
    expect(screen.getByLabelText('Totalt sparande 30,00 kr')).toBeInTheDocument();
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
    expect(screen.getByRole('heading', { name: 'Förälder' })).toBeInTheDocument();
    expect(screen.getByText('Version 1.0.0')).toBeInTheDocument();
  });

  it('creates another parent from settings', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/csrf')) return json({ csrfToken: 'token' });
      if (url.endsWith('/api/setup/status')) return json({ needsSetup: false });
      if (url.endsWith('/api/auth/me')) return json({ user: { id: 1, username: 'parent', role: 'parent', childId: null }, csrfToken: 'token' });
      if (url.endsWith('/api/children')) return json({ children: [{ id: 1, name: 'Anna', photoUrl: null, cashBalanceOre: 1000, fundBalanceOre: 2000, childLogin: null }] });
      if (url.includes('/api/children/1/transactions')) return json({ transactions: [] });
      if (url.endsWith('/api/parents') && init?.method === 'POST') {
        return json({ user: { id: 2, username: 'partner', role: 'parent', childId: null } }, 201);
      }
      return json({});
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await screen.findByRole('heading', { name: 'Annas sparande' });
    await userEvent.click(screen.getByRole('button', { name: 'Användare parent' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Inställningar' }));

    const parentPanel = screen.getByRole('heading', { name: 'Förälder' }).closest('section');
    expect(parentPanel).not.toBeNull();
    const parentForm = within(parentPanel!);
    await userEvent.type(parentForm.getByLabelText('Användarnamn'), 'partner');
    await userEvent.type(parentForm.getByLabelText('Lösenord'), 'partner123');
    await userEvent.click(parentForm.getByRole('button', { name: 'Lägg till förälder' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/parents', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ username: 'partner', password: 'partner123' }),
    }));
    expect(await screen.findByText('Föräldern partner skapades.')).toBeInTheDocument();
  });

  it('refreshes balance cards when transaction history is reloaded', async () => {
    let childrenRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/csrf')) return json({ csrfToken: 'token' });
      if (url.endsWith('/api/setup/status')) return json({ needsSetup: false });
      if (url.endsWith('/api/auth/me')) return json({ user: { id: 1, username: 'parent', role: 'parent', childId: null }, csrfToken: 'token' });
      if (url.endsWith('/api/children')) {
        childrenRequests += 1;
        const updated = childrenRequests > 2;
        return json({
          children: [{
            id: 1,
            name: 'Anna',
            photoUrl: null,
            cashBalanceOre: 1000,
            fundBalanceOre: updated ? 500 : 0,
            childLogin: null,
          }],
        });
      }
      if (url.endsWith('/api/children/1/transactions?account=fund')) {
        return json({
          transactions: [{ id: 11, child_id: 1, account_type: 'fund', type: 'deposit', amount_ore: 500, balance_ore: 500, date: '2026-06-01', comment: 'Extern insättning' }],
        });
      }
      if (url.includes('/api/children/1/transactions')) return json({ transactions: [] });
      return json({});
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    expect(await screen.findByLabelText('Totalt sparande 10,00 kr')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Fond0,00/ }));

    expect(await screen.findByText('Extern insättning')).toBeInTheDocument();
    expect(await screen.findByLabelText('Totalt sparande 15,00 kr')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fond5,00/ })).toBeInTheDocument();
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
