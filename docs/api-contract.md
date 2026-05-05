# API-kontrakt

Alla muterande anrop kräver `x-csrf-token` från `GET /api/csrf` och en aktiv cookie-session där endpointen kräver inloggning.

## System/auth
- `GET /api/health`
- `GET /api/csrf`
- `GET /api/setup/status`
- `POST /api/setup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/change-password`

## Barn
- `GET /api/children`
- `POST /api/children` (förälder)
- `PATCH /api/children/:id` (förälder)
- `POST /api/children/:id/photo` (förälder)
- `POST /api/children/:id/login` (förälder)

## Transaktioner
- `GET /api/children/:id/transactions?account=cash|fund`
- `POST /api/children/:id/transactions` (förälder): `{ account, type, amountOre, date, comment }`
- `PATCH /api/transactions/:id` (förälder)
- `DELETE /api/transactions/:id` (förälder)

## Import/Export
- `GET /api/export.json` (förälder)
- `GET /api/export/transactions.csv` (förälder)
- `POST /api/import/transactions/validate` (förälder)
- `POST /api/import/transactions/commit` (förälder)
