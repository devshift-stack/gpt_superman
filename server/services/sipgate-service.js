/**
 * Sipgate Telefonie-Service für MUCI-SUPERMAN
 * =============================================
 *
 * Sipgate ist ein deutscher VoIP-Anbieter.
 * Diese Integration ermöglicht ein- und ausgehende Anrufe.
 *
 * Features:
 * - Ein- und ausgehende Anrufe
 * - SMS-Versand
 * - Anruf-Historie
 * - Webhook-Verarbeitung
 * - Retry-Logik mit exponential Backoff
 * - Circuit Breaker Pattern
 * - Request-Caching
 *
 * Voraussetzungen:
 * - Sipgate Account (team oder basic)
 * - Personal Access Token: https://app.sipgate.com/personal-access-token
 * - Berechtigungen: sessions:calls:write, history:read
 *
 * Sprachen: Deutsch, Bosnisch, Serbisch, Englisch
 *
 * @module sipgate-service
 * @version 2.0.0
 */

'use strict';

const axios = require('axios');
const { logError, logInfo } = require('./error-logger');
const { PhoneNumberUtils, RetryHandler, CircuitBreaker, SimpleCache } = require('./utils/service-helpers');

const SIPGATE_API = 'https://api.sipgate.com/v2';

/**
 * @typedef {Object} SipgateConfig
 * @property {string} tokenId - Sipgate Token ID
 * @property {string} token - Sipgate Token
 * @property {string} [phoneNumber] - Standard-Telefonnummer
 * @property {string} [deviceId='p0'] - Standard-Device ID
 * @property {string} [language='de'] - Sprache
 * @property {number} [timeout=30000] - Request-Timeout in ms
 * @property {number} [maxRetries=3] - Maximale Retry-Versuche
 */

/**
 * @typedef {Object} CallResult
 * @property {boolean} success - Erfolg
 * @property {string} [sessionId] - Session-ID des Anrufs
 * @property {string} message - Statusmeldung
 * @property {string} [error] - Fehlermeldung
 */

class SipgateService {
  /**
   * @param {SipgateConfig} config - Konfiguration
   */
  constructor(config = {}) {
    // Credentials
    this.tokenId = config.tokenId || process.env.SIPGATE_TOKEN_ID;
    this.token = config.token || process.env.SIPGATE_TOKEN;
    this.phoneNumber = config.phoneNumber || process.env.SIPGATE_PHONE_NUMBER;
    this.deviceId = config.deviceId || process.env.SIPGATE_DEVICE_ID || 'p0';

    // Timeout & Retries
    this.timeout = config.timeout || 30000;
    this.maxRetries = config.maxRetries || 3;

    // Circuit Breaker
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 60000,
      name: 'sipgate'
    });

    // Cache für häufige Abfragen
    this.cache = new SimpleCache({ ttl: 300000 }); // 5 Minuten

    // Axios Instance mit Defaults
    this.httpClient = axios.create({
      baseURL: SIPGATE_API,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Request Interceptor für Auth
    this.httpClient.interceptors.request.use((config) => {
      config.headers.Authorization = this.getAuthHeader();
      return config;
    });

    // Sprach-spezifische Nachrichten
    this.messages = {
      de: {
        call_initiated: 'Anruf wird gestartet...',
        call_failed: 'Anruf fehlgeschlagen',
        call_success: 'Anruf erfolgreich initiiert',
        sms_sent: 'SMS erfolgreich gesendet',
        sms_failed: 'SMS-Versand fehlgeschlagen',
        connection_success: 'Sipgate Verbindung erfolgreich',
        connection_failed: 'Sipgate Verbindung fehlgeschlagen',
        no_credentials: 'Sipgate Zugangsdaten fehlen',
        invalid_number: 'Ungültige Telefonnummer',
        rate_limited: 'Zu viele Anfragen - bitte warten',
        circuit_open: 'Service temporär nicht verfügbar'
      },
      bs: {
        call_initiated: 'Poziv se pokreće...',
        call_failed: 'Poziv nije uspio',
        call_success: 'Poziv uspješno pokrenut',
        sms_sent: 'SMS uspješno poslan',
        sms_failed: 'Slanje SMS-a nije uspjelo',
        connection_success: 'Sipgate veza uspješna',
        connection_failed: 'Sipgate veza nije uspjela',
        no_credentials: 'Nedostaju Sipgate pristupni podaci',
        invalid_number: 'Nevažeći telefonski broj',
        rate_limited: 'Previše zahtjeva - molimo pričekajte',
        circuit_open: 'Usluga privremeno nedostupna'
      },
      sr: {
        call_initiated: 'Позив се покреће...',
        call_failed: 'Позив није успео',
        call_success: 'Позив успешно покренут',
        sms_sent: 'СМС успешно послат',
        sms_failed: 'Слање СМС-а није успело',
        connection_success: 'Sipgate веза успешна',
        connection_failed: 'Sipgate веза није успела',
        no_credentials: 'Недостају Sipgate приступни подаци',
        invalid_number: 'Неважећи телефонски број',
        rate_limited: 'Превише захтева - молимо сачекајте',
        circuit_open: 'Услуга привремено недоступна'
      },
      en: {
        call_initiated: 'Call is being initiated...',
        call_failed: 'Call failed',
        call_success: 'Call successfully initiated',
        sms_sent: 'SMS sent successfully',
        sms_failed: 'SMS sending failed',
        connection_success: 'Sipgate connection successful',
        connection_failed: 'Sipgate connection failed',
        no_credentials: 'Sipgate credentials missing',
        invalid_number: 'Invalid phone number',
        rate_limited: 'Too many requests - please wait',
        circuit_open: 'Service temporarily unavailable'
      }
    };

    this.language = config.language || 'de';

    // Webhook-Handler Registry
    this.webhookHandlers = new Map();
  }

  /**
   * Konfiguration aktualisieren
   * @param {Partial<SipgateConfig>} config
   */
  updateConfig(config) {
    if (config.tokenId) this.tokenId = config.tokenId;
    if (config.token) this.token = config.token;
    if (config.phoneNumber) this.phoneNumber = config.phoneNumber;
    if (config.deviceId) this.deviceId = config.deviceId;
    if (config.language) this.language = config.language;
    if (config.timeout) this.timeout = config.timeout;

    // Cache invalidieren bei Credential-Änderung
    this.cache.clear();
  }

  /**
   * Lokalisierte Nachricht abrufen
   * @param {string} key
   * @returns {string}
   */
  getMessage(key) {
    return this.messages[this.language]?.[key] || this.messages.en?.[key] || key;
  }

  /**
   * Authorization Header erstellen
   * @returns {string}
   * @throws {Error}
   */
  getAuthHeader() {
    if (!this.tokenId || !this.token) {
      throw new Error(this.getMessage('no_credentials'));
    }
    const auth = Buffer.from(`${this.tokenId}:${this.token}`).toString('base64');
    return `Basic ${auth}`;
  }

  /**
   * API Request mit Retry-Logik und Circuit Breaker
   * @param {string} method - HTTP-Methode
   * @param {string} endpoint - API-Endpoint
   * @param {Object} [data] - Request-Body
   * @param {Object} [options] - Zusätzliche Optionen
   * @returns {Promise<any>}
   */
  async request(method, endpoint, data = null, options = {}) {
    // Circuit Breaker Check
    if (!this.circuitBreaker.canRequest()) {
      throw new Error(this.getMessage('circuit_open'));
    }

    const requestFn = async () => {
      try {
        const response = await this.httpClient({
          method,
          url: endpoint,
          data,
          ...options
        });

        this.circuitBreaker.recordSuccess();
        return response.data;
      } catch (error) {
        this.circuitBreaker.recordFailure();
        throw this._handleError(error, endpoint, method);
      }
    };

    // Mit Retry-Logik ausführen
    return RetryHandler.execute(requestFn, {
      maxRetries: this.maxRetries,
      retryCondition: (error) => {
        const status = error.response?.status;
        return status === 429 || status >= 500;
      }
    });
  }

  /**
   * Fehlerbehandlung
   * @private
   */
  _handleError(error, endpoint, method) {
    const status = error.response?.status;
    const errorMessage = error.response?.data?.message || error.message;

    logError(error, {
      source: 'sipgate',
      provider: 'sipgate',
      details: {
        endpoint,
        method,
        statusCode: status,
        apiMessage: errorMessage
      }
    });

    // Spezifische Fehlermeldungen
    if (status === 401) {
      return new Error('Sipgate: Authentifizierung fehlgeschlagen - Token ungültig');
    }
    if (status === 403) {
      return new Error('Sipgate: Keine Berechtigung für diese Aktion');
    }
    if (status === 429) {
      return new Error(this.getMessage('rate_limited'));
    }

    return new Error(`Sipgate API Error: ${errorMessage}`);
  }

  /**
   * Verbindung testen
   * @returns {Promise<Object>}
   */
  async testConnection() {
    try {
      const result = await this.request('GET', '/account');

      logInfo('Sipgate connection test successful', { source: 'sipgate' });

      return {
        success: true,
        message: this.getMessage('connection_success'),
        company: result.company,
        accountId: result.sid
      };
    } catch (error) {
      return {
        success: false,
        message: this.getMessage('connection_failed'),
        error: error.message
      };
    }
  }

  /**
   * Verfügbare Telefonnummern abrufen (gecacht)
   * @returns {Promise<Array>}
   */
  async getNumbers() {
    const cacheKey = 'numbers';
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const result = await this.request('GET', '/numbers');
    const numbers = result.items.map(n => ({
      id: n.id,
      number: n.number,
      type: n.type,
      endpointId: n.endpointId,
      formatted: PhoneNumberUtils.format(n.number)
    }));

    this.cache.set(cacheKey, numbers);
    return numbers;
  }

  /**
   * Verfügbare Devices (Endpunkte) abrufen (gecacht)
   * @returns {Promise<Array>}
   */
  async getDevices() {
    const cacheKey = 'devices';
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const result = await this.request('GET', '/devices');
    const devices = result.items.map(d => ({
      id: d.id,
      alias: d.alias,
      type: d.type,
      online: d.online
    }));

    this.cache.set(cacheKey, devices);
    return devices;
  }

  /**
   * Anruf initiieren
   * @param {string} calleeNumber - Zu rufende Nummer
   * @param {Object} [options] - Optionale Parameter
   * @returns {Promise<CallResult>}
   */
  async initiateCall(calleeNumber, options = {}) {
    // Nummer validieren und normalisieren
    const normalizedNumber = PhoneNumberUtils.normalize(calleeNumber);
    if (!PhoneNumberUtils.isValid(normalizedNumber)) {
      return {
        success: false,
        message: this.getMessage('invalid_number'),
        error: `Invalid phone number: ${calleeNumber}`
      };
    }

    const data = {
      caller: options.deviceId || this.deviceId,
      callee: normalizedNumber,
      callerId: options.callerId || this.phoneNumber
    };

    logInfo(`Initiating Sipgate call to ${PhoneNumberUtils.mask(normalizedNumber)}`, {
      source: 'sipgate',
      details: { deviceId: data.caller }
    });

    try {
      const result = await this.request('POST', '/sessions/calls', data);

      return {
        success: true,
        sessionId: result.sessionId,
        message: this.getMessage('call_success'),
        callDetails: {
          callee: normalizedNumber,
          caller: data.caller,
          callerId: data.callerId
        }
      };
    } catch (error) {
      return {
        success: false,
        message: this.getMessage('call_failed'),
        error: error.message
      };
    }
  }

  /**
   * Anruf-Historie abrufen
   * @param {Object} [options] - Filter-Optionen
   * @returns {Promise<Array>}
   */
  async getCallHistory(options = {}) {
    const {
      limit = 50,
      offset = 0,
      direction = null,
      type = 'CALL',
      since = null,
      until = null
    } = options;

    let endpoint = `/history?types=${type}&limit=${Math.min(limit, 100)}&offset=${offset}`;

    if (direction) {
      endpoint += `&directions=${direction.toUpperCase()}`;
    }

    // Zeitfilter
    if (since) {
      endpoint += `&from=${new Date(since).toISOString()}`;
    }
    if (until) {
      endpoint += `&to=${new Date(until).toISOString()}`;
    }

    const result = await this.request('GET', endpoint);

    return result.items.map(item => ({
      id: item.id,
      source: item.source,
      target: item.target,
      sourceMasked: PhoneNumberUtils.mask(item.source),
      targetMasked: PhoneNumberUtils.mask(item.target),
      direction: item.direction,
      status: item.status,
      duration: item.duration,
      durationFormatted: this._formatDuration(item.duration),
      created: item.created,
      answered: item.answered,
      ended: item.ended
    }));
  }

  /**
   * Account-Balance abrufen
   * @returns {Promise<Object>}
   */
  async getBalance() {
    const result = await this.request('GET', '/balance');
    const amount = result.amount / 10000; // Betrag in Euro

    return {
      amount,
      amountFormatted: new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: result.currency || 'EUR'
      }).format(amount),
      currency: result.currency || 'EUR',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * SMS senden
   * @param {string} recipient - Empfänger-Nummer
   * @param {string} message - Nachricht
   * @param {Object} [options] - Optionen
   * @returns {Promise<Object>}
   */
  async sendSMS(recipient, message, options = {}) {
    // Validierung
    const normalizedNumber = PhoneNumberUtils.normalize(recipient);
    if (!PhoneNumberUtils.isValid(normalizedNumber)) {
      return {
        success: false,
        message: this.getMessage('invalid_number'),
        error: 'Invalid recipient phone number'
      };
    }

    if (!message || message.trim().length === 0) {
      return {
        success: false,
        message: 'Nachricht darf nicht leer sein',
        error: 'Empty message'
      };
    }

    // SMS-Länge prüfen
    const messageLength = message.length;
    const smsCount = Math.ceil(messageLength / 160);

    const data = {
      smsId: options.smsId || 's0',
      recipient: normalizedNumber,
      message: message.trim()
    };

    try {
      const result = await this.request('POST', '/sessions/sms', data);

      logInfo(`SMS sent to ${PhoneNumberUtils.mask(normalizedNumber)}`, {
        source: 'sipgate',
        details: { messageLength, smsCount }
      });

      return {
        success: true,
        sessionId: result.sessionId,
        message: this.getMessage('sms_sent'),
        details: {
          recipient: normalizedNumber,
          messageLength,
          smsCount
        }
      };
    } catch (error) {
      return {
        success: false,
        message: this.getMessage('sms_failed'),
        error: error.message
      };
    }
  }

  /**
   * Webhook-Handler registrieren
   * @param {string} eventType - Event-Typ
   * @param {Function} handler - Handler-Funktion
   */
  registerWebhookHandler(eventType, handler) {
    this.webhookHandlers.set(eventType, handler);
  }

  /**
   * Webhook-Events verarbeiten
   * @param {Object} event - Webhook-Event
   * @returns {Promise<Object>}
   */
  async handleWebhook(event) {
    const { event: eventType, call, user } = event;

    logInfo(`Sipgate Webhook: ${eventType}`, {
      source: 'sipgate',
      details: { callId: call?.id, eventType }
    });

    // Registrierten Handler aufrufen
    const handler = this.webhookHandlers.get(eventType);
    if (handler) {
      return await handler(event);
    }

    // Default-Handler
    switch (eventType) {
      case 'newCall':
        return this._handleNewCall(call);
      case 'answer':
        return this._handleAnsweredCall(call);
      case 'hangup':
        return this._handleHangup(call);
      case 'dtmf':
        return this._handleDTMF(call, event.dtmf);
      default:
        return { handled: false, event: eventType };
    }
  }

  /**
   * @private
   */
  _handleNewCall(call) {
    return {
      handled: true,
      action: 'incoming_call',
      callId: call.id,
      from: call.from,
      fromMasked: PhoneNumberUtils.mask(call.from),
      to: call.to,
      direction: call.direction,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * @private
   */
  _handleAnsweredCall(call) {
    return {
      handled: true,
      action: 'call_answered',
      callId: call.id,
      answeredAt: new Date().toISOString()
    };
  }

  /**
   * @private
   */
  _handleHangup(call) {
    return {
      handled: true,
      action: 'call_ended',
      callId: call.id,
      duration: call.duration,
      durationFormatted: this._formatDuration(call.duration),
      endedAt: new Date().toISOString(),
      cause: call.cause || 'normal'
    };
  }

  /**
   * @private
   */
  _handleDTMF(call, dtmf) {
    return {
      handled: true,
      action: 'dtmf_received',
      callId: call.id,
      digit: dtmf,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Dauer formatieren
   * @private
   */
  _formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Status-Informationen
   * @returns {Object}
   */
  getStatus() {
    return {
      configured: !!(this.tokenId && this.token),
      phoneNumber: this.phoneNumber ? PhoneNumberUtils.mask(this.phoneNumber) : null,
      deviceId: this.deviceId,
      language: this.language,
      circuitBreaker: this.circuitBreaker.getState(),
      cacheSize: this.cache.size()
    };
  }

  /**
   * Health-Check
   * @returns {Promise<Object>}
   */
  async healthCheck() {
    const status = this.getStatus();

    if (!status.configured) {
      return {
        healthy: false,
        reason: 'not_configured',
        status
      };
    }

    if (status.circuitBreaker.state === 'open') {
      return {
        healthy: false,
        reason: 'circuit_open',
        status
      };
    }

    try {
      const connectionTest = await this.testConnection();
      return {
        healthy: connectionTest.success,
        reason: connectionTest.success ? null : 'connection_failed',
        status,
        connection: connectionTest
      };
    } catch (error) {
      return {
        healthy: false,
        reason: 'connection_error',
        error: error.message,
        status
      };
    }
  }
}

/**
 * Express Router für Sipgate API Endpoints
 * @param {SipgateService} sipgateService
 * @returns {import('express').Router}
 */
function createSipgateRouter(sipgateService) {
  const express = require('express');
  const router = express.Router();

  // Rate Limiting Middleware (optional)
  const rateLimit = (limit, window) => {
    const requests = new Map();
    return (req, res, next) => {
      const key = req.ip;
      const now = Date.now();
      const windowStart = now - window;

      const requestTimes = requests.get(key) || [];
      const recentRequests = requestTimes.filter(t => t > windowStart);

      if (recentRequests.length >= limit) {
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.ceil(window / 1000)
        });
      }

      recentRequests.push(now);
      requests.set(key, recentRequests);
      next();
    };
  };

  // Verbindung testen
  router.post('/test', async (req, res) => {
    try {
      const result = await sipgateService.testConnection();
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Health Check
  router.get('/health', async (req, res) => {
    try {
      const health = await sipgateService.healthCheck();
      res.status(health.healthy ? 200 : 503).json(health);
    } catch (error) {
      res.status(500).json({ healthy: false, error: error.message });
    }
  });

  // Telefonnummern abrufen
  router.get('/numbers', async (req, res) => {
    try {
      const numbers = await sipgateService.getNumbers();
      res.json({ numbers, count: numbers.length });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Devices abrufen
  router.get('/devices', async (req, res) => {
    try {
      const devices = await sipgateService.getDevices();
      res.json({ devices, count: devices.length });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Anruf initiieren
  router.post('/call', rateLimit(10, 60000), async (req, res) => {
    try {
      const { number, deviceId, callerId } = req.body;

      if (!number) {
        return res.status(400).json({
          error: 'Telefonnummer fehlt',
          field: 'number'
        });
      }

      const result = await sipgateService.initiateCall(number, { deviceId, callerId });
      res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Anruf-Historie
  router.get('/history', async (req, res) => {
    try {
      const { limit, offset, direction, since, until } = req.query;
      const history = await sipgateService.getCallHistory({
        limit: Math.min(parseInt(limit) || 50, 100),
        offset: parseInt(offset) || 0,
        direction,
        since,
        until
      });
      res.json({
        history,
        count: history.length,
        pagination: {
          limit: parseInt(limit) || 50,
          offset: parseInt(offset) || 0
        }
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Balance abrufen
  router.get('/balance', async (req, res) => {
    try {
      const balance = await sipgateService.getBalance();
      res.json(balance);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // SMS senden
  router.post('/sms', rateLimit(5, 60000), async (req, res) => {
    try {
      const { recipient, message, smsId } = req.body;

      if (!recipient) {
        return res.status(400).json({
          error: 'Empfänger fehlt',
          field: 'recipient'
        });
      }
      if (!message) {
        return res.status(400).json({
          error: 'Nachricht fehlt',
          field: 'message'
        });
      }

      const result = await sipgateService.sendSMS(recipient, message, { smsId });
      res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Webhook für eingehende Events
  router.post('/webhook', async (req, res) => {
    try {
      const result = await sipgateService.handleWebhook(req.body);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Status
  router.get('/status', (req, res) => {
    res.json(sipgateService.getStatus());
  });

  return router;
}

// Singleton-Instanz
const sipgateService = new SipgateService();

module.exports = {
  SipgateService,
  sipgateService,
  createSipgateRouter
};
