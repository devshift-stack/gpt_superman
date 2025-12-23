/**
 * Agents API Routes v2 - Mit Arena Pro+ und Auto-Routing
 */

const express = require('express');
const { ResearchAgent, CodingAgent, CreativeAgent, AnalysisAgent, RecruiterAgent, SalesAgent } = require('../../supervisor/agents');
const ArenaProPlus = require('../../supervisor/ArenaProPlus');
const TaskRouter = require('../../supervisor/TaskRouter');
const { getAvailableProviders } = require('../../supervisor/src/providers');

// Agent configurations
const AGENT_CONFIGS = {
  research: {
    id: 'research',
    name: 'Research Agent',
    type: 'research',
    description: 'Sammelt Informationen, fasst Texte zusammen, erstellt Markt-Überblicke.',
    capabilities: ['web_search', 'fact_check', 'summarize', 'compare', 'explain', 'timeline'],
    keywords: ['search', 'find', 'research', 'summarize', 'compare', 'suche', 'finde'],
    primary: { provider: 'gemini', model: 'gemini-1.5-pro' },
    fallback: { provider: 'openai', model: 'gpt-4o' },
    settings: { timeout: 60000 },
    costs: { input: 1.25, output: 5.00 }
  },
  coding: {
    id: 'coding',
    name: 'Coding Agent',
    type: 'coding',
    description: 'Hilft bei Code, Debugging, Refactoring und technischen Aufgaben.',
    capabilities: ['bug_fix', 'new_code', 'refactor', 'review', 'test', 'docs'],
    keywords: ['code', 'bug', 'fix', 'function', 'class', 'implement', 'debug'],
    primary: { provider: 'anthropic', model: 'claude-3-sonnet' },
    fallback: { provider: 'openai', model: 'gpt-4o' },
    settings: { timeout: 90000 },
    costs: { input: 3.00, output: 15.00 }
  },
  creative: {
    id: 'creative',
    name: 'Creative Agent',
    type: 'creative',
    description: 'Erstellt Texte, Marketing-Copy, E-Mails und kreative Inhalte.',
    capabilities: ['blog', 'marketing', 'email', 'social', 'story', 'headline'],
    keywords: ['write', 'create', 'blog', 'email', 'marketing', 'headline', 'schreib'],
    primary: { provider: 'openai', model: 'gpt-4o' },
    fallback: { provider: 'anthropic', model: 'claude-3-sonnet' },
    settings: { timeout: 60000 },
    costs: { input: 2.50, output: 10.00 }
  },
  analysis: {
    id: 'analysis',
    name: 'Analysis Agent',
    type: 'analysis',
    description: 'Analysiert Daten, erkennt Trends und erstellt Business Intelligence.',
    capabilities: ['data_analysis', 'trend', 'sentiment', 'comparison', 'forecast', 'report', 'kpi'],
    keywords: ['analyze', 'data', 'trend', 'report', 'kpi', 'forecast', 'analysiere'],
    primary: { provider: 'xai', model: 'grok-2' },
    fallback: { provider: 'gemini', model: 'gemini-1.5-pro' },
    settings: { timeout: 60000 },
    costs: { input: 2.00, output: 10.00 }
  },
  recruiter: {
    id: 'recruiter',
    name: 'Recruiter Agent',
    type: 'recruiter',
    description: 'HR-Spezialist für Recruiting, Stellenanzeigen, Interviews und Onboarding.',
    capabilities: ['job_posting', 'candidate_screening', 'interview_prep', 'talent_search', 'onboarding', 'employer_branding'],
    keywords: ['job', 'stelle', 'kandidat', 'bewerber', 'interview', 'recruiting', 'hr', 'personal', 'talent'],
    primary: { provider: 'openai', model: 'gpt-4o' },
    fallback: { provider: 'anthropic', model: 'claude-3-sonnet' },
    settings: { timeout: 60000 },
    costs: { input: 2.50, output: 10.00 }
  },
  sales: {
    id: 'sales',
    name: 'Sales Agent',
    type: 'sales',
    description: 'Vertriebsexperte für Pitches, Einwandbehandlung, Closing und Lead-Qualifizierung.',
    capabilities: ['cold_outreach', 'sales_pitch', 'objection_handling', 'follow_up', 'closing', 'lead_qualification', 'negotiation', 'proposal'],
    keywords: ['sales', 'vertrieb', 'pitch', 'deal', 'closing', 'lead', 'kunde', 'akquise', 'angebot'],
    primary: { provider: 'openai', model: 'gpt-4o' },
    fallback: { provider: 'xai', model: 'grok-2' },
    settings: { timeout: 60000 },
    costs: { input: 2.50, output: 10.00 }
  }
};

// Agent instances
const agents = {};
let taskRouter = null;
let arenaProPlus = null;
let initialized = false;

async function initializeAgents() {
  if (initialized) return;

  console.log('[agents] Initializing OOP agents...');

  const AgentClasses = {
    research: ResearchAgent,
    coding: CodingAgent,
    creative: CreativeAgent,
    analysis: AnalysisAgent,
    recruiter: RecruiterAgent,
    sales: SalesAgent
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
  console.log('[agents] All systems ready (' + Object.keys(agents).length + ' agents)');
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
      available: ['openai', 'anthropic', 'xai', 'gemini', 'cursor']
    });
  });

  // System info
  router.get('/info', (req, res) => {
    res.json({
      ok: true,
      system: 'MUCI-SUPERMAN',
      version: '2.0',
      features: {
        agents: Object.keys(agents).length,
        autoRouting: true,
        arenaProPlus: true,
      },
      agents: Object.keys(agents),
      endpoints: {
        agents: '/api/v1/agents',
        execute: '/api/v1/agents/:id/execute',
        auto: '/api/v1/auto',
        arena: '/api/v1/arena',
        analyze: '/api/v1/analyze',
      }
    });
  });

  return router;
}

module.exports = { createAgentsRouter };
