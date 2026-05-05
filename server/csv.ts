import { parse as parseCsv } from 'csv-parse/sync';
import type { AccountType, AppDb, TransactionType } from './types.js';

export interface ImportRow {
  row: number;
  childId: number;
  childName: string;
  account: AccountType;
  type: TransactionType;
  amountOre: number;
  date: string;
  comment: string;
}

export interface ImportError {
  row: number;
  error: string;
}

export interface ImportValidation {
  validRows: ImportRow[];
  errors: ImportError[];
}

interface CsvRecord {
  childId?: string;
  childName?: string;
  account?: string;
  type?: string;
  amountOre?: string;
  date?: string;
  comment?: string;
}

export function validateTransactionsCsv(db: AppDb, csv: string): ImportValidation {
  const errors: ImportError[] = [];
  let records: CsvRecord[] = [];
  try {
    records = parseCsv(csv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as CsvRecord[];
  } catch (error) {
    return {
      validRows: [],
      errors: [{ row: 1, error: error instanceof Error ? error.message : 'CSV kunde inte läsas' }],
    };
  }

  const validRows: ImportRow[] = [];
  records.forEach((record, index) => {
    const rowNumber = index + 2;
    const rowErrors: string[] = [];
    const child = resolveChild(db, record.childId, record.childName);
    const account = normalizeAccount(record.account);
    const type = normalizeType(record.type);
    const amountOre = Number(record.amountOre);
    const date = String(record.date || '').trim();
    const comment = String(record.comment || '').trim();

    if (!child) rowErrors.push('Barn saknas eller hittades inte');
    if (!account) rowErrors.push('Kontotyp måste vara cash/kontant eller fund/fond');
    if (!type) rowErrors.push('Typ måste vara deposit/insattning eller withdrawal/uttag');
    if (!Number.isInteger(amountOre) || amountOre <= 0) rowErrors.push('Belopp i öre måste vara ett positivt heltal');
    if (!isIsoDate(date)) rowErrors.push('Datum måste vara YYYY-MM-DD');
    if (!comment) rowErrors.push('Kommentar krävs');

    if (rowErrors.length || !child || !account || !type) {
      errors.push({ row: rowNumber, error: rowErrors.join(', ') });
      return;
    }

    validRows.push({
      row: rowNumber,
      childId: child.id,
      childName: child.name,
      account,
      type,
      amountOre,
      date,
      comment,
    });
  });

  return { validRows, errors };
}

export function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function normalizeAccount(value: unknown): AccountType | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'cash' || normalized === 'kontant') return 'cash';
  if (normalized === 'fund' || normalized === 'fond') return 'fund';
  return null;
}

export function normalizeType(value: unknown): TransactionType | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'deposit' || normalized === 'insattning' || normalized === 'insättning') return 'deposit';
  if (normalized === 'withdrawal' || normalized === 'uttag') return 'withdrawal';
  return null;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function resolveChild(db: AppDb, childId?: string, childName?: string): { id: number; name: string } | undefined {
  const numericId = Number(childId);
  if (Number.isInteger(numericId) && numericId > 0) {
    return db.prepare('SELECT id, name FROM children WHERE id = ?').get<{ id: number; name: string }>(numericId);
  }
  const name = String(childName || '').trim();
  if (!name) return undefined;
  return db.prepare('SELECT id, name FROM children WHERE lower(name) = lower(?)').get<{ id: number; name: string }>(name);
}
