/**
 * TranslatorAgent - Optimierte Version
 * =====================================
 *
 * OPTIMIERUNGEN:
 * - Erweiterte Spracherkennung mit Confidence
 * - Glossar-Support für konsistente Terminologie
 * - Quality-Estimation vorbereitet
 * - Batch-Translation Support
 * - RTL-Sprachen korrekt behandelt
 */

const BaseAgent = require('./BaseAgent');
const {
  LanguageDetector,
  TaskTypeDetector,
  TextAnalyzer,
  SimpleCache
} = require('./AgentUtils');

const TASK_TYPES = Object.freeze({
  TRANSLATE: 'translate',
  LOCALIZE: 'localize',
  PROOFREAD: 'proofread',
  TERMINOLOGY: 'terminology',
  TRANSCREATION: 'transcreation',
  SUBTITLE: 'subtitle',
  WEBSITE_LOCALIZE: 'website_localize',
  DOCUMENT_TRANSLATE: 'document_translate',
  LEGAL_TRANSLATE: 'legal_translate',
  TECHNICAL_TRANSLATE: 'technical_translate'
});

const LANGUAGES = Object.freeze({
  de: { name: 'Deutsch', nativeName: 'Deutsch', code: 'de-DE', direction: 'ltr', script: 'latin' },
  en: { name: 'English', nativeName: 'English', code: 'en-US', direction: 'ltr', script: 'latin' },
  bs: { name: 'Bosnisch', nativeName: 'Bosanski', code: 'bs-BA', direction: 'ltr', script: 'latin' },
  hr: { name: 'Kroatisch', nativeName: 'Hrvatski', code: 'hr-HR', direction: 'ltr', script: 'latin' },
  sr: { name: 'Serbisch (Lat.)', nativeName: 'Srpski', code: 'sr-RS', direction: 'ltr', script: 'latin' },
  sr_cyrl: { name: 'Serbisch (Kyr.)', nativeName: 'Српски', code: 'sr-Cyrl', direction: 'ltr', script: 'cyrillic' },
  tr: { name: 'Türkisch', nativeName: 'Türkçe', code: 'tr-TR', direction: 'ltr', script: 'latin' },
  ar: { name: 'Arabisch', nativeName: 'العربية', code: 'ar-SA', direction: 'rtl', script: 'arabic' },
  fr: { name: 'Französisch', nativeName: 'Français', code: 'fr-FR', direction: 'ltr', script: 'latin' },
  es: { name: 'Spanisch', nativeName: 'Español', code: 'es-ES', direction: 'ltr', script: 'latin' },
  it: { name: 'Italienisch', nativeName: 'Italiano', code: 'it-IT', direction: 'ltr', script: 'latin' },
  nl: { name: 'Niederländisch', nativeName: 'Nederlands', code: 'nl-NL', direction: 'ltr', script: 'latin' },
  pl: { name: 'Polnisch', nativeName: 'Polski', code: 'pl-PL', direction: 'ltr', script: 'latin' },
  ru: { name: 'Russisch', nativeName: 'Русский', code: 'ru-RU', direction: 'ltr', script: 'cyrillic' },
  zh: { name: 'Chinesisch', nativeName: '中文', code: 'zh-CN', direction: 'ltr', script: 'chinese' },
  ja: { name: 'Japanisch', nativeName: '日本語', code: 'ja-JP', direction: 'ltr', script: 'japanese' },
  ko: { name: 'Koreanisch', nativeName: '한국어', code: 'ko-KR', direction: 'ltr', script: 'korean' },
  pt: { name: 'Portugiesisch', nativeName: 'Português', code: 'pt-PT', direction: 'ltr', script: 'latin' }
});

const DOMAINS = Object.freeze({
  general: { name: 'Allgemein', description: 'Allgemeine Texte ohne Fachterminologie' },
  legal: { name: 'Recht & Verträge', description: 'Juristische Dokumente, Verträge, AGB' },
  medical: { name: 'Medizin', description: 'Medizinische Texte, Befunde, Beipackzettel' },
  technical: { name: 'Technik', description: 'Technische Dokumentation, Handbücher' },
  marketing: { name: 'Marketing', description: 'Werbetexte, Kampagnen, Slogans' },
  finance: { name: 'Finanzen', description: 'Finanzberichte, Buchhaltung, Banking' },
  it: { name: 'IT & Software', description: 'Software-Lokalisierung, UI-Texte' },
  academic: { name: 'Wissenschaft', description: 'Akademische Texte, Papers, Studien' }
});

const FORMALITY_LEVELS = Object.freeze({
  informal: { name: 'Informell', description: 'Du-Form, lockerer Stil' },
  neutral: { name: 'Neutral', description: 'Ausgewogen, weder zu formal noch zu locker' },
  formal: { name: 'Formell', description: 'Sie-Form, professioneller Stil' },
  legal: { name: 'Juristisch', description: 'Maximale Präzision, rechtssichere Formulierungen' }
});

class TranslatorAgent extends BaseAgent {
  constructor() {
    super({
      id: 'translator',
      name: 'Translator Agent',
      type: 'translator',
      version: '2.0.0',
      description: 'Übersetzt Texte professionell in 15+ Sprachen mit kultureller Anpassung.',
      primary: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
      fallback: { provider: 'openai', model: 'gpt-4o' },
      capabilities: Object.values(TASK_TYPES),
      keywords: [
        'übersetzen', 'translate', 'übersetzung', 'translation', 'sprache', 'language',
        'deutsch', 'englisch', 'französisch', 'bosnisch', 'serbisch', 'kroatisch',
        'türkisch', 'arabisch', 'lokalisierung', 'localization', 'auf englisch',
        'prevesti', 'prijevod', 'превод', 'tercüme', 'ترجمة', '翻译', 'prevoditi',
        'ins deutsche', 'auf deutsch', 'to english', 'na bosanski', 'na srpski'
      ],
      costs: { input: 3, output: 15 }
    });

    this._initializeDetectors();
    this._cache = new SimpleCache(100, 300000); // 5 Min TTL
    this._glossary = new Map(); // Für konsistente Terminologie
  }

  _initializeDetectors() {
    this._languageDetector = new LanguageDetector();

    this._taskTypeDetector = new TaskTypeDetector({
      [TASK_TYPES.TRANSLATE]: ['übersetzen', 'translate', 'übersetzung', 'prevesti', 'prijevod'],
      [TASK_TYPES.LOCALIZE]: ['lokalisieren', 'localize', 'anpassen', 'adapt', 'prilagoditi'],
      [TASK_TYPES.PROOFREAD]: ['korrektur', 'proofread', 'korrigieren', 'lektorat', 'ispraviti'],
      [TASK_TYPES.TERMINOLOGY]: ['terminologie', 'terminology', 'glossar', 'glossary', 'pojmovnik'],
      [TASK_TYPES.TRANSCREATION]: ['transcreation', 'kreativ übersetzen', 'creative translation'],
      [TASK_TYPES.SUBTITLE]: ['untertitel', 'subtitle', 'caption', 'titl'],
      [TASK_TYPES.WEBSITE_LOCALIZE]: ['website', 'webseite', 'seite', 'web stranica'],
      [TASK_TYPES.DOCUMENT_TRANSLATE]: ['dokument', 'document', 'datei', 'file'],
      [TASK_TYPES.LEGAL_TRANSLATE]: ['vertrag', 'contract', 'rechtlich', 'legal', 'ugovor'],
      [TASK_TYPES.TECHNICAL_TRANSLATE]: ['technisch', 'technical', 'manual', 'anleitung']
    });
  }

  /**
   * Erweiterte Spracherkennung
   */
  _detectSourceLanguage(content) {
    // Script-basierte Erkennung (höchste Priorität)

    // Kyrillisch - differenziert Serbisch von Russisch
    if (/[а-яА-Я]/.test(content)) {
      if (/[ћђљњ]/i.test(content)) return { language: 'sr_cyrl', confidence: 0.95 };
      if (/[ёЁъЪ]/i.test(content)) return { language: 'ru', confidence: 0.95 };
      // Unspezifisches Kyrillisch
      return { language: 'ru', confidence: 0.7 };
    }

    // Arabisch
    if (/[\u0600-\u06FF]/.test(content)) {
      return { language: 'ar', confidence: 0.95 };
    }

    // Chinesisch
    if (/[\u4e00-\u9fff]/.test(content)) {
      return { language: 'zh', confidence: 0.95 };
    }

    // Japanisch (Hiragana/Katakana)
    if (/[\u3040-\u30ff]/.test(content)) {
      return { language: 'ja', confidence: 0.95 };
    }

    // Koreanisch (Hangul)
    if (/[\uac00-\ud7af]/.test(content)) {
      return { language: 'ko', confidence: 0.95 };
    }

    // Türkisch-spezifische Buchstaben (ohne deutsche Umlaute)
    if (/[şŞğĞıİ]/.test(content) && !/[äÄüÜöÖß]/.test(content)) {
      return { language: 'tr', confidence: 0.9 };
    }

    // Balkan-Sprachen (čćđšž)
    if (/[čćđšžČĆĐŠŽ]/.test(content)) {
      // Unterscheidung Bosnisch/Kroatisch/Serbisch ist schwierig
      const lower = content.toLowerCase();
      if (lower.includes('što') || lower.includes('tko')) {
        return { language: 'hr', confidence: 0.75 };
      }
      if (lower.includes('šta') || lower.includes('ko ')) {
        return { language: 'bs', confidence: 0.75 };
      }
      return { language: 'bs', confidence: 0.6 }; // Default Bosnisch
    }

    // Wortbasierte Erkennung für lateinische Sprachen
    return this._languageDetector.detect(content, 'de');
  }

  /**
   * Zielsprache aus Anfrage extrahieren
   */
  _detectTargetLanguage(content) {
    const lower = content.toLowerCase();

    const languagePatterns = {
      de: ['auf deutsch', 'ins deutsche', 'to german', 'na njemački', 'на немецкий'],
      en: ['auf englisch', 'ins englische', 'to english', 'na engleski', 'in english'],
      bs: ['auf bosnisch', 'ins bosnische', 'to bosnian', 'na bosanski'],
      hr: ['auf kroatisch', 'ins kroatische', 'to croatian', 'na hrvatski'],
      sr: ['auf serbisch', 'ins serbische', 'to serbian', 'na srpski'],
      sr_cyrl: ['kyrillisch', 'cyrillic', 'ћирилица', 'na ćirilicu', 'ћирилицом'],
      tr: ['auf türkisch', 'ins türkische', 'to turkish', 'türkçeye'],
      ar: ['auf arabisch', 'ins arabische', 'to arabic', 'إلى العربية', 'بالعربية'],
      fr: ['auf französisch', 'ins französische', 'to french', 'en français'],
      es: ['auf spanisch', 'ins spanische', 'to spanish', 'al español'],
      it: ['auf italienisch', 'ins italienische', 'to italian', 'in italiano'],
      ru: ['auf russisch', 'ins russische', 'to russian', 'на русский'],
      zh: ['auf chinesisch', 'ins chinesische', 'to chinese', '翻译成中文'],
      ja: ['auf japanisch', 'ins japanische', 'to japanese', '日本語に'],
      ko: ['auf koreanisch', 'ins koreanische', 'to korean', '한국어로'],
      pt: ['auf portugiesisch', 'ins portugiesische', 'to portuguese'],
      nl: ['auf niederländisch', 'ins niederländische', 'to dutch'],
      pl: ['auf polnisch', 'ins polnische', 'to polish']
    };

    for (const [lang, patterns] of Object.entries(languagePatterns)) {
      if (patterns.some(p => lower.includes(p))) {
        return { language: lang, confidence: 0.95 };
      }
    }

    return { language: 'de', confidence: 0.5 }; // Default
  }

  _detectFormality(content) {
    const lower = content.toLowerCase();

    if (lower.includes('formal') || lower.includes('geschäftlich') || lower.includes('business') || lower.includes('sie-form')) {
      return 'formal';
    }
    if (lower.includes('informal') || lower.includes('locker') || lower.includes('casual') || lower.includes('du-form')) {
      return 'informal';
    }
    if (lower.includes('legal') || lower.includes('rechtlich') || lower.includes('vertrag') || lower.includes('juristisch')) {
      return 'legal';
    }
    return 'neutral';
  }

  _detectDomain(content) {
    const lower = content.toLowerCase();

    const domainPatterns = {
      legal: ['vertrag', 'contract', 'gesetz', 'law', 'recht', 'legal', 'agb', 'klausel'],
      medical: ['medizin', 'medical', 'arzt', 'doctor', 'patient', 'diagnose', 'therapie'],
      technical: ['technisch', 'technical', 'maschine', 'machine', 'engineering', 'manual'],
      marketing: ['marketing', 'werbung', 'ad', 'kampagne', 'slogan', 'brand'],
      finance: ['finanz', 'finance', 'bank', 'investition', 'bilanz', 'buchhaltung'],
      it: ['software', 'code', 'programmieren', 'api', 'database', 'app', 'ui'],
      academic: ['wissenschaft', 'academic', 'forschung', 'research', 'studie', 'paper']
    };

    for (const [domain, keywords] of Object.entries(domainPatterns)) {
      if (keywords.some(kw => lower.includes(kw))) {
        return domain;
      }
    }
    return 'general';
  }

  /**
   * Prompt-Builder
   */
  buildPrompt(task) {
    const sourceLanguage = this._detectSourceLanguage(task.content);
    const targetLanguage = this._detectTargetLanguage(task.content);
    const taskType = this._taskTypeDetector.detect(task.content, TASK_TYPES.TRANSLATE);
    const formality = this._detectFormality(task.content);
    const domain = this._detectDomain(task.content);

    const sourceLangInfo = LANGUAGES[sourceLanguage.language] || { name: 'Auto', nativeName: 'Auto' };
    const targetLangInfo = LANGUAGES[targetLanguage.language] || LANGUAGES.de;

    const isRTL = targetLangInfo.direction === 'rtl';
    const isScriptChange = sourceLangInfo.script !== targetLangInfo.script;

    const systemPrompt = `Du bist ein professioneller Übersetzer und Sprachexperte.

ÜBERSETZUNGSAUFTRAG:
• Quellsprache: ${sourceLangInfo.name} (${sourceLangInfo.nativeName}) - Confidence: ${(sourceLanguage.confidence * 100).toFixed(0)}%
• Zielsprache: ${targetLangInfo.name} (${targetLangInfo.nativeName}) - Confidence: ${(targetLanguage.confidence * 100).toFixed(0)}%
• Task-Typ: ${taskType.type}
• Formalität: ${FORMALITY_LEVELS[formality].name} - ${FORMALITY_LEVELS[formality].description}
• Fachgebiet: ${DOMAINS[domain].name} - ${DOMAINS[domain].description}

${isRTL ? '⚠️ ACHTUNG: Zielsprache ist RTL (Rechts-nach-Links)!\n' : ''}
${isScriptChange ? `⚠️ SCRIPT-WECHSEL: ${sourceLangInfo.script} → ${targetLangInfo.script}\n` : ''}

AUFGABEN JE NACH TASK-TYP:

1. TRANSLATE:
   - Präzise, natürliche Übersetzung
   - Bedeutung und Ton beibehalten
   - KEINE wörtliche Übersetzung
   - Idiome und Redewendungen anpassen

2. LOCALIZE:
   - Kulturelle Anpassungen vornehmen
   - Datumsformate, Währungen, Maße anpassen
   - Lokale Beispiele und Referenzen verwenden
   - Kulturell sensible Inhalte prüfen

3. PROOFREAD:
   - Grammatik und Rechtschreibung prüfen
   - Stil verbessern
   - Konsistenz sicherstellen
   - Änderungen in [KLAMMERN] markieren

4. LEGAL_TRANSLATE:
   - Juristische Terminologie EXAKT übersetzen
   - KEINE freie Interpretation
   - Originalstruktur beibehalten
   - ⚠️ Dies ist KEINE Rechtsberatung

5. TECHNICAL_TRANSLATE:
   - Fachterminologie konsistent verwenden
   - Technische Genauigkeit priorisieren
   - Abkürzungen erklären wenn nötig

6. TRANSCREATION:
   - Kreative Freiheit für Marketing-Texte
   - Wirkung wichtiger als Wortlaut
   - Kulturelle Resonanz maximieren

SPRACHSPEZIFISCHE REGELN:

${targetLanguage.language === 'bs' || targetLanguage.language === 'hr' || targetLanguage.language === 'sr' ? `
Für ${targetLangInfo.name}:
- Ijekavica (Bosnisch/Kroatisch) vs Ekavica (Serbisch) beachten
- Regionale Unterschiede berücksichtigen
- Bei Unsicherheit: beide Varianten anbieten
` : ''}

${targetLanguage.language === 'ar' ? `
Für Arabisch:
- Formelle vs. informelle Anrede (أنت/أنتم) beachten
- Modernes Hocharabisch (MSA) verwenden
- Geschlechtsspezifische Formen korrekt anwenden
- Diakritische Zeichen (Tashkil) bei Bedarf
` : ''}

${targetLanguage.language === 'tr' ? `
Für Türkisch:
- Vokalharmonie beachten
- Sie-Form (siz) bei formal
- Suffixe korrekt anhängen
` : ''}

${targetLanguage.language === 'zh' ? `
Für Chinesisch:
- Vereinfachtes Chinesisch (Festland) als Standard
- Bei Taiwan-Kontext: Traditionell verwenden
` : ''}

QUALITÄTSREGELN:
1. Natürlich klingende Übersetzung in der Zielsprache
2. Konsistente Terminologie im gesamten Text
3. Kulturelle Sensibilität beachten
4. Bei Unsicherheit: Alternative in [ECKIGEN KLAMMERN] anbieten
5. Unübersetzbare Begriffe mit Erklärung markieren`;

    return {
      system: systemPrompt,
      user: task.content
    };
  }

  /**
   * Glossar-Eintrag hinzufügen
   */
  addGlossaryEntry(source, target, domain = 'general') {
    const key = `${source.toLowerCase()}_${domain}`;
    this._glossary.set(key, { source, target, domain });
  }

  /**
   * Execute mit erweiterten Metadaten
   */
  async execute(task) {
    const sourceLanguage = this._detectSourceLanguage(task.content);
    const targetLanguage = this._detectTargetLanguage(task.content);
    const taskType = this._taskTypeDetector.detect(task.content, TASK_TYPES.TRANSLATE);
    const formality = this._detectFormality(task.content);
    const domain = this._detectDomain(task.content);

    const result = await super.execute(task);

    const targetLangInfo = LANGUAGES[targetLanguage.language] || LANGUAGES.de;
    const sourceLangInfo = LANGUAGES[sourceLanguage.language];

    result.metadata = {
      translation: {
        sourceLanguage: sourceLanguage.language,
        sourceLanguageName: sourceLangInfo?.name || 'Auto',
        sourceConfidence: sourceLanguage.confidence,
        targetLanguage: targetLanguage.language,
        targetLanguageName: targetLangInfo.name,
        targetConfidence: targetLanguage.confidence
      },
      taskType: taskType.type,
      formality,
      domain,
      formatting: {
        isRTL: targetLangInfo.direction === 'rtl',
        script: targetLangInfo.script,
        locale: targetLangInfo.code
      },
      quality: {
        wordCount: TextAnalyzer.estimateWordCount(task.content),
        glossaryUsed: this._glossary.size > 0
      }
    };

    return result;
  }
}

// Exports
TranslatorAgent.TASK_TYPES = TASK_TYPES;
TranslatorAgent.LANGUAGES = LANGUAGES;
TranslatorAgent.DOMAINS = DOMAINS;
TranslatorAgent.FORMALITY_LEVELS = FORMALITY_LEVELS;

module.exports = TranslatorAgent;
