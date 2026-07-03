import { afterEach, describe, expect, it } from 'vitest';
import { createTestServer } from '../helpers/api.js';

let server: ReturnType<typeof createTestServer> | null = null;

afterEach(() => {
  server?.cleanup();
  server = null;
});

describe('children and transactions', () => {
  it('creates children with cash/fund accounts and calculates balances', async () => {
    server = createTestServer();
    await server.setupParent();
    const child = await server.post('/api/children', { name: 'Anna' });
    expect(child.status).toBe(201);
    const childId = child.body.child.id;

    expect((await server.post(`/api/children/${childId}/transactions`, {
      account: 'cash',
      type: 'deposit',
      amountOre: 10000,
      date: '2026-05-05',
      comment: 'Present',
    })).status).toBe(201);
    expect((await server.post(`/api/children/${childId}/transactions`, {
      account: 'cash',
      type: 'withdrawal',
      amountOre: 2500,
      date: '2026-05-06',
      comment: 'Köp',
    })).status).toBe(201);

    await server.agent.get('/api/children').expect(200).expect(({ body }) => {
      expect(body.children[0].cashBalanceOre).toBe(7500);
      expect(body.children[0].fundBalanceOre).toBe(0);
    });

    await server.agent.get(`/api/children/${childId}/transactions`).expect(200).expect(({ body }) => {
      expect(body.transactions.map((tx: { balance_ore: number }) => tx.balance_ore)).toEqual([7500, 10000]);
    });
  });

  it('stores running transaction balances when history changes', async () => {
    server = createTestServer();
    await server.setupParent();
    const child = await server.post('/api/children', { name: 'Anna' });
    expect(child.status).toBe(201);
    const childId = child.body.child.id;

    const first = await server.post(`/api/children/${childId}/transactions`, {
      account: 'cash',
      type: 'deposit',
      amountOre: 10000,
      date: '2026-05-05',
      comment: 'Present',
    });
    expect(first.status).toBe(201);
    expect(first.body.transaction.balance_ore).toBe(10000);

    const older = await server.post(`/api/children/${childId}/transactions`, {
      account: 'cash',
      type: 'deposit',
      amountOre: 2500,
      date: '2026-05-01',
      comment: 'Earlier',
    });
    expect(older.status).toBe(201);
    expect(older.body.transaction.balance_ore).toBe(2500);

    await server.agent.get(`/api/children/${childId}/transactions`).expect(200).expect(({ body }) => {
      expect(body.transactions.map((tx: { date: string; balance_ore: number }) => [tx.date, tx.balance_ore])).toEqual([
        ['2026-05-05', 12500],
        ['2026-05-01', 2500],
      ]);
    });
  });

  it('updates transactions and recalculates affected account balances', async () => {
    server = createTestServer();
    await server.setupParent();
    const child = await server.post('/api/children', { name: 'Anna' });
    expect(child.status).toBe(201);
    const childId = child.body.child.id;

    const first = await server.post(`/api/children/${childId}/transactions`, {
      account: 'cash',
      type: 'deposit',
      amountOre: 10000,
      date: '2026-05-05',
      comment: 'Present',
    });
    expect(first.status).toBe(201);
    const second = await server.post(`/api/children/${childId}/transactions`, {
      account: 'cash',
      type: 'deposit',
      amountOre: 2500,
      date: '2026-05-06',
      comment: 'Extra',
    });
    expect(second.status).toBe(201);

    const update = await server.patch(`/api/transactions/${first.body.transaction.id}`, {
      account: 'fund',
      type: 'deposit',
      amountOre: 4000,
      date: '2026-05-04',
      comment: 'Flyttad till fond',
    });
    expect(update.status).toBe(200);
    expect(update.body.transaction.account_type).toBe('fund');
    expect(update.body.transaction.balance_ore).toBe(4000);

    await server.agent.get('/api/children').expect(200).expect(({ body }) => {
      expect(body.children[0].cashBalanceOre).toBe(2500);
      expect(body.children[0].fundBalanceOre).toBe(4000);
    });

    await server.agent.get(`/api/children/${childId}/transactions?account=cash`).expect(200).expect(({ body }) => {
      expect(body.transactions.map((tx: { comment: string; balance_ore: number }) => [tx.comment, tx.balance_ore])).toEqual([
        ['Extra', 2500],
      ]);
    });
  });

  it('rejects invalid transaction data', async () => {
    server = createTestServer();
    await server.setupParent();
    const child = await server.post('/api/children', { name: 'Anna' });
    expect(child.status).toBe(201);
    const childId = child.body.child.id;

    expect((await server.post(`/api/children/${childId}/transactions`, {
      account: 'crypto',
      type: 'deposit',
      amountOre: 100,
      date: '2026-05-05',
      comment: 'x',
    })).status).toBe(400);
    expect((await server.post(`/api/children/${childId}/transactions`, {
      account: 'cash',
      type: 'deposit',
      amountOre: -100,
      date: '2026-05-05',
      comment: 'x',
    })).status).toBe(400);
    expect((await server.post(`/api/children/${childId}/transactions`, {
      account: 'cash',
      type: 'unknown',
      amountOre: 100,
      date: '2026-99-99',
      comment: '',
    })).status).toBe(400);
  });

  it('configures weekly allowance and applies due deposits once', async () => {
    server = createTestServer();
    await server.setupParent();
    const child = await server.post('/api/children', { name: 'Anna' });
    expect(child.status).toBe(201);
    const childId = child.body.child.id;
    const today = new Date().toISOString().slice(0, 10);

    const allowance = await server.put(`/api/children/${childId}/allowance`, {
      account: 'cash',
      amountOre: 5000,
      cadence: 'weekly',
      nextRunDate: today,
      enabled: true,
    });

    expect(allowance.status).toBe(200);
    expect(allowance.body.allowance).toMatchObject({
      childId,
      account: 'cash',
      amountOre: 5000,
      cadence: 'weekly',
      enabled: true,
    });
    expect(allowance.body.allowance.nextRunDate > today).toBe(true);
    expect(allowance.body.applied.created).toBe(1);

    const appliedAgain = await server.post('/api/allowances/apply', {});
    expect(appliedAgain.status).toBe(200);
    expect(appliedAgain.body.applied.created).toBe(0);

    await server.agent.get(`/api/children/${childId}/transactions?account=cash`).expect(200).expect(({ body }) => {
      expect(body.transactions).toHaveLength(1);
      expect(body.transactions.every((tx: { comment: string; amount_ore: number }) => tx.comment === 'Veckopeng' && tx.amount_ore === 5000)).toBe(true);
    });

    await server.agent.get('/api/children').expect(200).expect(({ body }) => {
      expect(body.children[0].cashBalanceOre).toBe(5000);
    });
  });

  it('scopes child users to their own child and blocks exports', async () => {
    server = createTestServer();
    await server.setupParent();
    const anna = await server.post('/api/children', { name: 'Anna' });
    const elsa = await server.post('/api/children', { name: 'Elsa' });
    expect(anna.status).toBe(201);
    expect(elsa.status).toBe(201);
    expect((await server.post(`/api/children/${anna.body.child.id}/login`, { username: 'anna', password: 'anna12345' })).status).toBe(201);
    expect((await server.post('/api/auth/logout', {})).status).toBe(204);
    expect((await server.post('/api/auth/login', { username: 'anna', password: 'anna12345' })).status).toBe(200);

    await server.agent.get('/api/children').expect(200).expect(({ body }) => {
      expect(body.children).toHaveLength(1);
      expect(body.children[0].name).toBe('Anna');
    });
    await server.agent.get(`/api/children/${elsa.body.child.id}/transactions`).expect(403);
    expect((await server.post(`/api/children/${anna.body.child.id}/transactions`, {
      account: 'cash',
      type: 'deposit',
      amountOre: 100,
      date: '2026-05-05',
      comment: 'x',
    })).status).toBe(403);
    await server.agent.get('/api/export/transactions.csv').expect(403);
  });
});
