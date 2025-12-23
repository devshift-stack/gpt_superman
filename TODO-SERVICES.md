# TODO: Services v2.0 - Fehlende Konfigurationen

## Status-Übersicht

| Service | Status | Fehlende Konfiguration |
|---------|--------|------------------------|
| Sipgate | nicht konfiguriert | API-Credentials |
| Twilio | nicht konfiguriert | API-Credentials |
| Voice (OpenAI) | verfügbar | - |
| Voice (ElevenLabs) | nicht verfügbar | API-Key |
| Voice (Azure) | nicht verfügbar | API-Credentials |
| Meta Graph | nicht konfiguriert | API-Credentials |

---

## 1. Sipgate (Telefonie)

**Benötigte Umgebungsvariablen:**
```env
SIPGATE_TOKEN_ID=<dein-token-id>
SIPGATE_TOKEN=<dein-token>
SIPGATE_PHONE_NUMBER=<deine-telefonnummer>
SIPGATE_DEVICE_ID=p0  # Optional, Default: p0
```

**Wo bekommst du die Credentials?**
- Sipgate Account: https://app.sipgate.com
- Token erstellen: Einstellungen → API-Clients → Personal Access Token

**Endpoints nach Konfiguration:**
- `POST /api/v1/services/sipgate/call` - Anruf starten
- `POST /api/v1/services/sipgate/sms` - SMS senden
- `GET /api/v1/services/sipgate/history` - Anrufverlauf
- `GET /api/v1/services/sipgate/balance` - Guthaben

---

## 2. Twilio (SMS, WhatsApp, Anrufe)

**Benötigte Umgebungsvariablen:**
```env
TWILIO_ACCOUNT_SID=<dein-account-sid>
TWILIO_AUTH_TOKEN=<dein-auth-token>
TWILIO_PHONE_NUMBER=<deine-twilio-nummer>
```

**Wo bekommst du die Credentials?**
- Twilio Console: https://console.twilio.com
- Account SID & Auth Token auf der Dashboard-Seite

**Endpoints nach Konfiguration:**
- `POST /api/v1/services/twilio/sms` - SMS senden
- `POST /api/v1/services/twilio/whatsapp` - WhatsApp senden
- `POST /api/v1/services/twilio/call` - Anruf starten
- `GET /api/v1/services/twilio/messages` - Nachrichtenverlauf

---

## 3. Voice (STT/TTS)

### OpenAI (bereits konfiguriert)
```env
OPENAI_API_KEY=sk-...  # Bereits vorhanden
```

### ElevenLabs (optional)
```env
ELEVENLABS_API_KEY=<dein-api-key>
ELEVENLABS_VOICE_ID=<voice-id>  # Optional
```

**Wo bekommst du die Credentials?**
- ElevenLabs: https://elevenlabs.io/app/settings/api-keys

### Azure Speech (optional)
```env
AZURE_SPEECH_KEY=<dein-speech-key>
AZURE_SPEECH_REGION=<region>  # z.B. westeurope
```

**Wo bekommst du die Credentials?**
- Azure Portal: https://portal.azure.com
- Cognitive Services → Speech → Keys and Endpoint

**Endpoints:**
- `POST /api/v1/services/voice/stt` - Speech-to-Text
- `POST /api/v1/services/voice/tts` - Text-to-Speech
- `GET /api/v1/services/voice/voices` - Verfügbare Stimmen

---

## 4. Meta Graph (Facebook/Instagram)

**Benötigte Umgebungsvariablen:**
```env
META_ACCESS_TOKEN=<dein-access-token>
META_PAGE_ID=<deine-page-id>
META_INSTAGRAM_ACCOUNT_ID=<dein-instagram-id>  # Optional
META_APP_SECRET=<dein-app-secret>  # Für Webhook-Verifizierung
```

**Wo bekommst du die Credentials?**
- Meta for Developers: https://developers.facebook.com
- Graph API Explorer für Token-Generierung
- Page ID: Seiten-Einstellungen → Über → Page-ID

**Endpoints nach Konfiguration:**
- `POST /api/v1/services/meta/post` - Facebook Post erstellen
- `POST /api/v1/services/meta/instagram` - Instagram Post
- `GET /api/v1/services/meta/insights` - Seiten-Statistiken
- `POST /api/v1/services/meta/webhook` - Webhook-Handler

---

## 5. Allgemeine Server-Konfiguration

**Bereits konfiguriert:**
```env
GEMINI_API_KEY=✓
OPENAI_API_KEY=✓
ANTHROPIC_API_KEY=✓
```

**Optional:**
```env
REQUIRE_AUTH=true  # API-Authentifizierung aktivieren
RATE_LIMIT=200     # Requests pro 15 Min (Default: 200)
API_VERSION=v1     # API-Version (Default: v1)
ALLOWED_ORIGINS=*  # CORS Origins
```

---

## Deployment-Checkliste

- [ ] Sipgate Credentials in `.env` eintragen
- [ ] Twilio Credentials in `.env` eintragen
- [ ] ElevenLabs API-Key (optional) in `.env` eintragen
- [ ] Azure Speech Credentials (optional) in `.env` eintragen
- [ ] Meta Graph Credentials in `.env` eintragen
- [ ] Server neu starten: `pm2 restart gpt-superman`
- [ ] Health-Check: `curl http://server:3000/api/v1/services/health`

---

## Test-URLs

```bash
# Status aller Services
curl http://91.98.78.198:3000/api/v1/services/status

# Health-Check
curl http://91.98.78.198:3000/api/v1/services/health

# Error-Statistiken
curl http://91.98.78.198:3000/api/v1/services/errors/stats
```

---

*Erstellt: 2025-12-23*
*Version: 2.0.0*
