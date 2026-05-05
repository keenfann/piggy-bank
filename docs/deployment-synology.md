# Deployment på Synology

## Krav
- Docker/Container Manager
- Reverse proxy + TLS
- Persistent volym för SQLite, uploads och sessionshemlighet

## Miljövariabler
- `DB_PATH=/data/piggy-bank.sqlite`
- `UPLOAD_DIR=/data/uploads`
- `PORT=4287`
- `HOST=0.0.0.0`
- `SESSION_SECRET` (valfri; annars skapas och sparas en hemlighet i datakatalogen)

## Körning
1. Kopiera `compose.sample.yml` till Synology.
2. Kör `docker compose up -d`.
3. Öppna `http://<nas>:4287` och skapa första föräldrakontot.
4. Health check finns på `/api/health`.

Migrationer körs automatiskt vid start. Säkerhetskopiera `./data` innan uppgradering.
