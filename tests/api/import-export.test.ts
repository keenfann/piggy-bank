import { afterEach, describe, expect, it } from 'vitest';
import { createTestServer } from '../helpers/api.js';

let server: ReturnType<typeof createTestServer> | null = null;

afterEach(() => {
  server?.cleanup();
  server = null;
});

describe('import and export', () => {
  it('validates quoted csv and commits valid rows', async () => {
    server = createTestServer();
    await server.setupParent();
    expect((await server.post('/api/children', { name: 'Anna' })).status).toBe(201);
    const csv = 'childName,account,type,amountOre,date,comment\nAnna,cash,deposit,1234,2026-05-05,"Present, maj"\n';

    const validation = await server.post('/api/import/transactions/validate', { csv });
    expect(validation.status).toBe(200);
    expect(validation.body.imported).toBe(1);
    expect(validation.body.errors).toHaveLength(0);
    const commit = await server.post('/api/import/transactions/commit', { csv });
    expect(commit.status).toBe(200);
    expect(commit.body.imported).toBe(1);
    await server.agent.get('/api/export/transactions.csv').expect(200).expect(({ text }) => {
      expect(text).toContain('"Present, maj"');
    });
    await server.agent.get('/api/export.json').expect(200).expect(({ body }) => {
      expect(body.version).toBe(1);
      expect(body.children[0].transactions).toHaveLength(1);
    });
  });

  it('rejects invalid csv rows on commit', async () => {
    server = createTestServer();
    await server.setupParent();
    expect((await server.post('/api/children', { name: 'Anna' })).status).toBe(201);
    const csv = 'childName,account,type,amountOre,date,comment\nAnna,cash,deposit,-1,2026-05-05,\n';

    const validation = await server.post('/api/import/transactions/validate', { csv });
    expect(validation.status).toBe(200);
    expect(validation.body.errors).toHaveLength(1);
    expect((await server.post('/api/import/transactions/commit', { csv })).status).toBe(400);
  });
});
