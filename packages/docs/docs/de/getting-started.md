---
title: Erste Schritte
description: Family Todo einrichten und mit Claude verbinden
---

# Erste Schritte

Diese Anleitung führt dich durch die Einrichtung von Family Todo und die Verbindung mit Claude.

## 1. Account erstellen

1. Öffne die Family Todo App unter [todos.levinkeller.de](https://todos.levinkeller.de)
2. Klicke auf "Registrieren"
3. Gib deine E-Mail-Adresse und ein Passwort ein
4. Bestätige deine E-Mail-Adresse

## 2. Claude verbinden

Family Todo wird ausschließlich über Claude administriert. So richtest du die Verbindung ein:

### In der Claude Desktop App

1. Öffne Claude Desktop
2. Gehe zu **Einstellungen → MCP Server**
3. Klicke auf "Server hinzufügen"
4. Gib die MCP-URL ein: `https://mcp.todos.levinkeller.de/mcp`
5. Claude wird dich zur Anmeldung weiterleiten
6. Melde dich mit deinen Family Todo Zugangsdaten an
7. Bestätige die Verbindung

### In Claude.ai (Web)

1. Öffne [claude.ai](https://claude.ai)
2. Gehe zu **Einstellungen → Verbindungen**
3. Suche nach "Family Todo" oder füge die URL manuell hinzu
4. Folge dem OAuth-Flow zur Authentifizierung

## 3. Erste Familie erstellen

Sobald Claude verbunden ist, kannst du loslegen. Schreibe einfach:

> "Erstelle eine neue Familie namens 'Müller Familie'"

Claude wird die Familie anlegen und dir die Details zurückgeben.

## 4. Kinder hinzufügen

> "Füge zur Müller Familie zwei Kinder hinzu: Max (blau) und Lisa (pink)"

Jedes Kind bekommt eine eigene Farbe für die Kiosk-Ansicht.

## 5. Aufgaben erstellen

> "Erstelle für Max folgende Aufgaben: Hausaufgaben machen, Zimmer aufräumen, Müll rausbringen"

Oder detaillierter:

> "Gib Lisa die Aufgabe 'Klavier üben' mit hoher Priorität"

## 6. Kiosk-Ansicht öffnen

Die Kiosk-Ansicht ist für die Kinder gedacht:

1. Öffne `https://todos.levinkeller.de/kiosk`
2. Wähle das Kind aus
3. Das Kind sieht seine Aufgaben und kann sie abhaken

**Tipp**: Speichere die Kiosk-URL als Lesezeichen auf einem Tablet, das in der Küche oder im Kinderzimmer steht.

## Beispiel-Workflows

### Morgen-Routine einrichten

> "Erstelle für beide Kinder eine Morgen-Routine mit den Aufgaben: Zähne putzen, Anziehen, Frühstücken, Schultasche packen"

### Wochenplan erstellen

> "Was haben Max und Lisa diese Woche noch zu erledigen?"

### Aufgabe bearbeiten

> "Ändere bei Max die Aufgabe 'Hausaufgaben' zu 'Mathe-Hausaufgaben'"

### Aufgabe löschen

> "Lösche bei Lisa die Aufgabe 'Müll rausbringen'"

## Nächste Schritte

- [Claude Integration](/docs/de/claude-integration) – Technische Details zur KI-Anbindung
- [Roadmap](/docs/de/roadmap) – Kommende Features wie wiederkehrende Aufgaben
