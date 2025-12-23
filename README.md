# MUCI-SUPERMAN v2.0

Ein vollständiger AI-Supervisor-Service mit Multi-Agent-System, intelligenter Task-Verteilung, externen Services und Arena-Modus für kollaborative Aufgaben.

## Features

### 7 OOP Agents v2.1
| Agent | Typ | Beschreibung |
|-------|-----|--------------|
| **TranslatorAgent** | `translator` | 18 Sprachen, Glossar-Support, Confidence Scores |
| **SupportAgent** | `support` | FAQ-Suche, Session-Management, Eskalationslogik |
| **MarketingAgent** | `marketing` | A/B Testing mit Statistical Significance |
| **DataAgent** | `data` | SQL-Generierung, Chart-Empfehlungen |
| **FinanceAgent** | `finance` | Multi-Währung (EUR, BAM, RSD), Steuerberechnung |
| **LegalAgent** | `legal` | Multi-Jurisdiktion (DE, AT, CH, BA, RS) |
| **SummaryAgent** | `summary` | Multi-Style (Executive, Bullets, Academic) |

### External Services v2.0
| Service | Beschreibung |
|---------|--------------|
| **Sipgate** | Telefonie (Anrufe, SMS) |
| **Twilio** | SMS, WhatsApp, Anrufe |
| **Voice** | STT/TTS (OpenAI, ElevenLabs, Azure) |
| **Meta Graph** | Facebook/Instagram Posting |

### Kernfunktionen
- **ArenaProPlus** - Multi-Agent Collaboration für komplexe Aufgaben
- **TaskRouter** - Intelligente Agent-Auswahl basierend auf Keyword-Analyse
- **Auto-Routing** - Automatische Agent-Zuweisung ohne manuelle Auswahl
- **Circuit Breaker** - Resilience Pattern für Agent-Stabilität
- **Streaming** - Token-by-Token Ausgabe mit EventEmitter
- **Batch Processing** - Mehrere Tasks gleichzeitig verarbeiten
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

## Authentifizierung

### Auth aktivieren

```env
# In .env setzen:
REQUIRE_AUTH=true
JWT_SECRET=dein-geheimer-schlüssel
ADMIN_USER=admin
ADMIN_PASS=dein-passwort
```

### Login

```bash
# Token holen
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"dein-passwort"}'

# Response:
# {"ok":true,"token":"eyJhbGci...","user":{"id":"user-admin","username":"admin","role":"admin"}}
```

### API mit Token nutzen

```bash
# Token im Header mitgeben
curl http://localhost:3000/api/v1/agents \
  -H "Authorization: Bearer eyJhbGci..."
```

### Auth Endpoints
| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/v1/auth/login` | POST | Login, gibt JWT Token zurück |
| `/api/v1/auth/me` | GET | Aktueller User (Auth required) |
| `/api/v1/auth/keys` | POST | API-Key erstellen (Admin only) |
| `/api/v1/auth/keys` | GET | API-Keys auflisten (Admin only) |
| `/api/v1/auth/keys/:id` | DELETE | API-Key widerrufen (Admin only) |

## API Endpoints

### System
| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/health` | GET | Health-Check (kein Auth) |
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
| `/api/v1/batch` | POST | Batch Processing (mehrere Tasks) |

### Auto-Routing & Arena
| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/v1/auto` | POST | Auto-Routing: Automatische Agent-Auswahl |
| `/api/v1/analyze` | POST | Routing-Vorschau für Live-Preview |
| `/api/v1/arena` | POST | Arena Pro+: Multi-Agent Collaboration |
| `/api/v1/routing/stats` | GET | Routing-Statistiken |

### External Services
| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/v1/services/status` | GET | Status aller Services |
| `/api/v1/services/health` | GET | Health-Check aller Services |
| `/api/v1/services/config` | POST | Service-Konfiguration ändern |

### Sipgate (Telefonie)
| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/v1/services/sipgate/call` | POST | Anruf starten |
| `/api/v1/services/sipgate/sms` | POST | SMS senden |
| `/api/v1/services/sipgate/history` | GET | Anrufverlauf |
| `/api/v1/services/sipgate/balance` | GET | Guthaben |

### Twilio (SMS/WhatsApp)
| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/v1/services/twilio/sms` | POST | SMS senden |
| `/api/v1/services/twilio/whatsapp` | POST | WhatsApp senden |
| `/api/v1/services/twilio/call` | POST | Anruf starten |
| `/api/v1/services/twilio/messages` | GET | Nachrichtenverlauf |

### Voice (STT/TTS)
| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/v1/services/voice/stt` | POST | Speech-to-Text |
| `/api/v1/services/voice/tts` | POST | Text-to-Speech |
| `/api/v1/services/voice/voices` | GET | Verfügbare Stimmen |

### Meta Graph (Social Media)
| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/v1/services/meta/post` | POST | Facebook-Post erstellen |
| `/api/v1/services/meta/instagram` | POST | Instagram-Post erstellen |
| `/api/v1/services/meta/instagram/carousel` | POST | Instagram Carousel |
| `/api/v1/services/meta/insights` | GET | Seiten-Statistiken |

### Error Logging
| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/v1/services/errors` | GET | Fehler-Logs abrufen |
| `/api/v1/services/errors/stats` | GET | Fehler-Statistiken |
| `/api/v1/services/errors` | DELETE | Alle Fehler löschen |
| `/api/v1/services/errors/export` | GET | Export (JSON/CSV) |

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

### Task mit Auth erstellen
```bash
TOKEN="eyJhbGci..."

curl -X POST http://localhost:3000/api/v1/auto \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Übersetze: Hello World"}'
```

### Arena Pro+ (Multi-Agent)
```bash
curl -X POST http://localhost:3000/api/v1/arena \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Erstelle eine komplette Go-to-Market Strategie"}'
```

### Voice TTS
```bash
curl -X POST http://localhost:3000/api/v1/services/voice/tts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hallo Welt", "voice": "alloy"}' \
  --output audio.mp3
```

### SMS senden (Twilio)
```bash
curl -X POST http://localhost:3000/api/v1/services/twilio/sms \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to": "+49123456789", "message": "Test SMS"}'
```

## Umgebungsvariablen

Siehe `.env.example` für alle verfügbaren Optionen.

### Wichtige Variablen

```env
# Server
PORT=3000
API_VERSION=v1

# Auth
REQUIRE_AUTH=true
JWT_SECRET=change-this
ADMIN_USER=admin
ADMIN_PASS=change-this

# AI Provider (mindestens einer erforderlich)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...

# Optional: External Services
SIPGATE_TOKEN_ID=...
TWILIO_ACCOUNT_SID=...
META_ACCESS_TOKEN=...
```

## Projektstruktur

```
gpt_superman/
├── server/
│   ├── app.js              # Express-App Setup
│   ├── index.js            # Server-Start
│   ├── middleware/
│   │   └── auth.js         # JWT Auth Middleware
│   ├── routes/
│   │   ├── agents.js       # Agent-Routes
│   │   ├── auth.js         # Auth-Routes
│   │   ├── services.js     # External Services Routes
│   │   ├── supervisor.js   # Supervisor-Routes
│   │   └── health.js       # Health-Check
│   └── services/
│       ├── error-logger.js # Strukturiertes Logging
│       ├── sipgate-service.js
│       ├── twilio-service.js
│       ├── voice-service.js
│       ├── meta-graph-service.js
│       └── utils/
│           └── service-helpers.js
├── server/agents/          # v2.1 Agents
│   ├── BaseAgent.js        # EventEmitter, Streaming, Circuit Breaker
│   ├── AgentUtils.js       # Shared Utilities
│   ├── TranslatorAgent.js
│   ├── SupportAgent.js
│   ├── MarketingAgent.js
│   ├── DataAgent.js
│   ├── FinanceAgent.js
│   ├── LegalAgent.js
│   ├── SummaryAgent.js
│   └── index.js
├── supervisor/             # Core Supervisor
├── public/                 # Static Files
├── data/                   # SQLite Database
└── docs/                   # Dokumentation
```

## Tests

```bash
npm test
```

## Lizenz

MIT
