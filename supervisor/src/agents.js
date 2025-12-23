const { complete, smartComplete, getAvailableProviders } = require('./providers');

const AGENTS = [
  {
    id: "research",
    name: "Research Agent",
    type: "research",
    description: "Sammelt Informationen, fasst Texte zusammen, erstellt Markt-Überblicke.",
    primary: { provider: "anthropic", model: "claude-3-sonnet" },
    fallback: { provider: "openai", model: "gpt-4o" },
    systemPrompt: "Du bist ein Research-Spezialist. Analysiere Informationen gründlich, fasse zusammen und liefere fundierte Erkenntnisse."
  },
  {
    id: "analysis",
    name: "Analysis Agent",
    type: "analysis",
    description: "Analysiert Daten, extrahiert Zielgruppen, Pain-Points, Chancen und Risiken.",
    primary: { provider: "anthropic", model: "claude-3-sonnet" },
    fallback: { provider: "gemini", model: "gemini-1.5-pro" },
    systemPrompt: "Du bist ein Daten-Analyst. Identifiziere Muster, Zielgruppen, Pain-Points und Geschäftschancen."
  },
  {
    id: "creative",
    name: "Creative Agent",
    type: "creative",
    description: "Erstellt Texte, Hooks, Betreffzeilen, E-Mails und kreative Vorschläge.",
    primary: { provider: "openai", model: "gpt-4o" },
    fallback: { provider: "xai", model: "grok-2" },
    systemPrompt: "Du bist ein kreativer Texter. Erstelle überzeugende Headlines, Hooks, E-Mails und Marketing-Texte."
  },
  {
    id: "coding",
    name: "Coding Agent",
    type: "coding",
    description: "Hilft bei Code, Snippets, kleinen Komponenten und technischen Vorschlägen.",
    primary: { provider: "anthropic", model: "claude-3-sonnet" },
    fallback: { provider: "openai", model: "gpt-4o" },
    systemPrompt: "Du bist ein erfahrener Software-Entwickler. Schreibe sauberen, effizienten Code und erkläre technische Konzepte."
  }
];

// Execute agent task
async function executeAgent(agentId, userMessage, options = {}) {
  const agent = AGENTS.find(a => a.id === agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  const messages = [
    { role: "system", content: agent.systemPrompt },
    { role: "user", content: userMessage }
  ];

  // Try primary provider first
  try {
    const result = await complete(
      agent.primary.provider,
      agent.primary.model,
      messages,
      options
    );
    return {
      agentId,
      provider: agent.primary.provider,
      model: agent.primary.model,
      response: result,
      fallbackUsed: false
    };
  } catch (primaryError) {
    console.error(`[agent_primary_failed] ${agentId}: ${primaryError.message}`);
    
    // Try fallback
    try {
      const result = await complete(
        agent.fallback.provider,
        agent.fallback.model,
        messages,
        options
      );
      return {
        agentId,
        provider: agent.fallback.provider,
        model: agent.fallback.model,
        response: result,
        fallbackUsed: true
      };
    } catch (fallbackError) {
      console.error(`[agent_fallback_failed] ${agentId}: ${fallbackError.message}`);
      
      // Last resort: smart complete
      const result = await smartComplete(messages, options);
      return {
        agentId,
        provider: 'auto',
        model: 'auto',
        response: result,
        fallbackUsed: true
      };
    }
  }
}

function getAgentByType(type) {
  return AGENTS.find((a) => a.type === type) || null;
}

function getAgentById(id) {
  return AGENTS.find((a) => a.id === id) || null;
}

function listAgents() {
  return AGENTS.map(a => ({
    id: a.id,
    name: a.name,
    type: a.type,
    description: a.description,
    providers: {
      primary: `${a.primary.provider}/${a.primary.model}`,
      fallback: `${a.fallback.provider}/${a.fallback.model}`
    }
  }));
}

module.exports = { 
  AGENTS, 
  getAgentByType, 
  getAgentById,
  listAgents,
  executeAgent 
};
