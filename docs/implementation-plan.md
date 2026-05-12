# Implementationsplan

Piggy Bank är implementerad som en TypeScript single-package-app med React/Vite, Express och SQLite. Appen följer samma driftmönster som Episodely och Trainbook.

## Kvarvarande förbättringar efter v1
- Ikonuppsättning i flera PNG-storlekar för bredare PWA-stöd.
- Redigeringsvy för befintliga transaktioner i UI.
- Valfri import från JSON-backup.

## Leverans
- `npm run typecheck`
- `npm test`
- `npm run test:e2e`
- `npm run build`
- GHCR-publicering vid push till `main`
