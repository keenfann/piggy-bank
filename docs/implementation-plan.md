# Implementationsplan (svenska-only)

## Fas 1: Grund
- Monorepo struktur: `apps/web`, `apps/api`, `packages/shared`.
- Auth: username/lösenord, roller `FORALDER`, `BARN`.
- Databas: PostgreSQL + migrationer.

## Fas 2: Sparlogik
- Barn med namn + foto.
- Två kontotyper per barn: `KONTANT`, `FOND`.
- Transaktioner: insättning/uttag med obligatorisk kommentar + datum.
- Belopp lagras i öre.

## Fas 3: Import/export
- CSV-import med torrkörning + validering.
- Export till CSV (alla barn eller filtrerat).

## Fas 4: PWA/UX
- Mobil-först.
- iOS-liknande animationer.
- Svenska texter i central textmodul.

## Fas 5: Kvalitet/leverans
- Unit/integration/e2e (Playwright).
- GitHub Actions pipeline.
- GHCR image build + publish.
- Synology deployment.
