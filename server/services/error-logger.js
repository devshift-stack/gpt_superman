/**
 * Error Logger Service für MUCI-SUPERMAN
 * ========================================
 *
 * Zentrales Fehler-Logging-System mit erweiterten Features.
 *
 * Features:
 * - In-Memory Error Store mit LRU-Cache-Verhalten
 * - Automatische Fehler-Rotation (konfigurierbar)
 * - Detaillierte Fehler-Statistiken nach Source, Level, Zeitraum
 * - Export-Funktion für Debugging (JSON/CSV)
 * - Webhook-Support für externe Alerting-Systeme
 * - Strukturiertes Logging mit Correlation IDs
 * - Rate-Limiting für Error-Flooding-Schutz
 *
 * Sprachen: Deutsch, Bosnisch, Serbisch, Englisch
 *
 * @module error-logger
 * @version 2.0.0
 */

'use strict';

/**
 * @typedef {Object} ErrorEntry
 * @property {string} id - Eindeutige Error-ID
 * @property {string} timestamp - ISO Timestamp
 * @property {string} level - Log-Level (debug|info|warning|error|critical)
 * @property {string} source - Fehlerquelle
 * @property {string} message - Fehlermeldung
 * @property {string|null} code - Fehlercode
 * @property {string|null} stack - Stack Trace
 * @property {string|null} correlationId - Korrelations-ID für Request-Tracking
 * @property {string|null} userId - Benutzer-ID
 * @property {string|null} requestPath - Request-Pfad
 * @property {string|null} agentId - Agent-ID
 * @property {string|null} taskId - Task-ID
 * @property {string|null} provider - Provider-Name
 * @property {Object} details - Zusätzliche Details
 * @property {Object} metadata - System-Metadaten
 */

/**
 * @typedef {Object} ErrorLoggerOptions
 * @property {number} [maxErrors=1000] - Maximale Anzahl gespeicherter Fehler
 * @property {string} [language='de'] - Standardsprache
 * @property {number} [rateLimitWindow=60000] - Rate-Limit-Fenster in ms
 * @property {number} [rateLimitMax=100] - Max Errors pro Fenster
 * @property {string} [webhookUrl] - Optional: Webhook für kritische Fehler
 * @property {boolean} [enableConsoleLog=true] - Console-Logging aktivieren
 */

class ErrorLogger {
  /**
   * @param {ErrorLoggerOptions} options - Konfigurationsoptionen
   */
  constructor(options = {}) {
    // Konfiguration
    this.maxErrors = options.maxErrors || 1000;
    this.enableConsoleLog = options.enableConsoleLog !== false;
    this.webhookUrl = options.webhookUrl || null;

    // Rate Limiting
    this.rateLimitWindow = options.rateLimitWindow || 60000; // 1 Minute
    this.rateLimitMax = options.rateLimitMax || 100;
    this.rateLimitCounter = new Map();

    // Error Store
    this.errors = [];

    // Statistiken nach Source
    this.stats = new Map();

    // Log-Levels mit Prioritäten
    this.levels = {
      debug: 0,
      info: 1,
      warning: 2,
      error: 3,
      critical: 4
    };

    // Minimum Level für Console-Output
    this.minLogLevel = options.minLogLevel || 'info';

    // Sprach-spezifische Fehlermeldungen
    this.messages = {
      de: {
        circuit_open: 'Circuit Breaker offen für Agent',
        provider_failed: 'Provider-Fehler',
        auth_failed: 'Authentifizierung fehlgeschlagen',
        rate_limit: 'Rate-Limit überschritten',
        validation_error: 'Validierungsfehler',
        sipgate_error: 'Sipgate API Fehler',
        twilio_error: 'Twilio API Fehler',
        meta_error: 'Meta Graph API Fehler',
        voice_error: 'Voice Service Fehler',
        network_error: 'Netzwerkfehler',
        timeout_error: 'Zeitüberschreitung',
        unknown_error: 'Unbekannter Fehler',
        rate_limit_exceeded: 'Error-Rate-Limit überschritten',
        cleared: 'Alle Fehler gelöscht'
      },
      bs: {
        circuit_open: 'Circuit Breaker otvoren za agenta',
        provider_failed: 'Greška providera',
        auth_failed: 'Autentifikacija nije uspjela',
        rate_limit: 'Prekoračen limit zahtjeva',
        validation_error: 'Greška validacije',
        sipgate_error: 'Sipgate API greška',
        twilio_error: 'Twilio API greška',
        meta_error: 'Meta Graph API greška',
        voice_error: 'Voice Service greška',
        network_error: 'Mrežna greška',
        timeout_error: 'Isteklo vrijeme',
        unknown_error: 'Nepoznata greška',
        rate_limit_exceeded: 'Prekoračen limit grešaka',
        cleared: 'Sve greške obrisane'
      },
      sr: {
        circuit_open: 'Circuit Breaker отворен за агента',
        provider_failed: 'Грешка провајдера',
        auth_failed: 'Аутентификација није успела',
        rate_limit: 'Прекорачен лимит захтева',
        validation_error: 'Грешка валидације',
        sipgate_error: 'Sipgate API грешка',
        twilio_error: 'Twilio API грешка',
        meta_error: 'Meta Graph API грешка',
        voice_error: 'Voice Service грешка',
        network_error: 'Мрежна грешка',
        timeout_error: 'Истекло време',
        unknown_error: 'Непозната грешка',
        rate_limit_exceeded: 'Прекорачен лимит грешака',
        cleared: 'Све грешке обрисане'
      },
      en: {
        circuit_open: 'Circuit Breaker open for agent',
        provider_failed: 'Provider error',
        auth_failed: 'Authentication failed',
        rate_limit: 'Rate limit exceeded',
        validation_error: 'Validation error',
        sipgate_error: 'Sipgate API error',
        twilio_error: 'Twilio API error',
        meta_error: 'Meta Graph API error',
        voice_error: 'Voice Service error',
        network_error: 'Network error',
        timeout_error: 'Timeout error',
        unknown_error: 'Unknown error',
        rate_limit_exceeded: 'Error rate limit exceeded',
        cleared: 'All errors cleared'
      }
    };

    this.defaultLanguage = options.language || 'de';

    // Cleanup-Timer für Rate-Limiting
    this._cleanupInterval = setInterval(() => this._cleanupRateLimits(), this.rateLimitWindow);
  }

  /**
   * Fehler loggen
   * @param {Error|string} error - Der Fehler
   * @param {Object} context - Zusätzlicher Kontext
   * @returns {ErrorEntry|null} - Der geloggte Fehler-Eintrag oder null bei Rate-Limit
   */
  log(error, context = {}) {
    const {
      source = 'unknown',
      userId = null,
      requestPath = null,
      level = 'error',
      agentId = null,
      taskId = null,
      provider = null,
      correlationId = null,
      details = {}
    } = context;

    // Rate-Limiting Check
    if (!this._checkRateLimit(source)) {
      if (this.enableConsoleLog) {
        console.warn(`[ErrorLogger] Rate limit exceeded for source: ${source}`);
      }
      return null;
    }

    // Error-Objekt normalisieren
    const normalizedError = this._normalizeError(error);

    const errorEntry = {
      id: this._generateId(),
      timestamp: new Date().toISOString(),
      level,
      source,
      message: normalizedError.message,
      code: normalizedError.code || context.code || null,
      stack: normalizedError.stack || null,
      correlationId: correlationId || this._generateCorrelationId(),
      userId,
      requestPath,
      agentId,
      taskId,
      provider,
      details: this._sanitizeDetails(details),
      metadata: {
        nodeVersion: process.version,
        platform: process.platform,
        memory: process.memoryUsage().heapUsed,
        uptime: process.uptime()
      }
    };

    // Zum Store hinzufügen (LIFO)
    this.errors.unshift(errorEntry);

    // Rotation wenn maxErrors überschritten
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(0, this.maxErrors);
    }

    // Statistiken aktualisieren
    this._updateStats(source, level);

    // Console-Log
    if (this.enableConsoleLog && this.levels[level] >= this.levels[this.minLogLevel]) {
      this._logToConsole(errorEntry);
    }

    // Webhook für kritische Fehler
    if (level === 'critical' && this.webhookUrl) {
      this._sendWebhook(errorEntry).catch(() => {});
    }

    return errorEntry;
  }

  /**
   * Error-Objekt normalisieren
   * @private
   */
  _normalizeError(error) {
    if (error instanceof Error) {
      return {
        message: error.message,
        code: error.code,
        stack: error.stack
      };
    }

    if (typeof error === 'string') {
      return { message: error, code: null, stack: null };
    }

    if (typeof error === 'object' && error !== null) {
      return {
        message: error.message || JSON.stringify(error),
        code: error.code || null,
        stack: error.stack || null
      };
    }

    return { message: String(error), code: null, stack: null };
  }

  /**
   * Details sanitisieren (sensible Daten entfernen)
   * @private
   */
  _sanitizeDetails(details) {
    const sanitized = { ...details };
    const sensitiveKeys = ['password', 'token', 'apiKey', 'secret', 'authorization', 'auth'];

    const sanitizeObj = (obj) => {
      if (typeof obj !== 'object' || obj === null) return obj;

      const result = Array.isArray(obj) ? [] : {};
      for (const [key, value] of Object.entries(obj)) {
        if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
          result[key] = '[REDACTED]';
        } else if (typeof value === 'object') {
          result[key] = sanitizeObj(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    };

    return sanitizeObj(sanitized);
  }

  /**
   * Rate-Limit prüfen
   * @private
   */
  _checkRateLimit(source) {
    const now = Date.now();
    const key = `${source}_${Math.floor(now / this.rateLimitWindow)}`;

    const current = this.rateLimitCounter.get(key) || 0;
    if (current >= this.rateLimitMax) {
      return false;
    }

    this.rateLimitCounter.set(key, current + 1);
    return true;
  }

  /**
   * Alte Rate-Limit-Einträge bereinigen
   * @private
   */
  _cleanupRateLimits() {
    const now = Date.now();
    const currentWindow = Math.floor(now / this.rateLimitWindow);

    for (const key of this.rateLimitCounter.keys()) {
      const keyWindow = parseInt(key.split('_').pop());
      if (keyWindow < currentWindow - 1) {
        this.rateLimitCounter.delete(key);
      }
    }
  }

  /**
   * Statistiken aktualisieren
   * @private
   */
  _updateStats(source, level) {
    if (!this.stats.has(source)) {
      this.stats.set(source, {
        total: 0,
        byLevel: {},
        lastError: null,
        firstError: new Date().toISOString()
      });
    }

    const sourceStats = this.stats.get(source);
    sourceStats.total++;
    sourceStats.byLevel[level] = (sourceStats.byLevel[level] || 0) + 1;
    sourceStats.lastError = new Date().toISOString();
  }

  /**
   * Console-Logging
   * @private
   */
  _logToConsole(entry) {
    const timestamp = new Date(entry.timestamp).toLocaleTimeString('de-DE');
    const prefix = `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.source}]`;
    const correlationInfo = entry.correlationId ? ` (${entry.correlationId.slice(0, 8)})` : '';

    const logMethod = entry.level === 'critical' || entry.level === 'error'
      ? 'error'
      : entry.level === 'warning'
        ? 'warn'
        : 'log';

    console[logMethod](`${prefix}${correlationInfo} ${entry.message}`);

    if (entry.level === 'critical' && entry.stack) {
      console.error(entry.stack);
    }
  }

  /**
   * Webhook senden
   * @private
   */
  async _sendWebhook(entry) {
    if (!this.webhookUrl) return;

    try {
      const axios = require('axios');
      await axios.post(this.webhookUrl, {
        type: 'critical_error',
        error: entry,
        timestamp: new Date().toISOString()
      }, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (webhookError) {
      // Webhook-Fehler nicht rekursiv loggen
      console.error('[ErrorLogger] Webhook failed:', webhookError.message);
    }
  }

  /**
   * Letzte Fehler abrufen
   * @param {number} limit - Anzahl der Fehler
   * @param {Object} filters - Filter-Optionen
   * @returns {ErrorEntry[]}
   */
  getRecent(limit = 50, filters = {}) {
    let result = [...this.errors];

    // Nach Source filtern
    if (filters.source) {
      result = result.filter(e => e.source === filters.source);
    }

    // Nach Level filtern
    if (filters.level) {
      if (Array.isArray(filters.level)) {
        result = result.filter(e => filters.level.includes(e.level));
      } else {
        result = result.filter(e => e.level === filters.level);
      }
    }

    // Nach Minimum-Level filtern
    if (filters.minLevel) {
      const minLevelValue = this.levels[filters.minLevel] || 0;
      result = result.filter(e => this.levels[e.level] >= minLevelValue);
    }

    // Nach Agent filtern
    if (filters.agentId) {
      result = result.filter(e => e.agentId === filters.agentId);
    }

    // Nach Provider filtern
    if (filters.provider) {
      result = result.filter(e => e.provider === filters.provider);
    }

    // Nach Correlation-ID filtern
    if (filters.correlationId) {
      result = result.filter(e => e.correlationId === filters.correlationId);
    }

    // Nach Zeitraum filtern
    if (filters.since) {
      const sinceDate = new Date(filters.since);
      result = result.filter(e => new Date(e.timestamp) >= sinceDate);
    }

    if (filters.until) {
      const untilDate = new Date(filters.until);
      result = result.filter(e => new Date(e.timestamp) <= untilDate);
    }

    // Nach Suchbegriff filtern
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(e =>
        e.message.toLowerCase().includes(searchLower) ||
        e.source.toLowerCase().includes(searchLower)
      );
    }

    return result.slice(0, Math.min(limit, 1000));
  }

  /**
   * Fehler-Statistiken abrufen
   * @returns {Object}
   */
  getStats() {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const oneDayAgo = now - 86400000;

    const lastHour = this.errors.filter(e => new Date(e.timestamp).getTime() >= oneHourAgo).length;
    const lastDay = this.errors.filter(e => new Date(e.timestamp).getTime() >= oneDayAgo).length;

    const bySource = {};
    this.stats.forEach((stats, source) => {
      bySource[source] = { ...stats };
    });

    const byLevel = {};
    Object.keys(this.levels).forEach(level => {
      byLevel[level] = this.errors.filter(e => e.level === level).length;
    });

    // Top-Fehler nach Häufigkeit
    const errorFrequency = new Map();
    this.errors.forEach(e => {
      const key = `${e.source}:${e.code || 'no_code'}`;
      errorFrequency.set(key, (errorFrequency.get(key) || 0) + 1);
    });

    const topErrors = Array.from(errorFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([key, count]) => ({ key, count }));

    return {
      total: this.errors.length,
      maxCapacity: this.maxErrors,
      utilizationPercent: Math.round((this.errors.length / this.maxErrors) * 100),
      lastHour,
      lastDay,
      bySource,
      byLevel,
      topErrors,
      oldestError: this.errors.length > 0 ? this.errors[this.errors.length - 1].timestamp : null,
      newestError: this.errors.length > 0 ? this.errors[0].timestamp : null,
      rateLimitStatus: {
        window: this.rateLimitWindow,
        max: this.rateLimitMax
      }
    };
  }

  /**
   * Fehler nach Source gruppieren
   * @param {string} source
   * @returns {ErrorEntry[]}
   */
  getBySource(source) {
    return this.errors.filter(e => e.source === source);
  }

  /**
   * Fehler für einen bestimmten Agent abrufen
   * @param {string} agentId
   * @returns {ErrorEntry[]}
   */
  getByAgent(agentId) {
    return this.errors.filter(e => e.agentId === agentId);
  }

  /**
   * Fehler nach Correlation-ID abrufen
   * @param {string} correlationId
   * @returns {ErrorEntry[]}
   */
  getByCorrelationId(correlationId) {
    return this.errors.filter(e => e.correlationId === correlationId);
  }

  /**
   * Alle Fehler löschen
   */
  clear() {
    const count = this.errors.length;
    this.errors = [];
    this.stats.clear();
    this.rateLimitCounter.clear();

    if (this.enableConsoleLog) {
      console.log(`[ErrorLogger] ${this.getMessage('cleared')} (${count} Einträge)`);
    }

    return { cleared: count };
  }

  /**
   * Fehler als JSON exportieren
   * @param {Object} options - Export-Optionen
   * @returns {string}
   */
  export(options = {}) {
    const data = {
      exportDate: new Date().toISOString(),
      exportVersion: '2.0',
      totalErrors: this.errors.length,
      filters: options.filters || null,
      errors: options.filters ? this.getRecent(options.limit || 1000, options.filters) : this.errors,
      stats: Object.fromEntries(this.stats)
    };

    return JSON.stringify(data, null, options.pretty ? 2 : 0);
  }

  /**
   * Fehler als CSV exportieren
   * @param {Object} options - Export-Optionen
   * @returns {string}
   */
  exportCSV(options = {}) {
    const errors = options.filters ? this.getRecent(options.limit || 1000, options.filters) : this.errors;

    const headers = ['id', 'timestamp', 'level', 'source', 'message', 'code', 'provider', 'agentId', 'correlationId'];
    const rows = errors.map(e => headers.map(h => {
      const value = e[h];
      if (value === null || value === undefined) return '';
      const str = String(value).replace(/"/g, '""');
      return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
    }).join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Lokalisierte Fehlermeldung abrufen
   * @param {string} key
   * @param {string} [language]
   * @returns {string}
   */
  getMessage(key, language = null) {
    const lang = language || this.defaultLanguage;
    return this.messages[lang]?.[key] || this.messages.en?.[key] || key;
  }

  /**
   * ID generieren
   * @private
   */
  _generateId() {
    return `err_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Correlation-ID generieren
   * @private
   */
  _generateCorrelationId() {
    return `cor_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Service herunterfahren
   */
  shutdown() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
  }
}

// Singleton-Instanz
const errorLogger = new ErrorLogger();

/**
 * Express Middleware für globales Error Handling
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function errorMiddleware(err, req, res, next) {
  // Correlation-ID aus Header oder generieren
  const correlationId = req.headers['x-correlation-id'] ||
                        req.headers['x-request-id'] ||
                        errorLogger._generateCorrelationId();

  const errorEntry = errorLogger.log(err, {
    source: 'express',
    correlationId,
    userId: req.user?.id,
    requestPath: req.path,
    level: err.status >= 500 ? 'error' : 'warning',
    details: {
      method: req.method,
      query: req.query,
      body: req.method !== 'GET' ? '[BODY_OMITTED]' : undefined,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent']
    }
  });

  // Setze Correlation-ID im Response
  res.setHeader('X-Correlation-ID', correlationId);

  // Error-Response
  const statusCode = err.status || err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  res.status(statusCode).json({
    error: {
      message: statusCode >= 500 && isProduction
        ? 'Interner Serverfehler'
        : err.message,
      code: err.code || 'INTERNAL_ERROR',
      errorId: errorEntry?.id,
      correlationId
    }
  });
}

/**
 * Wrapper für async Route Handlers
 * @param {Function} fn
 * @returns {Function}
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Correlation-ID Middleware
 * @returns {Function}
 */
function correlationMiddleware() {
  return (req, res, next) => {
    const correlationId = req.headers['x-correlation-id'] ||
                          req.headers['x-request-id'] ||
                          errorLogger._generateCorrelationId();

    req.correlationId = correlationId;
    res.setHeader('X-Correlation-ID', correlationId);
    next();
  };
}

// Graceful Shutdown
process.on('SIGTERM', () => errorLogger.shutdown());
process.on('SIGINT', () => errorLogger.shutdown());

module.exports = {
  ErrorLogger,
  errorLogger,
  errorMiddleware,
  asyncHandler,
  correlationMiddleware,
  // Convenience Functions
  logError: (error, context) => errorLogger.log(error, context),
  logWarning: (message, context) => errorLogger.log(message, { ...context, level: 'warning' }),
  logInfo: (message, context) => errorLogger.log(message, { ...context, level: 'info' }),
  logDebug: (message, context) => errorLogger.log(message, { ...context, level: 'debug' }),
  logCritical: (error, context) => errorLogger.log(error, { ...context, level: 'critical' }),
  getRecentErrors: (limit, filters) => errorLogger.getRecent(limit, filters),
  getErrorStats: () => errorLogger.getStats(),
  clearErrors: () => errorLogger.clear()
};
