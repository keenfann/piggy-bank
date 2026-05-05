import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppDb } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');
const UP_MARKER = '-- migrate:up';
const DOWN_MARKER = '-- migrate:down';

function checksum(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function parseMigration(content: string, id: string): { upSql: string; downSql: string } {
  const upIndex = content.indexOf(UP_MARKER);
  if (upIndex === -1) throw new Error(`Migration ${id} is missing ${UP_MARKER}.`);
  const downIndex = content.indexOf(DOWN_MARKER);
  const upSql = content.slice(upIndex + UP_MARKER.length, downIndex === -1 ? undefined : downIndex).trim();
  const downSql = downIndex === -1 ? '' : content.slice(downIndex + DOWN_MARKER.length).trim();
  if (!upSql) throw new Error(`Migration ${id} has empty up SQL.`);
  return { upSql, downSql };
}

export function runMigrations(db: AppDb, migrationsDir = DEFAULT_MIGRATIONS_DIR): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      down_sql TEXT NOT NULL
    );
  `);

  const applied = new Map(
    db.prepare('SELECT id, checksum FROM schema_migrations').all<{ id: string; checksum: string }>().map((row) => [row.id, row.checksum])
  );
  const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();
  const insert = db.prepare('INSERT INTO schema_migrations (id, checksum, applied_at, down_sql) VALUES (?, ?, ?, ?)');

  for (const file of files) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const nextChecksum = checksum(content);
    const previousChecksum = applied.get(file);

    if (previousChecksum) {
      if (previousChecksum !== nextChecksum) {
        throw new Error(`Migration checksum mismatch for ${file}.`);
      }
      continue;
    }

    const migration = parseMigration(content, file);
    db.exec('BEGIN;');
    try {
      db.exec(migration.upSql);
      insert.run(file, nextChecksum, new Date().toISOString(), migration.downSql);
      db.exec('COMMIT;');
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }
  }
}
