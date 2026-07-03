import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../../server/index.js';
import { createDatabase } from '../../server/db.js';

export function createTestServer() {
  const dbPath = path.join(os.tmpdir(), `piggy-bank-test-${process.pid}-${Date.now()}-${Math.random()}.sqlite`);
  const uploadDir = path.join(os.tmpdir(), `piggy-bank-uploads-${process.pid}-${Date.now()}-${Math.random()}`);
  const db = createDatabase(dbPath);
  const app = createApp({ db, uploadDir, staticDir: '__missing__' });
  const agent = request.agent(app);

  async function csrf() {
    const response = await agent.get('/api/csrf').expect(200);
    return response.body.csrfToken as string;
  }

  async function post(pathname: string, body: object) {
    const token = await csrf();
    return agent.post(pathname).set('x-csrf-token', token).send(body);
  }

  async function patch(pathname: string, body: object) {
    const token = await csrf();
    return agent.patch(pathname).set('x-csrf-token', token).send(body);
  }

  async function put(pathname: string, body: object) {
    const token = await csrf();
    return agent.put(pathname).set('x-csrf-token', token).send(body);
  }

  async function del(pathname: string) {
    const token = await csrf();
    return agent.delete(pathname).set('x-csrf-token', token);
  }

  async function setupParent(username = 'parent', password = 'parent123') {
    const response = await post('/api/setup', { username, password });
    if (response.status !== 201) throw new Error(`Setup failed with ${response.status}`);
  }

  function cleanup() {
    db.close();
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(`${dbPath}-shm`, { force: true });
    fs.rmSync(`${dbPath}-wal`, { force: true });
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }

  return { app, agent, db, post, put, patch, del, csrf, setupParent, cleanup };
}
