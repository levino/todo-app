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

Nach der Schule kommen die allgemeinen Aufgaben und Hobbys:

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

## Design-Entscheidungen

- **Kein Übergang**: Phasenwechsel ist hart — keine Übergangszeit nötig, da Kinder um 9 in der Schule sind
- **Auto-Refresh**: Die Task-Ansicht aktualisiert sich automatisch beim Phasenwechsel (kein manueller Reload)
- **Filter gilt überall**: Alle Nutzer sehen nur Tasks der aktuellen Phase. Eltern können sich über den MCP-Server / KI eine Gesamtübersicht holen
- **`timeOfDay` ist Pflichtfeld**: Bei der Task-Erstellung muss immer eine Phase angegeben werden — kein Default
- **Customization sofort**: Phasen-Zeiten sind pro Gruppe anpassbar (kommt in v1)

## Technisches Konzept

### Datenmodell

Neues Pflichtfeld `timeOfDay` auf der `tasks`-Collection:

| Wert | Beschreibung |
|------|-------------|
| `morning` | Morgenroutine |
| `afternoon` | Allgemeine Aufgaben |
| `evening` | Abendroutine |

### Phasen-Zeiten pro Gruppe

Neue Felder auf der `groups`-Collection (oder eigene Collection):

| Feld | Default | Beschreibung |
|------|---------|-------------|
| `morningEnd` | 09:00 | Ende der Morgenphase |
| `eveningStart` | 18:00 | Start der Abendphase |

Konfiguration über MCP-Server, damit Eltern per Chat die Zeiten für ihre Familie anpassen können.

### Migration

Alle bestehenden Tasks werden auf `afternoon` gesetzt (allgemeiner Slot).

### Anzeigelogik

Die Task-Ansicht filtert nach der aktuellen Tagesphase basierend auf der Uhrzeit. Beim Phasenwechsel wird automatisch neu geladen (Timer/Subscription).

### MCP-Server

- `create_task`: `timeOfDay` als Pflichtparameter
- Neues Tool: Phasen-Zeiten pro Gruppe konfigurieren
