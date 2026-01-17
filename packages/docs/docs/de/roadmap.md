---
title: Roadmap
description: Geplante Features und Entwicklung
---

# Roadmap

Family Todo wird aktiv weiterentwickelt. Hier sind die geplanten Features.

## Phase 1: Wiederkehrende Aufgaben ✅

**Status: Implementiert**

Viele Aufgaben wiederholen sich täglich oder wöchentlich. Mit wiederkehrenden Aufgaben müssen diese nur einmal definiert werden.

### Features

- **Tägliche Aufgaben**: Automatisches Zurücksetzen um Mitternacht. Heute erledigt, morgen wieder da!
- **Wöchentliche Aufgaben**: Bestimmte Tage auswählen (z.B. nur Schultage Mo-Fr)
- **Intelligentes Zurücksetzen**: Nutze das `reset_recurring_tasks` MCP Tool um alle wiederkehrenden Aufgaben zurückzusetzen

### MCP Tools

```
create_task - Unterstützt jetzt recurrence und daysOfWeek Parameter
  - recurrence: "none" | "daily" | "weekly"
  - daysOfWeek: [0-6] Array (0=Sonntag, 6=Samstag)

reset_recurring_tasks - Setzt alle erledigten wiederkehrenden Aufgaben zurück
  - Setzt tägliche Aufgaben zurück, die vor heute erledigt wurden
  - Setzt wöchentliche Aufgaben an ihren geplanten Tagen zurück
```

### Beispiel-Interaktion

> "Erstelle für Max eine tägliche Aufgabe 'Zähne putzen' die jeden Morgen erscheint"

> "Lisa soll jeden Montag und Mittwoch 'Klavier üben' als Aufgabe haben"

> "Setze alle wiederkehrenden Aufgaben für die Familie zurück"

---

## Phase 2: Tageszeiträume ✅

**Status: Implementiert**

Aufgaben zu bestimmten Tageszeiten – Morgens, Nachmittags, Abends.

### Features

- **Drei Zeiträume**: Morgens (6-12), Nachmittags (12-18), Abends (18-22)
- **Visuelle Gruppierung**: Kiosk-Ansicht zeigt Aufgaben nach Tageszeit gruppiert mit Icons
- **Flexible Anzeige**: Aufgaben ohne Zeitraum erscheinen im "Ganztägig"-Bereich

### Tageszeitraum-Icons

```
🌅 Morgen - 6:00 - 12:00 Uhr
☀️ Nachmittag - 12:00 - 18:00 Uhr
🌙 Abend - 18:00 - 22:00 Uhr
📋 Ganztägig - Keine bestimmte Zeit
```

### MCP Tools

```
create_task - Unterstützt jetzt timePeriod Parameter
  - timePeriod: "morning" | "afternoon" | "evening" | "" (leer = ganztägig)

list_tasks - Unterstützt jetzt Filterung nach timePeriod und recurrence
```

### Beispiel-Interaktion

> "Zeige mir nur die Morgen-Aufgaben von Max"

> "Füge 'Hausaufgaben' als Nachmittags-Aufgabe für Lisa hinzu"

> "Erstelle eine Abend-Aufgabe 'Pyjama anziehen' für alle Kinder"

---

## Phase 3: Belohnungssystem 🏆

**Status: Idee**

Motivation durch Punkte und Belohnungen.

### Ideen

- Punkte für erledigte Aufgaben
- Wöchentliche/monatliche Ziele
- Virtuelle oder reale Belohnungen
- Familien-Rangliste

---

## Phase 4: Benachrichtigungen 📱

**Status: Idee**

Push-Benachrichtigungen für Eltern.

### Ideen

- Tägliche Zusammenfassung
- Benachrichtigung wenn alle Aufgaben erledigt
- Erinnerungen für überfällige Aufgaben

---

## Phase 5: Multi-Familie 👨‍👩‍👧‍👦

**Status: Idee**

Unterstützung für komplexere Familiensituationen.

### Ideen

- Geteilte Kinder zwischen Haushalten
- Unterschiedliche Aufgaben je nach Haushalt
- Synchronisation zwischen Elternteilen

---

## Feedback

Hast du Ideen oder Wünsche?

- Öffne ein [GitHub Issue](https://github.com/levino/todo-app/issues)
- Oder frag Claude: *"Welche Features wünschst du dir für Family Todo?"* 😉

## Changelog

### v1.1.0 (Januar 2026)
- **Wiederkehrende Aufgaben**: Tägliche und wöchentliche Wiederholung mit automatischem Zurücksetzen
- **Tageszeiträume**: Aufgaben können Morgen, Nachmittag oder Abend zugeordnet werden
- **Visuelle Gruppierung**: Kiosk-Ansicht gruppiert Aufgaben nach Tageszeit mit Icons
- **Neue MCP Tools**: `reset_recurring_tasks`, erweiterte `create_task` und `list_tasks`

### v1.0.0 (Januar 2026)
- Erste öffentliche Version
- Grundlegende Aufgabenverwaltung
- Claude MCP Integration
- OAuth 2.0 Authentifizierung
