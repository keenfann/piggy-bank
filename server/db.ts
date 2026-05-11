import fs from 'node:fs';
import path from 'node:path';
import { runMigrations } from './migrations.js';
import { NativeDatabaseSync } from './sqlite.js';
import type { AppDb } from './types.js';

export function resolveDbPath(): string {
  return process.env.DB_PATH || path.resolve(process.cwd(), 'db', 'piggy-bank.sqlite');
}

export function createDatabase(dbPath = resolveDbPath()): AppDb {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new NativeDatabaseSync(dbPath) as AppDb;
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  runMigrations(db);
  return db;
}
