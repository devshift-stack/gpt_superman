/**
 * SummaryAgent - Text-Zusammenfassung und Analyse
 * ================================================
 *
 * Features:
 * - Multi-Format Zusammenfassung
 * - Verschiedene Stile (Executive, Bullets, Academic)
 * - Key-Point Extraktion
 * - Sentiment und Themen-Analyse
 */

const BaseAgent = require('./BaseAgent');
const { LanguageDetector, TaskTypeDetector, TextAnalyzer, SimpleCache } = require('./AgentUtils');

const TASK_TYPES = Object.freeze({
  SUMMARIZE: 'summarize',
  KEY_POINTS: 'key_points',
  EXECUTIVE_SUMMARY: 'executive_summary',
  BULLET_POINTS: 'bullet_points',
  ABSTRACT: 'abstract',
  TLDR: 'tldr',
  MEETING_NOTES: 'meeting_notes'
});

const SUMMARY_STYLES = Object.freeze({
  executive: {
    name: 'Executive Summary',
    description: 'Kurz, prägnant, für Entscheider',
    maxWords: 200
  },
  bullets: {
    name: 'Bullet Points',
    description: 'Stichpunkte, scanbar',
    maxPoints: 10
  },
  academic: {
    name: 'Akademisch',
    description: 'Formal, strukturiert',
    sections: ['Hintergrund', 'Methodik', 'Ergebnisse', 'Schlussfolgerung']
  },
  casual: {
    name: 'Casual',
    description: 'Locker, verständlich',
    maxWords: 150
  },
  technical: {
    name: 'Technisch',
    description: 'Fachspezifisch, präzise',
    maxWords: 300
  }
});

const LENGTH_OPTIONS = Object.freeze({
  short: { name: 'Kurz', sentences: 3, words: 100 },
  medium: { name: 'Mittel', sentences: 7, words: 250 },
  long: { name: 'Lang', sentences: 15, words: 500 },
  detailed: { name: 'Detailliert', sentences: 25, words: 800 }
});

class SummaryAgent extends BaseAgent {
  constructor() {
    super({
      id: 'summary',
      name: 'Summary Agent',
      type: 'summary',
      version: '2.1.0',
      description: 'Fasst Texte zusammen und extrahiert Kernaussagen.',
      primary: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
      fallback: { provider: 'openai', model: 'gpt-4o' },
      capabilities: Object.values(TASK_TYPES),
      keywords: [
        'zusammenfassung', 'summary', 'sažetak', 'zusammenfassen', 'summarize',
        'kernaussagen', 'key points', 'abstract', 'tldr', 'überblick',
        'overview', 'pregled', 'stichpunkte', 'bullet points', 'fasse', 'kürze'
      ],
      costs: { input: 3, output: 15 },
      feedback: { enabled: true, minSamples: 5 }
    });

    this._languageDetector = new LanguageDetector();
    this._taskTypeDetector = new TaskTypeDetector({
      [TASK_TYPES.SUMMARIZE]: ['zusammenfassen', 'summarize', 'sažmi', 'kurzfassung'],
      [TASK_TYPES.KEY_POINTS]: ['kernaussagen', 'key points', 'hauptpunkte', 'ključne točke'],
      [TASK_TYPES.EXECUTIVE_SUMMARY]: ['executive summary', 'management summary', 'führungszusammenfassung'],
      [TASK_TYPES.BULLET_POINTS]: ['stichpunkte', 'bullets', 'aufzählung', 'liste'],
      [TASK_TYPES.ABSTRACT]: ['abstract', 'abstrakt', 'kurzbeschreibung'],
      [TASK_TYPES.TLDR]: ['tldr', 'tl;dr', 'kurzversion', 'in kürze'],
      [TASK_TYPES.MEETING_NOTES]: ['meeting', 'protokoll', 'besprechung', 'sitzung', 'zapisnik']
    });

    this._cache = new SimpleCache(100, 300000);
  }

  /**
   * Stil erkennen
   */
  _detectStyle(content) {
    const lower = content.toLowerCase();

    if (lower.includes('executive') || lower.includes('management') || lower.includes('führung')) return 'executive';
    if (lower.includes('bullet') || lower.includes('stichpunkt') || lower.includes('liste')) return 'bullets';
    if (lower.includes('akadem') || lower.includes('academic') || lower.includes('wissenschaft')) return 'academic';
    if (lower.includes('technisch') || lower.includes('technical') || lower.includes('fach')) return 'technical';
    if (lower.includes('locker') || lower.includes('casual') || lower.includes('einfach')) return 'casual';

    return 'executive'; // Default
  }

  /**
   * Gewünschte Länge erkennen
   */
  _detectLength(content) {
    const lower = content.toLowerCase();

    if (lower.includes('sehr kurz') || lower.includes('tldr') || lower.includes('minimal')) return 'short';
    if (lower.includes('ausführlich') || lower.includes('detailed') || lower.includes('umfassend')) return 'detailed';
    if (lower.includes('lang') || lower.includes('long') || lower.includes('umfangreich')) return 'long';

    return 'medium'; // Default
  }

  /**
   * Text-Analyse für Input
   */
  _analyzeInput(content) {
    const wordCount = TextAnalyzer.estimateWordCount(content);
    const sentenceCount = TextAnalyzer.estimateSentenceCount(content);
    const sentiment = TextAnalyzer.analyzeSentiment(content);

    return {
      wordCount,
      sentenceCount,
      avgWordsPerSentence: sentenceCount > 0 ? Math.round(wordCount / sentenceCount) : 0,
      sentiment,
      complexity: wordCount > 500 ? 'high' : wordCount > 200 ? 'medium' : 'low'
    };
  }

  /**
   * Prompt-Builder
   */
  buildPrompt(task) {
    const language = this._languageDetector.detect(task.content);
    const taskType = this._taskTypeDetector.detect(task.content, TASK_TYPES.SUMMARIZE);
    const style = this._detectStyle(task.content);
    const length = this._detectLength(task.content);
    const styleInfo = SUMMARY_STYLES[style];
    const lengthInfo = LENGTH_OPTIONS[length];
    const inputAnalysis = this._analyzeInput(task.content);

    const systemPrompt = `Du bist ein Experte für Textzusammenfassungen und -analyse.

SPRACHE: ${language.language.toUpperCase()}
TASK-TYP: ${taskType.type}
STIL: ${styleInfo.name} - ${styleInfo.description}
LÄNGE: ${lengthInfo.name} (ca. ${lengthInfo.words} Wörter)

INPUT-ANALYSE:
• Wörter: ${inputAnalysis.wordCount}
• Sätze: ${inputAnalysis.sentenceCount}
• Komplexität: ${inputAnalysis.complexity}
• Grundstimmung: ${inputAnalysis.sentiment > 0.2 ? 'Positiv' : inputAnalysis.sentiment < -0.2 ? 'Negativ' : 'Neutral'}

AUFGABEN JE NACH TASK-TYP:

1. SUMMARIZE:
   - Kernaussagen erfassen
   - Wichtigste Informationen priorisieren
   - Logische Struktur beibehalten
   - Max. ${lengthInfo.words} Wörter

2. KEY_POINTS:
   - 3-7 Hauptpunkte extrahieren
   - Nummerierte Liste
   - Pro Punkt max. 2 Sätze
   - Priorisiert nach Wichtigkeit

3. EXECUTIVE_SUMMARY:
   - Für Entscheider geschrieben
   - Problem → Lösung → Handlung
   - Max. 200 Wörter
   - Handlungsempfehlungen hervorheben

4. BULLET_POINTS:
   - Stichpunkte mit •
   - Max. ${styleInfo.maxPoints || 10} Punkte
   - Scanbar und prägnant
   - Keine vollständigen Sätze nötig

5. ABSTRACT:
   - Akademischer Stil
   - ${styleInfo.sections?.join(', ') || 'Strukturiert'}
   - Objektiv und formal
   - Keine Meinungen

6. TLDR:
   - Maximal 2-3 Sätze
   - Das Allerwichtigste
   - Extrem komprimiert

7. MEETING_NOTES:
   - Datum und Teilnehmer (falls erwähnt)
   - Besprochene Themen
   - Entscheidungen
   - Action Items mit Verantwortlichen
   - Nächste Schritte

QUALITÄTSREGELN:
1. Keine wichtigen Informationen auslassen
2. Keine neuen Informationen hinzufügen
3. Neutral und objektiv bleiben
4. Bei Kürzung: Wichtiges vor Unwichtigem
5. Konsistenter Stil durchgehend`;

    return { system: systemPrompt, user: task.content };
  }

  /**
   * Execute mit erweiterten Metadaten
   */
  async execute(task) {
    const language = this._languageDetector.detect(task.content);
    const taskType = this._taskTypeDetector.detect(task.content, TASK_TYPES.SUMMARIZE);
    const style = this._detectStyle(task.content);
    const length = this._detectLength(task.content);
    const inputAnalysis = this._analyzeInput(task.content);

    const result = await super.execute(task);

    // Output-Analyse
    const outputAnalysis = result.result ? this._analyzeInput(result.result) : null;

    result.metadata = {
      language: language.language,
      taskType: taskType.type,
      style: {
        name: style,
        info: SUMMARY_STYLES[style]
      },
      length: {
        name: length,
        info: LENGTH_OPTIONS[length]
      },
      analysis: {
        input: inputAnalysis,
        output: outputAnalysis,
        compressionRatio: outputAnalysis
          ? (1 - outputAnalysis.wordCount / inputAnalysis.wordCount).toFixed(2)
          : null
      }
    };

    return result;
  }
}

SummaryAgent.TASK_TYPES = TASK_TYPES;
SummaryAgent.SUMMARY_STYLES = SUMMARY_STYLES;
SummaryAgent.LENGTH_OPTIONS = LENGTH_OPTIONS;

module.exports = SummaryAgent;
