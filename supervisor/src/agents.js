const AGENTS = [
  {
    id: "research",
    name: "Research Agent",
    type: "research",
    description: "Sammelt Informationen, fasst Texte zusammen, erstellt Markt-Überblicke.",
    primary: { provider: "stub", model: "research-v1" },
    fallback: { provider: "stub", model: "research-v1-fallback" }
  },
  {
    id: "analysis",
    name: "Analysis Agent",
    type: "analysis",
    description: "Analysiert Daten, extrahiert Zielgruppen, Pain-Points, Chancen und Risiken.",
    primary: { provider: "stub", model: "analysis-v1" },
    fallback: { provider: "stub", model: "analysis-v1-fallback" }
  },
  {
    id: "creative",
    name: "Creative Agent",
    type: "creative",
    description: "Erstellt Texte, Hooks, Betreffzeilen, E-Mails und kreative Vorschläge.",
    primary: { provider: "stub", model: "creative-v1" },
    fallback: { provider: "stub", model: "creative-v1-fallback" }
  },
  {
    id: "coding",
    name: "Coding Agent",
    type: "coding",
    description: "Hilft bei Code, Snippets, kleinen Komponenten und technischen Vorschlägen.",
    primary: { provider: "stub", model: "coding-v1" },
    fallback: { provider: "stub", model: "coding-v1-fallback" }
  }
];

function getAgentByType(type) {
  return AGENTS.find((a) => a.type === type) || null;
}

module.exports = { AGENTS, getAgentByType };
