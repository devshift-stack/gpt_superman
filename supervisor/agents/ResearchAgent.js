/**
 * ResearchAgent - Specialized in research, fact-finding, and summarization
 */

const BaseAgent = require('./BaseAgent');

class ResearchAgent extends BaseAgent {
  constructor(config) {
    super(config);
    
    this.researchPatterns = {
      web_search: /search|find|lookup|google|what is|who is|suche|finde/i,
      fact_check: /verify|fact.?check|true|false|accurate|wahr|falsch|stimmt/i,
      summarize: /summarize|summary|tldr|brief|overview|zusammenfassung|fasse zusammen/i,
      compare: /compare|versus|vs|difference|between|vergleich|unterschied/i,
      explain: /explain|what does|how does|why does|erkläre|was ist|wie funktioniert/i,
      timeline: /when|history|timeline|chronolog|wann|geschichte/i,
    };
  }
  
  buildPrompt(task) {
    const taskType = this.detectTaskType(task.content);
    
    let systemPrompt = `Du bist ein Experte für Recherche und Informationsbeschaffung.

Deine Fähigkeiten:
- Informationen aus verschiedenen Quellen finden und zusammenfassen
- Fakten überprüfen und verifizieren
- Umfassende Zusammenfassungen mit Quellenangaben erstellen
- Verschiedene Standpunkte objektiv vergleichen
- Zeitliche Abläufe und historische Analysen erstellen

Richtlinien:
- Genauigkeit hat Vorrang vor Geschwindigkeit
- Quellen angeben wenn möglich
- Unsicherheiten klar kommunizieren
- Bei kontroversen Themen mehrere Perspektiven präsentieren
- Klare, strukturierte Formatierung verwenden`;

    switch (taskType) {
      case 'web_search':
        systemPrompt += `\n\nFokus: Finde relevante Informationen, synthetisiere aus mehreren Quellen, zitiere Quellen.`;
        break;
      case 'fact_check':
        systemPrompt += `\n\nFokus: Verifiziere die Behauptung, finde Primärquellen, bewerte als Wahr/Falsch/Teilweise Wahr.`;
        break;
      case 'summarize':
        systemPrompt += `\n\nFokus: Identifiziere Hauptpunkte, fasse prägnant zusammen, behalte den Kontext bei.`;
        break;
      case 'compare':
        systemPrompt += `\n\nFokus: Definiere Vergleichskriterien, präsentiere Unterschiede und Gemeinsamkeiten objektiv.`;
        break;
      case 'explain':
        systemPrompt += `\n\nFokus: Erkläre einfach, verwende Analogien, definiere Fachbegriffe.`;
        break;
      case 'timeline':
        systemPrompt += `\n\nFokus: Chronologische Darstellung, Ursache-Wirkung erklären, Meilensteine hervorheben.`;
        break;
    }
    
    return { system: systemPrompt, user: task.content };
  }
  
  detectTaskType(content) {
    for (const [type, pattern] of Object.entries(this.researchPatterns)) {
      if (pattern.test(content)) return type;
    }
    return 'web_search';
  }
  
  canHandle(task) {
    let score = super.canHandle(task);
    const content = (task.content || '').toLowerCase();
    
    if (/\b(what|who|when|where|why|how|was|wer|wann|wo|warum|wie)\b/.test(content)) {
      score += 0.2;
    }
    
    for (const pattern of Object.values(this.researchPatterns)) {
      if (pattern.test(content)) {
        score += 0.15;
        break;
      }
    }
    
    return Math.min(score, 1.0);
  }
}

module.exports = ResearchAgent;
