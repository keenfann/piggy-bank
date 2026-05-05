import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NativeDatabaseSync } from '../../server/sqlite.js';
import { runMigrations } from '../../server/migrations.js';
import type { AppDb } from '../../server/types.js';

describe('migrations', () => {
  it('runs once and rejects checksum drift', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'piggy-bank-migrations-'));
    const dbPath = path.join(dir, 'test.sqlite');
    const migrationsDir = path.join(dir, 'migrations');
    fs.mkdirSync(migrationsDir);
    const migrationPath = path.join(migrationsDir, '0001_test.sql');
    fs.writeFileSync(migrationPath, '-- migrate:up\nCREATE TABLE demo (id INTEGER PRIMARY KEY);\n-- migrate:down\nDROP TABLE demo;\n');
    const db = new NativeDatabaseSync(dbPath) as AppDb;

    runMigrations(db, migrationsDir);
    runMigrations(db, migrationsDir);
    fs.writeFileSync(migrationPath, '-- migrate:up\nCREATE TABLE demo (id INTEGER PRIMARY KEY, name TEXT);\n');

    expect(() => runMigrations(db, migrationsDir)).toThrow(/checksum/i);
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
