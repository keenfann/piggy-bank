import test from 'node:test';
import assert from 'node:assert/strict';
import { balance, db } from '../../src/server.js';

test('balance handles deposits and withdrawals', () => {
  db.transactions.length = 0;
  db.transactions.push({ childId: 'c1', account: 'cash', type: 'deposit', amountOre: 10000 });
  db.transactions.push({ childId: 'c1', account: 'cash', type: 'withdrawal', amountOre: 2500 });
  assert.equal(balance('c1', 'cash'), 7500);
});
