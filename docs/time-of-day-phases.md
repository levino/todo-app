# Tagesphasen (Time-of-Day Phases)

## Hintergrund

Die App wird von Familien genutzt, damit Kinder ihre täglichen Aufgaben selbstständig abarbeiten können. Im Alltag gibt es drei klar getrennte Phasen, in denen jeweils unterschiedliche Aufgaben relevant sind:

### Morgens (bis 9:00 Uhr)

Die Kinder bereiten sich auf die Schule vor. Nur Tasks, die für den Start in den Tag wichtig sind, werden angezeigt:

- Duschen
- Haare bürsten
- Zähne putzen
- Schultasche packen
- Frühstücken

### Nachmittags (9:00 – 18:00 Uhr)

Nach der Schule kommen die allgemeinen Aufgaben und Hobbys. Dies ist der **Default-Slot** für alle Tasks, die keiner speziellen Tageszeit zugeordnet sind:

- Hausaufgaben machen
- Instrument üben (z.B. Geige spielen)
- Sport / Hobbys (z.B. Inliner fahren)
- Allgemeine Aufgaben im Haushalt

### Abends (ab 18:00 Uhr)

Die Abendroutine vor dem Schlafengehen:

- Zähne putzen
- Beten
- Medizinische Routinen (z.B. Fußpilzcreme)
- Bett vorbereiten

## Wochenende

Am Wochenende gelten dieselben Phasen und Zeitgrenzen. Die Phasenstruktur ist tagesunabhängig.

## Technisches Konzept

### Datenmodell

Neues Feld `timeOfDay` auf der `tasks`-Collection:

| Wert | Beschreibung |
|------|-------------|
| `morning` | Morgenroutine |
| `afternoon` | Allgemeine Aufgaben (Default) |
| `evening` | Abendroutine |

### Migration

Alle bestehenden Tasks werden auf `afternoon` gesetzt, da dies der allgemeine Slot ist.

### Anzeigelogik

Die Task-Ansicht filtert automatisch nach der aktuellen Tagesphase basierend auf der Uhrzeit des Clients. Es werden nur Tasks der aktuellen Phase angezeigt.

### Default-Zeiten

| Phase | Start | Ende |
|-------|-------|------|
| morning | 00:00 | 09:00 |
| afternoon | 09:00 | 18:00 |
| evening | 18:00 | 00:00 |

### Customization (geplant)

Die Zeitgrenzen sollen pro Gruppe anpassbar sein, damit Familien die Phasen an ihren eigenen Tagesablauf anpassen können. Dies wird über den MCP-Server ermöglicht, sodass Eltern per Chat-Interface die Zeiten für ihre Familie konfigurieren können.

Beispiel: Eine Familie, deren Kinder erst um 10:00 zur Schule müssen, kann die Morgenphase bis 10:00 verlängern.
