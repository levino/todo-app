# History

## 2026-01-23 - Initial Setup

Tasks angelegt fuer:
- OAuth Refresh Tokens
- Tageszeiten statt Cron
- Task-Completion Animation
- Kiosk-Begriff entfernen

## 2026-01-23 - Refresh Tokens Implementiert

**Task:** `implement-refresh-tokens`
**Status:** COMPLETED

### TDD Red Phase
- 8 neue Tests in `db.test.ts` fuer Refresh Token DB-Funktionen
- 6 neue Tests in `oauth.test.ts` fuer Token Endpoint Integration
- Tests schlugen wie erwartet fehl

### TDD Green Phase
- `oauth_refresh_tokens` Table in SQLite angelegt
- `saveRefreshToken()` - generiert Token, speichert bcrypt-Hash
- `consumeRefreshToken()` - validiert und revoked Token (Rotation)
- `cleanupExpiredRefreshTokens()` - loescht abgelaufene/revoked Tokens
- `deleteClient()` aktualisiert - loescht auch Refresh Tokens
- Token Endpoint (`token.ts`) komplett refactored:
  - `grant_type=authorization_code` gibt jetzt auch `refresh_token` zurueck
  - `grant_type=refresh_token` neu implementiert mit Rotation

### Ergebnis
- Alle 81 MCP Tests pass
- Alle 75 Frontend Tests pass
- Refresh Tokens haben 30 Tage TTL
- Access Tokens bleiben bei 1 Stunde TTL
