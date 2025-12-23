/**
 * SupportAgent - Erweiterte Version mit Vector-Search
 * ====================================================
 *
 * NEUE FEATURES:
 * - Vector-Search für FAQ (semantische Suche)
 * - Session-Management mit Kontext
 * - Intelligente Eskalationslogik
 * - Sentiment-Tracking über Zeit
 */

const BaseAgent = require('./BaseAgent');
const { LanguageDetector, TaskTypeDetector, IdGenerator, SimpleCache } = require('./AgentUtils');

const TASK_TYPES = Object.freeze({
  CUSTOMER_INQUIRY: 'customer_inquiry',
  TICKET_CREATE: 'ticket_create',
  TECHNICAL_SUPPORT: 'technical_support',
  REFUND_REQUEST: 'refund_request',
  ESCALATION: 'escalation',
  FAQ_ANSWER: 'faq_answer'
});

const TICKET_PRIORITIES = Object.freeze({
  CRITICAL: { level: 4, name: 'Kritisch', slaHours: 1 },
  HIGH: { level: 3, name: 'Hoch', slaHours: 4 },
  MEDIUM: { level: 2, name: 'Mittel', slaHours: 24 },
  LOW: { level: 1, name: 'Niedrig', slaHours: 72 }
});

// ============================================================================
// VECTOR SEARCH FÜR FAQ (Vereinfachte Implementation)
// ============================================================================

/**
 * Einfache TF-IDF basierte "Vector Search" für FAQ
 * In Produktion: Verwende OpenAI Embeddings, Pinecone, Weaviate, etc.
 */
class FAQVectorStore {
  constructor() {
    this.documents = [];
    this.vocabulary = new Set();
    this.idfScores = new Map();
    this.documentVectors = [];
  }

  /**
   * FAQ-Dokumente hinzufügen
   * @param {Array} faqs - Array von { id, question, answer, category }
   */
  addDocuments(faqs) {
    for (const faq of faqs) {
      const doc = {
        id: faq.id,
        question: faq.question,
        answer: faq.answer,
        category: faq.category || 'general',
        tokens: this._tokenize(faq.question + ' ' + faq.answer)
      };

      this.documents.push(doc);
      doc.tokens.forEach(token => this.vocabulary.add(token));
    }

    this._computeIDF();
    this._computeDocumentVectors();
  }

  /**
   * Semantische Suche nach ähnlichen FAQs
   * @param {string} query - Suchanfrage
   * @param {number} topK - Anzahl Ergebnisse
   * @returns {Array} Top-K ähnlichste FAQs mit Score
   */
  search(query, topK = 5) {
    const queryTokens = this._tokenize(query);
    const queryVector = this._computeTFIDF(queryTokens);

    const scores = this.documentVectors.map((docVector, idx) => ({
      document: this.documents[idx],
      score: this._cosineSimilarity(queryVector, docVector)
    }));

    // Nach Score sortieren
    scores.sort((a, b) => b.score - a.score);

    return scores.slice(0, topK).filter(s => s.score > 0.1);
  }

  /**
   * FAQ nach Kategorie finden
   */
  getByCategory(category) {
    return this.documents.filter(doc => doc.category === category);
  }

  // Tokenisierung
  _tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\säöüß]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2);
  }

  // IDF berechnen
  _computeIDF() {
    const N = this.documents.length;

    for (const term of this.vocabulary) {
      const docsWithTerm = this.documents.filter(doc => doc.tokens.includes(term)).length;
      this.idfScores.set(term, Math.log((N + 1) / (docsWithTerm + 1)) + 1);
    }
  }

  // TF-IDF Vector für Tokens
  _computeTFIDF(tokens) {
    const vector = new Map();
    const termFreq = new Map();

    // Term Frequency
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }

    // TF-IDF
    for (const [term, tf] of termFreq) {
      const idf = this.idfScores.get(term) || 1;
      vector.set(term, (tf / tokens.length) * idf);
    }

    return vector;
  }

  // Document Vectors vorberechnen
  _computeDocumentVectors() {
    this.documentVectors = this.documents.map(doc =>
      this._computeTFIDF(doc.tokens)
    );
  }

  // Cosine Similarity
  _cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (const [term, valA] of vecA) {
      const valB = vecB.get(term) || 0;
      dotProduct += valA * valB;
      normA += valA * valA;
    }

    for (const [, val] of vecB) {
      normB += val * val;
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

// ============================================================================
// SUPPORT AGENT
// ============================================================================

class SupportAgent extends BaseAgent {
  constructor() {
    super({
      id: 'support',
      name: 'Support Agent',
      type: 'support',
      version: '2.1.0',
      description: 'Bearbeitet Kundenanfragen mit intelligenter FAQ-Suche und Eskalation.',
      primary: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
      fallback: { provider: 'openai', model: 'gpt-4o' },
      capabilities: Object.values(TASK_TYPES),
      keywords: [
        'hilfe', 'problem', 'fehler', 'support', 'ticket', 'anfrage', 'reklamation',
        'beschwerde', 'erstattung', 'refund', 'bug', 'help', 'issue', 'error'
      ],
      costs: { input: 3, output: 15 },
      // NEU: Feedback aktiviert
      feedback: { enabled: true, minSamples: 5 }
    });

    this._languageDetector = new LanguageDetector();
    this._taskTypeDetector = new TaskTypeDetector({
      [TASK_TYPES.TICKET_CREATE]: ['ticket erstellen', 'neues ticket', 'melden'],
      [TASK_TYPES.REFUND_REQUEST]: ['erstattung', 'geld zurück', 'refund', 'storno'],
      [TASK_TYPES.TECHNICAL_SUPPORT]: ['fehler', 'bug', 'funktioniert nicht', 'error'],
      [TASK_TYPES.ESCALATION]: ['manager', 'vorgesetzter', 'beschwerde'],
      [TASK_TYPES.FAQ_ANSWER]: ['wie', 'was', 'warum', 'how', 'what', 'why', 'faq']
    });

    // NEU: Vector Store für FAQ
    this._faqStore = new FAQVectorStore();
    this._faqInitialized = false;

    // Session Management
    this._sessions = new Map();
    this._maxSessionHistory = 20;

    // Sentiment-Tracking über Zeit
    this._sentimentHistory = new Map();
  }

  // ==========================================================================
  // FAQ MANAGEMENT
  // ==========================================================================

  /**
   * FAQ-Datenbank initialisieren
   * @param {Array} faqs - Array von FAQ-Objekten
   */
  initializeFAQ(faqs) {
    this._faqStore.addDocuments(faqs);
    this._faqInitialized = true;

    this.emit('faq:initialized', {
      agentId: this.id,
      faqCount: faqs.length
    });
  }

  /**
   * FAQ hinzufügen (dynamisch)
   */
  addFAQ(faq) {
    this._faqStore.addDocuments([faq]);

    this.emit('faq:added', {
      agentId: this.id,
      faqId: faq.id
    });
  }

  /**
   * FAQ suchen
   */
  searchFAQ(query, topK = 5) {
    if (!this._faqInitialized) {
      return [];
    }

    const results = this._faqStore.search(query, topK);

    this.emit('faq:searched', {
      agentId: this.id,
      query,
      resultCount: results.length
    });

    return results;
  }

  // ==========================================================================
  // SESSION MANAGEMENT
  // ==========================================================================

  _getSession(sessionId) {
    if (!this._sessions.has(sessionId)) {
      this._sessions.set(sessionId, {
        id: sessionId,
        history: [],
        sentiment: [],
        createdAt: Date.now(),
        metadata: {}
      });
    }
    return this._sessions.get(sessionId);
  }

  _addToSession(sessionId, role, content, sentiment = null) {
    const session = this._getSession(sessionId);

    session.history.push({
      role,
      content,
      sentiment,
      timestamp: Date.now()
    });

    if (sentiment !== null) {
      session.sentiment.push(sentiment);
    }

    // History begrenzen
    if (session.history.length > this._maxSessionHistory) {
      session.history.shift();
    }
  }

  _getSessionSentimentTrend(sessionId) {
    const session = this._getSession(sessionId);
    const sentiments = session.sentiment;

    if (sentiments.length < 2) return 'stable';

    const recent = sentiments.slice(-3);
    const older = sentiments.slice(-6, -3);

    if (older.length === 0) return 'stable';

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    if (recentAvg - olderAvg > 0.2) return 'improving';
    if (olderAvg - recentAvg > 0.2) return 'declining';
    return 'stable';
  }

  // ==========================================================================
  // SENTIMENT ANALYSIS
  // ==========================================================================

  _analyzeSentiment(content) {
    const lower = content.toLowerCase();

    const negativeWords = {
      strong: ['furchtbar', 'schrecklich', 'katastrophal', 'unverschämt', 'betrug'],
      moderate: ['schlecht', 'enttäuscht', 'ärgerlich', 'frustriert', 'unzufrieden'],
      mild: ['problem', 'leider', 'schade', 'nicht gut']
    };

    const positiveWords = {
      strong: ['fantastisch', 'ausgezeichnet', 'perfekt', 'toll'],
      moderate: ['gut', 'super', 'zufrieden', 'danke'],
      mild: ['ok', 'in ordnung', 'passt']
    };

    let score = 0;

    for (const word of negativeWords.strong) if (lower.includes(word)) score -= 0.8;
    for (const word of negativeWords.moderate) if (lower.includes(word)) score -= 0.5;
    for (const word of negativeWords.mild) if (lower.includes(word)) score -= 0.2;

    for (const word of positiveWords.strong) if (lower.includes(word)) score += 0.8;
    for (const word of positiveWords.moderate) if (lower.includes(word)) score += 0.5;
    for (const word of positiveWords.mild) if (lower.includes(word)) score += 0.2;

    // Intensifiers
    if (lower.includes('sehr') || lower.includes('total') || lower.includes('absolut')) {
      score *= 1.5;
    }

    // Caps Lock = Intensität
    const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
    if (capsRatio > 0.5) score *= 1.3;

    return {
      score: Math.max(-1, Math.min(1, score)),
      label: score > 0.2 ? 'positive' : score < -0.2 ? 'negative' : 'neutral'
    };
  }

  // ==========================================================================
  // ESCALATION LOGIC
  // ==========================================================================

  _checkEscalation(content, sentiment, session) {
    const lower = content.toLowerCase();
    const reasons = [];

    // Keyword-basiert
    const escalationKeywords = ['manager', 'vorgesetzter', 'beschwerde', 'anwalt', 'presse'];
    for (const keyword of escalationKeywords) {
      if (lower.includes(keyword)) {
        reasons.push({ type: 'keyword', trigger: keyword });
      }
    }

    // Sentiment-basiert
    if (sentiment.score < -0.6) {
      reasons.push({ type: 'sentiment', trigger: `score: ${sentiment.score.toFixed(2)}` });
    }

    // Trend-basiert (NEU!)
    const trend = this._getSessionSentimentTrend(session.id);
    if (trend === 'declining' && session.history.length >= 3) {
      reasons.push({ type: 'sentiment_trend', trigger: 'declining' });
    }

    // Wiederholte Kontakte
    if (session.history.length >= 5) {
      reasons.push({ type: 'repeat_contact', trigger: `${session.history.length} messages` });
    }

    // VIP-Keywords
    if (lower.includes('enterprise') || lower.includes('premium')) {
      reasons.push({ type: 'vip', trigger: 'premium customer' });
    }

    return {
      shouldEscalate: reasons.length > 0,
      urgency: reasons.some(r => r.type === 'keyword' || r.type === 'vip') ? 'immediate' : 'standard',
      reasons
    };
  }

  // ==========================================================================
  // PRIORITY DETERMINATION
  // ==========================================================================

  _determinePriority(content, sentiment, session) {
    const lower = content.toLowerCase();

    // Critical
    if (lower.includes('dringend') || lower.includes('urgent') || lower.includes('notfall')) {
      return TICKET_PRIORITIES.CRITICAL;
    }

    // High - basierend auf Sentiment oder Trend
    const trend = this._getSessionSentimentTrend(session.id);
    if (sentiment.score < -0.5 || trend === 'declining') {
      return TICKET_PRIORITIES.HIGH;
    }

    // Medium
    if (lower.includes('wichtig') || session.history.length >= 3) {
      return TICKET_PRIORITIES.MEDIUM;
    }

    return TICKET_PRIORITIES.LOW;
  }

  // ==========================================================================
  // PROMPT BUILDING
  // ==========================================================================

  buildPrompt(task) {
    const sessionId = task.sessionId || 'default';
    const session = this._getSession(sessionId);

    const taskType = this._taskTypeDetector.detect(task.content, TASK_TYPES.CUSTOMER_INQUIRY);
    const sentiment = this._analyzeSentiment(task.content);
    const priority = this._determinePriority(task.content, sentiment, session);
    const escalation = this._checkEscalation(task.content, sentiment, session);
    const sentimentTrend = this._getSessionSentimentTrend(sessionId);

    // FAQ-Suche für Kontext
    let faqContext = '';
    if (this._faqInitialized && taskType.type === TASK_TYPES.FAQ_ANSWER) {
      const faqResults = this.searchFAQ(task.content, 3);
      if (faqResults.length > 0) {
        faqContext = '\n\nRELEVANTE FAQ-EINTRÄGE:\n' +
          faqResults.map((r, i) =>
            `${i + 1}. [Score: ${(r.score * 100).toFixed(0)}%]\n` +
            `   Frage: ${r.document.question}\n` +
            `   Antwort: ${r.document.answer}`
          ).join('\n\n');
      }
    }

    const systemPrompt = `Du bist ein professioneller Kundenservice-Agent.

EIGENSCHAFTEN: Freundlich, empathisch, lösungsorientiert, geduldig

AKTUELLE SITUATION:
• Task-Typ: ${taskType.type}
• Priorität: ${priority.name} (SLA: ${priority.slaHours}h)
• Sentiment: ${sentiment.label} (${sentiment.score.toFixed(2)})
• Sentiment-Trend: ${sentimentTrend}
• Kontakte in Session: ${session.history.length}
${escalation.shouldEscalate ? `\n⚠️ ESKALATION EMPFOHLEN (${escalation.urgency})
Gründe: ${escalation.reasons.map(r => r.type).join(', ')}` : ''}
${faqContext}

KONVERSATIONSHISTORIE:
${session.history.slice(-5).map(h => `[${h.role}]: ${h.content.substring(0, 100)}...`).join('\n')}

VERHALTENSREGELN:
1. Freundliche Begrüßung
2. Verständnis zeigen bei Problemen
3. ${faqContext ? 'FAQ-Antworten als Basis nutzen, aber personalisieren' : 'Konkrete Lösungen anbieten'}
4. Bei Eskalation: Professionell weiterleiten
5. Hilfsangebot zum Abschluss

${sentiment.label === 'negative' ? '⚠️ ACHTUNG: Kunde ist unzufrieden - besondere Empathie zeigen!' : ''}
${sentimentTrend === 'declining' ? '⚠️ ACHTUNG: Kundenzufriedenheit sinkt im Verlauf!' : ''}`;

    return { system: systemPrompt, user: task.content };
  }

  // ==========================================================================
  // EXECUTION
  // ==========================================================================

  async execute(task) {
    const sessionId = task.sessionId || 'default';
    const session = this._getSession(sessionId);

    const taskType = this._taskTypeDetector.detect(task.content, TASK_TYPES.CUSTOMER_INQUIRY);
    const sentiment = this._analyzeSentiment(task.content);
    const priority = this._determinePriority(task.content, sentiment, session);
    const escalation = this._checkEscalation(task.content, sentiment, session);

    // Zur Session hinzufügen
    this._addToSession(sessionId, 'user', task.content, sentiment.score);

    // FAQ-Suche
    const faqResults = this._faqInitialized ? this.searchFAQ(task.content, 3) : [];

    // Basis-Ausführung
    const result = await super.execute(task);

    // Antwort zur Session
    if (result.result) {
      this._addToSession(sessionId, 'assistant', result.result);
    }

    // Ticket-Nummer generieren
    const ticketNumber = (taskType.type === TASK_TYPES.TICKET_CREATE || escalation.shouldEscalate)
      ? IdGenerator.generateTicketNumber()
      : null;

    result.metadata = {
      taskType: taskType.type,

      sentiment: {
        score: sentiment.score,
        label: sentiment.label,
        trend: this._getSessionSentimentTrend(sessionId)
      },

      priority: {
        name: priority.name,
        slaHours: priority.slaHours
      },

      escalation,

      session: {
        id: sessionId,
        messageCount: session.history.length
      },

      faq: {
        searched: this._faqInitialized,
        resultsFound: faqResults.length,
        topMatch: faqResults[0] ? {
          question: faqResults[0].document.question,
          score: faqResults[0].score
        } : null
      },

      ticketNumber
    };

    return result;
  }
}

SupportAgent.TASK_TYPES = TASK_TYPES;
SupportAgent.TICKET_PRIORITIES = TICKET_PRIORITIES;
SupportAgent.FAQVectorStore = FAQVectorStore;

module.exports = SupportAgent;
