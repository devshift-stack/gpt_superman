# Interaktive Betriebsanleitung – MUCI-SUPERMAN v2.1

Diese Datei kannst du komplett in eine neue ChatGPT-Konversation kopieren.
Bitte ChatGPT dann, dich **Schritt für Schritt** durch das System zu führen.

---

## Systemüberblick

**MUCI-SUPERMAN v2.1** ist ein AI-Supervisor-Service mit:

- **8 OOP Agents v2.1**: Translator, Support, Marketing, Data, Finance, Legal, Summary, Influencer
- **External Services v2.0**: Sipgate (Telefonie), Twilio (SMS/WhatsApp), Voice (STT/TTS), Meta Graph (Social Media)
- **ArenaProPlus**: Multi-Agent Collaboration für komplexe Aufgaben
- **TaskRouter**: Intelligente automatische Agent-Auswahl
- **JWT-Authentifizierung**: Sichere API-Zugriffe
- **Circuit Breaker**: Resilience Pattern für Stabilität
- **Streaming**: Token-by-Token Ausgabe
- **Batch Processing**: Mehrere Tasks gleichzeitig
- **SQLite-Datenbank**: Tasks, Sessions, Knowledge, Costs
- **InMemory-Queue**: Hintergrundverarbeitung

---

## Die 8 Agents (v2.1)

| Agent | Typ | Spezialisierung | Besondere Features |
|-------|-----|-----------------|-------------------|
| **TranslatorAgent** | `translator` | Übersetzungen | 18 Sprachen, Glossar-Support, Confidence Scores |
| **SupportAgent** | `support` | Kundenservice | FAQ-Suche (TF-IDF), Session-Management, Eskalationslogik |
| **MarketingAgent** | `marketing` | Marketing | A/B Testing mit Statistical Significance |
| **DataAgent** | `data` | Datenanalyse | SQL-Generierung, Chart-Empfehlungen, Multi-DB |
| **FinanceAgent** | `finance` | Finanzen | Multi-Währung (EUR, BAM, RSD, CHF), Steuerberechnung |
| **LegalAgent** | `legal` | Recht | Multi-Jurisdiktion (DE, AT, CH, BA, RS, HR) |
| **SummaryAgent** | `summary` | Zusammenfassungen | Multi-Style (Executive, Bullets, Academic) |
| **InfluencerAgent** | `influencer` | Social Media | Profil-Analyse, Content-Generierung, Hashtag-Optimierung, Auto-Posting |

---

## External Services (v2.0)

| Service | Beschreibung | Endpoints |
|---------|--------------|-----------|
| **Sipgate** | Telefonie (Anrufe, SMS) | `/api/v1/services/sipgate/*` |
| **Twilio** | SMS, WhatsApp, Anrufe | `/api/v1/services/twilio/*` |
| **Voice** | STT/TTS (OpenAI, ElevenLabs, Azure) | `/api/v1/services/voice/*` |
| **Meta Graph** | Facebook/Instagram Posting | `/api/v1/services/meta/*` |

---

## Quickstart

### Lokal starten
```bash
npm install
cp .env.example .env
# .env anpassen (API-Keys, Auth-Settings)
npm run dev
# -> http://localhost:3000
```

### Production (Server)
```bash
# Backend
pm2 start server/index.js --name gpt-superman

# Frontend (Next.js)
cd frontend && npm run build
PORT=3001 pm2 start npm --name gpt-frontend -- start
```

---

## Authentifizierung

### Auth aktivieren
```env
# In .env setzen:
REQUIRE_AUTH=true
JWT_SECRET=dein-sicherer-schluessel
ADMIN_USER=admin
ADMIN_PASS=dein-passwort
```

### Login und Token holen
```bash
# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"dein-passwort"}'

# Response:
# {"ok":true,"token":"eyJhbGci...","user":{"id":"user-admin","username":"admin","role":"admin"}}
```

### API mit Token nutzen
```bash
# Token als Variable speichern
TOKEN="eyJhbGci..."

# Alle weiteren Requests mit Authorization Header
curl http://localhost:3000/api/v1/agents \
  -H "Authorization: Bearer $TOKEN"
```

### Auth Endpoints
| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/v1/auth/login` | POST | Login, gibt JWT Token zurück |
| `/api/v1/auth/me` | GET | Aktueller User (Auth required) |
| `/api/v1/auth/keys` | POST | API-Key erstellen (Admin only) |
| `/api/v1/auth/keys` | GET | API-Keys auflisten (Admin only) |
| `/api/v1/auth/keys/:id` | DELETE | API-Key widerrufen (Admin only) |

---

## Beispieldialog für ChatGPT

Kopiere diesen Text in ChatGPT:

> Du bist mein Operator-Guide für MUCI-SUPERMAN v2.1.
> Das System hat 8 Agents (Translator, Support, Marketing, Data, Finance, Legal, Summary, Influencer), ArenaProPlus für Multi-Agent-Tasks, Auto-Routing und externe Services (Sipgate, Twilio, Voice, Meta).
>
> Führe mich Schritt für Schritt durch:
> 1. System starten und Status prüfen
> 2. Authentifizierung (Login, Token holen)
> 3. Auto-Routing testen (automatische Agent-Auswahl)
> 4. Arena Pro+ testen (Multi-Agent Collaboration)
> 5. Translator-Agent: Übersetzung mit Confidence Score
> 6. Finance-Agent: Steuerberechnung
> 7. Influencer-Agent: Social Media Content generieren
> 8. Voice-Service: Text-to-Speech testen
> 9. Services-Status prüfen
>
> Gib mir konkrete Kommandos (curl, Terminal, UI) und warte nach jedem Schritt auf meine Rückmeldung.

---

## API-Referenz

### System & Health

```bash
# Health-Check (kein Auth erforderlich)
curl http://localhost:3000/health

# System-Status
curl http://localhost:3000/api/v1/status \
  -H "Authorization: Bearer $TOKEN"

# System-Info
curl http://localhost:3000/api/v1/info \
  -H "Authorization: Bearer $TOKEN"
```

### Agents

```bash
# Alle Agents auflisten
curl http://localhost:3000/api/v1/agents \
  -H "Authorization: Bearer $TOKEN"

# Agent-Details
curl http://localhost:3000/api/v1/agents/translator \
  -H "Authorization: Bearer $TOKEN"

# Agent-Health (Circuit Breaker Status)
curl http://localhost:3000/api/v1/agents/support/health \
  -H "Authorization: Bearer $TOKEN"

# Direkter Agent-Aufruf
curl -X POST http://localhost:3000/api/v1/agents/translator/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Übersetze: Hello World"}'

# Circuit Breaker zurücksetzen
curl -X POST http://localhost:3000/api/v1/agents/support/reset \
  -H "Authorization: Bearer $TOKEN"
```

### Auto-Routing & Arena

```bash
# Auto-Routing (System wählt Agent automatisch)
curl -X POST http://localhost:3000/api/v1/auto \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Übersetze diesen Text ins Englische: Guten Morgen"}'

# Routing-Vorschau (für Live-Preview im UI)
curl -X POST http://localhost:3000/api/v1/analyze \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Fasse diesen Artikel zusammen"}'

# Arena Pro+ (Multi-Agent Collaboration)
curl -X POST http://localhost:3000/api/v1/arena \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Entwickle eine komplette Go-to-Market Strategie für ein B2B SaaS"}'

# Routing-Statistiken
curl http://localhost:3000/api/v1/routing/stats \
  -H "Authorization: Bearer $TOKEN"
```

### Tasks

```bash
# Task erstellen
curl -X POST http://localhost:3000/api/v1/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "translator",
    "content": "Übersetze: The quick brown fox",
    "priority": "high"
  }'

# Batch Processing (mehrere Tasks gleichzeitig)
curl -X POST http://localhost:3000/api/v1/batch \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": [
      {"task": "Übersetze: Hello", "agent": "translator"},
      {"task": "Fasse zusammen: ...", "agent": "summary"}
    ]
  }'

# Tasks auflisten
curl "http://localhost:3000/api/v1/tasks?limit=10&offset=0" \
  -H "Authorization: Bearer $TOKEN"

# Task-Details
curl http://localhost:3000/api/v1/tasks/{task-id} \
  -H "Authorization: Bearer $TOKEN"

# Task-Ergebnis
curl http://localhost:3000/api/v1/tasks/{task-id}/result \
  -H "Authorization: Bearer $TOKEN"

# Task abbrechen
curl -X POST http://localhost:3000/api/v1/tasks/{task-id}/cancel \
  -H "Authorization: Bearer $TOKEN"
```

---

## External Services

### Services-Status (Übersicht)

```bash
# Status aller Services
curl http://localhost:3000/api/v1/services/status \
  -H "Authorization: Bearer $TOKEN"

# Health-Check aller Services
curl http://localhost:3000/api/v1/services/health \
  -H "Authorization: Bearer $TOKEN"
```

### Sipgate (Telefonie)

```bash
# Anruf starten
curl -X POST http://localhost:3000/api/v1/services/sipgate/call \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to": "+49123456789"}'

# SMS senden
curl -X POST http://localhost:3000/api/v1/services/sipgate/sms \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to": "+49123456789", "message": "Hallo!"}'

# Anrufverlauf
curl http://localhost:3000/api/v1/services/sipgate/history \
  -H "Authorization: Bearer $TOKEN"

# Guthaben abfragen
curl http://localhost:3000/api/v1/services/sipgate/balance \
  -H "Authorization: Bearer $TOKEN"
```

### Twilio (SMS, WhatsApp)

```bash
# SMS senden
curl -X POST http://localhost:3000/api/v1/services/twilio/sms \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to": "+49123456789", "message": "Test SMS"}'

# WhatsApp senden
curl -X POST http://localhost:3000/api/v1/services/twilio/whatsapp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to": "+49123456789", "message": "Hallo via WhatsApp!"}'

# Anruf starten
curl -X POST http://localhost:3000/api/v1/services/twilio/call \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to": "+49123456789", "twiml": "<Response><Say>Hallo!</Say></Response>"}'

# Nachrichtenverlauf
curl http://localhost:3000/api/v1/services/twilio/messages \
  -H "Authorization: Bearer $TOKEN"
```

### Voice (STT/TTS)

```bash
# Verfügbare Stimmen
curl http://localhost:3000/api/v1/services/voice/voices \
  -H "Authorization: Bearer $TOKEN"

# Text-to-Speech
curl -X POST http://localhost:3000/api/v1/services/voice/tts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hallo Welt", "voice": "alloy"}' \
  --output audio.mp3

# Speech-to-Text (mit Audio-Datei)
curl -X POST http://localhost:3000/api/v1/services/voice/stt \
  -H "Authorization: Bearer $TOKEN" \
  -F "audio=@recording.webm"
```

### Meta Graph (Facebook/Instagram)

```bash
# Facebook-Post erstellen
curl -X POST http://localhost:3000/api/v1/services/meta/post \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Neuer Blogpost online!"}'

# Instagram-Post erstellen
curl -X POST http://localhost:3000/api/v1/services/meta/instagram \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"imageUrl": "https://...", "caption": "Schönes Bild!"}'

# Seiten-Statistiken
curl http://localhost:3000/api/v1/services/meta/insights \
  -H "Authorization: Bearer $TOKEN"
```

### Error Logging

```bash
# Fehler abrufen
curl "http://localhost:3000/api/v1/services/errors?limit=50" \
  -H "Authorization: Bearer $TOKEN"

# Fehler-Statistiken
curl http://localhost:3000/api/v1/services/errors/stats \
  -H "Authorization: Bearer $TOKEN"

# Fehler exportieren (JSON oder CSV)
curl "http://localhost:3000/api/v1/services/errors/export?format=csv" \
  -H "Authorization: Bearer $TOKEN" \
  --output errors.csv

# Alle Fehler löschen
curl -X DELETE http://localhost:3000/api/v1/services/errors \
  -H "Authorization: Bearer $TOKEN"
```

---

## Sessions & Knowledge

### Sessions

```bash
# Session erstellen
curl -X POST http://localhost:3000/api/v1/sessions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Support-Session Q1", "userId": "user-123"}'

# Alle Sessions
curl http://localhost:3000/api/v1/sessions \
  -H "Authorization: Bearer $TOKEN"

# Session-Details
curl http://localhost:3000/api/v1/sessions/{session-id} \
  -H "Authorization: Bearer $TOKEN"

# Session löschen
curl -X DELETE http://localhost:3000/api/v1/sessions/{session-id} \
  -H "Authorization: Bearer $TOKEN"
```

### Knowledge Base

```bash
# Knowledge speichern
curl -X POST http://localhost:3000/api/v1/knowledge \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Unser Hauptprodukt ist eine KI-gestützte CRM-Lösung.",
    "source": "company-info",
    "tags": ["produkt", "crm", "ki"]
  }'

# Knowledge durchsuchen
curl "http://localhost:3000/api/v1/knowledge/search?query=CRM&limit=10" \
  -H "Authorization: Bearer $TOKEN"

# Knowledge-Statistiken
curl http://localhost:3000/api/v1/knowledge/stats \
  -H "Authorization: Bearer $TOKEN"
```

---

## Queue, Cache & Kosten

```bash
# Queue-Status
curl http://localhost:3000/api/v1/queue/stats \
  -H "Authorization: Bearer $TOKEN"

# Cache-Status
curl http://localhost:3000/api/v1/cache/stats \
  -H "Authorization: Bearer $TOKEN"

# Cache leeren
curl -X POST http://localhost:3000/api/v1/cache/invalidate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pattern": "*"}'

# Kosten-Report
curl "http://localhost:3000/api/v1/costs?period=month" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Agent-Features im Detail

### TranslatorAgent

**Unterstützte Sprachen (18):**
DE, EN, FR, ES, IT, PT, NL, PL, RU, UK, TR, AR, ZH, JA, KO, BS, SR, HR

**Features:**
- Automatische Spracherkennung
- Glossar-Support für Fachbegriffe
- RTL/Script-Detection
- Confidence Scores

```bash
curl -X POST http://localhost:3000/api/v1/agents/translator/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Übersetze ins Französische: Guten Morgen"}'
```

### SupportAgent

**Features:**
- FAQ Vector Store (TF-IDF Suche)
- Session-Management
- Sentiment-Tracking
- Automatische Eskalationslogik

```bash
curl -X POST http://localhost:3000/api/v1/agents/support/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Wie kann ich mein Passwort zurücksetzen?"}'
```

### MarketingAgent

**Features:**
- A/B Testing mit Statistical Significance
- Multi-Varianten-Tests
- Kampagnen-Analyse

```bash
curl -X POST http://localhost:3000/api/v1/agents/marketing/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Erstelle A/B Test für Newsletter-Betreffzeile"}'
```

### DataAgent

**Features:**
- SQL-Generierung für MySQL, PostgreSQL, SQLite, MSSQL, Oracle
- Chart-Empfehlungen
- Datenanalyse

```bash
curl -X POST http://localhost:3000/api/v1/agents/data/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Erstelle SQL Query für monatliche Umsätze"}'
```

### FinanceAgent

**Features:**
- Multi-Währung: EUR, BAM, RSD, CHF
- Steuerberechnung (MwSt/PDV)
- Finanzanalyse

```bash
curl -X POST http://localhost:3000/api/v1/agents/finance/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Berechne MwSt für 1000 EUR"}'
```

### LegalAgent

**Features:**
- Multi-Jurisdiktion: DE, AT, CH, BA, RS, HR
- Verschiedene Vertragstypen
- Rechtliche Analyse

```bash
curl -X POST http://localhost:3000/api/v1/agents/legal/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Prüfe AGB auf DSGVO-Konformität"}'
```

### SummaryAgent

**Styles:**
- Executive: Kurz und prägnant für Führungskräfte
- Bullets: Stichpunktartig
- Academic: Wissenschaftlich

```bash
curl -X POST http://localhost:3000/api/v1/agents/summary/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Fasse zusammen (Executive Style): [langer Text]"}'
```

### InfluencerAgent

**Features:**
- Profil-Analyse (Instagram & Facebook via Meta Graph API)
- Content-Generierung mit KI (Captions, Bilder)
- Hashtag-Optimierung (Top 15 basierend auf Analysen)
- Auto-Posting auf Instagram und Facebook
- Scheduling zu optimalen Zeiten
- Style Learning von erfolgreichen Profilen

**Unterstützte Plattformen:**
- Instagram (Business/Creator Account)
- Facebook (Page)

**Aktionen:**
- `analyze_profile`: Profil analysieren
- `generate_content`: Content generieren
- `generate_caption`: Caption erstellen
- `generate_hashtags`: Hashtags generieren
- `post_content`: Content veröffentlichen
- `schedule_post`: Post planen

```bash
# Profil analysieren
curl -X POST http://localhost:3000/api/v1/agents/influencer/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Analysiere Instagram-Profil @beispiel_influencer"}'

# Content generieren
curl -X POST http://localhost:3000/api/v1/agents/influencer/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Generiere Instagram Post über Fitness mit Hashtags"}'

# Caption erstellen
curl -X POST http://localhost:3000/api/v1/agents/influencer/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Erstelle Caption für Reise-Foto in Paris"}'

# Hashtags generieren
curl -X POST http://localhost:3000/api/v1/agents/influencer/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Generiere Hashtags für Food-Content"}'
```

**Umgebungsvariablen für Influencer Agent:**
```env
META_ACCESS_TOKEN=EAAxxxxxxx...
INSTAGRAM_ACCOUNT_ID=17841400000000000
FACEBOOK_PAGE_ID=100000000000000
```

---

## Troubleshooting

### Agent antwortet nicht
```bash
# Circuit Breaker Status prüfen
curl http://localhost:3000/api/v1/agents/{agent-id}/health \
  -H "Authorization: Bearer $TOKEN"

# Circuit Breaker zurücksetzen
curl -X POST http://localhost:3000/api/v1/agents/{agent-id}/reset \
  -H "Authorization: Bearer $TOKEN"
```

### Service nicht verfügbar
```bash
# Services-Status prüfen
curl http://localhost:3000/api/v1/services/status \
  -H "Authorization: Bearer $TOKEN"

# Fehler-Logs prüfen
curl http://localhost:3000/api/v1/services/errors \
  -H "Authorization: Bearer $TOKEN"
```

### Auth-Probleme
```bash
# Token erneuern
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"dein-passwort"}'

# Token prüfen
curl http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

### Queue ist voll
```bash
# Queue-Status prüfen
curl http://localhost:3000/api/v1/queue/stats \
  -H "Authorization: Bearer $TOKEN"

# Pending Tasks prüfen
curl "http://localhost:3000/api/v1/tasks?status=queued" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Architektur

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                       │
│                    http://server:3001                        │
│        Login │ Dashboard │ Agents │ Services │ Arena        │
└─────────────────────────┬───────────────────────────────────┘
                          │ JWT Token
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Express API (Node.js)                      │
│                    http://server:3000                        │
├─────────────────────────────────────────────────────────────┤
│  Auth Middleware (JWT)                                       │
├─────────────────────────────────────────────────────────────┤
│  /api/v1/auto     → TaskRouter → Agent-Auswahl              │
│  /api/v1/arena    → ArenaProPlus → Multi-Agent              │
│  /api/v1/agents   → Direkte Agent-Kontrolle                 │
│  /api/v1/tasks    → Task-Management                         │
│  /api/v1/services → External Services                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
┌─────────────────┐ ┌───────────┐ ┌─────────────────┐
│   8 AI Agents   │ │ External  │ │   Persistence   │
├─────────────────┤ │ Services  │ ├─────────────────┤
│ Translator      │ ├───────────┤ │ SQLite DB       │
│ Support         │ │ Sipgate   │ │ InMemory Queue  │
│ Marketing       │ │ Twilio    │ │ Cache Service   │
│ Data            │ │ Voice     │ │ Cost Tracking   │
│ Finance         │ │ Meta      │ └─────────────────┘
│ Legal           │ └───────────┘
│ Summary         │
│ Influencer      │
└─────────────────┘
```

---

## Umgebungsvariablen

### Erforderlich
```env
PORT=3000
OPENAI_API_KEY=sk-...
# oder
ANTHROPIC_API_KEY=sk-ant-...
# oder
GEMINI_API_KEY=AIza...
```

### Authentifizierung
```env
REQUIRE_AUTH=true
JWT_SECRET=change-this-to-secure-random-string
JWT_EXPIRES_IN=24h
ADMIN_USER=admin
ADMIN_PASS=change-this-password
```

### External Services (Optional)
```env
# Sipgate
SIPGATE_TOKEN_ID=token-xxx
SIPGATE_TOKEN=xxxxxxxx
SIPGATE_PHONE_NUMBER=+49123456789

# Twilio
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=xxxx
TWILIO_PHONE_NUMBER=+1234567890

# Voice (ElevenLabs)
ELEVENLABS_API_KEY=xxxx

# Meta Graph / Influencer Agent
META_ACCESS_TOKEN=xxxx
META_PAGE_ID=xxxx
INSTAGRAM_ACCOUNT_ID=xxxx
FACEBOOK_PAGE_ID=xxxx
```

---

## Live-URLs

### Server
- **Backend API**: http://91.98.78.198:3000
- **Frontend Dashboard**: http://91.98.78.198:3001

### Quick-Tests
```bash
# Health-Check
curl http://91.98.78.198:3000/health

# Login
curl -X POST http://91.98.78.198:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"MuciSuperman2024"}'
```

---

## Kontakt & Repositories

- **Backend**: https://github.com/devshift-stack/gpt_superman
- **Frontend**: https://github.com/devshift-stack/uix-gptsuperman

---

*Version: 2.1.0*
*Aktualisiert: 2025-12-23*
