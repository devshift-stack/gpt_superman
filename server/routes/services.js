/**
 * Services Router - Zentrale Route für alle externen Services
 * ===========================================================
 *
 * Integriert:
 * - Sipgate (Telefonie)
 * - Twilio (SMS, WhatsApp, Anrufe)
 * - Voice (STT/TTS)
 * - Meta Graph (Facebook/Instagram)
 * - Error Logger
 *
 * @version 2.0.0
 */

'use strict';

const express = require('express');

// Services importieren
const { sipgateService, createSipgateRouter } = require('../services/sipgate-service');
const { twilioService, createTwilioRouter } = require('../services/twilio-service');
const { voiceService, createVoiceRouter } = require('../services/voice-service');
const { metaGraphService, createMetaGraphRouter } = require('../services/meta-graph-service');
const { errorLogger, getRecentErrors, getErrorStats, clearErrors } = require('../services/error-logger');

/**
 * Services Router erstellen
 * @returns {express.Router}
 */
function createServicesRouter() {
  const router = express.Router();

  // ============================================
  // GLOBALER STATUS
  // ============================================

  /**
   * GET /services/status
   * Übersicht aller Service-Stati
   */
  router.get('/status', (req, res) => {
    res.json({
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      services: {
        sipgate: sipgateService.getStatus(),
        twilio: twilioService.getStatus(),
        voice: voiceService.getStatus(),
        meta: metaGraphService.getStatus()
      },
      errorStats: getErrorStats()
    });
  });

  /**
   * GET /services/health
   * Health-Check aller Services
   */
  router.get('/health', async (req, res) => {
    const results = {
      timestamp: new Date().toISOString(),
      services: {}
    };

    // Parallel Health-Checks
    const [sipgateHealth, twilioHealth, metaHealth] = await Promise.allSettled([
      sipgateService.healthCheck(),
      twilioService.healthCheck(),
      metaGraphService.healthCheck()
    ]);

    results.services.sipgate = sipgateHealth.status === 'fulfilled'
      ? sipgateHealth.value
      : { healthy: false, error: sipgateHealth.reason?.message };

    results.services.twilio = twilioHealth.status === 'fulfilled'
      ? twilioHealth.value
      : { healthy: false, error: twilioHealth.reason?.message };

    results.services.meta = metaHealth.status === 'fulfilled'
      ? metaHealth.value
      : { healthy: false, error: metaHealth.reason?.message };

    results.services.voice = voiceService.getStatus();

    // Overall health
    const allHealthy = Object.values(results.services).every(s => s.healthy !== false);
    results.healthy = allHealthy;

    res.status(allHealthy ? 200 : 503).json(results);
  });

  // ============================================
  // SUB-ROUTER FÜR JEDEN SERVICE
  // ============================================

  // Sipgate Routes: /services/sipgate/*
  router.use('/sipgate', createSipgateRouter(sipgateService));

  // Twilio Routes: /services/twilio/*
  router.use('/twilio', createTwilioRouter(twilioService));

  // Voice Routes: /services/voice/*
  router.use('/voice', createVoiceRouter(voiceService));

  // Meta Graph Routes: /services/meta/*
  router.use('/meta', createMetaGraphRouter(metaGraphService));

  // ============================================
  // ERROR LOGGER ENDPOINTS
  // ============================================

  /**
   * GET /services/errors
   * Letzte Fehler abrufen
   */
  router.get('/errors', (req, res) => {
    const { limit, source, level, minLevel, agentId, provider, since, until, search } = req.query;

    const errors = getRecentErrors(parseInt(limit) || 50, {
      source,
      level,
      minLevel,
      agentId,
      provider,
      since,
      until,
      search
    });

    res.json({
      errors,
      count: errors.length,
      filters: { source, level, minLevel, agentId, provider, since, until, search }
    });
  });

  /**
   * GET /services/errors/stats
   * Fehler-Statistiken
   */
  router.get('/errors/stats', (req, res) => {
    res.json(getErrorStats());
  });

  /**
   * DELETE /services/errors
   * Alle Fehler löschen
   */
  router.delete('/errors', (req, res) => {
    const result = clearErrors();
    res.json(result);
  });

  /**
   * GET /services/errors/export
   * Fehler exportieren (JSON)
   */
  router.get('/errors/export', (req, res) => {
    const { format, pretty } = req.query;

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="errors.csv"');
      res.send(errorLogger.exportCSV());
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="errors.json"');
      res.send(errorLogger.export({ pretty: pretty === 'true' }));
    }
  });

  // ============================================
  // KONFIGURATION
  // ============================================

  /**
   * POST /services/config
   * Service-Konfiguration aktualisieren
   */
  router.post('/config', (req, res) => {
    const { service, config } = req.body;

    if (!service || !config) {
      return res.status(400).json({ error: 'service und config erforderlich' });
    }

    try {
      switch (service) {
        case 'sipgate':
          sipgateService.updateConfig(config);
          break;
        case 'twilio':
          twilioService.updateConfig(config);
          break;
        case 'voice':
          voiceService.updateConfig(config);
          break;
        case 'meta':
          metaGraphService.updateConfig(config);
          break;
        default:
          return res.status(400).json({ error: `Unbekannter Service: ${service}` });
      }

      res.json({ success: true, service, message: 'Konfiguration aktualisiert' });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}

module.exports = { createServicesRouter };
