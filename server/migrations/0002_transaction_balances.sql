-- migrate:up
ALTER TABLE transactions ADD COLUMN balance_ore INTEGER NOT NULL DEFAULT 0;

WITH running_balances AS (
  SELECT id,
         SUM(CASE WHEN type = 'deposit' THEN amount_ore ELSE -amount_ore END)
           OVER (PARTITION BY account_id ORDER BY date ASC, id ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance_ore
  FROM transactions
)
UPDATE transactions
SET balance_ore = (
  SELECT running_balances.balance_ore
  FROM running_balances
  WHERE running_balances.id = transactions.id
);

-- migrate:down
ALTER TABLE transactions DROP COLUMN balance_ore;
