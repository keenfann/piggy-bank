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
      if (url.endsWith('/api/children/1/transactions')) return json({ transactions: [] });
      return json({});
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Anna' })).toBeInTheDocument();
    expect(screen.getByText('10,00 kr')).toBeInTheDocument();
    expect(screen.getByLabelText('Belopp (kr)')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Kommentar'), 'Present');
    expect(screen.getByDisplayValue('Present')).toBeInTheDocument();
  });
});
