import test from 'node:test';
import assert from 'node:assert/strict';
import { server, db } from '../../src/server.js';

async function req(path, method='GET', body, token) {
  const res = await fetch(`http://127.0.0.1:3100${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const txt = await res.text();
  let json;
  try { json = JSON.parse(txt); } catch { json = txt; }
  return { status: res.status, body: json };
}

test('api auth + create transaction + export', async (t) => {
  db.transactions.length = 0;
  await new Promise((resolve) => server.listen(3100, resolve));
  t.after(() => server.close());

  const login = await req('/api/auth/login', 'POST', { username: 'parent', password: 'parent123' });
  assert.equal(login.status, 200);
  const token = login.body.token;

  const created = await req('/api/transactions', 'POST', {
    childId: 'c1', account: 'cash', type: 'deposit', amountOre: 1000, date: '2026-05-05', comment: 'Present'
  }, token);
  assert.equal(created.status, 201);

  const children = await req('/api/children', 'GET', null, token);
  assert.equal(children.status, 200);
  assert.equal(children.body[0].kontantOre, 1000);
});
