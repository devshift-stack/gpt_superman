/**
 * TaskRouter v2.1 - Intelligentes Task-Routing zu Agenten
 *
 * Entscheidungslogik:
 * 1. Expliziter Task-Typ prüfen
 * 2. Keyword-Matching im Content
 * 3. Load Balancing (Agent mit geringster Last)
 * 4. Fallback auf Default-Agent
 */

class TaskRouter {
  constructor(agents, config = {}) {
    this.agents = agents; // Map of agent instances
    this.config = {
      defaultAgent: config.defaultAgent || 'summary',
      matchThreshold: config.matchThreshold || 0.3,
      ...config,
    };

    // Keyword-Mappings für v2.1 Agents
    this.keywordMappings = {
      translator: {
        keywords: [
          'übersetze', 'translate', 'übersetzung', 'translation',
          'sprache', 'language', 'englisch', 'english', 'deutsch', 'german',
          'französisch', 'french', 'spanisch', 'spanish', 'italienisch', 'italian',
          'russisch', 'russian', 'arabisch', 'arabic', 'chinesisch', 'chinese',
          'japanisch', 'japanese', 'koreanisch', 'korean', 'türkisch', 'turkish',
          'polnisch', 'polish', 'niederländisch', 'dutch', 'portugiesisch', 'portuguese',
          'bosnisch', 'bosnian', 'serbisch', 'serbian', 'kroatisch', 'croatian',
          'in english', 'auf deutsch', 'ins deutsche', 'into english',
        ],
        weight: 1.3,
      },
      support: {
        keywords: [
          'hilfe', 'help', 'support', 'problem', 'fehler', 'error',
          'frage', 'question', 'wie kann ich', 'how do i', 'how can i',
          'funktioniert nicht', 'not working', 'kaputt', 'broken',
          'kundenservice', 'customer service', 'ticket', 'anfrage',
          'beschwerde', 'complaint', 'reklamation', 'rückgabe', 'return',
          'passwort', 'password', 'zugang', 'access', 'login', 'konto', 'account',
        ],
        weight: 1.1,
      },
      marketing: {
        keywords: [
          'marketing', 'werbung', 'advertising', 'kampagne', 'campaign',
          'zielgruppe', 'target audience', 'conversion', 'click', 'ctr',
          'a/b test', 'ab test', 'split test', 'variante', 'variant',
          'headline', 'überschrift', 'slogan', 'tagline', 'copy',
          'social media', 'facebook', 'instagram', 'linkedin', 'twitter',
          'newsletter', 'email marketing', 'landing page', 'funnel',
          'roi', 'reach', 'impression', 'engagement', 'viral',
        ],
        weight: 1.1,
      },
      data: {
        keywords: [
          'daten', 'data', 'analyse', 'analysis', 'analysiere', 'analyze',
          'sql', 'query', 'abfrage', 'database', 'datenbank',
          'mysql', 'postgresql', 'sqlite', 'oracle', 'mssql',
          'tabelle', 'table', 'spalte', 'column', 'zeile', 'row',
          'chart', 'diagramm', 'graph', 'visualisierung', 'visualization',
          'report', 'bericht', 'dashboard', 'kpi', 'metrik', 'metric',
          'statistik', 'statistics', 'durchschnitt', 'average', 'summe', 'sum',
        ],
        weight: 1.2,
      },
      finance: {
        keywords: [
          'finanzen', 'finance', 'geld', 'money', 'betrag', 'amount',
          'steuer', 'tax', 'mwst', 'vat', 'mehrwertsteuer', 'pdv',
          'währung', 'currency', 'euro', 'eur', 'dollar', 'usd', 'chf', 'bam', 'rsd',
          'rechnung', 'invoice', 'berechne', 'calculate', 'kalkulation',
          'budget', 'kosten', 'cost', 'preis', 'price', 'gewinn', 'profit',
          'verlust', 'loss', 'bilanz', 'balance', 'umsatz', 'revenue',
          'zinsen', 'interest', 'kredit', 'loan', 'investition', 'investment',
        ],
        weight: 1.2,
      },
      legal: {
        keywords: [
          'recht', 'legal', 'gesetz', 'law', 'paragraph', 'artikel', 'article',
          'vertrag', 'contract', 'vereinbarung', 'agreement', 'klausel', 'clause',
          'dsgvo', 'gdpr', 'datenschutz', 'privacy', 'compliance',
          'agb', 'terms', 'bedingungen', 'conditions', 'nutzungsbedingungen',
          'haftung', 'liability', 'gewährleistung', 'warranty', 'garantie',
          'anwalt', 'lawyer', 'gericht', 'court', 'klage', 'lawsuit',
          'impressum', 'imprint', 'widerruf', 'revocation', 'kündigung',
        ],
        weight: 1.2,
      },
      summary: {
        keywords: [
          'zusammenfassung', 'summary', 'zusammenfassen', 'summarize',
          'fasse zusammen', 'kurz', 'brief', 'überblick', 'overview',
          'kernpunkte', 'key points', 'highlights', 'wichtigste', 'main',
          'executive', 'bullets', 'stichpunkte', 'bullet points',
          'tldr', 'tl;dr', 'kurzfassung', 'abstract', 'synopsis',
          'komprimier', 'compress', 'kürze', 'shorten', 'reduziere', 'reduce',
        ],
        weight: 1.0,
      },
      influencer: {
        keywords: [
          'influencer', 'social media', 'instagram', 'facebook', 'tiktok',
          'content', 'post', 'caption', 'hashtag', 'hashtags',
          'follower', 'followers', 'engagement', 'reichweite', 'reach',
          'profil', 'profile', 'analyse', 'analyze', 'analysieren',
          'generiere', 'generate', 'erstelle', 'create', 'posten', 'posting',
          'scheduling', 'planen', 'schedule', 'veröffentlichen', 'publish',
          'stil', 'style', 'lernen', 'learn', 'automatisch', 'auto',
          'bild', 'image', 'foto', 'photo', 'story', 'stories', 'reel', 'reels',
        ],
        weight: 1.2,
      },
    };

    // Type-to-Agent Mapping für v2.1
    this.typeMapping = {
      // Translator
      'translator': 'translator',
      'translation': 'translator',
      'übersetze': 'translator',
      'übersetzung': 'translator',
      'translate': 'translator',
      // Support
      'support': 'support',
      'hilfe': 'support',
      'help': 'support',
      'customer': 'support',
      // Marketing
      'marketing': 'marketing',
      'werbung': 'marketing',
      'campaign': 'marketing',
      'kampagne': 'marketing',
      // Data
      'data': 'data',
      'daten': 'data',
      'sql': 'data',
      'analyse': 'data',
      'analysis': 'data',
      // Finance
      'finance': 'finance',
      'finanzen': 'finance',
      'steuer': 'finance',
      'tax': 'finance',
      'rechnung': 'finance',
      // Legal
      'legal': 'legal',
      'recht': 'legal',
      'vertrag': 'legal',
      'contract': 'legal',
      'compliance': 'legal',
      // Summary
      'summary': 'summary',
      'zusammenfassung': 'summary',
      'summarize': 'summary',
      // Influencer
      'influencer': 'influencer',
      'social media': 'influencer',
      'instagram': 'influencer',
      'facebook': 'influencer',
      'content': 'influencer',
      'hashtag': 'influencer',
      'posting': 'influencer',
    };

    // Routing Statistics
    this.stats = {
      totalRouted: 0,
      byAgent: {},
      byMethod: {
        type: 0,
        keywords: 0,
        load: 0,
        default: 0,
      },
    };

    // Initialize agent stats
    Object.keys(this.keywordMappings).forEach(agent => {
      this.stats.byAgent[agent] = 0;
    });
  }

  /**
   * Routet einen Task zum passenden Agenten
   */
  route(task) {
    const startTime = Date.now();
    const content = task.content || task.message || '';
    const taskType = task.type || '';

    let agentId = null;
    let routingMethod = 'default';
    let score = 0;
    let scores = {};

    // 1. Versuche explizites Type-Matching
    if (taskType && this.typeMapping[taskType.toLowerCase()]) {
      agentId = this.typeMapping[taskType.toLowerCase()];
      routingMethod = 'type';
      score = 1.0;
    }

    // 2. Wenn kein Match, versuche Keyword-Matching
    if (!agentId) {
      const keywordResult = this.routeByKeywords(content);
      scores = keywordResult.scores;

      if (keywordResult.agentId && keywordResult.score >= this.config.matchThreshold) {
        agentId = keywordResult.agentId;
        score = keywordResult.score;
        routingMethod = 'keywords';
      }
    }

    // 3. Wenn immer noch kein Match, nutze Load Balancing
    if (!agentId) {
      const loadResult = this.routeByLoad();
      if (loadResult) {
        agentId = loadResult;
        routingMethod = 'load';
        score = 0.5;
      }
    }

    // 4. Fallback auf Default-Agent
    if (!agentId) {
      agentId = this.config.defaultAgent;
      routingMethod = 'default';
      score = 0.3;
    }

    // Update Stats
    this.updateStats(agentId, routingMethod);

    const routingTime = Date.now() - startTime;

    console.log(`[router] Task routed to ${agentId} via ${routingMethod} (score: ${score.toFixed(2)}, ${routingTime}ms)`);

    return {
      agentId,
      score,
      routingMethod,
      routingTime,
      allScores: scores,
      estimatedTime: this.estimateTime(agentId, task),
    };
  }

  /**
   * Route nach Keywords im Content
   */
  routeByKeywords(content) {
    if (!content) {
      return { agentId: null, score: 0, scores: {} };
    }

    const contentLower = content.toLowerCase();
    const scores = {};

    // Calculate score for each agent
    for (const [agentId, config] of Object.entries(this.keywordMappings)) {
      let matchCount = 0;
      let matchedKeywords = [];

      for (const keyword of config.keywords) {
        if (contentLower.includes(keyword.toLowerCase())) {
          matchCount++;
          matchedKeywords.push(keyword);
        }
      }

      // Normalized score with weight
      const rawScore = config.keywords.length > 0
        ? (matchCount / config.keywords.length) * config.weight
        : 0;

      scores[agentId] = {
        score: rawScore,
        matchCount,
        matchedKeywords: matchedKeywords.slice(0, 5), // Top 5 matches
      };
    }

    // Find best match
    let bestAgent = null;
    let bestScore = 0;

    for (const [agentId, data] of Object.entries(scores)) {
      if (data.score > bestScore) {
        bestScore = data.score;
        bestAgent = agentId;
      }
    }

    return {
      agentId: bestAgent,
      score: bestScore,
      scores,
    };
  }

  /**
   * Route nach Load (Agent mit geringster Last)
   */
  routeByLoad() {
    if (!this.agents || Object.keys(this.agents).length === 0) {
      return null;
    }

    let lowestLoadAgent = null;
    let lowestLoad = Infinity;

    for (const [agentId, agent] of Object.entries(this.agents)) {
      const currentTasks = agent.currentTasks?.size || agent.taskCount || 0;

      if (currentTasks < lowestLoad) {
        lowestLoad = currentTasks;
        lowestLoadAgent = agentId;
      }
    }

    return lowestLoadAgent;
  }

  /**
   * Schätzt die Bearbeitungszeit
   */
  estimateTime(agentId, task) {
    // Base estimates in ms für v2.1 Agents
    const baseEstimates = {
      translator: 5000,
      support: 6000,
      marketing: 8000,
      data: 10000,
      finance: 6000,
      legal: 8000,
      summary: 5000,
      influencer: 12000,
    };

    let estimate = baseEstimates[agentId] || 6000;

    // Adjust by content length
    const content = task.content || task.message || '';
    if (content.length > 2000) {
      estimate *= 1.3;
    } else if (content.length > 5000) {
      estimate *= 1.6;
    }

    return Math.round(estimate);
  }

  /**
   * Update Routing Statistics
   */
  updateStats(agentId, method) {
    this.stats.totalRouted++;
    this.stats.byAgent[agentId] = (this.stats.byAgent[agentId] || 0) + 1;
    this.stats.byMethod[method] = (this.stats.byMethod[method] || 0) + 1;
  }

  /**
   * Holt Routing-Statistiken
   */
  getStats() {
    const distribution = {};

    if (this.stats.totalRouted > 0) {
      for (const [agentId, count] of Object.entries(this.stats.byAgent)) {
        distribution[agentId] = {
          count,
          percentage: ((count / this.stats.totalRouted) * 100).toFixed(1) + '%',
        };
      }
    }

    return {
      ...this.stats,
      distribution,
    };
  }

  /**
   * Analysiert einen Text und gibt Routing-Empfehlung
   */
  analyze(content) {
    const result = this.routeByKeywords(content);

    // Sort agents by score
    const ranked = Object.entries(result.scores)
      .map(([agent, data]) => ({
        agent,
        ...data,
      }))
      .sort((a, b) => b.score - a.score);

    return {
      recommended: result.agentId,
      score: result.score,
      ranking: ranked,
    };
  }
}

module.exports = TaskRouter;
