/**
 * MUCI-SUPERMAN Agents v2.1
 * ==========================
 *
 * NEUE FEATURES:
 * - Streaming-Support für lange Antworten
 * - Batch-Processing für mehrere Tasks
 * - A/B-Testing im MarketingAgent
 * - Vector-Search für FAQ im SupportAgent
 * - Automatische Prompt-Optimierung basierend auf Feedback
 */

const BaseAgent = require('./BaseAgent');
const AgentUtils = require('./AgentUtils');

// Spezialisierte Agenten
const SummaryAgent = require('./SummaryAgent');
const DataAgent = require('./DataAgent');
const FinanceAgent = require('./FinanceAgent');
const TranslatorAgent = require('./TranslatorAgent');
const LegalAgent = require('./LegalAgent');
const SupportAgent = require('./SupportAgent');
const MarketingAgent = require('./MarketingAgent');

// Agent Registry
const AGENTS = {
  summary: SummaryAgent,
  data: DataAgent,
  finance: FinanceAgent,
  translator: TranslatorAgent,
  legal: LegalAgent,
  support: SupportAgent,
  marketing: MarketingAgent
};

/**
 * Agent Factory
 */
function createAgent(type) {
  const AgentClass = AGENTS[type];
  if (!AgentClass) {
    throw new Error(`Unknown agent type: ${type}. Available: ${Object.keys(AGENTS).join(', ')}`);
  }
  return new AgentClass();
}

/**
 * Alle Agenten instantiieren
 */
function createAllAgents() {
  const agents = new Map();
  for (const [type, AgentClass] of Object.entries(AGENTS)) {
    agents.set(type, new AgentClass());
  }
  return agents;
}

/**
 * Besten Agent für Task finden
 */
function findBestAgent(task, agents) {
  let bestAgent = null;
  let bestScore = 0;

  for (const [type, agent] of agents) {
    const score = agent.canHandle(task);
    if (score > bestScore) {
      bestScore = score;
      bestAgent = agent;
    }
  }

  return { agent: bestAgent, score: bestScore };
}

/**
 * Batch-Ausführung über alle passenden Agenten
 */
async function executeBatch(tasks, agents) {
  const results = [];

  for (const task of tasks) {
    const { agent, score } = findBestAgent(task, agents);
    if (agent && score > 0.1) {
      try {
        const result = await agent.executeBatch(task);
        results.push({ taskId: task.id, status: 'success', result, agentId: agent.id });
      } catch (error) {
        results.push({ taskId: task.id, status: 'error', error: error.message, agentId: agent.id });
      }
    } else {
      results.push({ taskId: task.id, status: 'no_agent', error: 'No suitable agent found' });
    }
  }

  return results;
}

/**
 * Streaming-Ausführung
 */
async function* executeStream(task, agents) {
  const { agent, score } = findBestAgent(task, agents);

  if (!agent || score < 0.1) {
    yield { type: 'error', content: 'No suitable agent found', done: true };
    return;
  }

  yield* agent.executeStream(task);
}

module.exports = {
  // Version
  VERSION: '2.1.0',

  // Base
  BaseAgent,
  AgentUtils,

  // Agents
  SummaryAgent,
  DataAgent,
  FinanceAgent,
  TranslatorAgent,
  LegalAgent,
  SupportAgent,
  MarketingAgent,

  // Registry
  AGENTS,

  // Utilities
  createAgent,
  createAllAgents,
  findBestAgent,

  // NEU: Advanced Features
  executeBatch,
  executeStream
};
