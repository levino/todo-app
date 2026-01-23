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

## 2026-01-23 - User-konfigurierbare Tageszeiten implementiert

**Task:** `user-configurable-time-periods`
**Status:** COMPLETED

### TDD Red Phase
- 4 Integration Tests in `timePeriods.integration.test.ts`:
  - Default-Einstellungen wenn User keine custom Settings hat
  - Custom Settings werden korrekt geladen
  - Defaults fuer ungesetzte Felder
  - Defaults wenn User nicht gefunden

### Migration
- `1769198401_updated_users.js` erstellt via PocketBase SDK
- Neue Felder in `users` Collection:
  - `morningStart` (text, optional) - HH:MM Format
  - `afternoonStart` (text, optional) - HH:MM Format
  - `eveningStart` (text, optional) - HH:MM Format

### TDD Green Phase
- `timePeriods.ts` erstellt mit:
  - `TimePeriod` Type ('morning' | 'afternoon' | 'evening')
  - `UserTimePeriodSettings` Interface
  - `DEFAULT_TIME_PERIODS` (06:00, 12:00, 18:00)
  - `parseTime()` - HH:MM String zu {hours, minutes}
  - `getTimePeriodStart()` - Start einer Tageszeit
  - `getTimePeriodEnd()` - Ende einer Tageszeit
  - `isTimeInPeriod()` - Ist Zeit in Tageszeit?
  - `getCurrentTimePeriod()` - Aktuelle Tageszeit
  - `getTimePeriodStartDateTime()` - Start-DateTime fuer Tageszeit
  - `getUserTimePeriodSettings()` - Laedt User-Settings aus PocketBase
- 15 Unit Tests in `timePeriods.test.ts`

### Ergebnis
- Alle 87 MCP Tests pass
- Alle 99 Frontend Tests pass (15 unit + 4 integration fuer timePeriods)
- User kann morningStart, afternoonStart, eveningStart konfigurieren

## 2026-01-23 - Task-Sichtbarkeit nach Tageszeit

**Task:** `task-visibility-by-time-period`
**Status:** COMPLETED

### TDD Red Phase
- 6 Integration Tests in `task-visibility.integration.test.ts`:
  - Evening Task erstellt am Morgen -> visibleFrom = 18:00
  - Evening Task erstellt am Abend -> sofort sichtbar
  - Afternoon Task erstellt am Morgen -> visibleFrom = 12:00
  - Morning Task erstellt am Abend -> visibleFrom = 06:00 naechster Tag
  - Morning Task erstellt am Morgen -> sofort sichtbar
  - Custom User Settings werden beruecksichtigt

### Migration
- `1769198905_updated_tasks.js` - visibleFrom Feld (date, optional)

### TDD Green Phase
- `timePeriods.ts`:
  - `calculateVisibleFrom()` - berechnet wann Task sichtbar wird basierend auf:
    - Aktuelle Tageszeit vs Ziel-Tageszeit
    - Wenn in Ziel-Tageszeit: sofort sichtbar
    - Wenn Ziel-Tageszeit spaeter heute: visibleFrom = Start der Tageszeit
    - Wenn Ziel-Tageszeit frueher im Tag: visibleFrom = Start naechster Tag
- `scheduleProcessor.ts`:
  - `getSettingsForSchedule()` - laedt User-Settings via child->group->user_groups->user
  - `processSchedules()` - setzt visibleFrom beim Task erstellen

### Ergebnis
- Alle 87 MCP Tests pass
- Alle 107 Frontend Tests pass
- Tasks werden mit korrektem visibleFrom erstellt

## 2026-01-23 - Schedule Processor mit Day-Filtering

**Task:** `schedule-processor-time-periods`
**Status:** COMPLETED

### TDD Red Phase
- 8 Integration Tests in `schedule-day-filtering.integration.test.ts`:
  - daysOfWeek: Task erstellen wenn heute passt
  - daysOfWeek: KEINE Task wenn heute nicht passt
  - daysOfWeek: Mehrere Tage, Wochenenden
  - intervalDays: Task erstellen wenn keine vorherige existiert
  - intervalDays: KEINE Task wenn Interval nicht vergangen
  - intervalDays: Task erstellen wenn Interval vergangen
  - intervalDays: Task erstellen wenn mehr als Interval vergangen
  - Ohne Filter: Task immer erstellen

### TDD Green Phase
- `scheduleProcessor.ts`:
  - `DAY_NAME_TO_NUMBER` - Mapping 'mon'->1, 'tue'->2, etc.
  - `isTodayInDaysOfWeek()` - prueft ob heute in daysOfWeek Array
  - `hasIntervalPassed()` - prueft ob genug Tage seit letzter completedAt
  - `processSchedules()` - nutzt beide Checks vor Task-Erstellung

### Ergebnis
- Alle 87 MCP Tests pass
- Alle 110 Frontend Tests pass
- Schedules erstellen Tasks nur an gueltigen Tagen/Intervallen

## 2026-01-23 - Aufgabenliste filtert nach visibleFrom

**Task:** `task-list-filter-by-visible-from`
**Status:** COMPLETED

### TDD Red Phase
- 5 Integration Tests in `task-visible-from-filter.integration.test.ts`:
  - Task mit visibleFrom in der Vergangenheit wird angezeigt
  - Task mit visibleFrom in der Zukunft wird NICHT angezeigt
  - Task mit visibleFrom = jetzt wird angezeigt
  - Task ohne visibleFrom (null) wird angezeigt
  - Mix von sichtbaren und versteckten Tasks

### TDD Green Phase
- `[childId].astro`:
  - Akzeptiert optionales `now` Datum via `Astro.locals` fuer testbare Zeitlogik
  - Filtert Tasks nach visibleFrom in JavaScript (PocketBase datetime comparison ist unzuverlaessig)
  - Tasks mit `visibleFrom <= now` oder `visibleFrom = null` sind sichtbar

### Ergebnis
- Alle 87 MCP Tests pass
- Alle 115 Frontend Tests pass
- Aufgabenliste zeigt nur Tasks deren Tageszeit begonnen hat
