import fs from 'node:fs';
import path from 'node:path';
import { resolveDbPath } from './db.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CHECK_INTERVAL_MS = DAY_MS;
const DEFAULT_RETENTION_DAYS = 365;
const BACKUP_PREFIX = 'piggy-bank-transactions-';
const BACKUP_SUFFIX = '.json';

export interface WeeklyTransactionBackupOptions {
  backupDir?: string;
  checkIntervalMs?: number;
  retentionDays?: number;
  now?: () => Date;
  logger?: Pick<Console, 'log' | 'warn'>;
}

export interface TransactionBackupResult {
  filePath: string | null;
  prunedFiles: string[];
  skipped: boolean;
}

export function resolveTransactionBackupDir(dbPath = resolveDbPath()): string {
  return process.env.TRANSACTION_BACKUP_DIR || path.resolve(path.dirname(dbPath), 'backups');
}

export function writeWeeklyTransactionBackupIfDue(
  createPayload: () => unknown,
  options: WeeklyTransactionBackupOptions = {}
): TransactionBackupResult {
  const backupDir = options.backupDir || resolveTransactionBackupDir();
  const now = options.now?.() || new Date();
  fs.mkdirSync(backupDir, { recursive: true });

  const backups = listTransactionBackups(backupDir);
  const latestBackup = backups[backups.length - 1];
  const latestBackupDate = latestBackup ? parseBackupDate(latestBackup) : null;
  if (latestBackupDate && now.getTime() - latestBackupDate.getTime() < WEEK_MS) {
    return {
      filePath: null,
      prunedFiles: pruneTransactionBackups(backupDir, options.retentionDays ?? DEFAULT_RETENTION_DAYS, now),
      skipped: true,
    };
  }

  const filePath = path.join(backupDir, `${BACKUP_PREFIX}${formatDate(now)}${BACKUP_SUFFIX}`);
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(createPayload(), null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempPath, filePath);

  return {
    filePath,
    prunedFiles: pruneTransactionBackups(backupDir, options.retentionDays ?? DEFAULT_RETENTION_DAYS, now),
    skipped: false,
  };
}

export function startWeeklyTransactionBackups(
  createPayload: () => unknown,
  options: WeeklyTransactionBackupOptions = {}
): () => void {
  const logger = options.logger || console;
  const run = () => {
    try {
      const result = writeWeeklyTransactionBackupIfDue(createPayload, options);
      if (result.filePath) logger.log(`Skrev transaktionsbackup: ${result.filePath}`);
      for (const filePath of result.prunedFiles) logger.log(`Tog bort gammal transaktionsbackup: ${filePath}`);
    } catch (error) {
      logger.warn('Kunde inte skriva transaktionsbackup.', error);
    }
  };

  run();
  const timer = setInterval(run, options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}

function listTransactionBackups(backupDir: string): string[] {
  return fs
    .readdirSync(backupDir)
    .filter((filename) => filename.startsWith(BACKUP_PREFIX) && filename.endsWith(BACKUP_SUFFIX) && Boolean(parseBackupDate(filename)))
    .sort();
}

function pruneTransactionBackups(backupDir: string, retentionDays: number, now: Date): string[] {
  const cutoff = startOfUtcDay(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  const prunedFiles: string[] = [];
  for (const filename of listTransactionBackups(backupDir)) {
    const backupDate = parseBackupDate(filename);
    if (!backupDate || backupDate.getTime() >= cutoff.getTime()) continue;
    const filePath = path.join(backupDir, filename);
    fs.rmSync(filePath, { force: true });
    prunedFiles.push(filePath);
  }
  return prunedFiles;
}

function parseBackupDate(filename: string): Date | null {
  const datePart = filename.slice(BACKUP_PREFIX.length, -BACKUP_SUFFIX.length);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  const date = new Date(`${datePart}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
