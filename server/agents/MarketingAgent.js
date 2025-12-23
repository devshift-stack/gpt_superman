/**
 * MarketingAgent - Erweiterte Version mit A/B-Testing
 * ====================================================
 *
 * NEUE FEATURES:
 * - A/B-Testing für Content-Varianten
 * - Automatische Performance-Messung
 * - Multi-Varianten Tests
 * - Statistisch signifikante Auswertung
 */

const BaseAgent = require('./BaseAgent');
const { LanguageDetector, TaskTypeDetector, SimpleCache } = require('./AgentUtils');

const TASK_TYPES = Object.freeze({
  SOCIAL_POST: 'social_post',
  AD_COPY: 'ad_copy',
  SEO_CONTENT: 'seo_content',
  EMAIL_MARKETING: 'email_marketing',
  CAMPAIGN_PLAN: 'campaign_plan'
});

const PLATFORMS = Object.freeze({
  instagram: { name: 'Instagram', maxChars: 2200, hashtagLimit: 30 },
  facebook: { name: 'Facebook', maxChars: 63206, hashtagLimit: 5 },
  linkedin: { name: 'LinkedIn', maxChars: 3000, hashtagLimit: 5 },
  twitter: { name: 'X/Twitter', maxChars: 280, hashtagLimit: 2 },
  tiktok: { name: 'TikTok', maxChars: 2200, hashtagLimit: 5 }
});

// ============================================================================
// A/B TESTING ENGINE
// ============================================================================

class ABTestEngine {
  constructor() {
    this.experiments = new Map();
    this.results = new Map();
  }

  /**
   * Neuen A/B Test erstellen
   */
  createExperiment(config) {
    const experiment = {
      id: config.id,
      name: config.name,
      variants: config.variants.map((v, idx) => ({
        id: v.id || `variant_${idx}`,
        name: v.name,
        weight: v.weight || 1 / config.variants.length,
        promptModifier: v.promptModifier,
        stats: {
          impressions: 0,
          conversions: 0,
          totalScore: 0,
          scores: []
        }
      })),
      status: 'active',
      createdAt: Date.now(),
      minSampleSize: config.minSampleSize || 30,
      confidenceLevel: config.confidenceLevel || 0.95
    };

    // Weights normalisieren
    const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
    experiment.variants.forEach(v => v.weight /= totalWeight);

    this.experiments.set(experiment.id, experiment);
    return experiment;
  }

  /**
   * Variante für User auswählen (gewichtet)
   */
  selectVariant(experimentId, userId = null) {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.status !== 'active') return null;

    // Deterministisch für gleichen User
    let random;
    if (userId) {
      random = this._hashToFloat(userId + experimentId);
    } else {
      random = Math.random();
    }

    let cumulative = 0;
    for (const variant of experiment.variants) {
      cumulative += variant.weight;
      if (random <= cumulative) {
        variant.stats.impressions++;
        return variant;
      }
    }

    return experiment.variants[0];
  }

  /**
   * Ergebnis für Variante erfassen
   */
  recordResult(experimentId, variantId, result) {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return;

    const variant = experiment.variants.find(v => v.id === variantId);
    if (!variant) return;

    // Score kann sein: 1-5 Rating, CTR, Conversion, etc.
    const score = typeof result === 'number' ? result : (result.score || 0);
    const isConversion = result.converted || score >= 4;

    variant.stats.scores.push(score);
    variant.stats.totalScore += score;
    if (isConversion) variant.stats.conversions++;

    // Automatisch Winner bestimmen wenn genug Samples
    this._checkForWinner(experimentId);
  }

  /**
   * Statistiken für Experiment abrufen
   */
  getExperimentStats(experimentId) {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return null;

    const stats = experiment.variants.map(v => ({
      id: v.id,
      name: v.name,
      impressions: v.stats.impressions,
      conversions: v.stats.conversions,
      conversionRate: v.stats.impressions > 0
        ? (v.stats.conversions / v.stats.impressions * 100).toFixed(2) + '%'
        : '0%',
      avgScore: v.stats.scores.length > 0
        ? (v.stats.totalScore / v.stats.scores.length).toFixed(2)
        : 'N/A',
      sampleSize: v.stats.scores.length
    }));

    const leader = this._findLeader(experiment);

    return {
      experimentId,
      name: experiment.name,
      status: experiment.status,
      variants: stats,
      leader: leader?.id,
      isSignificant: this._isStatisticallySignificant(experiment),
      recommendation: this._getRecommendation(experiment)
    };
  }

  /**
   * Experiment pausieren/beenden
   */
  endExperiment(experimentId, winnerId = null) {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return null;

    experiment.status = 'completed';
    experiment.completedAt = Date.now();
    experiment.winner = winnerId || this._findLeader(experiment)?.id;

    return experiment;
  }

  // Private Methoden

  _hashToFloat(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash) / 2147483647;
  }

  _findLeader(experiment) {
    let leader = null;
    let bestScore = -Infinity;

    for (const variant of experiment.variants) {
      if (variant.stats.scores.length === 0) continue;
      const avg = variant.stats.totalScore / variant.stats.scores.length;
      if (avg > bestScore) {
        bestScore = avg;
        leader = variant;
      }
    }

    return leader;
  }

  _isStatisticallySignificant(experiment) {
    // Vereinfachte Prüfung - in Produktion: Chi-Square oder T-Test
    const variants = experiment.variants.filter(v => v.stats.scores.length >= experiment.minSampleSize);

    if (variants.length < 2) return false;

    const scores = variants.map(v => ({
      avg: v.stats.totalScore / v.stats.scores.length,
      n: v.stats.scores.length,
      variance: this._variance(v.stats.scores)
    }));

    // Z-Score zwischen Top 2
    scores.sort((a, b) => b.avg - a.avg);
    const [a, b] = scores;

    const pooledSE = Math.sqrt(a.variance / a.n + b.variance / b.n);
    if (pooledSE === 0) return true;

    const zScore = Math.abs(a.avg - b.avg) / pooledSE;

    // 95% Konfidenz = z > 1.96
    return zScore > 1.96;
  }

  _variance(arr) {
    if (arr.length === 0) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
  }

  _checkForWinner(experimentId) {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.status !== 'active') return;

    // Alle Varianten haben genug Samples?
    const allHaveMinSamples = experiment.variants.every(
      v => v.stats.scores.length >= experiment.minSampleSize
    );

    if (allHaveMinSamples && this._isStatisticallySignificant(experiment)) {
      // Auto-Complete mit Winner
      const leader = this._findLeader(experiment);
      experiment.status = 'auto_completed';
      experiment.winner = leader?.id;
      experiment.completedAt = Date.now();
    }
  }

  _getRecommendation(experiment) {
    if (experiment.status === 'completed' || experiment.status === 'auto_completed') {
      const winner = experiment.variants.find(v => v.id === experiment.winner);
      return `Verwende "${winner?.name}" - statistisch signifikant besser.`;
    }

    const totalSamples = experiment.variants.reduce((sum, v) => sum + v.stats.scores.length, 0);
    const neededSamples = experiment.variants.length * experiment.minSampleSize;

    if (totalSamples < neededSamples) {
      return `Noch ${neededSamples - totalSamples} Samples nötig für signifikante Ergebnisse.`;
    }

    if (!this._isStatisticallySignificant(experiment)) {
      return 'Kein signifikanter Unterschied - mehr Daten sammeln oder Varianten überarbeiten.';
    }

    return 'Test kann beendet werden.';
  }
}

// ============================================================================
// MARKETING AGENT
// ============================================================================

class MarketingAgent extends BaseAgent {
  constructor() {
    super({
      id: 'marketing',
      name: 'Marketing Agent',
      type: 'marketing',
      version: '2.1.0',
      description: 'Erstellt Marketing-Content mit A/B-Testing für optimale Performance.',
      primary: { provider: 'openai', model: 'gpt-4o' },
      fallback: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
      capabilities: Object.values(TASK_TYPES),
      keywords: [
        'marketing', 'social media', 'instagram', 'facebook', 'werbung',
        'ad', 'seo', 'content', 'post', 'kampagne', 'newsletter'
      ],
      costs: { input: 5, output: 15 },
      feedback: { enabled: true, minSamples: 5 }
    });

    this._languageDetector = new LanguageDetector();
    this._taskTypeDetector = new TaskTypeDetector({
      [TASK_TYPES.SOCIAL_POST]: ['post', 'beitrag', 'instagram', 'facebook'],
      [TASK_TYPES.AD_COPY]: ['werbung', 'anzeige', 'ad', 'werbetext'],
      [TASK_TYPES.SEO_CONTENT]: ['seo', 'google', 'ranking', 'keywords'],
      [TASK_TYPES.EMAIL_MARKETING]: ['newsletter', 'email', 'mailing'],
      [TASK_TYPES.CAMPAIGN_PLAN]: ['kampagne', 'campaign', 'strategie']
    });

    // NEU: A/B Testing Engine
    this._abTestEngine = new ABTestEngine();
    this._activeTests = new Map(); // taskId -> experimentId

    this._cache = new SimpleCache(50, 120000);
  }

  // ==========================================================================
  // A/B TESTING API
  // ==========================================================================

  /**
   * A/B Test für Content erstellen
   *
   * @example
   * agent.createABTest({
   *   id: 'headline_test_1',
   *   name: 'Headline Variations',
   *   variants: [
   *     { id: 'control', name: 'Standard', promptModifier: null },
   *     { id: 'urgency', name: 'Mit Dringlichkeit', promptModifier: 'Füge Dringlichkeit hinzu' },
   *     { id: 'social_proof', name: 'Mit Social Proof', promptModifier: 'Nutze Social Proof' }
   *   ]
   * });
   */
  createABTest(config) {
    const experiment = this._abTestEngine.createExperiment(config);

    this.emit('abtest:created', {
      agentId: this.id,
      experimentId: experiment.id,
      variantCount: experiment.variants.length
    });

    return experiment;
  }

  /**
   * Content mit A/B Test generieren
   */
  async executeWithABTest(task, experimentId) {
    const variant = this._abTestEngine.selectVariant(experimentId, task.userId);

    if (!variant) {
      // Kein aktives Experiment - normal ausführen
      return this.execute(task);
    }

    // Task mit Variante modifizieren
    const modifiedTask = {
      ...task,
      _abTest: {
        experimentId,
        variantId: variant.id,
        variantName: variant.name,
        promptModifier: variant.promptModifier
      }
    };

    this._activeTests.set(task.id || 'default', { experimentId, variantId: variant.id });

    const result = await this.execute(modifiedTask);

    result.metadata.abTest = {
      experimentId,
      variantId: variant.id,
      variantName: variant.name
    };

    this.emit('abtest:impression', {
      agentId: this.id,
      experimentId,
      variantId: variant.id
    });

    return result;
  }

  /**
   * A/B Test Ergebnis erfassen
   */
  recordABTestResult(taskId, result) {
    const testInfo = this._activeTests.get(taskId);
    if (!testInfo) return;

    this._abTestEngine.recordResult(testInfo.experimentId, testInfo.variantId, result);
    this._activeTests.delete(taskId);

    this.emit('abtest:result', {
      agentId: this.id,
      experimentId: testInfo.experimentId,
      variantId: testInfo.variantId,
      result
    });
  }

  /**
   * A/B Test Statistiken abrufen
   */
  getABTestStats(experimentId) {
    return this._abTestEngine.getExperimentStats(experimentId);
  }

  /**
   * A/B Test beenden
   */
  endABTest(experimentId, winnerId = null) {
    const result = this._abTestEngine.endExperiment(experimentId, winnerId);

    this.emit('abtest:ended', {
      agentId: this.id,
      experimentId,
      winner: result?.winner
    });

    return result;
  }

  /**
   * Alle aktiven Tests auflisten
   */
  listActiveABTests() {
    const tests = [];
    for (const [id, experiment] of this._abTestEngine.experiments) {
      if (experiment.status === 'active') {
        tests.push(this.getABTestStats(id));
      }
    }
    return tests;
  }

  // ==========================================================================
  // PROMPT BUILDING
  // ==========================================================================

  _detectPlatform(content) {
    const lower = content.toLowerCase();
    if (lower.includes('instagram') || lower.includes('insta')) return 'instagram';
    if (lower.includes('facebook') || lower.includes('fb')) return 'facebook';
    if (lower.includes('linkedin')) return 'linkedin';
    if (lower.includes('twitter') || lower.includes(' x ')) return 'twitter';
    if (lower.includes('tiktok')) return 'tiktok';
    return 'instagram';
  }

  _detectTone(content) {
    const lower = content.toLowerCase();
    if (lower.includes('professionell') || lower.includes('b2b')) return 'professional';
    if (lower.includes('locker') || lower.includes('casual')) return 'casual';
    if (lower.includes('luxus') || lower.includes('premium')) return 'luxury';
    return 'neutral';
  }

  buildPrompt(task) {
    const language = this._languageDetector.detect(task.content);
    const taskType = this._taskTypeDetector.detect(task.content, TASK_TYPES.SOCIAL_POST);
    const platform = this._detectPlatform(task.content);
    const tone = this._detectTone(task.content);
    const platformConfig = PLATFORMS[platform];

    // A/B Test Modifier anwenden
    let abTestSection = '';
    if (task._abTest?.promptModifier) {
      abTestSection = `\n\n⚡ A/B TEST VARIANTE: ${task._abTest.variantName}
ANWEISUNG: ${task._abTest.promptModifier}`;
    }

    const systemPrompt = `Du bist ein erfahrener Marketing-Experte und Content Creator.

SPRACHE: ${language.language.toUpperCase()}
TASK-TYP: ${taskType.type}
PLATFORM: ${platformConfig.name}
TONALITÄT: ${tone}

PLATFORM-REGELN für ${platformConfig.name}:
• Maximale Zeichen: ${platformConfig.maxChars}
• Hashtag-Limit: ${platformConfig.hashtagLimit}
${abTestSection}

AUFGABEN:

1. SOCIAL_POST:
   - Hook in der ersten Zeile
   - Storytelling nutzen
   - Call-to-Action einbauen

2. AD_COPY:
   - Starke Headline mit Benefit
   - Problem → Lösung Framework
   - Klarer CTA

3. SEO_CONTENT:
   - Keyword-optimiert
   - Strukturiert mit H2/H3
   - Meta-Description vorschlagen

4. EMAIL_MARKETING:
   - Betreffzeile (max 50 Zeichen)
   - Preheader-Text
   - Klarer CTA-Button

QUALITÄTSREGELN:
1. Authentisch und menschlich
2. Zielgruppen-passend
3. Keine leeren Phrasen`;

    return { system: systemPrompt, user: task.content };
  }

  // ==========================================================================
  // EXECUTION
  // ==========================================================================

  async execute(task) {
    const language = this._languageDetector.detect(task.content);
    const taskType = this._taskTypeDetector.detect(task.content, TASK_TYPES.SOCIAL_POST);
    const platform = this._detectPlatform(task.content);
    const tone = this._detectTone(task.content);

    const result = await super.execute(task);

    result.metadata = {
      language: language.language,
      taskType: taskType.type,
      platform,
      platformConfig: PLATFORMS[platform],
      tone,
      // A/B Test Info wenn vorhanden
      ...(task._abTest && { abTest: task._abTest })
    };

    return result;
  }
}

MarketingAgent.TASK_TYPES = TASK_TYPES;
MarketingAgent.PLATFORMS = PLATFORMS;
MarketingAgent.ABTestEngine = ABTestEngine;

module.exports = MarketingAgent;
