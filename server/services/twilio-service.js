/**
 * Twilio Telefonie-Service für MUCI-SUPERMAN
 * =============================================
 *
 * Twilio ermöglicht internationale Telefonie, SMS und WhatsApp.
 *
 * @module twilio-service
 * @version 2.0.0
 */

'use strict';

const { logError, logInfo } = require('./error-logger');
const { PhoneNumberUtils, RetryHandler, CircuitBreaker, SimpleCache } = require('./utils/service-helpers');

let twilioClient = null;

class TwilioService {
  constructor(config = {}) {
    this.accountSid = config.accountSid || process.env.TWILIO_ACCOUNT_SID;
    this.authToken = config.authToken || process.env.TWILIO_AUTH_TOKEN;
    this.phoneNumber = config.phoneNumber || process.env.TWILIO_PHONE_NUMBER;
    this.client = null;
    this.timeout = config.timeout || 60000;
    this.maxRetries = config.maxRetries || 3;

    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 60000,
      name: 'twilio'
    });

    this.cache = new SimpleCache({ ttl: 300000 });

    this.messages = {
      de: {
        call_initiated: 'Anruf wird gestartet...',
        call_failed: 'Anruf fehlgeschlagen',
        call_success: 'Anruf erfolgreich initiiert',
        sms_sent: 'SMS erfolgreich gesendet',
        sms_failed: 'SMS-Versand fehlgeschlagen',
        whatsapp_sent: 'WhatsApp-Nachricht gesendet',
        whatsapp_failed: 'WhatsApp-Versand fehlgeschlagen',
        connection_success: 'Twilio Verbindung erfolgreich',
        connection_failed: 'Twilio Verbindung fehlgeschlagen',
        no_credentials: 'Twilio Zugangsdaten fehlen',
        invalid_number: 'Ungültige Telefonnummer',
        sdk_missing: 'Twilio SDK nicht installiert',
        circuit_open: 'Service temporär nicht verfügbar'
      },
      bs: {
        call_initiated: 'Poziv se pokreće...',
        call_failed: 'Poziv nije uspio',
        call_success: 'Poziv uspješno pokrenut',
        sms_sent: 'SMS uspješno poslan',
        sms_failed: 'Slanje SMS-a nije uspjelo',
        whatsapp_sent: 'WhatsApp poruka poslana',
        whatsapp_failed: 'Slanje WhatsApp nije uspjelo',
        connection_success: 'Twilio veza uspješna',
        connection_failed: 'Twilio veza nije uspjela',
        no_credentials: 'Nedostaju Twilio podaci',
        invalid_number: 'Nevažeći broj',
        sdk_missing: 'Twilio SDK nije instaliran',
        circuit_open: 'Usluga nedostupna'
      },
      sr: {
        call_initiated: 'Позив се покреће...',
        call_failed: 'Позив није успео',
        call_success: 'Позив успешно покренут',
        sms_sent: 'СМС успешно послат',
        sms_failed: 'Слање СМС није успело',
        whatsapp_sent: 'WhatsApp порука послата',
        whatsapp_failed: 'Слање WhatsApp није успело',
        connection_success: 'Twilio веза успешна',
        connection_failed: 'Twilio веза није успела',
        no_credentials: 'Недостају Twilio подаци',
        invalid_number: 'Неважећи број',
        sdk_missing: 'Twilio SDK није инсталиран',
        circuit_open: 'Услуга недоступна'
      },
      en: {
        call_initiated: 'Call is being initiated...',
        call_failed: 'Call failed',
        call_success: 'Call successfully initiated',
        sms_sent: 'SMS sent successfully',
        sms_failed: 'SMS sending failed',
        whatsapp_sent: 'WhatsApp message sent',
        whatsapp_failed: 'WhatsApp sending failed',
        connection_success: 'Twilio connection successful',
        connection_failed: 'Twilio connection failed',
        no_credentials: 'Twilio credentials missing',
        invalid_number: 'Invalid phone number',
        sdk_missing: 'Twilio SDK not installed',
        circuit_open: 'Service temporarily unavailable'
      }
    };

    this.language = config.language || 'de';
  }

  async initClient() {
    if (!this.accountSid || !this.authToken) {
      throw new Error(this.getMessage('no_credentials'));
    }

    if (!twilioClient) {
      try {
        twilioClient = require('twilio');
      } catch (err) {
        throw new Error(this.getMessage('sdk_missing'));
      }
    }

    if (!this.client) {
      this.client = twilioClient(this.accountSid, this.authToken);
    }

    return this.client;
  }

  updateConfig(config) {
    if (config.accountSid) this.accountSid = config.accountSid;
    if (config.authToken) this.authToken = config.authToken;
    if (config.phoneNumber) this.phoneNumber = config.phoneNumber;
    if (config.language) this.language = config.language;
    this.client = null;
    this.cache.clear();
  }

  getMessage(key) {
    return this.messages[this.language]?.[key] || this.messages.en?.[key] || key;
  }

  async executeWithRetry(apiCall) {
    if (!this.circuitBreaker.canRequest()) {
      throw new Error(this.getMessage('circuit_open'));
    }

    return RetryHandler.execute(async () => {
      try {
        const result = await apiCall();
        this.circuitBreaker.recordSuccess();
        return result;
      } catch (error) {
        this.circuitBreaker.recordFailure();
        throw error;
      }
    }, {
      maxRetries: this.maxRetries,
      retryCondition: (error) => error.status === 429 || error.status >= 500
    });
  }

  async testConnection() {
    try {
      const client = await this.initClient();
      const account = await this.executeWithRetry(() =>
        client.api.accounts(this.accountSid).fetch()
      );

      return {
        success: true,
        message: this.getMessage('connection_success'),
        accountName: account.friendlyName,
        status: account.status,
        type: account.type
      };
    } catch (error) {
      logError(error, { source: 'twilio', details: { action: 'testConnection' } });
      return {
        success: false,
        message: this.getMessage('connection_failed'),
        error: error.message
      };
    }
  }

  async initiateCall(to, options = {}) {
    const normalizedNumber = PhoneNumberUtils.normalize(to);
    if (!PhoneNumberUtils.isValid(normalizedNumber)) {
      return { success: false, message: this.getMessage('invalid_number') };
    }

    try {
      const client = await this.initClient();
      const callParams = {
        to: normalizedNumber,
        from: options.from || this.phoneNumber,
        timeout: options.timeout || 30
      };

      if (options.twiml) {
        callParams.twiml = options.twiml;
      } else {
        callParams.url = options.twimlUrl || 'http://demo.twilio.com/docs/voice.xml';
      }

      if (options.statusCallback) {
        callParams.statusCallback = options.statusCallback;
        callParams.statusCallbackEvent = ['initiated', 'ringing', 'answered', 'completed'];
      }

      if (options.record) {
        callParams.record = true;
        callParams.recordingChannels = 'dual';
      }

      logInfo(`Twilio call to ${PhoneNumberUtils.mask(normalizedNumber)}`, { source: 'twilio' });

      const call = await this.executeWithRetry(() => client.calls.create(callParams));

      return {
        success: true,
        message: this.getMessage('call_success'),
        callSid: call.sid,
        status: call.status
      };
    } catch (error) {
      logError(error, { source: 'twilio', details: { action: 'initiateCall' } });
      return { success: false, message: this.getMessage('call_failed'), error: error.message };
    }
  }

  async sendSMS(to, body, options = {}) {
    const normalizedNumber = PhoneNumberUtils.normalize(to);
    if (!PhoneNumberUtils.isValid(normalizedNumber)) {
      return { success: false, message: this.getMessage('invalid_number') };
    }

    if (!body?.trim()) {
      return { success: false, message: 'Nachricht darf nicht leer sein' };
    }

    try {
      const client = await this.initClient();
      const message = await this.executeWithRetry(() =>
        client.messages.create({
          to: normalizedNumber,
          from: options.from || this.phoneNumber,
          body: body.trim()
        })
      );

      return {
        success: true,
        message: this.getMessage('sms_sent'),
        messageSid: message.sid,
        status: message.status
      };
    } catch (error) {
      logError(error, { source: 'twilio', details: { action: 'sendSMS' } });
      return { success: false, message: this.getMessage('sms_failed'), error: error.message };
    }
  }

  async sendWhatsApp(to, body, options = {}) {
    const normalizedNumber = PhoneNumberUtils.normalize(to);
    if (!PhoneNumberUtils.isValid(normalizedNumber)) {
      return { success: false, message: this.getMessage('invalid_number') };
    }

    try {
      const client = await this.initClient();
      const message = await this.executeWithRetry(() =>
        client.messages.create({
          to: `whatsapp:${normalizedNumber}`,
          from: `whatsapp:${options.from || this.phoneNumber}`,
          body: body.trim()
        })
      );

      return {
        success: true,
        message: this.getMessage('whatsapp_sent'),
        messageSid: message.sid,
        status: message.status
      };
    } catch (error) {
      logError(error, { source: 'twilio', details: { action: 'sendWhatsApp' } });
      return { success: false, message: this.getMessage('whatsapp_failed'), error: error.message };
    }
  }

  async getCallHistory(options = {}) {
    const cacheKey = `calls_${JSON.stringify(options)}`;
    const cached = options.useCache !== false && this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const client = await this.initClient();
      const calls = await client.calls.list({
        limit: Math.min(options.limit || 50, 100),
        status: options.status,
        to: options.to,
        from: options.from
      });

      const result = calls.map(call => ({
        sid: call.sid,
        from: call.from,
        fromMasked: PhoneNumberUtils.mask(call.from),
        to: call.to,
        toMasked: PhoneNumberUtils.mask(call.to),
        status: call.status,
        direction: call.direction,
        duration: parseInt(call.duration) || 0,
        startTime: call.startTime,
        endTime: call.endTime,
        price: call.price,
        priceUnit: call.priceUnit
      }));

      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      logError(error, { source: 'twilio', details: { action: 'getCallHistory' } });
      throw error;
    }
  }

  async getSMSHistory(options = {}) {
    try {
      const client = await this.initClient();
      const messages = await client.messages.list({
        limit: Math.min(options.limit || 50, 100),
        to: options.to,
        from: options.from
      });

      return messages.map(msg => ({
        sid: msg.sid,
        from: msg.from,
        to: msg.to,
        body: msg.body?.substring(0, 100) + (msg.body?.length > 100 ? '...' : ''),
        status: msg.status,
        direction: msg.direction,
        dateSent: msg.dateSent,
        price: msg.price,
        priceUnit: msg.priceUnit
      }));
    } catch (error) {
      logError(error, { source: 'twilio', details: { action: 'getSMSHistory' } });
      throw error;
    }
  }

  async getAvailableNumbers() {
    const cacheKey = 'numbers';
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const client = await this.initClient();
      const incomingNumbers = await client.incomingPhoneNumbers.list({ limit: 50 });

      const result = incomingNumbers.map(num => ({
        sid: num.sid,
        phoneNumber: num.phoneNumber,
        friendlyName: num.friendlyName,
        capabilities: num.capabilities,
        formatted: PhoneNumberUtils.format(num.phoneNumber)
      }));

      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      logError(error, { source: 'twilio', details: { action: 'getAvailableNumbers' } });
      throw error;
    }
  }

  async getBalance() {
    try {
      const client = await this.initClient();
      const balance = await client.balance.fetch();

      return {
        balance: parseFloat(balance.balance),
        balanceFormatted: new Intl.NumberFormat('de-DE', {
          style: 'currency',
          currency: balance.currency || 'USD'
        }).format(parseFloat(balance.balance)),
        currency: balance.currency,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logError(error, { source: 'twilio', details: { action: 'getBalance' } });
      throw error;
    }
  }

  async getRecording(callSid) {
    try {
      const client = await this.initClient();
      const recordings = await client.recordings.list({ callSid, limit: 1 });

      if (recordings.length === 0) return null;

      const recording = recordings[0];
      return {
        sid: recording.sid,
        duration: parseInt(recording.duration) || 0,
        uri: `https://api.twilio.com${recording.uri.replace('.json', '.mp3')}`,
        dateCreated: recording.dateCreated
      };
    } catch (error) {
      logError(error, { source: 'twilio', details: { action: 'getRecording', callSid } });
      throw error;
    }
  }

  getStatus() {
    return {
      configured: !!(this.accountSid && this.authToken),
      phoneNumber: this.phoneNumber ? PhoneNumberUtils.mask(this.phoneNumber) : null,
      language: this.language,
      circuitBreaker: this.circuitBreaker.getState(),
      cacheSize: this.cache.size()
    };
  }

  async healthCheck() {
    const status = this.getStatus();

    if (!status.configured) {
      return { healthy: false, reason: 'not_configured', status };
    }

    if (status.circuitBreaker.state === 'open') {
      return { healthy: false, reason: 'circuit_open', status };
    }

    try {
      const test = await this.testConnection();
      return { healthy: test.success, reason: test.success ? null : 'connection_failed', status };
    } catch (error) {
      return { healthy: false, reason: 'connection_error', error: error.message, status };
    }
  }
}

function createTwilioRouter(twilioService) {
  const express = require('express');
  const router = express.Router();

  router.post('/test', async (req, res) => {
    try {
      const result = await twilioService.testConnection();
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/health', async (req, res) => {
    try {
      const health = await twilioService.healthCheck();
      res.status(health.healthy ? 200 : 503).json(health);
    } catch (error) {
      res.status(500).json({ healthy: false, error: error.message });
    }
  });

  router.post('/call', async (req, res) => {
    const { to, twimlUrl, twiml, record } = req.body;
    if (!to) return res.status(400).json({ error: 'Telefonnummer fehlt' });
    const result = await twilioService.initiateCall(to, { twimlUrl, twiml, record });
    res.status(result.success ? 200 : 400).json(result);
  });

  router.post('/sms', async (req, res) => {
    const { to, body } = req.body;
    if (!to || !body) return res.status(400).json({ error: 'Empfänger und Nachricht erforderlich' });
    const result = await twilioService.sendSMS(to, body);
    res.status(result.success ? 200 : 400).json(result);
  });

  router.post('/whatsapp', async (req, res) => {
    const { to, body } = req.body;
    if (!to || !body) return res.status(400).json({ error: 'Empfänger und Nachricht erforderlich' });
    const result = await twilioService.sendWhatsApp(to, body);
    res.status(result.success ? 200 : 400).json(result);
  });

  router.get('/calls', async (req, res) => {
    try {
      const { limit, status, to, from } = req.query;
      const history = await twilioService.getCallHistory({
        limit: parseInt(limit) || 50, status, to, from
      });
      res.json({ calls: history, count: history.length });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/sms', async (req, res) => {
    try {
      const { limit, to, from } = req.query;
      const history = await twilioService.getSMSHistory({
        limit: parseInt(limit) || 50, to, from
      });
      res.json({ messages: history, count: history.length });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/numbers', async (req, res) => {
    try {
      const numbers = await twilioService.getAvailableNumbers();
      res.json({ numbers, count: numbers.length });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/balance', async (req, res) => {
    try {
      const balance = await twilioService.getBalance();
      res.json(balance);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/webhook/status', (req, res) => {
    logInfo(`Twilio Status Webhook: ${req.body.CallStatus}`, {
      source: 'twilio',
      details: { callSid: req.body.CallSid, status: req.body.CallStatus }
    });
    res.sendStatus(200);
  });

  router.post('/webhook/incoming', (req, res) => {
    logInfo(`Twilio Incoming Call: ${PhoneNumberUtils.mask(req.body.From)}`, { source: 'twilio' });
    res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="de-DE">Willkommen bei MUCI-SUPERMAN. Bitte warten Sie.</Say>
  <Pause length="2"/>
</Response>`);
  });

  router.get('/status', (req, res) => {
    res.json(twilioService.getStatus());
  });

  return router;
}

const twilioService = new TwilioService();

module.exports = {
  TwilioService,
  twilioService,
  createTwilioRouter
};
