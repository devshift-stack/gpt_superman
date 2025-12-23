# Interaktive Betriebsanleitung – MUCI-SUPERMAN v2.0

Diese Datei kannst du komplett in eine neue ChatGPT-Konversation kopieren.
Bitte ChatGPT dann, dich **Schritt für Schritt** durch das System zu führen.

---

## Systemüberblick

**MUCI-SUPERMAN** ist ein AI-Supervisor-Service mit:

- **6 OOP Agents**: Research, Analysis, Creative, Coding, Recruiter, Sales
- **ArenaProPlus**: Multi-Agent Collaboration für komplexe Aufgaben
- **TaskRouter**: Intelligente automatische Agent-Auswahl
- **Circuit Breaker**: Resilience Pattern für Stabilität
- **SQLite-Datenbank**: Tasks, Sessions, Knowledge, Costs
- **InMemory-Queue**: Hintergrundverarbeitung

### Die 6 Agents

| Agent | Typ | Spezialisierung |
|-------|-----|-----------------|
| ResearchAgent | `research` | Informationen sammeln, Markt-Überblicke |
| AnalysisAgent | `analysis` | Datenanalyse, Zielgruppen, Pain-Points |
| CreativeAgent | `creative` | Texte, Hooks, E-Mails |
| CodingAgent | `coding` | Code, Snippets, Komponenten |
| RecruiterAgent | `recruiter` | Stellenanzeigen, Screening, Bias-Check |
| SalesAgent | `sales` | Outreach, BANT-Scoring, Proposals |

---

## Quickstart

### Lokal starten
```bash
npm install
cp .env.example .env
npm run dev
# -> http://localhost:3000
```

### Production (Server)
```bash
# Backend
pm2 start server/index.js --name gpt-superman

# Frontend (falls Next.js)
cd frontend && npm run build && pm2 start npm --name gpt-frontend -- start
```

---

## Beispieldialog für ChatGPT

Kopiere diesen Text in ChatGPT:

> Du bist mein Operator-Guide für MUCI-SUPERMAN v2.0.
> Das System hat 6 Agents (Research, Analysis, Creative, Coding, Recruiter, Sales), ArenaProPlus für Multi-Agent-Tasks und Auto-Routing.
>
> Führe mich Schritt für Schritt durch:
> 1. System starten und Status prüfen
> 2. Auto-Routing testen (automatische Agent-Auswahl)
> 3. Arena Pro+ testen (Multi-Agent Collaboration)
> 4. Recruiter-Task erstellen
> 5. Sales-Task mit BANT-Scoring
> 6. Knowledge speichern und durchsuchen
>
> Gib mir konkrete Kommandos (curl, Terminal, UI) und warte nach jedem Schritt auf meine Rückmeldung.

---

## API-Referenz

### System & Health

```bash
# Health-Check
curl http://localhost:3000/health

# System-Status
curl http://localhost:3000/api/v1/status

# System-Info
curl http://localhost:3000/api/v1/info
```

### Agents

```bash
# Alle Agents auflisten
curl http://localhost:3000/api/v1/agents

# Agent-Details
curl http://localhost:3000/api/v1/agents/research

# Agent-Health (Circuit Breaker Status)
curl http://localhost:3000/api/v1/agents/recruiter/health

# Direkter Agent-Aufruf
curl -X POST http://localhost:3000/api/v1/agents/sales/execute \
  -H "Content-Type: application/json" \
  -d '{"message": "Schreibe eine Cold-Email für IT-Dienstleister"}'

# Circuit Breaker zurücksetzen
curl -X POST http://localhost:3000/api/v1/agents/sales/reset
```

### Auto-Routing & Arena

```bash
# Auto-Routing (System wählt Agent automatisch)
curl -X POST http://localhost:3000/api/v1/auto \
  -H "Content-Type: application/json" \
  -d '{"message": "Analysiere die aktuellen KI-Trends im HR-Bereich"}'

# Routing-Vorschau (für Live-Preview im UI)
curl -X POST http://localhost:3000/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{"message": "Erstelle eine Stellenanzeige"}'

# Arena Pro+ (Multi-Agent Collaboration)
curl -X POST http://localhost:3000/api/v1/arena \
  -H "Content-Type: application/json" \
  -d '{"message": "Entwickle eine komplette Go-to-Market Strategie für ein B2B SaaS"}'

# Routing-Statistiken
curl http://localhost:3000/api/v1/routing/stats
```

### Tasks

```bash
# Task erstellen (mit explizitem Agent-Typ)
curl -X POST http://localhost:3000/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "type": "recruiter",
    "content": "Erstelle eine Stellenanzeige für Senior Full-Stack Developer",
    "priority": "high"
  }'

# Tasks auflisten
curl "http://localhost:3000/api/v1/tasks?limit=10&offset=0"
curl "http://localhost:3000/api/v1/tasks?status=completed"

# Task-Details
curl http://localhost:3000/api/v1/tasks/{task-id}

# Task-Ergebnis
curl http://localhost:3000/api/v1/tasks/{task-id}/result

# Task abbrechen
curl -X POST http://localhost:3000/api/v1/tasks/{task-id}/cancel
```

### Sessions

```bash
# Session erstellen
curl -X POST http://localhost:3000/api/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{"name": "Marketing-Kampagne Q1", "userId": "user-123"}'

# Alle Sessions
curl http://localhost:3000/api/v1/sessions

# Session-Details
curl http://localhost:3000/api/v1/sessions/{session-id}

# Session löschen
curl -X DELETE http://localhost:3000/api/v1/sessions/{session-id}
```

### Knowledge Base

```bash
# Knowledge speichern
curl -X POST http://localhost:3000/api/v1/knowledge \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Unser Hauptprodukt ist eine KI-gestützte CRM-Lösung für den Mittelstand.",
    "source": "company-info",
    "tags": ["produkt", "crm", "ki"]
  }'

# Knowledge durchsuchen
curl "http://localhost:3000/api/v1/knowledge/search?query=CRM&limit=10"

# Knowledge-Statistiken
curl http://localhost:3000/api/v1/knowledge/stats
```

### Queue, Cache & Kosten

```bash
# Queue-Status
curl http://localhost:3000/api/v1/queue/stats

# Cache-Status
curl http://localhost:3000/api/v1/cache/stats

# Cache leeren
curl -X POST http://localhost:3000/api/v1/cache/invalidate \
  -H "Content-Type: application/json" \
  -d '{"pattern": "*"}'

# Kosten-Report (Tag/Woche/Monat)
curl "http://localhost:3000/api/v1/costs?period=month"
curl "http://localhost:3000/api/v1/costs?period=week"
curl "http://localhost:3000/api/v1/costs?period=day"
```

---

## Spezial-Features der Agents

### RecruiterAgent (10 Task-Typen)

| Task-Typ | Beschreibung |
|----------|--------------|
| `job_posting` | Stellenanzeigen erstellen |
| `candidate_screening` | Bewerber-Screening |
| `interview_prep` | Interview-Fragen vorbereiten |
| `talent_search` | Active Sourcing |
| `onboarding` | Onboarding-Pläne |
| `employer_branding` | Arbeitgebermarke stärken |
| `offer_negotiation` | Gehaltsverhandlung |
| `rejection_feedback` | Absagen formulieren |
| `diversity_inclusion` | D&I Checks |
| `retention` | Mitarbeiterbindung |

**Spezial-Features:**
- Entity Extraction (Namen, Skills, Erfahrung)
- Bias-Check für inklusive Sprache
- STAR Framework für Interviews
- Conversation Context

### SalesAgent (10 Task-Typen)

| Task-Typ | Beschreibung |
|----------|--------------|
| `cold_outreach` | Kaltakquise |
| `sales_pitch` | Verkaufspräsentation |
| `objection_handling` | Einwandbehandlung |
| `follow_up` | Nachfassen |
| `closing` | Abschluss |
| `lead_qualification` | Lead-Qualifizierung |
| `negotiation` | Preisverhandlung |
| `proposal` | Angebote erstellen |
| `competitor_analysis` | Wettbewerbsanalyse |
| `upsell_crosssell` | Upselling/Cross-Selling |

**Spezial-Features:**
- BANT Scoring (Budget, Authority, Need, Timeline)
- MEDDIC Scoring für Enterprise
- Email Templates (Cold, Follow-up, Closing)
- Entity Extraction (Firmenname, Budget, Entscheider)

---

## Troubleshooting

### Agent antwortet nicht
```bash
# Circuit Breaker Status prüfen
curl http://localhost:3000/api/v1/agents/{agent-id}/health

# Circuit Breaker zurücksetzen
curl -X POST http://localhost:3000/api/v1/agents/{agent-id}/reset
```

### Queue ist voll
```bash
# Queue-Status prüfen
curl http://localhost:3000/api/v1/queue/stats

# Pending Tasks prüfen
curl "http://localhost:3000/api/v1/tasks?status=queued"
```

### Cache-Probleme
```bash
# Cache komplett leeren
curl -X POST http://localhost:3000/api/v1/cache/invalidate \
  -H "Content-Type: application/json" \
  -d '{"pattern": "*"}'
```

---

## Architektur

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                   │
│                      http://server:3001                      │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                     Express API (Node.js)                    │
│                      http://server:3000                      │
├─────────────────────────────────────────────────────────────┤
│  /api/v1/auto     → TaskRouter → Agent-Auswahl              │
│  /api/v1/arena    → ArenaProPlus → Multi-Agent              │
│  /api/v1/agents   → Direkte Agent-Kontrolle                 │
│  /api/v1/tasks    → Task-Management                         │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                       Supervisor                             │
├──────────┬──────────┬──────────┬──────────┬────────┬────────┤
│ Research │ Analysis │ Creative │  Coding  │Recruiter│ Sales │
│  Agent   │  Agent   │  Agent   │  Agent   │ Agent  │ Agent │
└──────────┴──────────┴──────────┴──────────┴────────┴────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  InMemory-Queue  │  Cache-Service  │  SQLite (Persistence)  │
└─────────────────────────────────────────────────────────────┘
```

---

## Kontakt & Support

- **Repository**: https://github.com/devshift-stack/gpt_superman
- **Frontend**: https://github.com/devshift-stack/uix-gptsuperman
