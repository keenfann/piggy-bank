-- migrate:up
CREATE TABLE IF NOT EXISTS allowances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL UNIQUE,
  account_type TEXT NOT NULL CHECK (account_type IN ('cash', 'fund')),
  amount_ore INTEGER NOT NULL CHECK (amount_ore > 0),
  cadence TEXT NOT NULL CHECK (cadence IN ('weekly', 'monthly')),
  next_run_date TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS allowance_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  allowance_id INTEGER NOT NULL,
  scheduled_date TEXT NOT NULL,
  transaction_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (allowance_id) REFERENCES allowances(id) ON DELETE CASCADE,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  UNIQUE(allowance_id, scheduled_date)
);

CREATE INDEX IF NOT EXISTS idx_allowances_child_id ON allowances(child_id);
CREATE INDEX IF NOT EXISTS idx_allowances_due ON allowances(enabled, next_run_date);
CREATE INDEX IF NOT EXISTS idx_allowance_runs_allowance_id ON allowance_runs(allowance_id);

-- migrate:down
DROP INDEX IF EXISTS idx_allowance_runs_allowance_id;
DROP INDEX IF EXISTS idx_allowances_due;
DROP INDEX IF EXISTS idx_allowances_child_id;
DROP TABLE IF EXISTS allowance_runs;
DROP TABLE IF EXISTS allowances;
