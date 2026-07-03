import type { DatabaseSync } from './sqlite.js';

export type Role = 'parent' | 'child';
export type AccountType = 'cash' | 'fund';
export type TransactionType = 'deposit' | 'withdrawal';
export type AllowanceCadence = 'weekly' | 'monthly';

export interface AppDb extends DatabaseSync {}

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: Role;
  child_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface ChildRow {
  id: number;
  name: string;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountRow {
  id: number;
  child_id: number;
  type: AccountType;
  created_at: string;
}

export interface TransactionRow {
  id: number;
  account_id: number;
  child_id: number;
  account_type: AccountType;
  type: TransactionType;
  amount_ore: number;
  balance_ore: number;
  date: string;
  comment: string;
  created_by_user_id: number;
  created_at: string;
  updated_at: string;
}

export interface AllowanceRow {
  id: number;
  child_id: number;
  account_type: AccountType;
  amount_ore: number;
  cadence: AllowanceCadence;
  next_run_date: string;
  enabled: number;
  created_by_user_id: number;
  created_at: string;
  updated_at: string;
}

export interface AuthUser {
  id: number;
  username: string;
  role: Role;
  childId: number | null;
}

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    csrfToken?: string;
  }
}
