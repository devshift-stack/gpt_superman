/**
 * Agents API Routes v2.1 - Mit neuen spezialisierten Agents
 */

const express = require('express');
const {
  TranslatorAgent,
  SupportAgent,
  MarketingAgent,
  DataAgent,
  FinanceAgent,
  LegalAgent,
  SummaryAgent
} = require('../agents');
const ArenaProPlus = require('../../supervisor/ArenaProPlus');
const TaskRouter = require('../../supervisor/TaskRouter');
const { getAvailableProviders } = require('../../supervisor/src/providers');

// Agent configurations v2.1
const AGENT_CONFIGS = {
  translator: {
    id: 'translator',
    name: 'Translator Agent',
    type: 'translator',
    description: 'Übersetzt Texte in 18 Sprachen mit Glossar-Support und Confidence Scores.',
    capabilities: ['translate', 'detect_language', 'glossary', 'rtl_support'],
    keywords: ['übersetze', 'translate', 'übersetzung', 'translation', 'sprache', 'language', 'englisch', 'deutsch', 'französisch'],
    primary: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
    fallback: { provider: 'openai', model: 'gpt-4o' },
    settings: { timeout: 60000 },
    costs: { input: 3.00, output: 15.00 }
  },
  support: {
    id: 'support',
    name: 'Support Agent',
    type: 'support',
    description: 'Kundenservice mit FAQ-Suche, Session-Management und Eskalationslogik.',
    capabilities: ['faq_search', 'session_management', 'sentiment_tracking', 'escalation'],
    keywords: ['hilfe', 'help', 'support', 'problem', 'frage', 'question', 'kundenservice', 'ticket'],
    primary: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
    fallback: { provider: 'openai', model: 'gpt-4o' },
    settings: { timeout: 60000 },
    costs: { input: 3.00, output: 15.00 }
  },
  marketing: {
    id: 'marketing',
    name: 'Marketing Agent',
    type: 'marketing',
    description: 'Marketing mit A/B Testing und Statistical Significance.',
    capabilities: ['ab_testing', 'campaign_analysis', 'copywriting', 'audience_targeting'],
    keywords: ['marketing', 'kampagne', 'campaign', 'werbung', 'ad', 'copy', 'headline', 'ab test', 'conversion'],
    primary: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
    fallback: { provider: 'openai', model: 'gpt-4o' },
    settings: { timeout: 60000 },
    costs: { input: 3.00, output: 15.00 }
  },
  data: {
    id: 'data',
    name: 'Data Agent',
    type: 'data',
    description: 'Datenanalyse mit SQL-Generierung und Chart-Empfehlungen.',
    capabilities: ['sql_generation', 'chart_recommendation', 'data_analysis', 'multi_db'],
    keywords: ['daten', 'data', 'sql', 'query', 'analyse', 'analysis', 'chart', 'database', 'tabelle'],
    primary: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
    fallback: { provider: 'openai', model: 'gpt-4o' },
    settings: { timeout: 90000 },
    costs: { input: 3.00, output: 15.00 }
  },
  finance: {
    id: 'finance',
    name: 'Finance Agent',
    type: 'finance',
    description: 'Finanzen mit Multi-Währung (EUR, BAM, RSD, CHF) und Steuerberechnung.',
    capabilities: ['multi_currency', 'tax_calculation', 'financial_analysis', 'budgeting'],
    keywords: ['finanzen', 'finance', 'geld', 'money', 'steuer', 'tax', 'mwst', 'währung', 'currency', 'budget', 'rechnung'],
    primary: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
    fallback: { provider: 'openai', model: 'gpt-4o' },
    settings: { timeout: 60000 },
    costs: { input: 3.00, output: 15.00 }
  },
  legal: {
    id: 'legal',
    name: 'Legal Agent',
    type: 'legal',
    description: 'Recht mit Multi-Jurisdiktion (DE, AT, CH, BA, RS, HR).',
    capabilities: ['contract_analysis', 'compliance_check', 'multi_jurisdiction', 'gdpr'],
    keywords: ['recht', 'legal', 'vertrag', 'contract', 'gesetz', 'law', 'dsgvo', 'gdpr', 'compliance', 'agb'],
    primary: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
    fallback: { provider: 'openai', model: 'gpt-4o' },
    settings: { timeout: 60000 },
    costs: { input: 3.00, output: 15.00 }
  },
  summary: {
    id: 'summary',
    name: 'Summary Agent',
    type: 'summary',
    description: 'Zusammenfassungen in verschiedenen Styles (Executive, Bullets, Academic).',
    capabilities: ['executive_summary', 'bullet_points', 'academic_summary', 'compression_analysis'],
    keywords: ['zusammenfassung', 'summary', 'fasse zusammen', 'summarize', 'kurzfassung', 'überblick', 'overview'],
    primary: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
    fallback: { provider: 'openai', model: 'gpt-4o' },
    settings: { timeout: 60000 },
    costs: { input: 3.00, output: 15.00 }
  }
};

// Agent instances
const agents = {};
let taskRouter = null;
let arenaProPlus = null;
let initialized = false;

async function initializeAgents() {
  if (initialized) return;

  console.log('[agents] Initializing v2.1 agents...');

  const AgentClasses = {
    translator: TranslatorAgent,
    support: SupportAgent,
    marketing: MarketingAgent,
    data: DataAgent,
    finance: FinanceAgent,
    legal: LegalAgent,
    summary: SummaryAgent
  };

  for (const [type, config] of Object.entries(AGENT_CONFIGS)) {
    try {
      const AgentClass = AgentClasses[type];
      agents[type] = new AgentClass(config);
      await agents[type].initialize();
      console.log('[agents] ' + config.name + ' initialized');
    } catch (error) {
      console.error('[agents] Failed to initialize ' + type + ':', error.message);
    }
  }

  // Initialize TaskRouter
  taskRouter = new TaskRouter(agents);
  console.log('[agents] TaskRouter initialized');

  // Initialize Arena Pro+
  arenaProPlus = new ArenaProPlus(agents);
  console.log('[agents] Arena Pro+ initialized');

  initialized = true;
  console.log('[agents] All systems ready (' + Object.keys(agents).length + ' agents v2.1)');
}

function createAgentsRouter() {
  const router = express.Router();

  // Initialize agents on first request
  router.use(async (req, res, next) => {
    if (!initialized) {
      await initializeAgents();
    }
    next();
  });

  // ============================================
  // AGENT ENDPOINTS
  // ============================================

  // List all agents with health
  router.get('/agents', async (req, res) => {
    try {
      const agentList = Object.values(agents).map(agent => agent.getHealth());
      res.json({ ok: true, agents: agentList });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Get single agent health
  router.get('/agents/:id', async (req, res) => {
    const agent = agents[req.params.id];
    if (!agent) {
      return res.status(404).json({ ok: false, error: 'Agent not found' });
    }
    res.json({ ok: true, ...agent.getHealth() });
  });

  // Get agent health status
  router.get('/agents/:id/health', async (req, res) => {
    const agent = agents[req.params.id];
    if (!agent) {
      return res.status(404).json({ ok: false, error: 'Agent not found' });
    }
    res.json({ ok: true, ...agent.getHealth() });
  });

  // Reset agent circuit breaker
  router.post('/agents/:id/reset', async (req, res) => {
    const agent = agents[req.params.id];
    if (!agent) {
      return res.status(404).json({ ok: false, error: 'Agent not found' });
    }
    try {
      agent.resetCircuitBreaker();
      res.json({ ok: true, message: 'Circuit breaker reset', agentId: req.params.id });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Execute task on specific agent
  router.post('/agents/:id/execute', async (req, res) => {
    const agent = agents[req.params.id];
    if (!agent) {
      return res.status(404).json({ ok: false, error: 'Agent not found' });
    }

    const { message, options } = req.body;
    if (!message) {
      return res.status(400).json({ ok: false, error: 'Message is required' });
    }

    try {
      const result = await agent.execute({
        content: message,
        type: req.params.id,
        ...options
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error('[agent_execute_error]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ============================================
  // AUTO-ROUTING ENDPOINT
  // ============================================

  // Auto-route: Automatically select best agent
  router.post('/auto', async (req, res) => {
    const { message, options } = req.body;
    if (!message) {
      return res.status(400).json({ ok: false, error: 'Message is required' });
    }

    try {
      // Route to best agent
      const routing = taskRouter.route({ content: message, ...options });
      const agent = agents[routing.agentId];

      if (!agent) {
        return res.status(500).json({ ok: false, error: 'No suitable agent found' });
      }

      // Execute on selected agent
      const result = await agent.execute({
        content: message,
        type: routing.agentId,
        ...options
      });

      res.json({
        ok: true,
        routing: {
          selectedAgent: routing.agentId,
          method: routing.routingMethod,
          score: routing.score,
          estimatedTime: routing.estimatedTime,
        },
        ...result
      });
    } catch (error) {
      console.error('[auto_route_error]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Analyze text and get routing recommendation
  router.post('/analyze', async (req, res) => {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ ok: false, error: 'Message is required' });
    }

    try {
      const analysis = taskRouter.analyze(message);
      res.json({ ok: true, ...analysis });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ============================================
  // BATCH PROCESSING
  // ============================================

  router.post('/batch', async (req, res) => {
    const { tasks } = req.body;
    if (!tasks || !Array.isArray(tasks)) {
      return res.status(400).json({ ok: false, error: 'Tasks array is required' });
    }

    try {
      const results = [];
      for (const task of tasks) {
        const agent = agents[task.agent];
        if (!agent) {
          results.push({ task: task.task, status: 'error', error: 'Agent not found: ' + task.agent });
          continue;
        }
        try {
          const result = await agent.execute({ content: task.task, type: task.agent });
          results.push({ task: task.task, agent: task.agent, status: 'success', result });
        } catch (error) {
          results.push({ task: task.task, agent: task.agent, status: 'error', error: error.message });
        }
      }
      res.json({ ok: true, results });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ============================================
  // ARENA PRO+ ENDPOINTS
  // ============================================

  // Arena Pro+: Multi-agent collaboration
  router.post('/arena', async (req, res) => {
    const { message, options } = req.body;
    if (!message) {
      return res.status(400).json({ ok: false, error: 'Message is required' });
    }

    try {
      console.log('[arena] Starting Arena Pro+ execution...');
      const result = await arenaProPlus.execute({
        content: message,
        ...options
      });
      res.json(result);
    } catch (error) {
      console.error('[arena_error]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ============================================
  // STATS & INFO ENDPOINTS
  // ============================================

  // Get routing statistics
  router.get('/routing/stats', (req, res) => {
    res.json({
      ok: true,
      stats: taskRouter.getStats()
    });
  });

  // List available providers
  router.get('/providers', (req, res) => {
    res.json({
      ok: true,
      configured: getAvailableProviders(),
      available: ['openai', 'anthropic', 'xai', 'gemini']
    });
  });

  // System info
  router.get('/info', (req, res) => {
    res.json({
      ok: true,
      system: 'MUCI-SUPERMAN',
      version: '2.1',
      features: {
        agents: Object.keys(agents).length,
        autoRouting: true,
        arenaProPlus: true,
        batchProcessing: true,
        streaming: true,
      },
      agents: Object.keys(agents),
      endpoints: {
        agents: '/api/v1/agents',
        execute: '/api/v1/agents/:id/execute',
        health: '/api/v1/agents/:id/health',
        reset: '/api/v1/agents/:id/reset',
        auto: '/api/v1/auto',
        arena: '/api/v1/arena',
        batch: '/api/v1/batch',
        analyze: '/api/v1/analyze',
      }
    });
  });

  return router;
}

module.exports = { createAgentsRouter };
