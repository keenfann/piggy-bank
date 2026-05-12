import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeWeeklyTransactionBackupIfDue } from '../../server/backup.js';
import { buildJsonExport } from '../../server/index.js';
import { createTestServer } from '../helpers/api.js';

let server: ReturnType<typeof createTestServer> | null = null;
let backupDir: string | null = null;

afterEach(() => {
  server?.cleanup();
  server = null;
  if (backupDir) fs.rmSync(backupDir, { recursive: true, force: true });
  backupDir = null;
});

describe('transaction backups', () => {
  it('writes weekly json backups with all transactions and skips the same week', async () => {
    server = createTestServer();
    backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'piggy-bank-backups-'));
    await server.setupParent();
    expect((await server.post('/api/children', { name: 'Anna' })).status).toBe(201);
    expect(
      (
        await server.post('/api/children/1/transactions', {
          account: 'cash',
          type: 'deposit',
          amountOre: 1234,
          date: '2026-05-05',
          comment: 'Present',
        })
      ).status
    ).toBe(201);

    const first = writeWeeklyTransactionBackupIfDue(() => buildJsonExport(server!.db), {
      backupDir,
      now: () => new Date('2026-05-12T10:00:00.000Z'),
    });
    const second = writeWeeklyTransactionBackupIfDue(() => buildJsonExport(server!.db), {
      backupDir,
      now: () => new Date('2026-05-15T10:00:00.000Z'),
    });

    expect(first.skipped).toBe(false);
    expect(second.skipped).toBe(true);
    expect(fs.readdirSync(backupDir)).toEqual(['piggy-bank-transactions-2026-05-12.json']);

    const payload = JSON.parse(fs.readFileSync(first.filePath!, 'utf8'));
    expect(payload.version).toBe(1);
    expect(payload.children[0].transactions).toHaveLength(1);
    expect(Object.keys(payload.children[0].transactions[0]).sort()).toEqual([
      'account_id',
      'account_type',
      'amount_ore',
      'balance_ore',
      'child_id',
      'comment',
      'created_at',
      'created_by_user_id',
      'date',
      'id',
      'type',
      'updated_at',
    ]);
    expect(payload.children[0].transactions[0]).toMatchObject({
      account_type: 'cash',
      amount_ore: 1234,
      comment: 'Present',
    });
  });

  it('prunes transaction backups older than the retention window', () => {
    backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'piggy-bank-backups-'));
    fs.writeFileSync(path.join(backupDir, 'piggy-bank-transactions-2025-05-11.json'), '{}\n');
    fs.writeFileSync(path.join(backupDir, 'piggy-bank-transactions-2025-05-12.json'), '{}\n');

    writeWeeklyTransactionBackupIfDue(() => ({ version: 1, children: [] }), {
      backupDir,
      now: () => new Date('2026-05-12T10:00:00.000Z'),
    });

    expect(fs.readdirSync(backupDir).sort()).toEqual([
      'piggy-bank-transactions-2025-05-12.json',
      'piggy-bank-transactions-2026-05-12.json',
    ]);
  });
});
