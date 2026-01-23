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

## 2026-01-23 - Inactive Client Cleanup Implementiert

**Task:** `cleanup-old-oauth-clients`
**Status:** COMPLETED

### TDD Red Phase
- 6 neue Tests in `db.test.ts` fuer Client-Cleanup-Logik
- Tests prueften:
  - Clients aelter als 30 Tage ohne Refresh Tokens werden geloescht
  - Clients mit gueltigen Refresh Tokens bleiben (auch wenn alt)
  - Neue Clients bleiben
  - Clients mit nur abgelaufenen/revoked Tokens werden geloescht
  - Mix von aktiven und inaktiven Clients

### TDD Green Phase
- `cleanupInactiveClients()` implementiert:
  - Findet Clients aelter als 30 Tage
  - Prueft ob gueltige (nicht abgelaufen, nicht revoked) Refresh Tokens existieren
  - Loescht nur Clients ohne aktive Tokens
- `backdateClient()` als Test-Helper hinzugefuegt
- Cleanup bei Server-Start in `initOAuth()` integriert

### Ergebnis
- Alle 87 MCP Tests pass (31 db + 28 oauth + 14 server + 14 jwt)
- Alle 75 Frontend Tests pass
- Server loggt Cleanup-Ergebnis bei Start

## 2026-01-23 - Cron durch Tageszeiten ersetzt

**Task:** `replace-cron-with-time-periods`
**Status:** COMPLETED

### Schema-Aenderungen
- ENTFERNT: `cron` (Text-Feld fuer Cron-Expressions)
- ENTFERNT: `time` (Text-Feld fuer HH:MM Zeit)
- HINZUGEFUEGT: `timePeriod` (Select: morning, afternoon, evening) - REQUIRED
- HINZUGEFUEGT: `daysOfWeek` (JSON Array: ['mon', 'tue', 'wed', ...])
- BEHALTEN: `intervalDays` (Nummer fuer Intervall-Schedules)

### Code-Aenderungen
- Migration `1769197503_updated_schedules.js` erstellt via PocketBase SDK
- `scheduleProcessor.ts`: Interface aktualisiert auf neue Felder
- `server.ts` (MCP):
  - ScheduleRecord Interface aktualisiert
  - list_schedules Tool zeigt neue Felder
  - create_schedule Tool nutzt timePeriod + daysOfWeek/intervalDays
  - update_schedule Tool aktualisiert
- Integration Tests aktualisiert (schedules.integration.test.ts, schedule-time-travel.integration.test.ts)

### Ergebnis
- Alle 87 MCP Tests pass
- Alle 76 Frontend Tests pass
- Schedules nutzen jetzt Tageszeiten statt praeziser Uhrzeiten

## 2026-01-23 - Kiosk-Terminologie entfernt

**Task:** `purge-kiosk-terminology`
**Status:** COMPLETED

### Aenderungen
- `kiosk.integration.test.ts` umbenannt zu `tasks.integration.test.ts`
- Test-Beschreibung von "Kiosk Mode - Task List" zu "Task List" geaendert
- `KioskTask` Interface umbenannt zu `Task` in [childId].astro
- `agentic-work/kiosk-mode/` Ordner geloescht (obsolet)
- CLAUDE.md Beispiele aktualisiert (`kiosk_tasks` -> `tasks`)

### Nicht geaendert
- Alte PocketBase Migrations (duerfen nie editiert werden)
- Collection ist bereits "tasks" (nicht "kiosk_tasks")

### Ergebnis
- Alle 87 MCP Tests pass
- Alle 76 Frontend Tests pass
- Kein "kiosk" mehr in aktiven Code-Dateien
