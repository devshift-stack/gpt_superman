/**
 * CreativeAgent - Specialized in content creation, marketing, and storytelling
 */

const BaseAgent = require('./BaseAgent');

class CreativeAgent extends BaseAgent {
  constructor(config) {
    super(config);
    
    this.creativePatterns = {
      blog: /blog|artikel|article|post|beitrag/i,
      marketing: /marketing|werbung|ad|campaign|slogan|kampagne/i,
      email: /email|e-mail|newsletter|nachricht/i,
      social: /social|twitter|linkedin|instagram|facebook|tiktok/i,
      story: /story|geschichte|erzähl|narrative/i,
      description: /beschreib|description|über uns|about/i,
      headline: /headline|überschrift|titel|title|hook/i,
    };
    
    this.toneOptions = ['professional', 'casual', 'humorous', 'formal', 'friendly', 'urgent'];
  }
  
  buildPrompt(task) {
    const taskType = this.detectTaskType(task.content);
    const tone = this.detectTone(task.content);
    
    let systemPrompt = `Du bist ein kreativer Content-Experte und Texter.

Deine Fähigkeiten:
- Überzeugende Marketing-Texte schreiben
- Engaging Blog-Posts und Artikel erstellen
- Social Media Content optimieren
- Storytelling und Narrative entwickeln
- E-Mail-Kampagnen gestalten
- SEO-optimierte Inhalte erstellen

Richtlinien:
- Zielgruppengerecht schreiben
- Klare Call-to-Actions einbauen
- Emotionen ansprechen
- Einzigartige, originelle Formulierungen verwenden
- Auf Lesbarkeit und Struktur achten
- Brand Voice konsistent halten

Ton: ${tone}`;

    switch (taskType) {
      case 'blog':
        systemPrompt += `\n\nFokus Blog-Post:
- Catchy Überschrift mit Keywords
- Einleitung die fesselt
- Strukturierte Absätze mit Zwischenüberschriften
- Praktische Tipps oder Erkenntnisse
- Starker Abschluss mit CTA`;
        break;
        
      case 'marketing':
        systemPrompt += `\n\nFokus Marketing:
- AIDA-Prinzip (Attention, Interest, Desire, Action)
- Unique Selling Points hervorheben
- Emotionale Trigger nutzen
- Klarer Benefit für den Kunden
- Überzeugender CTA`;
        break;
        
      case 'email':
        systemPrompt += `\n\nFokus E-Mail:
- Betreffzeile die geöffnet wird
- Personalisierte Ansprache
- Scanbare Struktur
- Ein klares Ziel pro E-Mail
- Mobile-optimiert (kurze Absätze)`;
        break;
        
      case 'social':
        systemPrompt += `\n\nFokus Social Media:
- Plattform-spezifische Länge beachten
- Hook in den ersten Worten
- Hashtags strategisch einsetzen
- Engagement fördern (Fragen, CTAs)
- Visuelle Beschreibungen wenn relevant`;
        break;
        
      case 'story':
        systemPrompt += `\n\nFokus Storytelling:
- Starker Anfang der fesselt
- Relatable Charaktere oder Situationen
- Spannung aufbauen
- Emotionale Höhepunkte
- Zufriedenstellender Abschluss mit Botschaft`;
        break;
        
      case 'headline':
        systemPrompt += `\n\nFokus Headlines:
- Mehrere Varianten anbieten (5-10)
- Verschiedene Stile: Frage, How-to, Liste, Statement
- Power Words verwenden
- Zahlen wenn passend
- Neugier wecken ohne Clickbait`;
        break;
    }
    
    return { system: systemPrompt, user: task.content };
  }
  
  detectTaskType(content) {
    for (const [type, pattern] of Object.entries(this.creativePatterns)) {
      if (pattern.test(content)) return type;
    }
    return 'general';
  }
  
  detectTone(content) {
    const contentLower = content.toLowerCase();
    
    if (/professionell|formal|business|geschäft/i.test(contentLower)) return 'professional';
    if (/locker|casual|entspannt/i.test(contentLower)) return 'casual';
    if (/lustig|humor|witzig|spaß/i.test(contentLower)) return 'humorous';
    if (/dringend|urgent|wichtig|sofort/i.test(contentLower)) return 'urgent';
    if (/freundlich|warm|herzlich/i.test(contentLower)) return 'friendly';
    
    return 'professional';
  }
  
  canHandle(task) {
    let score = super.canHandle(task);
    const content = (task.content || '').toLowerCase();
    
    if (/\b(schreib|write|create|erstell|text|content)\b/.test(content)) {
      score += 0.2;
    }
    
    for (const pattern of Object.values(this.creativePatterns)) {
      if (pattern.test(content)) {
        score += 0.15;
        break;
      }
    }
    
    return Math.min(score, 1.0);
  }
}

module.exports = CreativeAgent;
