# Learnings

## TDD
- Tests werden inkrementell geschrieben
- Kleiner Test → Code → Kleiner Test → Code
- Nie einen grossen Test am Anfang und dann alles implementieren

## PocketBase
- Migrations nie manuell editieren
- Schema-Aenderungen via SDK, PocketBase generiert Migration automatisch
- Tests laufen als normaler User, nicht als Superuser

## OAuth
- Access Tokens in SQLite: `/app/data/oauth.db`
- RSA Keys in: `/app/data/oauth-keys/`
- JWTs sind stateless, werden nicht gespeichert
