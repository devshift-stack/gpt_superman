# Emir-Superman Supervisor (GPT_SupermanV1)

Ein einfacher, aber vollständiger Supervisor-Service mit:

- Express-API (Node.js)
- Supervisor-Core mit Agents (`research`, `analysis`, `creative`, `coding`)
- InMemory-Queue (Hintergrundverarbeitung von Tasks)
- SQLite-Persistence (Tasks, Sessions, Knowledge, Costs)
- Frontend-UI (Single Page, läuft unter `/`)
- Interaktivem Guide (digitale Betriebsanleitung direkt im Browser)

## Quickstart

```bash
npm install
cp .env.example .env
npm run dev
# -> http://localhost:3000
```

## Tests

```bash
npm test
```
