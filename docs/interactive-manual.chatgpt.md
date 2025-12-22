# Interaktive Betriebsanleitung – Emir‑Superman Supervisor

Diese Datei kannst du komplett in eine neue ChatGPT-Konversation kopieren.  
Bitte ChatGPT dann, dich **Schritt für Schritt** durch folgende Dinge zu führen:

- System starten & Status prüfen
- Ersten Task anlegen & Ergebnis abholen
- Knowledge speichern & durchsuchen
- Queue/Cache/Kosten verstehen

## Systemüberblick

- Node.js + Express-API unter `/api/v1`
- Supervisor-Core mit Agents: `research`, `analysis`, `creative`, `coding`
- InMemory-Queue für Tasks
- SQLite-Datenbank (Tasks, Sessions, Knowledge, Costs)
- Frontend-UI unter `http://localhost:3000/` mit Tabs: Status, Agents, Guide, Tasks, Knowledge, Tools

## Quickstart (lokal)

```bash
npm install
cp .env.example .env
npm run dev
# Browser: http://localhost:3000/
```

## Beispieldialog für ChatGPT

> Du bist mein Operator-Guide für den Emir‑Superman Supervisor.  
> Das Projekt ist so aufgebaut wie in der Betriebsanleitung beschrieben.  
> Führe mich Schritt für Schritt durch:
> – Systemstart & Statuscheck  
> – ersten research-Task  
> – Knowledge-Eintrag speichern und suchen.  
> Gib mir konkrete Kommandos (Terminal, curl, UI-Schritte) und warte nach jedem Schritt auf meine Rückmeldung.

## Endpoints (Kurzübersicht)

- `GET /health`
- `GET /api/v1/status`
- `GET /api/v1/agents`
- `POST /api/v1/tasks`
- `GET /api/v1/tasks/:id`
- `GET /api/v1/tasks/:id/result`
- `POST /api/v1/sessions`
- `GET /api/v1/sessions/:id`
- `DELETE /api/v1/sessions/:id`
- `POST /api/v1/knowledge`
- `GET /api/v1/knowledge/search?query=...`
- `GET /api/v1/queue/stats`
- `GET /api/v1/cache/stats`
- `POST /api/v1/cache/invalidate`
- `GET /api/v1/costs`
