/**
 * AnalysisAgent - Specialized in data analysis, trends, and business intelligence
 */

const BaseAgent = require('./BaseAgent');

class AnalysisAgent extends BaseAgent {
  constructor(config) {
    super(config);
    
    this.analysisPatterns = {
      data_analysis: /analys|data|daten|statistik|statistic/i,
      trend: /trend|entwicklung|growth|wachstum|pattern/i,
      sentiment: /sentiment|stimmung|meinung|opinion|feeling/i,
      comparison: /vergleich|compare|benchmark|versus/i,
      forecast: /forecast|prognose|vorhersage|predict|zukunft/i,
      report: /report|bericht|zusammenfassung|overview/i,
      kpi: /kpi|metric|kennzahl|performance|leistung/i,
    };
  }
  
  buildPrompt(task) {
    const taskType = this.detectTaskType(task.content);
    
    let systemPrompt = `Du bist ein Experte für Datenanalyse und Business Intelligence.

Deine Fähigkeiten:
- Komplexe Daten analysieren und interpretieren
- Trends und Muster erkennen
- Sentiment-Analysen durchführen
- Prognosen und Vorhersagen erstellen
- KPIs definieren und tracken
- Actionable Insights ableiten

Richtlinien:
- Datengetrieben argumentieren
- Visualisierungen beschreiben (Tabellen, Charts)
- Statistische Methoden transparent machen
- Unsicherheiten und Limitationen nennen
- Praktische Handlungsempfehlungen geben
- Zahlen in Kontext setzen`;

    switch (taskType) {
      case 'data_analysis':
        systemPrompt += `\n\nFokus Datenanalyse:
1. Datenqualität und -struktur prüfen
2. Deskriptive Statistiken erstellen
3. Muster und Ausreißer identifizieren
4. Korrelationen untersuchen
5. Klare Visualisierungsvorschläge machen`;
        break;
        
      case 'trend':
        systemPrompt += `\n\nFokus Trend-Analyse:
1. Zeitreihen analysieren
2. Saisonale Muster erkennen
3. Wachstumsraten berechnen
4. Trendwenden identifizieren
5. Zukunftsprognosen ableiten`;
        break;
        
      case 'sentiment':
        systemPrompt += `\n\nFokus Sentiment-Analyse:
1. Stimmung klassifizieren (positiv/neutral/negativ)
2. Emotionale Treiber identifizieren
3. Themen-Clustering durchführen
4. Zeitliche Entwicklung zeigen
5. Handlungsempfehlungen ableiten`;
        break;
        
      case 'comparison':
        systemPrompt += `\n\nFokus Vergleichsanalyse:
1. Vergleichbare Metriken definieren
2. Benchmark-Daten heranziehen
3. Stärken und Schwächen identifizieren
4. Gap-Analyse durchführen
5. Ranking erstellen`;
        break;
        
      case 'forecast':
        systemPrompt += `\n\nFokus Prognose:
1. Historische Daten analysieren
2. Einflussfaktoren identifizieren
3. Szenarien entwickeln (best/worst/expected)
4. Konfidenzintervalle angeben
5. Annahmen transparent machen`;
        break;
        
      case 'report':
        systemPrompt += `\n\nFokus Report:
1. Executive Summary voranstellen
2. Key Findings hervorheben
3. Daten visuell aufbereiten
4. Tiefenanalyse im Detail
5. Empfehlungen und nächste Schritte`;
        break;
        
      case 'kpi':
        systemPrompt += `\n\nFokus KPI-Analyse:
1. Relevante KPIs identifizieren
2. Ist-Soll-Vergleich durchführen
3. Treiber und Hebel analysieren
4. Benchmarks heranziehen
5. Verbesserungspotenziale aufzeigen`;
        break;
    }
    
    return { system: systemPrompt, user: task.content };
  }
  
  detectTaskType(content) {
    for (const [type, pattern] of Object.entries(this.analysisPatterns)) {
      if (pattern.test(content)) return type;
    }
    return 'data_analysis';
  }
  
  canHandle(task) {
    let score = super.canHandle(task);
    const content = (task.content || '').toLowerCase();
    
    if (/\b(analys|data|daten|trend|report|bericht|kpi|metric)\b/.test(content)) {
      score += 0.25;
    }
    
    if (/\d+%|\d+\.\d+|\$\d+|€\d+/.test(task.content)) {
      score += 0.15;
    }
    
    for (const pattern of Object.values(this.analysisPatterns)) {
      if (pattern.test(content)) {
        score += 0.1;
        break;
      }
    }
    
    return Math.min(score, 1.0);
  }
}

module.exports = AnalysisAgent;
