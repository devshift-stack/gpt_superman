# MUCI-SUPERMAN v2.0

Ein vollständiger AI-Supervisor-Service mit Multi-Agent-System, intelligenter Task-Verteilung und Arena-Modus für kollaborative Aufgaben.

## Features

### 6 OOP Agents
| Agent | Typ | Beschreibung |
|-------|-----|--------------|
| **ResearchAgent** | `research` | Sammelt Informationen, fasst Texte zusammen, erstellt Markt-Überblicke |
| **AnalysisAgent** | `analysis` | Analysiert Daten, extrahiert Zielgruppen, Pain-Points, Chancen und Risiken |
| **CreativeAgent** | `creative` | Erstellt Texte, Hooks, Betreffzeilen, E-Mails und kreative Vorschläge |
| **CodingAgent** | `coding` | Hilft bei Code, Snippets, Komponenten und technischen Vorschlägen |
| **RecruiterAgent** | `recruiter` | 10 Task-Typen inkl. Entity Extraction, Bias-Check, STAR Framework |
| **SalesAgent** | `sales` | 10 Task-Typen inkl. BANT/MEDDIC Scoring, Email Templates |

### Kernfunktionen
- **ArenaProPlus** - Multi-Agent Collaboration für komplexe Aufgaben
- **TaskRouter** - Intelligente Agent-Auswahl basierend auf Keyword-Analyse
- **Auto-Routing** - Automatische Agent-Zuweisung ohne manuelle Auswahl
- **Circuit Breaker** - Resilience Pattern für Agent-Stabilität
- **InMemory-Queue** - Hintergrundverarbeitung von Tasks
- **SQLite-Persistence** - Tasks, Sessions, Knowledge, Costs
- **Cost Tracking** - Token-Verbrauch und Kosten pro Agent/Task

## Quickstart

```bash
# Installation
npm install
cp .env.example .env

# Development
npm run dev
# -> http://localhost:3000

# Production
npm start
```

## API Endpoints

### System
| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/health` | GET | Health-Check |
| `/api/v1/status` | GET | System-Status mit Uptime, Queue, Cache |
| `/api/v1/info` | GET | System-Info und Feature-Toggles |

### Agents
| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/v1/agents` | GET | Liste aller Agents mit Health-Metrics |
| `/api/v1/agents/:id` | GET | Agent-Details |
| `/api/v1/agents/:id/health` | GET | Agent-Health und Circuit-Breaker Status |
| `/api/v1/agents/:id/execute` | POST | Direkte Agent-Ausführung |
| `/api/v1/agents/:id/reset` | POST | Circuit-Breaker zurücksetzen |

### Tasks
| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/v1/tasks` | POST | Task erstellen |
| `/api/v1/tasks` | GET | Tasks auflisten (mit `?status=`, `?limit=`, `?offset=`) |
| `/api/v1/tasks/:id` | GET | Task-Details |
| `/api/v1/tasks/:id/result` | GET | Task-Ergebnis |
| `/api/v1/tasks/:id/cancel` | POST | Task abbrechen |

### Auto-Routing & Arena
| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/v1/auto` | POST | Auto-Routing: Automatische Agent-Auswahl |
| `/api/v1/analyze` | POST | Routing-Vorschau für Live-Preview |
| `/api/v1/arena` | POST | Arena Pro+: Multi-Agent Collaboration |
| `/api/v1/routing/stats` | GET | Routing-Statistiken |

### Sessions
| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/v1/sessions` | POST | Session erstellen |
| `/api/v1/sessions` | GET | Alle Sessions auflisten |
| `/api/v1/sessions/:id` | GET | Session-Details |
| `/api/v1/sessions/:id` | DELETE | Session löschen |

### Knowledge Base
| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/v1/knowledge` | POST | Knowledge-Eintrag speichern |
| `/api/v1/knowledge/search` | GET | Suche (`?query=`, `?limit=`) |
| `/api/v1/knowledge/stats` | GET | Knowledge-Statistiken |

### Queue, Cache & Costs
| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/v1/queue/stats` | GET | Queue-Statistiken |
| `/api/v1/cache/stats` | GET | Cache-Statistiken |
| `/api/v1/cache/invalidate` | POST | Cache invalidieren |
| `/api/v1/costs` | GET | Kosten-Report (`?period=day/week/month`) |

## Beispiele

### Task erstellen (Auto-Routing)
```bash
curl -X POST http://localhost:3000/api/v1/auto \
  -H "Content-Type: application/json" \
  -d '{"message": "Analysiere die Markttrends für KI-Startups 2025"}'
```

### Arena Pro+ (Multi-Agent)
```bash
curl -X POST http://localhost:3000/api/v1/arena \
  -H "Content-Type: application/json" \
  -d '{"message": "Erstelle eine komplette Go-to-Market Strategie für ein SaaS-Produkt"}'
```

### Recruiter-Task
```bash
curl -X POST http://localhost:3000/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "type": "recruiter",
    "content": "Erstelle eine Stellenanzeige für Senior Full-Stack Developer"
  }'
```

### Sales-Task mit BANT-Scoring
```bash
curl -X POST http://localhost:3000/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "type": "sales",
    "content": "Lead qualifizieren: Unternehmen mit 50 Mitarbeitern, Budget vorhanden, CEO als Kontakt"
  }'
```

## Projektstruktur

```
gpt_superman/
├── server/
│   ├── app.js              # Express-App Setup
│   ├── index.js            # Server-Start
│   └── routes/
│       ├── agents.js       # Agent-Routes (Execute, Health, Reset)
│       ├── supervisor.js   # Supervisor-Routes (Tasks, Sessions, etc.)
│       └── health.js       # Health-Check
├── supervisor/
│   ├── ArenaProPlus.js     # Multi-Agent Collaboration
│   ├── TaskRouter.js       # Intelligentes Routing
│   ├── agents/
│   │   ├── BaseAgent.js    # Basis-Klasse mit Circuit Breaker
│   │   ├── ResearchAgent.js
│   │   ├── AnalysisAgent.js
│   │   ├── CreativeAgent.js
│   │   ├── CodingAgent.js
│   │   ├── RecruiterAgent.js
│   │   ├── SalesAgent.js
│   │   └── index.js
│   ├── src/
│   │   ├── Supervisor.js   # Haupt-Supervisor
│   │   ├── db.js           # SQLite-Persistence
│   │   ├── agents.js       # Agent-Registry
│   │   ├── queue.js        # InMemory-Queue
│   │   └── cache.js        # Cache-Service
│   └── utils/
│       └── logger.js       # Logging
├── public/                 # Frontend-UI
├── tests/                  # Tests
└── docs/                   # Dokumentation
```

## Tests

```bash
npm test
```

## Umgebungsvariablen

```env
PORT=3000
DB_PATH=./data/supervisor.db
ENABLE_CACHING=true
ENABLE_COST_TRACKING=true
```

## Lizenz

MIT
