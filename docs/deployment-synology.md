# Deployment på Synology

## Krav
- Docker/Container Manager
- Reverse proxy + TLS
- Persistenta volymer för DB och uploads

## Miljövariabler
- `DATABASE_URL`
- `AUTH_SECRET`
- `UPLOAD_DIR`

## Körning
1. Pull image från GHCR
2. Starta container med volymer
3. Kör migrationer
4. Health check på `/health`
