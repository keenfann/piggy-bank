import { afterEach, describe, expect, it } from 'vitest';
import { createTestServer } from '../helpers/api.js';

let server: ReturnType<typeof createTestServer> | null = null;

afterEach(() => {
  server?.cleanup();
  server = null;
});

describe('auth and setup', () => {
  it('creates the first parent and stores a bcrypt hash', async () => {
    server = createTestServer();
    await server.agent.get('/api/setup/status').expect(200).expect(({ body }) => {
      expect(body.needsSetup).toBe(true);
    });

    const setup = await server.post('/api/setup', { username: 'parent', password: 'parent123' });
    expect(setup.status).toBe(201);
    const row = server.db.prepare('SELECT username, password_hash, role FROM users WHERE username = ?').get<{ username: string; password_hash: string; role: string }>('parent');
    expect(row?.role).toBe('parent');
    expect(row?.password_hash).not.toBe('parent123');
    expect(row?.password_hash.startsWith('$2')).toBe(true);
  });

  it('requires csrf for mutating requests', async () => {
    server = createTestServer();
    await server.agent.post('/api/setup').send({ username: 'parent', password: 'parent123' }).expect(403);
  });

  it('logs in and out with a persisted session', async () => {
    server = createTestServer();
    await server.setupParent();
    expect((await server.post('/api/auth/logout', {})).status).toBe(204);

    expect((await server.post('/api/auth/login', { username: 'parent', password: 'parent123' })).status).toBe(200);
    await server.agent.get('/api/auth/me').expect(200).expect(({ body }) => {
      expect(body.user.username).toBe('parent');
    });
    expect((await server.post('/api/auth/logout', {})).status).toBe(204);
    await server.agent.get('/api/auth/me').expect(200).expect(({ body }) => {
      expect(body.user).toBeNull();
    });
  });

  it('lets a parent create another parent with the same access', async () => {
    server = createTestServer();
    await server.setupParent();
    const response = await server.post('/api/parents', { username: 'partner', password: 'partner123' });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ username: 'partner', role: 'parent', childId: null });

    const row = server.db.prepare('SELECT username, password_hash, role, child_id FROM users WHERE username = ?').get<{
      username: string;
      password_hash: string;
      role: string;
      child_id: number | null;
    }>('partner');
    expect(row?.role).toBe('parent');
    expect(row?.child_id).toBeNull();
    expect(row?.password_hash).not.toBe('partner123');

    await server.post('/api/auth/logout', {});
    expect((await server.post('/api/auth/login', { username: 'partner', password: 'partner123' })).status).toBe(200);
    expect((await server.post('/api/children', { name: 'Anna' })).status).toBe(201);
  });

  it('rejects duplicate parent usernames', async () => {
    server = createTestServer();
    await server.setupParent();

    expect((await server.post('/api/parents', { username: 'parent', password: 'partner123' })).status).toBe(409);
  });

  it('blocks child users from creating parents', async () => {
    server = createTestServer();
    await server.setupParent();
    const child = await server.post('/api/children', { name: 'Anna' });
    expect((await server.post(`/api/children/${child.body.child.id}/login`, { username: 'anna', password: 'anna12345' })).status).toBe(201);
    await server.post('/api/auth/logout', {});
    expect((await server.post('/api/auth/login', { username: 'anna', password: 'anna12345' })).status).toBe(200);

    expect((await server.post('/api/parents', { username: 'partner', password: 'partner123' })).status).toBe(403);
  });
});
