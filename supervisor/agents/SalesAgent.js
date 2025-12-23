/**
 * SalesAgent - Spezialisiert auf Vertrieb, Sales und Kundenakquise
 * Extends BaseAgent mit Sales-spezifischen Fähigkeiten
 *
 * @version 2.0.0 - Optimierte Version mit erweiterten Features
 * Angepasst für MUCI-SUPERMAN System
 */

const BaseAgent = require('./BaseAgent');

class SalesAgent extends BaseAgent {
  constructor(config) {
    super(config);

    this.agentType = 'sales';
    this.conversationContext = [];
    this.maxContextLength = 10;

    // Sales-spezifische Task-Patterns mit Prioritäten
    this.salesPatterns = {
      cold_outreach: {
        pattern: /cold|kalt|erstansprache|outreach|akquise|prospect|erstkontakt|neukundengewinnung/i,
        priority: 1
      },
      sales_pitch: {
        pattern: /pitch|präsentation|angebot|vorstellung|demo|produkt|showcase/i,
        priority: 2
      },
      objection_handling: {
        pattern: /einwand|objection|bedenken|zweifel|aber|problem|hindernis|widerstand|skeptisch/i,
        priority: 3
      },
      follow_up: {
        pattern: /follow|nachfassen|nachverfolgung|reminder|erinnerung|check-in|nachhaken/i,
        priority: 4
      },
      closing: {
        pattern: /abschluss|closing|deal|vertrag|unterschrift|zusage|gewinn|finalisieren/i,
        priority: 5
      },
      lead_qualification: {
        pattern: /lead|qualifizierung|qualif|potenzial|budget|entscheider|bant|meddic|scoring/i,
        priority: 6
      },
      negotiation: {
        pattern: /verhandlung|preis|rabatt|discount|konditionen|terms|nachlass|zugeständnis/i,
        priority: 7
      },
      proposal: {
        pattern: /proposal|angebot|quote|offerte|kostenvoranschlag|roi|business.?case/i,
        priority: 8
      },
      competitor_analysis: {
        pattern: /konkurrenz|wettbewerb|competitor|vergleich|alternative|mitbewerber/i,
        priority: 9
      },
      upsell_crosssell: {
        pattern: /upsell|cross.?sell|erweiterung|zusatz|upgrade|premium|addon/i,
        priority: 10
      }
    };

    // BANT/MEDDIC Scoring-Kriterien
    this.qualificationCriteria = {
      bant: {
        budget: { weight: 25, questions: ['Wie hoch ist das Budget?', 'Gibt es eine Budgetfreigabe?'] },
        authority: { weight: 25, questions: ['Wer entscheidet final?', 'Wer ist im Buying Center?'] },
        need: { weight: 30, questions: ['Was ist das Kernproblem?', 'Wie dringend ist die Lösung?'] },
        timeline: { weight: 20, questions: ['Wann soll die Lösung stehen?', 'Gibt es eine Deadline?'] }
      },
      meddic: {
        metrics: { weight: 15, questions: ['Welche KPIs sind relevant?', 'Wie messen Sie Erfolg?'] },
        economicBuyer: { weight: 20, questions: ['Wer hat die Budgethoheit?'] },
        decisionCriteria: { weight: 15, questions: ['Nach welchen Kriterien wird entschieden?'] },
        decisionProcess: { weight: 15, questions: ['Wie läuft der Entscheidungsprozess?'] },
        identifyPain: { weight: 20, questions: ['Was sind die größten Pain Points?'] },
        champion: { weight: 15, questions: ['Wer ist Ihr interner Fürsprecher?'] }
      }
    };

    // Output-Templates für strukturierte Antworten
    this.outputTemplates = {
      cold_outreach: {
        sections: ['subject', 'opening', 'valueProposition', 'credibility', 'cta'],
        maxLength: 150,
        format: 'email'
      },
      lead_qualification: {
        sections: ['summary', 'bantScore', 'nextSteps', 'risks'],
        format: 'structured'
      },
      proposal: {
        sections: ['executiveSummary', 'problemStatement', 'solution', 'investment', 'roi', 'timeline', 'nextSteps'],
        format: 'document'
      }
    };
  }

  /**
   * Erkennt alle zutreffenden Sales-Task-Typen mit Scoring
   */
  detectTaskType(content) {
    const matches = [];
    const contentLower = content.toLowerCase();

    for (const [taskType, config] of Object.entries(this.salesPatterns)) {
      const pattern = config.pattern || config;
      if (pattern.test(content)) {
        const keywords = pattern.source.split('|');
        const matchCount = keywords.filter(kw =>
          contentLower.includes(kw.replace(/[\\()]/g, ''))
        ).length;

        matches.push({
          type: taskType,
          priority: config.priority || 99,
          matchScore: matchCount
        });
      }
    }

    if (matches.length === 0) {
      return {
        primary: 'general_sales',
        all: [{ type: 'general_sales', priority: 99, matchScore: 0 }],
        isComposite: false
      };
    }

    matches.sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return a.priority - b.priority;
    });

    return {
      primary: matches[0].type,
      all: matches,
      isComposite: matches.length > 1
    };
  }

  /**
   * Extrahiert strukturierte Informationen aus dem Task-Content
   */
  extractEntities(content) {
    const entities = {
      company: null,
      product: null,
      budget: null,
      timeline: null,
      decisionMaker: null,
      painPoints: [],
      competitors: []
    };

    const companyMatch = content.match(/(?:für|bei|kunde[:\s]+|firma[:\s]+|unternehmen[:\s]+)([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\s&]+?)(?:[,.\s]|$)/i);
    if (companyMatch) entities.company = companyMatch[1].trim();

    const budgetMatch = content.match(/(\d+(?:[.,]\d+)?)\s*(?:k|tsd|tausend|mio|million|€|eur)/i);
    if (budgetMatch) entities.budget = budgetMatch[0];

    const timelineMatch = content.match(/(?:in|bis|innerhalb)\s+(?:von\s+)?(\d+\s*(?:woche|monat|tag|quartal|jahr))/i);
    if (timelineMatch) entities.timeline = timelineMatch[1];

    const painMatch = content.match(/(?:problem|herausforderung|schwierigkeit|pain)[:\s]+([^.]+)/gi);
    if (painMatch) {
      entities.painPoints = painMatch.map(p => p.replace(/^[^:]+:\s*/, '').trim());
    }

    return entities;
  }

  /**
   * Baut den spezialisierten Sales-Prompt
   * Überschreibt BaseAgent.buildPrompt()
   */
  buildPrompt(task) {
    const taskAnalysis = this.detectTaskType(task.content);
    const entities = this.extractEntities(task.content);
    const template = this.outputTemplates[taskAnalysis.primary];

    const systemPrompts = {
      cold_outreach: `Du bist ein erfahrener Sales Development Representative (SDR) mit nachgewiesener Erfolgsquote.

## DEINE AUFGABE
Erstelle eine überzeugende Erstansprache für Kaltakquise.

## STRUKTUR (halte dich strikt daran)
1. **Betreff** (max. 6 Wörter, neugierig machend, kein Spam-Trigger)
2. **Personalisierte Eröffnung** (Bezug zu Empfänger/Firma, max. 1 Satz)
3. **Value Proposition** (Kundennutzen, nicht Features, max. 2 Sätze)
4. **Social Proof** (1 konkretes Beispiel/Zahl, optional)
5. **Soft CTA** (Frage oder Einladung zum Gespräch)

## REGELN
- Maximal 100-150 Wörter gesamt
- Keine aggressive Verkaufssprache ("Einmalige Chance!", "Jetzt zuschlagen!")
- Fokus auf den Kundennutzen
- Authentisch und menschlich klingen
- Keine Attachments oder Links in der ersten Mail erwähnen`,

      sales_pitch: `Du bist ein erfahrener Sales Executive mit Expertise in überzeugenden Präsentationen.

## DEINE AUFGABE
Entwickle einen überzeugenden Sales Pitch.

## STRUKTUR (AIDA + Proof)
1. **Attention/Hook** - Provokante Frage oder überraschende Statistik
2. **Interest/Problem** - Die Pain Points der Zielgruppe
3. **Desire/Lösung** - Dein Produkt als Lösung (Nutzen > Features)
4. **Proof** - Konkrete Erfolgsgeschichten, Zahlen, Testimonials
5. **Action/CTA** - Klarer nächster Schritt

## ANPASSUNG
- Passe Sprache und Tiefe an die Zielgruppe an (C-Level vs. Fachebene)
- Bei technischen Produkten: Nutzen zuerst, dann wie
- Zeitlich anpassen: 30s Elevator Pitch bis 15min Präsentation`,

      objection_handling: `Du bist ein Experte für Einwandbehandlung mit psychologischem Feingefühl.

## DEINE AUFGABE
Entwickle professionelle Antworten auf Kundeneinwände.

## METHODIK (wähle passend)
1. **Feel-Felt-Found** - Empathie → Identifikation → Lösung
2. **Reframing** - Einwand in neuen Kontext setzen
3. **Boomerang** - Einwand als Vorteil umdeuten
4. **Frage-Technik** - Mit Gegenfrage zum Kern vordringen

## STRUKTUR DEINER ANTWORT
1. **Anerkennung** - "Ich verstehe vollkommen, dass..."
2. **Klärung** - "Darf ich fragen, was genau Sie meinen mit...?"
3. **Antwort** - Substanzielle Behandlung des Einwands
4. **Bestätigung** - "Beantwortet das Ihre Bedenken?"
5. **Überleitung** - Zurück zum Value

## TYPISCHE EINWÄNDE & ANSÄTZE
- "Zu teuer" → ROI, TCO, Opportunitätskosten
- "Kein Bedarf" → Latente vs. aktive Needs aufdecken
- "Später" → Kosten des Wartens, Quick Wins
- "Zufrieden mit aktuellem Anbieter" → Benchmark, Innovation`,

      follow_up: `Du bist ein Sales-Profi mit Expertise im strategischen Follow-up.

## DEINE AUFGABE
Schreibe effektive Follow-up Nachrichten, die Mehrwert bieten.

## FOLLOW-UP SEQUENZ (Position bestimmen)
1. Tag 2-3: Value-Add (Artikel, Insight, Case Study)
2. Tag 7: Check-in mit neuer Perspektive
3. Tag 14: Social Proof oder neues Feature
4. Tag 21: Break-up Email (letzte Chance)

## STRUKTUR
1. **Bezug** - Konkreter Rückbezug zum letzten Kontakt
2. **Mehrwert** - Neuer Insight, relevanter Content, News
3. **Brücke** - Verbindung zu ihrem Problem/Ziel
4. **Sanfter CTA** - Niedrigschwellig, keine Verpflichtung

## REGELN
- Nie "Ich wollte nur nachfragen..."
- Immer Mehrwert bieten, nie nur "pingen"
- Kurz halten (max. 75 Wörter)
- Verschiedene Kanäle/Formate variieren`,

      closing: `Du bist ein erfahrener Closer mit hoher Abschlussquote.

## DEINE AUFGABE
Entwickle Strategien und Formulierungen für den erfolgreichen Abschluss.

## CLOSING-TECHNIKEN
1. **Assumptive Close** - "Wann sollen wir starten?"
2. **Summary Close** - Alle Vorteile zusammenfassen, dann Abschluss
3. **Urgency Close** - Echte Dringlichkeit (nicht künstlich!)
4. **Alternative Close** - Zwei positive Optionen anbieten
5. **Trial Close** - Temperatur prüfen: "Wie klingt das für Sie?"

## STRUKTUR
1. **Zusammenfassung** - Key Benefits und Agreement Points
2. **Letzte Einwände** - Proaktiv adressieren
3. **Commitment-Frage** - Klar und direkt
4. **Nächste Schritte** - Konkret und terminiert
5. **Risiko minimieren** - Garantien, Support, Onboarding

## WARNSIGNALE ERKENNEN
- Zögern → Unausgesprochene Einwände erfragen
- Rückzug → Buying Center nicht vollständig
- Zeitspiel → Entscheidungsprozess klären`,

      lead_qualification: `Du bist ein Experte für Lead-Qualifizierung nach BANT und MEDDIC.

## DEINE AUFGABE
Bewerte und qualifiziere Leads systematisch.

## BANT-FRAMEWORK
| Kriterium | Gewicht | Status | Score |
|-----------|---------|--------|-------|
| Budget | 25% | ? | 0-25 |
| Authority | 25% | ? | 0-25 |
| Need | 30% | ? | 0-30 |
| Timeline | 20% | ? | 0-20 |
| **GESAMT** | 100% | | /100 |

## LEAD-KATEGORIEN
- **Hot (80-100)**: Sofort Closing anstreben
- **Warm (50-79)**: Nurturing, fehlende Infos sammeln
- **Cold (20-49)**: Long-term Nurturing
- **Unqualified (<20)**: Disqualifizieren, Ressourcen sparen

## OUTPUT
1. Score-Übersicht mit Begründung je Kriterium
2. Fehlende Informationen identifizieren
3. Empfohlene nächste Fragen
4. Handlungsempfehlung und Priorisierung`,

      negotiation: `Du bist ein Verhandlungsexperte im B2B-Vertrieb.

## DEINE AUFGABE
Entwickle Verhandlungsstrategien und -taktiken.

## VERHANDLUNGSRAHMEN
1. **BATNA** - Was ist deine beste Alternative?
2. **ZOPA** - Zone of Possible Agreement definieren
3. **Anker** - Erster Preis/Vorschlag strategisch setzen

## TAKTIKEN
- **Wert vor Preis** - ROI und TCO argumentieren
- **Paketlösungen** - Trade-offs statt reiner Rabatte
- **Zugeständnisse** - Immer Gegenleistung verlangen
- **Silence** - Stille als Werkzeug nutzen
- **Good Cop/Bad Cop** - Erkennen und kontern

## STRUKTUR
1. Analyse der Verhandlungsposition
2. Empfohlene Taktiken
3. Konkrete Formulierungsvorschläge
4. No-Go's und Walk-away Points
5. Win-Win Optionen identifizieren`,

      proposal: `Du bist ein Experte für überzeugende B2B-Proposals.

## DEINE AUFGABE
Erstelle ein strukturiertes Verkaufsangebot.

## PROPOSAL-STRUKTUR
1. **Executive Summary** (1 Seite max)
   - Problem → Lösung → Ergebnis → Investment

2. **Situationsanalyse**
   - Ist-Zustand und Herausforderungen
   - Kosten des Nichtstuns

3. **Lösungsvorschlag**
   - Was wir liefern (Scope)
   - Wie wir vorgehen (Methodik)
   - Warum wir (Differenzierung)

4. **Investment & ROI**
   - Preisübersicht
   - ROI-Berechnung
   - Vergleich zu Alternativen

5. **Timeline & Meilensteine**
   - Phasen und Deliverables
   - Go-Live Datum

6. **Nächste Schritte**
   - Klarer CTA mit Deadline
   - Ansprechpartner`,

      competitor_analysis: `Du bist ein strategischer Sales-Analyst mit Marktexpertise.

## DEINE AUFGABE
Analysiere die Wettbewerbssituation und entwickle Gegenstrategien.

## ANALYSE-FRAMEWORK
1. **Feature-Vergleich** - Was können wir, was nicht?
2. **Pricing-Position** - Wo stehen wir preislich?
3. **Marktposition** - Stärken/Schwächen im Vergleich
4. **Differenzierung** - Unsere einzigartigen Vorteile

## BATTLECARDS (pro Wettbewerber)
- Quick Facts (Größe, Fokus, Pricing)
- Ihre Stärken (ehrlich!)
- Ihre Schwächen
- Killer-Fragen (die sie in Verlegenheit bringen)
- Unsere Konter-Argumente
- Kundenreferenzen, die wir gewonnen haben`,

      upsell_crosssell: `Du bist ein Customer Success/Sales Hybrid-Experte.

## DEINE AUFGABE
Entwickle Strategien für Upselling und Cross-Selling bei Bestandskunden.

## ANSATZ
1. **Timing** - Nach erfolgreichem Onboarding, bei Renewal, nach Erfolgen
2. **Signale** - Usage-Daten, Feature-Anfragen, Wachstum
3. **Framing** - Mehrwert und Wachstum, nicht "mehr verkaufen"

## STRUKTUR
1. Aktuelle Nutzung und Erfolge zusammenfassen
2. Identifizierte Potenziale/Gaps
3. Passende Upgrade-Option mit klarem Nutzen
4. Social Proof von ähnlichen Kunden
5. Einladung zum Gespräch (nicht harter Push)`,

      general_sales: `Du bist ein vielseitiger Senior Sales-Experte mit breiter Erfahrung.

## DEIN PROFIL
- 10+ Jahre B2B Sales Experience
- Expertise in Solution Selling und Consultative Sales
- Erfahrung von Startup bis Enterprise
- Methodisch versiert (SPIN, Challenger, MEDDIC)

## DEIN ANSATZ
1. Verstehe das spezifische Anliegen
2. Gib konkrete, umsetzbare Empfehlungen
3. Nutze Frameworks wo sinnvoll
4. Liefere Beispiele und Templates
5. Priorisiere Quick Wins

Du hilfst bei allen Vertriebsthemen - sei praxisnah und direkt.`
    };

    // Basis-System-Prompt
    let systemPrompt = systemPrompts[taskAnalysis.primary] || systemPrompts.general_sales;

    // Bei Composite Tasks: Sekundäre Kontexte hinzufügen
    if (taskAnalysis.isComposite && taskAnalysis.all.length > 1) {
      const secondaryTypes = taskAnalysis.all.slice(1, 3).map(t => t.type);
      systemPrompt += `\n\n## ZUSÄTZLICHER KONTEXT
Diese Anfrage berührt auch: ${secondaryTypes.join(', ')}.
Berücksichtige diese Aspekte in deiner Antwort, wo relevant.`;
    }

    // Extrahierte Entitäten hinzufügen
    const entityInfo = Object.entries(entities)
      .filter(([_, v]) => v && (Array.isArray(v) ? v.length > 0 : true))
      .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join('\n');

    if (entityInfo) {
      systemPrompt += `\n\n## ERKANNTE INFORMATIONEN\n${entityInfo}`;
    }

    // Konversationskontext hinzufügen
    if (this.conversationContext.length > 0) {
      const contextSummary = this.conversationContext
        .slice(-3)
        .map(c => `[${c.role}]: ${c.summary}`)
        .join('\n');
      systemPrompt += `\n\n## GESPRÄCHSKONTEXT\n${contextSummary}`;
    }

    // Output-Format Hinweise
    if (template) {
      systemPrompt += `\n\n## OUTPUT-FORMAT
Strukturiere deine Antwort nach: ${template.sections.join(' → ')}`;
      if (template.maxLength) {
        systemPrompt += `\nMaximale Länge: ${template.maxLength} Wörter`;
      }
    }

    return {
      system: systemPrompt,
      user: task.content
    };
  }

  /**
   * Override execute to add context tracking
   */
  async execute(task) {
    // Add to context before execution
    this.addToContext('user', task.content);

    // Call parent execute
    const result = await super.execute(task);

    // Add response to context
    if (result.result) {
      this.addToContext('assistant', result.result);
    }

    // Add metadata
    const taskAnalysis = this.detectTaskType(task.content);
    result.metadata = {
      taskType: taskAnalysis.primary,
      isComposite: taskAnalysis.isComposite,
      allTypes: taskAnalysis.all.map(t => t.type)
    };

    return result;
  }

  /**
   * Lead-Scoring nach BANT
   */
  scoreLeadBANT(leadInfo) {
    const scores = {
      budget: 0,
      authority: 0,
      need: 0,
      timeline: 0
    };
    const feedback = {};

    // Budget (0-25)
    if (leadInfo.budget) {
      if (leadInfo.budget === 'confirmed') scores.budget = 25;
      else if (leadInfo.budget === 'discussed') scores.budget = 15;
      else if (leadInfo.budget === 'unknown') scores.budget = 5;
      feedback.budget = `Budget: ${leadInfo.budget} (${scores.budget}/25)`;
    }

    // Authority (0-25)
    if (leadInfo.authority) {
      if (leadInfo.authority === 'decision_maker') scores.authority = 25;
      else if (leadInfo.authority === 'influencer') scores.authority = 15;
      else if (leadInfo.authority === 'user') scores.authority = 5;
      feedback.authority = `Authority: ${leadInfo.authority} (${scores.authority}/25)`;
    }

    // Need (0-30)
    if (leadInfo.need) {
      if (leadInfo.need === 'critical') scores.need = 30;
      else if (leadInfo.need === 'important') scores.need = 20;
      else if (leadInfo.need === 'nice_to_have') scores.need = 10;
      feedback.need = `Need: ${leadInfo.need} (${scores.need}/30)`;
    }

    // Timeline (0-20)
    if (leadInfo.timeline) {
      if (leadInfo.timeline === 'immediate') scores.timeline = 20;
      else if (leadInfo.timeline === 'quarter') scores.timeline = 15;
      else if (leadInfo.timeline === 'year') scores.timeline = 8;
      feedback.timeline = `Timeline: ${leadInfo.timeline} (${scores.timeline}/20)`;
    }

    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

    let category;
    if (totalScore >= 80) category = 'hot';
    else if (totalScore >= 50) category = 'warm';
    else if (totalScore >= 20) category = 'cold';
    else category = 'unqualified';

    return {
      scores,
      totalScore,
      category,
      feedback,
      recommendation: this.getLeadRecommendation(category, scores)
    };
  }

  /**
   * Gibt Handlungsempfehlungen basierend auf Lead-Kategorie
   */
  getLeadRecommendation(category, scores) {
    const recommendations = {
      hot: 'Sofort Closing-Gespräch vereinbaren. Proposal vorbereiten.',
      warm: 'Discovery Call durchführen. Fehlende BANT-Kriterien klären.',
      cold: 'In Nurturing-Kampagne aufnehmen. Monatlicher Value-Content.',
      unqualified: 'Lead disqualifizieren. Ressourcen auf bessere Leads fokussieren.'
    };

    const missingInfo = [];
    if (scores.budget < 15) missingInfo.push('Budget klären');
    if (scores.authority < 15) missingInfo.push('Entscheider identifizieren');
    if (scores.need < 15) missingInfo.push('Pain Points vertiefen');
    if (scores.timeline < 10) missingInfo.push('Timeline festlegen');

    return {
      action: recommendations[category],
      nextSteps: missingInfo,
      priority: category === 'hot' ? 'HIGH' : category === 'warm' ? 'MEDIUM' : 'LOW'
    };
  }

  /**
   * Fügt Kontext aus vorherigen Interaktionen hinzu
   */
  addToContext(role, content) {
    const summary = content.length > 100
      ? content.substring(0, 100) + '...'
      : content;

    this.conversationContext.push({
      role,
      summary,
      timestamp: new Date().toISOString()
    });

    if (this.conversationContext.length > this.maxContextLength) {
      this.conversationContext.shift();
    }
  }

  /**
   * Generiert ein Email-Template für Cold Outreach
   */
  generateEmailTemplate(params) {
    const { company, product, recipient, valueProposition } = params;

    return {
      subject: `[Suggestion] ${valueProposition?.short || 'Idee für ' + company}`,
      body: {
        opening: `Hallo${recipient ? ' ' + recipient : ''},`,
        hook: '[Personalisierter Bezug zu Firma/Person]',
        valueProposition: valueProposition?.full || '[Ihr Nutzen in 1-2 Sätzen]',
        credibility: '[Optional: Ein Proof Point]',
        cta: 'Hätten Sie kommende Woche 15 Minuten für ein kurzes Gespräch?',
        closing: 'Beste Grüße'
      },
      notes: [
        'Betreff A/B testen',
        'Personalisierung nicht vergessen',
        'Follow-up nach 3 Tagen planen'
      ]
    };
  }

  /**
   * Validiert Sales-spezifische Eingaben
   */
  validateInput(task) {
    if (!task.content || task.content.trim().length < 10) {
      throw new Error('Sales-Anfrage zu kurz. Bitte beschreibe dein Anliegen mit mehr Details.');
    }

    if (task.content && task.content.length > 10000) {
      throw new Error('Anfrage zu lang. Bitte kürze auf die wesentlichen Informationen.');
    }

    return true;
  }
}

module.exports = SalesAgent;
