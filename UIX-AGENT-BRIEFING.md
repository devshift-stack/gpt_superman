# UIX Agent Briefing - MUCI-SUPERMAN v2.0

## Übersicht der Backend-Änderungen

Seit dem letzten UIX-Update wurden folgende Backend-Features implementiert, die Frontend-Integration benötigen:

---

## 1. NEUE SERVICE-ENDPOINTS

### Basis-URL: `/api/v1/services`

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/status` | GET | Status aller Services (Sipgate, Twilio, Voice, Meta) |
| `/health` | GET | Health-Check mit Details pro Service |
| `/errors` | GET | Error-Logs abrufen (mit Filterung) |
| `/errors/stats` | GET | Fehler-Statistiken |
| `/errors` | DELETE | Alle Fehler löschen |
| `/errors/export` | GET | Export als JSON oder CSV |
| `/config` | POST | Service-Konfiguration ändern |

### Sipgate Endpoints: `/api/v1/services/sipgate`

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/call` | POST | Anruf starten |
| `/sms` | POST | SMS senden |
| `/history` | GET | Anrufverlauf |
| `/balance` | GET | Guthaben abfragen |
| `/status` | GET | Service-Status |

### Twilio Endpoints: `/api/v1/services/twilio`

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/sms` | POST | SMS senden |
| `/whatsapp` | POST | WhatsApp-Nachricht senden |
| `/call` | POST | Anruf starten |
| `/messages` | GET | Nachrichtenverlauf |
| `/status` | GET | Service-Status |

### Voice Endpoints: `/api/v1/services/voice`

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/stt` | POST | Speech-to-Text (Audio → Text) |
| `/tts` | POST | Text-to-Speech (Text → Audio) |
| `/voices` | GET | Verfügbare Stimmen |
| `/status` | GET | Provider-Status |

### Meta Graph Endpoints: `/api/v1/services/meta`

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/post` | POST | Facebook-Post erstellen |
| `/instagram` | POST | Instagram-Post erstellen |
| `/instagram/carousel` | POST | Instagram Carousel |
| `/insights` | GET | Seiten-Statistiken |
| `/webhook` | POST | Webhook-Handler |
| `/status` | GET | Service-Status |

---

## 2. AGENTS v2.1 - NEUE FEATURES

### Streaming Support
```javascript
// Agents unterstützen jetzt Streaming
POST /api/v1/task
{
  "task": "Analysiere diesen Text...",
  "stream": true  // NEU: Streaming aktivieren
}
```

### Batch Processing
```javascript
// Mehrere Tasks gleichzeitig
POST /api/v1/batch
{
  "tasks": [
    { "task": "Übersetze: Hello", "agent": "translator" },
    { "task": "Zusammenfassung...", "agent": "summary" }
  ]
}
```

### Verfügbare Agents (7 Stück)

| Agent | Typ | Neue Features |
|-------|-----|---------------|
| TranslatorAgent | Übersetzung | 18 Sprachen, Glossar, Confidence Scores |
| SupportAgent | Kundenservice | FAQ-Suche, Session-Management, Eskalation |
| MarketingAgent | Marketing | A/B Testing mit Statistical Significance |
| DataAgent | Datenanalyse | SQL-Generierung, Chart-Empfehlungen |
| FinanceAgent | Finanzen | Multi-Währung (EUR, BAM, RSD), Steuer |
| LegalAgent | Recht | Multi-Jurisdiktion (DE, AT, CH, BA, RS) |
| SummaryAgent | Zusammenfassung | Multi-Style (Executive, Bullets, Academic) |

---

## 3. UIX ANPASSUNGEN ERFORDERLICH

### 3.1 Neues Dashboard-Widget: "Services Status"

**Anforderung:**
- Kachel/Card die den Status aller externen Services zeigt
- Farbcodierung: Grün (healthy), Gelb (degraded), Rot (unhealthy), Grau (not configured)
- Klick öffnet Detail-Ansicht

**Datenquelle:**
```javascript
fetch('/api/v1/services/status')
// Response enthält: sipgate, twilio, voice, meta Status
```

**Design-Vorschlag:**
```
┌─────────────────────────────────────────┐
│  🔌 External Services                   │
├─────────────────────────────────────────┤
│  ● Sipgate      ○ Twilio                │
│    Not Config     Not Config            │
│                                         │
│  ● Voice        ○ Meta Graph            │
│    OpenAI ✓       Not Config            │
└─────────────────────────────────────────┘
```

### 3.2 Neue Seite: "Services" (/services)

**Tabs/Bereiche:**

1. **Übersicht** - Alle Services auf einen Blick
2. **Sipgate** - Telefonie-Funktionen
3. **Twilio** - SMS/WhatsApp
4. **Voice** - STT/TTS testen
5. **Meta** - Social Media Posting
6. **Errors** - Fehler-Log Viewer

### 3.3 Error Log Viewer

**Anforderung:**
- Tabelle mit allen Fehlern
- Filter: Source, Level, Agent, Datum
- Export-Button (JSON/CSV)
- Clear-Button (mit Bestätigung)

**Datenquelle:**
```javascript
// Fehler abrufen mit Filtern
fetch('/api/v1/services/errors?limit=50&level=error&since=2025-12-23')

// Statistiken
fetch('/api/v1/services/errors/stats')
```

**Spalten:**
| Timestamp | Level | Source | Message | Agent | Correlation ID |

**Level-Farben:**
- debug: Grau
- info: Blau
- warning: Orange
- error: Rot
- critical: Dunkelrot/Pulsierend

### 3.4 Voice Test-Interface

**Anforderung:**
- Mikrofon-Button für STT (Speech-to-Text)
- Textfeld + Abspielen-Button für TTS (Text-to-Speech)
- Provider-Auswahl (OpenAI, ElevenLabs, Azure)
- Stimmen-Dropdown

**Design:**
```
┌─────────────────────────────────────────┐
│  🎤 Voice Testing                       │
├─────────────────────────────────────────┤
│  Provider: [OpenAI ▼]                   │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  🎙️ Klicken zum Aufnehmen      │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Erkannter Text:                        │
│  ┌─────────────────────────────────┐    │
│  │ "Hallo, das ist ein Test..."   │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ─────────── ODER ───────────           │
│                                         │
│  Text-to-Speech:                        │
│  ┌─────────────────────────────────┐    │
│  │ Text hier eingeben...           │    │
│  └─────────────────────────────────┘    │
│  Stimme: [Alloy ▼]   [▶️ Abspielen]     │
└─────────────────────────────────────────┘
```

### 3.5 Social Media Composer (Meta)

**Anforderung:**
- Textfeld für Post-Inhalt
- Bild-Upload (einzeln oder Carousel)
- Plattform-Auswahl: Facebook, Instagram, Beide
- Vorschau wie der Post aussehen wird
- Zeitplanung (optional)

### 3.6 Agent-Auswahl verbessern

**Anforderung:**
- Dropdown oder Kacheln für Agent-Auswahl
- Zeige Agent-Beschreibung und Features
- "Auto" Option für automatische Agent-Wahl

**Neue Agent-Badges:**
```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ 🌐 Translator│  │ 💬 Support   │  │ 📊 Marketing │
│   18 Sprachen│  │   FAQ Search │  │   A/B Testing│
└──────────────┘  └──────────────┘  └──────────────┘
```

### 3.7 Streaming-Anzeige

**Anforderung:**
- Wenn `stream: true`, zeige Text Token für Token
- Typing-Indikator während Streaming
- Möglichkeit, Streaming abzubrechen

### 3.8 Circuit Breaker Status

**Anforderung:**
- Zeige Circuit Breaker Status in Service-Details
- States: closed (✓), open (✗), half-open (⚠)
- Zeige Failure-Count und nächsten Retry

**Design:**
```
Circuit Breaker: ● Closed
Failures: 0/5
Last Failure: -
```

---

## 4. FARB-/ICON-SCHEMA

### Service Status Icons
- ✅ Healthy/Configured: `#22c55e` (Grün)
- ⚠️ Degraded/Half-Open: `#f59e0b` (Orange)
- ❌ Unhealthy/Open: `#ef4444` (Rot)
- ⚪ Not Configured: `#9ca3af` (Grau)

### Agent Icons (Vorschlag)
- 🌐 Translator
- 💬 Support
- 📊 Marketing
- 📈 Data
- 💰 Finance
- ⚖️ Legal
- 📝 Summary

### Error Level Colors
- debug: `#6b7280`
- info: `#3b82f6`
- warning: `#f59e0b`
- error: `#ef4444`
- critical: `#991b1b`

---

## 5. API RESPONSE BEISPIELE

### Services Status Response
```json
{
  "version": "2.0.0",
  "timestamp": "2025-12-23T04:44:44.270Z",
  "services": {
    "sipgate": {
      "configured": false,
      "circuitBreaker": {
        "state": "closed",
        "failures": 0
      }
    },
    "twilio": {
      "configured": false,
      "circuitBreaker": {
        "state": "closed",
        "failures": 0
      }
    },
    "voice": {
      "sttProvider": "openai",
      "ttsProvider": "openai",
      "providers": {
        "openai": { "available": true },
        "elevenlabs": { "available": false },
        "azure": { "available": false }
      }
    },
    "meta": {
      "configured": false
    }
  },
  "errorStats": {
    "total": 0,
    "byLevel": {
      "error": 0,
      "warning": 0
    }
  }
}
```

### Error Log Response
```json
{
  "errors": [
    {
      "id": "err_abc123",
      "timestamp": "2025-12-23T04:30:00Z",
      "level": "error",
      "source": "sipgate",
      "message": "API timeout after 30s",
      "agentId": "support",
      "correlationId": "req_xyz789",
      "metadata": {
        "endpoint": "/call",
        "duration": 30000
      }
    }
  ],
  "count": 1
}
```

---

## 6. PRIORITÄTEN

### Hoch (Sofort umsetzen)
1. Services Status Dashboard-Widget
2. Error Log Viewer
3. Agent-Auswahl mit neuen 7 Agents

### Mittel (Nächste Iteration)
4. Voice Test-Interface
5. Streaming-Anzeige für Agent-Responses
6. Service-Detail-Seiten

### Niedrig (Später)
7. Social Media Composer
8. Batch-Processing UI
9. A/B Test Dashboard für Marketing

---

## 7. TECHNISCHE HINWEISE

### Correlation ID Header
Alle Requests bekommen automatisch eine Correlation ID:
```
X-Correlation-ID: req_abc123
```
Diese sollte in Error-Anzeigen sichtbar sein für Debugging.

### WebSocket für Streaming (optional)
Falls WebSocket gewünscht:
```javascript
const ws = new WebSocket('ws://server/api/v1/stream');
ws.send(JSON.stringify({ task: "...", stream: true }));
ws.onmessage = (event) => {
  const chunk = JSON.parse(event.data);
  // chunk.token, chunk.done
};
```

### Audio-Handling für Voice
```javascript
// STT: Audio als FormData
const formData = new FormData();
formData.append('audio', audioBlob, 'recording.webm');
fetch('/api/v1/services/voice/stt', {
  method: 'POST',
  body: formData
});

// TTS: Returns audio/mpeg
const response = await fetch('/api/v1/services/voice/tts', {
  method: 'POST',
  body: JSON.stringify({ text: "Hallo Welt", voice: "alloy" })
});
const audioBlob = await response.blob();
const audioUrl = URL.createObjectURL(audioBlob);
```

---

## 8. LIVE-DEMO URLs

Server läuft auf: `http://91.98.78.198:3000`

```bash
# Status testen
curl http://91.98.78.198:3000/api/v1/services/status

# Health-Check
curl http://91.98.78.198:3000/api/v1/services/health

# Agents
curl http://91.98.78.198:3000/api/v1/agents
```

---

*Erstellt: 2025-12-23*
*Backend Version: 2.0.0*
*Für: UIX/Design Agent*
