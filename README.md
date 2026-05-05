# Piggy Bank

Svensk, self-hostad PWA för att hantera barns sparande (kontant och fond) med roller för förälder och barn. Appen körs som en Docker-container på samma mönster som Episodely och Trainbook: React + Vite, Express, SQLite och GHCR-publicering.

## Funktioner

- Första uppstart skapar föräldrakonto.
- Föräldrar kan skapa barn, barninloggningar och transaktioner.
- Barn kan bara läsa sitt eget saldo och sin egen historik.
- Konton per barn: kontant och fond.
- JSON-backup, CSV-export och tvåstegs CSV-import.
- SQLite med migrationer, sessionslagring och CSRF-skydd.
- Mobil-först PWA med service worker.
- Docker image publiceras till GHCR vid push till `main`.

## Lokal utveckling

Krav: Node.js 22+

- `npm install`
- `npm run dev`
- `npm run typecheck`
- `npm test`
- `npm run test:e2e`
- `npm run build`

API och produktionsserver kör på `http://localhost:4287` som standard. Vite kör på `http://localhost:5173` och proxyar `/api` till Express.

## Docker/Synology

Använd `compose.sample.yml` som mall:

```bash
docker compose -f compose.sample.yml up -d
```

Standardvolymen `./data:/data` innehåller SQLite-databasen, uploads och sessionshemlighet. Säkerhetskopiera den katalogen innan uppgraderingar.
