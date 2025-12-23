/**
 * TaskRouter - Intelligentes Task-Routing zu Agenten
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
      defaultAgent: config.defaultAgent || 'creative',
      matchThreshold: config.matchThreshold || 0.3,
      ...config,
    };

    // Keyword-Mappings für jeden Agent
    this.keywordMappings = {
      research: {
        keywords: [
          'recherche', 'suche', 'finde', 'information', 'fakten', 'erklär',
          'was ist', 'wer ist', 'wie funktioniert', 'warum', 'definition',
          'search', 'find', 'research', 'explain', 'what is', 'how does',
          'zusammenfass', 'summarize', 'vergleich', 'compare', 'unterschied',
          'hintergrund', 'kontext', 'quelle', 'source', 'wiki', 'google',
        ],
        weight: 1.0,
      },
      coding: {
        keywords: [
          'code', 'programmier', 'funktion', 'klasse', 'bug', 'fehler', 'fix',
          'javascript', 'python', 'typescript', 'react', 'node', 'api',
          'algorithm', 'debug', 'refactor', 'test', 'unit test', 'implement',
          'schreib code', 'erstelle funktion', 'entwickle', 'script',
          'json', 'html', 'css', 'sql', 'database', 'backend', 'frontend',
          'git', 'deploy', 'docker', 'kubernetes', 'server', 'error',
        ],
        weight: 1.2, // Slightly higher weight for precise matches
      },
      creative: {
        keywords: [
          'schreib', 'text', 'artikel', 'blog', 'story', 'geschichte',
          'marketing', 'werbung', 'slogan', 'headline', 'überschrift',
          'email', 'e-mail', 'newsletter', 'social media', 'post', 'tweet',
          'kreativ', 'idee', 'brainstorm', 'content', 'copy', 'copywriting',
          'beschreibung', 'description', 'produkttext', 'about', 'bio',
          'write', 'create', 'compose', 'draft', 'formulier',
        ],
        weight: 1.0,
      },
      analysis: {
        keywords: [
          'analyse', 'analysier', 'daten', 'data', 'statistik', 'trend',
          'chart', 'graph', 'report', 'bericht', 'kpi', 'metrik', 'metric',
          'prognose', 'forecast', 'vorhersage', 'sentiment', 'bewert',
          'evaluate', 'assess', 'measure', 'benchmark', 'comparison',
          'excel', 'tabelle', 'zahlen', 'number', 'prozent', 'wachstum',
          'umsatz', 'revenue', 'kosten', 'cost', 'roi', 'performance',
        ],
        weight: 1.0,
      },
      recruiter: {
        keywords: [
          'stelle', 'job', 'position', 'stellenanzeige', 'jobanzeige',
          'kandidat', 'bewerber', 'bewerbung', 'cv', 'lebenslauf', 'resume',
          'interview', 'vorstellungsgespräch', 'fragen', 'screening',
          'talent', 'recruiting', 'hr', 'personal', 'einstellung', 'hire',
          'onboarding', 'einarbeitung', 'employer branding', 'karriere',
          'gehalt', 'salary', 'benefits', 'team', 'kultur', 'culture',
        ],
        weight: 1.1,
      },
      sales: {
        keywords: [
          'verkauf', 'vertrieb', 'sales', 'deal', 'kunde', 'customer',
          'pitch', 'präsentation', 'angebot', 'proposal', 'quote',
          'einwand', 'objection', 'preis', 'price', 'rabatt', 'discount',
          'closing', 'abschluss', 'lead', 'prospect', 'akquise', 'cold',
          'follow-up', 'nachfassen', 'verhandlung', 'negotiation',
          'crm', 'pipeline', 'conversion', 'upsell', 'cross-sell',
        ],
        weight: 1.1,
      },
    };

    // Type-to-Agent Mapping
    this.typeMapping = {
      'research': 'research',
      'recherche': 'research',
      'suche': 'research',
      'coding': 'coding',
      'code': 'coding',
      'entwicklung': 'coding',
      'creative': 'creative',
      'kreativ': 'creative',
      'content': 'creative',
      'text': 'creative',
      'analysis': 'analysis',
      'analyse': 'analysis',
      'data': 'analysis',
      'daten': 'analysis',
      'recruiter': 'recruiter',
      'recruiting': 'recruiter',
      'hr': 'recruiter',
      'personal': 'recruiter',
      'sales': 'sales',
      'vertrieb': 'sales',
      'verkauf': 'sales',
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
    // Base estimates in ms
    const baseEstimates = {
      research: 8000,
      coding: 12000,
      creative: 6000,
      analysis: 10000,
      recruiter: 8000,
      sales: 6000,
    };

    let estimate = baseEstimates[agentId] || 8000;

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
