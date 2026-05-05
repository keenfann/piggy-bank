# API-kontrakt (v1)

## Auth
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

## Barn
- `GET /api/children`
- `POST /api/children` (förälder)
- `PATCH /api/children/:id` (förälder)

## Transaktioner
- `GET /api/children/:id/transactions?account=KONTANT|FOND`
- `POST /api/children/:id/transactions` (förälder)
- `DELETE /api/transactions/:id` (förälder)

## Import/Export
- `POST /api/import/transactions` (CSV upload + dry-run)
- `POST /api/import/transactions/commit`
- `GET /api/export/transactions.csv`
