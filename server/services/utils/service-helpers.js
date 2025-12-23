/**
 * Service Helpers - Gemeinsame Utilities für alle Services
 * =========================================================
 *
 * Enthält wiederverwendbare Komponenten:
 * - PhoneNumberUtils: Telefonnummern-Normalisierung und Validierung
 * - RetryHandler: Retry-Logik mit exponential Backoff
 * - CircuitBreaker: Circuit Breaker Pattern
 * - SimpleCache: Einfacher In-Memory Cache
 * - InputValidator: Eingabe-Validierung
 *
 * @module utils/service-helpers
 * @version 1.0.0
 */

'use strict';

/**
 * Telefonnummern-Utilities
 * Unterstützt: Deutschland (+49), Österreich (+43), Schweiz (+41),
 * Bosnien (+387), Serbien (+381), Kroatien (+385)
 */
class PhoneNumberUtils {
  // Bekannte Ländervorwahlen mit Regex-Patterns
  static COUNTRY_PATTERNS = {
    DE: { code: '+49', pattern: /^(\+49|0049|49)?0?([1-9]\d{6,14})$/, mobilePrefixes: ['15', '16', '17'] },
    AT: { code: '+43', pattern: /^(\+43|0043|43)?0?([1-9]\d{6,13})$/, mobilePrefixes: ['66', '67', '68', '69'] },
    CH: { code: '+41', pattern: /^(\+41|0041|41)?0?([1-9]\d{6,12})$/, mobilePrefixes: ['76', '77', '78', '79'] },
    BA: { code: '+387', pattern: /^(\+387|00387|387)?0?([3-6]\d{7,8})$/, mobilePrefixes: ['6'] },
    RS: { code: '+381', pattern: /^(\+381|00381|381)?0?([1-9]\d{7,9})$/, mobilePrefixes: ['6'] },
    HR: { code: '+385', pattern: /^(\+385|00385|385)?0?([1-9]\d{6,10})$/, mobilePrefixes: ['9'] }
  };

  /**
   * Telefonnummer normalisieren
   * @param {string} number - Eingabe-Nummer
   * @param {string} [defaultCountry='DE'] - Standard-Land
   * @returns {string} Normalisierte Nummer mit +
   */
  static normalize(number, defaultCountry = 'DE') {
    if (!number || typeof number !== 'string') {
      return '';
    }

    // Alle Nicht-Ziffern außer + entfernen
    let cleaned = number.replace(/[^\d+]/g, '');

    // Leere Eingabe
    if (!cleaned) return '';

    // Bereits internationales Format
    if (cleaned.startsWith('+')) {
      return cleaned;
    }

    // 00 Präfix zu + konvertieren
    if (cleaned.startsWith('00')) {
      return '+' + cleaned.substring(2);
    }

    // Führende 0 mit Ländervorwahl ersetzen
    if (cleaned.startsWith('0')) {
      const countryInfo = this.COUNTRY_PATTERNS[defaultCountry];
      if (countryInfo) {
        return countryInfo.code + cleaned.substring(1);
      }
      // Fallback: Deutsche Vorwahl
      return '+49' + cleaned.substring(1);
    }

    // Nummer beginnt mit Ländercode ohne +
    for (const [, info] of Object.entries(this.COUNTRY_PATTERNS)) {
      const codeWithoutPlus = info.code.substring(1);
      if (cleaned.startsWith(codeWithoutPlus)) {
        return '+' + cleaned;
      }
    }

    // Fallback: Annahme deutsches Format
    const countryInfo = this.COUNTRY_PATTERNS[defaultCountry];
    return (countryInfo?.code || '+49') + cleaned;
  }

  /**
   * Telefonnummer validieren
   * @param {string} number - Zu validierende Nummer
   * @returns {boolean}
   */
  static isValid(number) {
    if (!number || typeof number !== 'string') {
      return false;
    }

    const cleaned = number.replace(/[^\d+]/g, '');

    // Mindestlänge prüfen (inkl. Ländervorwahl)
    if (cleaned.length < 8 || cleaned.length > 16) {
      return false;
    }

    // Muss mit + beginnen (nach Normalisierung)
    if (!cleaned.startsWith('+')) {
      return false;
    }

    // Gegen bekannte Patterns prüfen
    for (const [, info] of Object.entries(this.COUNTRY_PATTERNS)) {
      if (cleaned.startsWith(info.code)) {
        return true;
      }
    }

    // Generische Validierung für andere Länder
    return /^\+[1-9]\d{7,14}$/.test(cleaned);
  }

  /**
   * Land aus Nummer erkennen
   * @param {string} number - Telefonnummer
   * @returns {string|null} Ländercode (DE, AT, etc.) oder null
   */
  static detectCountry(number) {
    const normalized = this.normalize(number);

    for (const [country, info] of Object.entries(this.COUNTRY_PATTERNS)) {
      if (normalized.startsWith(info.code)) {
        return country;
      }
    }

    return null;
  }

  /**
   * Prüfen ob Mobilnummer
   * @param {string} number - Telefonnummer
   * @returns {boolean}
   */
  static isMobile(number) {
    const normalized = this.normalize(number);
    const country = this.detectCountry(normalized);

    if (!country) return false;

    const countryInfo = this.COUNTRY_PATTERNS[country];
    const numberWithoutCountry = normalized.substring(countryInfo.code.length);

    return countryInfo.mobilePrefixes.some(prefix =>
      numberWithoutCountry.startsWith(prefix)
    );
  }

  /**
   * Nummer maskieren (für Logs)
   * @param {string} number - Telefonnummer
   * @returns {string} Maskierte Nummer
   */
  static mask(number) {
    if (!number || number.length < 6) {
      return '****';
    }
    const normalized = this.normalize(number);
    return normalized.slice(0, -4).replace(/\d/g, '*') + normalized.slice(-4);
  }

  /**
   * Nummer formatieren (für Anzeige)
   * @param {string} number - Telefonnummer
   * @returns {string} Formatierte Nummer
   */
  static format(number) {
    const normalized = this.normalize(number);
    const country = this.detectCountry(normalized);

    if (country === 'DE') {
      // +49 123 4567890
      return normalized.replace(/^(\+49)(\d{2,4})(\d+)$/, '$1 $2 $3');
    }

    // Generisches Format
    return normalized.replace(/^(\+\d{2,3})(\d+)$/, '$1 $2');
  }
}

/**
 * Retry Handler mit Exponential Backoff
 */
class RetryHandler {
  /**
   * Funktion mit Retry-Logik ausführen
   * @param {Function} fn - Auszuführende Funktion
   * @param {Object} options - Optionen
   * @returns {Promise<any>}
   */
  static async execute(fn, options = {}) {
    const {
      maxRetries = 3,
      baseDelay = 1000,
      maxDelay = 30000,
      backoffFactor = 2,
      retryCondition = () => true,
      onRetry = null
    } = options;

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn(attempt);
      } catch (error) {
        lastError = error;

        // Letzter Versuch oder Bedingung nicht erfüllt
        if (attempt >= maxRetries || !retryCondition(error)) {
          throw error;
        }

        // Delay berechnen (exponential backoff mit jitter)
        const delay = Math.min(
          baseDelay * Math.pow(backoffFactor, attempt) + Math.random() * 1000,
          maxDelay
        );

        // Callback für Retry-Event
        if (onRetry) {
          onRetry({ attempt: attempt + 1, delay, error });
        }

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}

/**
 * Circuit Breaker Pattern
 * Verhindert kaskadierende Fehler bei Service-Ausfällen
 */
class CircuitBreaker {
  /**
   * @param {Object} options - Konfiguration
   */
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000;
    this.halfOpenMaxAttempts = options.halfOpenMaxAttempts || 3;

    this.state = 'closed'; // closed, open, half-open
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.halfOpenAttempts = 0;
  }

  /**
   * Prüfen ob Request erlaubt
   * @returns {boolean}
   */
  canRequest() {
    if (this.state === 'closed') {
      return true;
    }

    if (this.state === 'open') {
      // Prüfen ob Reset-Timeout abgelaufen
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'half-open';
        this.halfOpenAttempts = 0;
        return true;
      }
      return false;
    }

    // half-open: begrenzte Versuche erlauben
    return this.halfOpenAttempts < this.halfOpenMaxAttempts;
  }

  /**
   * Erfolg aufzeichnen
   */
  recordSuccess() {
    this.failures = 0;
    this.successes++;

    if (this.state === 'half-open') {
      // Nach erfolgreichem Request im half-open State: schließen
      this.state = 'closed';
      this.halfOpenAttempts = 0;
    }
  }

  /**
   * Fehler aufzeichnen
   */
  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.halfOpenMaxAttempts) {
        this.state = 'open';
      }
    } else if (this.failures >= this.failureThreshold) {
      this.state = 'open';
    }
  }

  /**
   * Circuit manuell zurücksetzen
   */
  reset() {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.halfOpenAttempts = 0;
  }

  /**
   * Status abrufen
   * @returns {Object}
   */
  getState() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      nextRetryTime: this.state === 'open'
        ? new Date(this.lastFailureTime + this.resetTimeout).toISOString()
        : null
    };
  }
}

/**
 * Einfacher In-Memory Cache mit TTL
 */
class SimpleCache {
  /**
   * @param {Object} options - Konfiguration
   */
  constructor(options = {}) {
    this.ttl = options.ttl || 300000; // 5 Minuten default
    this.maxSize = options.maxSize || 1000;
    this.cache = new Map();

    // Cleanup-Interval
    this._cleanupInterval = setInterval(() => this._cleanup(), this.ttl);
  }

  /**
   * Wert abrufen
   * @param {string} key
   * @returns {any|null}
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Wert speichern
   * @param {string} key
   * @param {any} value
   * @param {number} [ttl] - Optionale individuelle TTL
   */
  set(key, value, ttl = null) {
    // Max-Size Prüfung mit LRU-ähnlichem Verhalten
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      expiry: Date.now() + (ttl || this.ttl)
    });
  }

  /**
   * Wert löschen
   * @param {string} key
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Cache leeren
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Cache-Größe
   * @returns {number}
   */
  size() {
    return this.cache.size;
  }

  /**
   * Abgelaufene Einträge entfernen
   * @private
   */
  _cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Cache herunterfahren
   */
  shutdown() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
  }
}

/**
 * Input Validator
 * Validierung von Eingaben
 */
class InputValidator {
  /**
   * String validieren
   * @param {any} value
   * @param {Object} options
   * @returns {Object}
   */
  static string(value, options = {}) {
    const {
      required = false,
      minLength = 0,
      maxLength = Infinity,
      pattern = null,
      trim = true
    } = options;

    if (value === null || value === undefined || value === '') {
      if (required) {
        return { valid: false, error: 'Wert ist erforderlich' };
      }
      return { valid: true, value: '' };
    }

    if (typeof value !== 'string') {
      return { valid: false, error: 'Wert muss ein String sein' };
    }

    let cleanValue = trim ? value.trim() : value;

    if (cleanValue.length < minLength) {
      return { valid: false, error: `Mindestens ${minLength} Zeichen erforderlich` };
    }

    if (cleanValue.length > maxLength) {
      return { valid: false, error: `Maximal ${maxLength} Zeichen erlaubt` };
    }

    if (pattern && !pattern.test(cleanValue)) {
      return { valid: false, error: 'Ungültiges Format' };
    }

    return { valid: true, value: cleanValue };
  }

  /**
   * E-Mail validieren
   * @param {string} value
   * @param {boolean} required
   * @returns {Object}
   */
  static email(value, required = false) {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return this.string(value, { required, pattern: emailPattern });
  }

  /**
   * URL validieren
   * @param {string} value
   * @param {boolean} required
   * @returns {Object}
   */
  static url(value, required = false) {
    if (!value && !required) {
      return { valid: true, value: '' };
    }

    try {
      new URL(value);
      return { valid: true, value };
    } catch {
      return { valid: false, error: 'Ungültige URL' };
    }
  }

  /**
   * Telefonnummer validieren
   * @param {string} value
   * @param {boolean} required
   * @returns {Object}
   */
  static phoneNumber(value, required = false) {
    if (!value && !required) {
      return { valid: true, value: '' };
    }

    const normalized = PhoneNumberUtils.normalize(value);
    if (!PhoneNumberUtils.isValid(normalized)) {
      return { valid: false, error: 'Ungültige Telefonnummer' };
    }

    return { valid: true, value: normalized };
  }

  /**
   * Integer validieren
   * @param {any} value
   * @param {Object} options
   * @returns {Object}
   */
  static integer(value, options = {}) {
    const { required = false, min = -Infinity, max = Infinity } = options;

    if (value === null || value === undefined || value === '') {
      if (required) {
        return { valid: false, error: 'Wert ist erforderlich' };
      }
      return { valid: true, value: null };
    }

    const num = parseInt(value, 10);
    if (isNaN(num)) {
      return { valid: false, error: 'Muss eine Ganzzahl sein' };
    }

    if (num < min || num > max) {
      return { valid: false, error: `Wert muss zwischen ${min} und ${max} liegen` };
    }

    return { valid: true, value: num };
  }
}

module.exports = {
  PhoneNumberUtils,
  RetryHandler,
  CircuitBreaker,
  SimpleCache,
  InputValidator
};
