import { createRequire } from 'node:module';

export interface StatementResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface StatementSync {
  get<T = unknown>(...params: unknown[]): T | undefined;
  all<T = unknown>(...params: unknown[]): T[];
  run(...params: unknown[]): StatementResult;
}

export interface DatabaseSync {
  exec(sql: string): void;
  prepare(sql: string): StatementSync;
  close(): void;
}

interface DatabaseConstructor {
  new (path: string): DatabaseSync;
}

const require = createRequire(import.meta.url);
const sqlite = require('node:sqlite') as { DatabaseSync: DatabaseConstructor };

export const NativeDatabaseSync = sqlite.DatabaseSync;
