# Geplante Verbesserungen

Dieses Dokument beschreibt geplante Verbesserungen. Details in `tasks.json`.

---

## 1. OAuth: Refresh Tokens

**Problem:** Access Tokens laufen nach 1 Stunde ab. User muss ständig neu autorisieren.

**Lösung:** Refresh Tokens implementieren für automatische Token-Erneuerung ohne User-Interaktion.

---

## 2. Schedules: Tageszeiten statt Cron

### Motivation

Cron-Expressions sind zu präzise für Familienaufgaben. `0 18 * * *` bedeutet "genau 18:00", aber Eltern denken in Tageszeiten: "Zähneputzen morgens", "Hausaufgaben nachmittags", "Duschen abends".

## Konzept

### Drei Tageszeiten

| Periode | Default | Beschreibung |
|---------|---------|--------------|
| morning | 06:00 - 12:00 | Morgens |
| afternoon | 12:00 - 18:00 | Nachmittags |
| evening | 18:00 - 00:00 | Abends (bis Mitternacht) |

Die Zeiten sind **pro User konfigurierbar**.

### Wiederholungsmuster

**Option A: Bestimmte Wochentage**
```json
{
  "title": "Hausaufgaben",
  "timePeriod": "afternoon",
  "daysOfWeek": ["mon", "tue", "wed", "thu", "fri"]
}
```

**Option B: Intervall (alle X Tage)**
```json
{
  "title": "Duschen",
  "timePeriod": "evening",
  "intervalDays": 2
}
```

### Sichtbarkeits-Logik

Tasks werden nicht sofort sichtbar, sondern wenn die Tageszeit beginnt:

| Schedule erstellt | Tageszeit | Task sichtbar |
|-------------------|-----------|---------------|
| 14:00 | evening | ab 18:00 |
| 19:00 | evening | sofort |
| 08:00 | morning | sofort |
| 22:00 | morning | ab 06:00 (nächster Tag) |

**Wichtig:** Keine Tasks sichtbar = alle erledigt (nicht "falsche Tageszeit")

## Schema-Änderungen

### Schedules Collection

```diff
- cron: string | null
- time: string | null
+ timePeriod: "morning" | "afternoon" | "evening"
+ daysOfWeek: string[] | null  // ["mon", "tue", ...]
  intervalDays: number | null
```

### Tasks Collection

```diff
+ visibleFrom: datetime | null  // wann Task sichtbar wird
```

### Users Collection (oder user_settings)

```diff
+ morningStart: string   // "06:00"
+ afternoonStart: string // "12:00"
+ eveningStart: string   // "18:00"
```

## Beispiele

### Tägliche Routine
- Zähneputzen morgens, täglich
- Zimmer aufräumen nachmittags, wochentags
- Zähneputzen abends, täglich

### Intervall-basiert
- Duschen abends, alle 2 Tage
- Haare waschen morgens, alle 3 Tage

### Spezielle Tage
- Müll rausbringen abends, nur Dienstag
- Klavierüben nachmittags, Mo/Mi/Fr
