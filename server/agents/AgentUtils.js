/**
 * AgentUtils - Gemeinsame Utilities für alle Agenten
 * ===================================================
 *
 * DRY-Prinzip: Gemeinsame Funktionen ausgelagert
 */

/**
 * Sprach-Erkennung mit Scoring
 */
class LanguageDetector {
  constructor() {
    this.languagePatterns = {
      // Kyrillisch-Erkennung
      sr_cyrl: {
        regex: /[ћђљњ]/,
        priority: 1
      },
      ru: {
        regex: /[а-яА-Яёё]/,
        priority: 2
      },
      // Arabisch
      ar: {
        regex: /[\u0600-\u06FF]/,
        priority: 1
      },
      // Chinesisch
      zh: {
        regex: /[\u4e00-\u9fff]/,
        priority: 1
      },
      // Türkisch (ohne deutsche Umlaute)
      tr: {
        regex: /[şŞğĞıİ]/,
        excludeRegex: /[äÄß]/,
        priority: 2
      },
      // Balkan-Sprachen (mit Sonderzeichen)
      bs: {
        regex: /[čćđšžČĆĐŠŽ]/,
        priority: 3
      }
    };

    // Wort-basierte Erkennung für lateinische Sprachen
    this.wordPatterns = {
      de: {
        words: ['auch', 'können', 'sein', 'was', 'wo', 'warum', 'danke', 'und', 'der', 'die', 'das', 'ist', 'nicht', 'haben', 'werden'],
        minMatches: 3
      },
      en: {
        words: ['the', 'and', 'is', 'are', 'what', 'where', 'why', 'thank', 'you', 'have', 'been', 'this', 'that', 'with'],
        minMatches: 3
      },
      bs: {
        words: ['također', 'može', 'biti', 'šta', 'gdje', 'zašto', 'hvala', 'imati', 'ovaj', 'taj', 'koji', 'kako'],
        minMatches: 2
      },
      hr: {
        words: ['također', 'može', 'što', 'gdje', 'zašto', 'hvala', 'imati', 'ovaj', 'taj', 'koji'],
        minMatches: 2
      },
      sr: {
        words: ['такође', 'може', 'бити', 'шта', 'где', 'зашто', 'хвала'],
        minMatches: 2
      },
      fr: {
        words: ['aussi', 'peut', 'être', 'quoi', 'où', 'pourquoi', 'merci', 'le', 'la', 'les', 'est', 'sont'],
        minMatches: 2
      },
      es: {
        words: ['también', 'puede', 'ser', 'qué', 'dónde', 'por qué', 'gracias', 'el', 'la', 'los', 'es', 'son'],
        minMatches: 2
      }
    };
  }

  /**
   * Sprache erkennen mit Confidence-Score
   * @returns {{ language: string, confidence: number }}
   */
  detect(content, defaultLanguage = 'de') {
    if (!content || typeof content !== 'string') {
      return { language: defaultLanguage, confidence: 0 };
    }

    // 1. Regex-basierte Erkennung (höchste Priorität)
    for (const [lang, pattern] of Object.entries(this.languagePatterns)) {
      if (pattern.regex.test(content)) {
        if (pattern.excludeRegex && pattern.excludeRegex.test(content)) {
          continue;
        }
        return { language: lang, confidence: 0.95 };
      }
    }

    // 2. Wort-basierte Erkennung
    const lower = content.toLowerCase();
    const scores = {};

    for (const [lang, pattern] of Object.entries(this.wordPatterns)) {
      const matches = pattern.words.filter(w => lower.includes(w)).length;
      if (matches >= pattern.minMatches) {
        scores[lang] = matches / pattern.words.length;
      }
    }

    // Höchsten Score finden
    const entries = Object.entries(scores);
    if (entries.length > 0) {
      entries.sort((a, b) => b[1] - a[1]);
      const [bestLang, bestScore] = entries[0];
      return { language: bestLang, confidence: Math.min(0.9, bestScore + 0.3) };
    }

    return { language: defaultLanguage, confidence: 0.5 };
  }
}

/**
 * Pattern-basierte Task-Typ-Erkennung
 */
class TaskTypeDetector {
  constructor(patterns) {
    this.patterns = patterns;
    this.patternCache = new Map();
  }

  /**
   * Task-Typ erkennen
   * @returns {{ type: string, confidence: number, matchedKeywords: string[] }}
   */
  detect(content, defaultType) {
    if (!content) {
      return { type: defaultType, confidence: 0, matchedKeywords: [] };
    }

    const lower = content.toLowerCase();
    let bestMatch = { type: defaultType, score: 0, keywords: [] };

    for (const [type, keywords] of Object.entries(this.patterns)) {
      const matched = keywords.filter(kw => lower.includes(kw));
      const score = matched.length / keywords.length;

      if (matched.length > 0 && score > bestMatch.score) {
        bestMatch = { type, score, keywords: matched };
      }
    }

    return {
      type: bestMatch.type,
      confidence: bestMatch.score,
      matchedKeywords: bestMatch.keywords
    };
  }
}

/**
 * Text-Analyse Utilities
 */
class TextAnalyzer {
  /**
   * Wortanzahl schätzen
   */
  static estimateWordCount(content) {
    if (!content) return 0;
    return content.split(/\s+/).filter(w => w.length > 0).length;
  }

  /**
   * Satzanzahl schätzen
   */
  static estimateSentenceCount(content) {
    if (!content) return 0;
    return content.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
  }

  /**
   * Einfache Sentiment-Analyse
   */
  static analyzeSentiment(content, customWords = {}) {
    const defaultNegative = ['schlecht', 'furchtbar', 'schrecklich', 'wütend', 'enttäuscht',
                            'ärgerlich', 'terrible', 'awful', 'angry', 'frustrated', 'horrible'];
    const defaultPositive = ['danke', 'toll', 'super', 'großartig', 'zufrieden',
                            'excellent', 'great', 'happy', 'satisfied', 'amazing', 'wonderful'];

    const negativeWords = [...defaultNegative, ...(customWords.negative || [])];
    const positiveWords = [...defaultPositive, ...(customWords.positive || [])];

    const lower = content.toLowerCase();
    let score = 0;

    for (const word of negativeWords) {
      if (lower.includes(word)) score -= 0.25;
    }
    for (const word of positiveWords) {
      if (lower.includes(word)) score += 0.25;
    }

    return Math.max(-1, Math.min(1, score));
  }

  /**
   * Zahlen aus Text extrahieren
   */
  static extractNumbers(content, currencies = ['€', 'EUR', 'KM', 'BAM', 'RSD', '$', 'USD']) {
    const numbers = [];
    const currencyPattern = currencies.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

    const patterns = [
      new RegExp(`(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2})?)\\s*(?:${currencyPattern})`, 'gi'),
      new RegExp(`(?:${currencyPattern})\\s*(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2})?)`, 'gi')
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const num = match[1].replace(/\./g, '').replace(',', '.');
        const parsed = parseFloat(num);
        if (!isNaN(parsed)) {
          numbers.push(parsed);
        }
      }
    }

    return [...new Set(numbers)]; // Deduplizieren
  }

  /**
   * Tabellen-/Spaltennamen extrahieren (für SQL)
   */
  static extractTableNames(content) {
    const patterns = [
      /(?:from|join|into|update|table)\s+[`"]?(\w+)[`"]?/gi,
      /tabelle[n]?\s+[`"]?(\w+)[`"]?/gi
    ];

    const tables = new Set();
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        tables.add(match[1].toLowerCase());
      }
    }

    return Array.from(tables);
  }
}

/**
 * Prompt Builder mit Template-System
 */
class PromptBuilder {
  constructor(templates = {}) {
    this.templates = templates;
    this.defaultLanguageInstructions = {
      de: 'Antworte auf Deutsch. Verwende klare, präzise Formulierungen.',
      bs: 'Odgovori na bosanskom. Koristi jasne i precizne formulacije.',
      sr: 'Одговори на српском. Користи јасне и прецизне формулације.',
      en: 'Respond in English. Use clear, concise language.',
      hr: 'Odgovori na hrvatskom. Koristi jasne i precizne formulacije.',
      tr: 'Türkçe yanıt ver. Açık ve net ifadeler kullan.',
      ar: 'أجب بالعربية. استخدم لغة واضحة ودقيقة.',
      fr: 'Réponds en français. Utilise un langage clair et précis.',
      es: 'Responde en español. Usa un lenguaje claro y preciso.'
    };
  }

  /**
   * Template-basierter Prompt-Aufbau
   */
  build(options) {
    const {
      role,
      language,
      taskType,
      context = {},
      instructions = [],
      rules = []
    } = options;

    const langInstruction = this.defaultLanguageInstructions[language] ||
                           this.defaultLanguageInstructions['en'];

    let prompt = `Du bist ${role}.\n\n`;
    prompt += `SPRACHE: ${language.toUpperCase()}\n${langInstruction}\n\n`;

    if (taskType) {
      prompt += `TASK-TYP: ${taskType}\n\n`;
    }

    // Kontext hinzufügen
    for (const [key, value] of Object.entries(context)) {
      if (value !== null && value !== undefined && value !== '') {
        prompt += `${key.toUpperCase()}: ${value}\n`;
      }
    }
    if (Object.keys(context).length > 0) prompt += '\n';

    // Instruktionen
    if (instructions.length > 0) {
      prompt += 'AUFGABEN:\n';
      instructions.forEach((instr, i) => {
        prompt += `${i + 1}. ${instr}\n`;
      });
      prompt += '\n';
    }

    // Regeln
    if (rules.length > 0) {
      prompt += 'REGELN:\n';
      rules.forEach(rule => {
        prompt += `- ${rule}\n`;
      });
    }

    return prompt.trim();
  }
}

/**
 * ID-Generatoren
 */
class IdGenerator {
  static generateTicketNumber(prefix = 'TKT') {
    const date = new Date();
    const timestamp = date.getFullYear().toString().slice(-2) +
                     (date.getMonth() + 1).toString().padStart(2, '0') +
                     date.getDate().toString().padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }

  static generateInvoiceNumber(prefix = 'INV') {
    const date = new Date();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${prefix}-${year}${month}-${random}`;
  }
}

/**
 * Währungs-Utilities
 */
class CurrencyFormatter {
  static formats = {
    EUR: { symbol: '€', position: 'after', decimal: ',', thousand: '.', locale: 'de-DE' },
    BAM: { symbol: 'KM', position: 'after', decimal: ',', thousand: '.', locale: 'bs-BA' },
    RSD: { symbol: 'RSD', position: 'after', decimal: ',', thousand: '.', locale: 'sr-RS' },
    USD: { symbol: '$', position: 'before', decimal: '.', thousand: ',', locale: 'en-US' },
    GBP: { symbol: '£', position: 'before', decimal: '.', thousand: ',', locale: 'en-GB' },
    CHF: { symbol: 'CHF', position: 'after', decimal: '.', thousand: "'", locale: 'de-CH' }
  };

  static format(amount, currency = 'EUR') {
    const format = this.formats[currency] || this.formats.EUR;
    const formatted = amount.toLocaleString(format.locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    return format.position === 'before'
      ? `${format.symbol}${formatted}`
      : `${formatted} ${format.symbol}`;
  }

  static calculateTax(amount, rate) {
    const taxAmount = amount * (rate / 100);
    return {
      net: amount,
      taxRate: rate,
      taxAmount: Math.round(taxAmount * 100) / 100,
      gross: Math.round((amount + taxAmount) * 100) / 100
    };
  }
}

/**
 * Cache-Utility für Agent-lokales Caching
 */
class SimpleCache {
  constructor(maxSize = 100, ttlMs = 300000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  set(key, value) {
    // LRU: Älteste entfernen wenn voll
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  has(key) {
    return this.get(key) !== null;
  }

  clear() {
    this.cache.clear();
  }
}

module.exports = {
  LanguageDetector,
  TaskTypeDetector,
  TextAnalyzer,
  PromptBuilder,
  IdGenerator,
  CurrencyFormatter,
  SimpleCache
};
