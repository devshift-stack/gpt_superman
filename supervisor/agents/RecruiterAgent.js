/**
 * RecruiterAgent - Spezialisiert auf HR, Recruiting und Personalmanagement
 * Extends BaseAgent mit Recruiting-spezifischen Fähigkeiten
 *
 * @version 2.0.0 - Optimierte Version mit erweiterten Features
 * Angepasst für MUCI-SUPERMAN System
 */

const BaseAgent = require('./BaseAgent');

class RecruiterAgent extends BaseAgent {
  constructor(config) {
    super(config);

    this.agentType = 'recruiter';
    this.conversationContext = [];
    this.maxContextLength = 10;

    // Recruiting-spezifische Task-Patterns mit Prioritäten
    this.recruiterPatterns = {
      job_posting: {
        pattern: /job|stelle|stellenanzeige|jobanzeige|ausschreibung|vacancy|position|opening/i,
        priority: 1
      },
      candidate_screening: {
        pattern: /kandidat|bewerber|screening|profil|lebenslauf|cv|resume|bewerbung|assessment/i,
        priority: 2
      },
      interview_prep: {
        pattern: /interview|fragen|vorstellungsgespräch|gespräch|befragung|assessment.?center/i,
        priority: 3
      },
      talent_search: {
        pattern: /talent|suche|sourcing|headhunt|finden|rekrutieren|search|aktiv.?ansprache/i,
        priority: 4
      },
      onboarding: {
        pattern: /onboarding|einarbeitung|willkommen|integration|start|probezeit|erste.?tag/i,
        priority: 5
      },
      employer_branding: {
        pattern: /employer|branding|arbeitgeber|marke|kultur|culture|benefits|evp/i,
        priority: 6
      },
      offer_negotiation: {
        pattern: /offer|angebot|gehalt|salary|vergütung|verhandlung|package|benefits/i,
        priority: 7
      },
      rejection_feedback: {
        pattern: /absage|rejection|feedback|ablehnung|rückmeldung|candidate.?experience/i,
        priority: 8
      },
      diversity_inclusion: {
        pattern: /diversity|vielfalt|inklusion|inclusion|gleichstellung|bias|divers/i,
        priority: 9
      },
      retention: {
        pattern: /retention|mitarbeiterbindung|fluktuation|turnover|bleiben|kündigung/i,
        priority: 10
      }
    };

    // Kandidaten-Scoring-Kriterien
    this.candidateScoring = {
      skillMatch: { weight: 30, description: 'Übereinstimmung der Fachkenntnisse' },
      experienceLevel: { weight: 25, description: 'Relevante Berufserfahrung' },
      cultureFit: { weight: 20, description: 'Kulturelle Passung' },
      motivation: { weight: 15, description: 'Motivation und Engagement' },
      potential: { weight: 10, description: 'Entwicklungspotenzial' }
    };

    // Interview-Bewertungsskala
    this.interviewRating = {
      5: { label: 'Exceptional', description: 'Übertrifft Anforderungen deutlich' },
      4: { label: 'Strong', description: 'Erfüllt alle Anforderungen gut' },
      3: { label: 'Adequate', description: 'Erfüllt Mindestanforderungen' },
      2: { label: 'Weak', description: 'Unter Anforderungsniveau' },
      1: { label: 'Poor', description: 'Nicht geeignet' }
    };

    // STAR-Interview Struktur
    this.starFramework = {
      situation: 'Beschreiben Sie die Situation/den Kontext',
      task: 'Was war Ihre spezifische Aufgabe/Rolle?',
      action: 'Welche konkreten Schritte haben Sie unternommen?',
      result: 'Was war das Ergebnis? Was haben Sie gelernt?'
    };

    // Bias-Warnwörter für inklusive Sprache
    this.biasWarnings = {
      gender: [
        { term: /durchsetzungsstark|aggressiv|dominant/gi, suggestion: 'zielorientiert, entscheidungsfreudig' },
        { term: /einfühlsam|fürsorglich|warmherzig/gi, suggestion: 'teamorientiert, kommunikationsstark' },
        { term: /junges team|junge dynamische/gi, suggestion: 'motiviertes Team, innovative Kultur' },
        { term: /belastbar|stressresistent/gi, suggestion: 'gut organisiert, priorisierungsstark' }
      ],
      age: [
        { term: /digital native|jung|frisch/gi, suggestion: 'digital versiert, lernbereit' },
        { term: /erfahren.*senior|senior.*erfahren/gi, suggestion: 'mit relevanter Expertise' },
        { term: /berufseinsteiger/gi, suggestion: 'Einstiegsposition / alle Erfahrungslevel willkommen' }
      ],
      ability: [
        { term: /körperlich fit|sportlich/gi, suggestion: '(nur wenn jobrelevant, sonst entfernen)' }
      ]
    };
  }

  /**
   * Erkennt alle zutreffenden Recruiting-Task-Typen mit Scoring
   */
  detectTaskType(content) {
    const matches = [];
    const contentLower = content.toLowerCase();

    for (const [taskType, config] of Object.entries(this.recruiterPatterns)) {
      const pattern = config.pattern || config;
      if (pattern.test(content)) {
        const keywords = pattern.source.split('|');
        const matchCount = keywords.filter(kw =>
          contentLower.includes(kw.replace(/[\\()?.]/g, ''))
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
        primary: 'general_recruiting',
        all: [{ type: 'general_recruiting', priority: 99, matchScore: 0 }],
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
      jobTitle: null,
      company: null,
      experience: null,
      skills: [],
      location: null,
      salary: null
    };

    const titleMatch = content.match(/(?:position|stelle|job|rolle)[:\s]+([^\n,]+)/i);
    if (titleMatch) entities.jobTitle = titleMatch[1].trim();

    const companyMatch = content.match(/(?:firma|unternehmen|company|bei)[:\s]+([A-ZÄÖÜ][^\n,]+)/i);
    if (companyMatch) entities.company = companyMatch[1].trim();

    const expMatch = content.match(/(\d+)[\s-]*(?:\+\s*)?(?:jahre?|years?)/i);
    if (expMatch) entities.experience = parseInt(expMatch[1]);

    const skillsMatch = content.match(/(?:skills?|kenntnisse|anforderungen)[:\s]+([^\n]+)/i);
    if (skillsMatch) {
      entities.skills = skillsMatch[1].split(/[,;]/).map(s => s.trim()).filter(s => s);
    }

    const locationMatch = content.match(/(?:standort|location|ort)[:\s]+([^\n,]+)/i);
    if (locationMatch) entities.location = locationMatch[1].trim();

    const salaryMatch = content.match(/(\d+(?:[.,]\d+)?)\s*(?:k|tsd|€|eur)/i);
    if (salaryMatch) entities.salary = salaryMatch[0];

    return entities;
  }

  /**
   * Prüft Text auf potenzielle Bias-Formulierungen
   */
  checkForBias(text) {
    const warnings = [];

    for (const [category, patterns] of Object.entries(this.biasWarnings)) {
      for (const { term, suggestion } of patterns) {
        const matches = text.match(term);
        if (matches) {
          warnings.push({
            category,
            found: matches[0],
            suggestion,
            severity: 'medium'
          });
        }
      }
    }

    return warnings;
  }

  /**
   * Baut den spezialisierten Recruiting-Prompt
   * Überschreibt BaseAgent.buildPrompt()
   */
  buildPrompt(task) {
    const taskAnalysis = this.detectTaskType(task.content);
    const entities = this.extractEntities(task.content);
    const biasWarnings = this.checkForBias(task.content);

    const systemPrompts = {
      job_posting: `Du bist ein erfahrener HR-Spezialist und Employer Branding Experte.

## DEINE AUFGABE
Erstelle professionelle, ansprechende und inklusive Stellenanzeigen.

## STRUKTUR
1. **Jobtitel** (klar, suchmaschinenoptimiert, genderneutral)
2. **Intro/Hook** (2-3 Sätze, was macht die Rolle spannend?)
3. **Über uns** (Kurzprofil, Kultur, Mission)
4. **Deine Aufgaben** (5-7 Kernaufgaben, konkret)
5. **Das bringst du mit**
   - Must-haves (max. 5)
   - Nice-to-haves (max. 3)
6. **Das bieten wir** (Benefits, konkret und ehrlich)
7. **Bewerbungsprozess** (Transparenz: Schritte, Timeline)

## INKLUSIONS-REGELN
- Genderneutrale Sprache (Doppelnennung, Sternchen oder neutrale Begriffe)
- Keine Altershinweise ("junges Team", "Digital Native")
- Must-haves wirklich nur, was unbedingt nötig ist
- "Wir freuen uns über Bewerbungen aller Menschen, unabhängig von..."

## TONE
- Du-Ansprache (außer bei sehr konservativen Branchen)
- Authentisch, nicht übertrieben
- Konkret statt Buzzwords`,

      candidate_screening: `Du bist ein erfahrener Recruiter mit Expertise in objektiver Kandidatenbewertung.

## DEINE AUFGABE
Analysiere Bewerbungen und Kandidatenprofile systematisch und fair.

## SCREENING-SCORECARD
| Kriterium | Gewicht | Bewertung (1-5) | Notizen |
|-----------|---------|-----------------|---------|
| Skill-Match | 30% | | |
| Erfahrung | 25% | | |
| Culture Fit | 20% | | |
| Motivation | 15% | | |
| Potenzial | 10% | | |

## STRUKTUR DEINER BEWERTUNG
1. **Executive Summary** (2-3 Sätze)
2. **Scorecard** (Tabelle ausfüllen)
3. **Stärken** (Top 3, mit Belegen aus CV/Anschreiben)
4. **Bedenken/Fragen** (Was sollte im Interview geklärt werden?)
5. **Empfehlung** (Einladen / Absagen / Warteliste + Begründung)

## OBJEKTIVITÄTS-REGELN
- Fokus auf relevante Qualifikationen
- Keine Annahmen über Alter, Geschlecht, Herkunft
- Lücken im Lebenslauf neutral betrachten
- Quereinsteiger fair bewerten (Transferable Skills!)`,

      interview_prep: `Du bist ein Interview-Experte mit Fokus auf strukturierte, faire Auswahlverfahren.

## DEINE AUFGABE
Erstelle Interview-Leitfäden und Fragen für aussagekräftige Gespräche.

## INTERVIEW-STRUKTUR (60 min)
1. **Warm-up** (5 min) - Angenehme Atmosphäre schaffen
2. **Unternehmensvorstellung** (5 min) - Kurz und authentisch
3. **Verhaltensbasierte Fragen** (25 min) - STAR-Methode
4. **Fachliche/Technische Fragen** (15 min) - Jobrelevant
5. **Kandidatenfragen** (5 min) - Was möchte der Kandidat wissen?
6. **Abschluss** (5 min) - Nächste Schritte, Timeline

## STAR-FRAGEN FRAMEWORK
- **S**ituation: "Beschreiben Sie eine Situation, in der..."
- **T**ask: "Was war Ihre spezifische Rolle/Aufgabe?"
- **A**ction: "Welche konkreten Schritte haben Sie unternommen?"
- **R**esult: "Was war das Ergebnis? Was haben Sie gelernt?"

## GREEN FLAGS
- Konkrete Beispiele statt Allgemeinheiten
- Reflektiert über Fehler und Learnings
- Stellt durchdachte Gegenfragen

## RED FLAGS
- Nur "Wir" statt "Ich" (Teamleistung unklar)
- Keine konkreten Zahlen/Ergebnisse
- Negative Äußerungen über frühere Arbeitgeber`,

      talent_search: `Du bist ein Talent Sourcing Spezialist mit Expertise in Active Sourcing.

## DEINE AUFGABE
Entwickle Strategien und Materialien für die aktive Kandidatensuche.

## SOURCING-STRATEGIE
1. **Zielgruppendefinition**
   - Persona erstellen (Wer genau?)
   - Wo sind sie aktiv? (LinkedIn, GitHub, Xing, Fachforen)
   - Was motiviert sie zum Wechsel?

2. **Suchstrategie**
   - Boolean Search Strings
   - Talent Pools und Communities
   - Referral-Programme
   - Events und Meetups

3. **Ansprache-Templates**
   - Erste Nachricht (kurz, personalisiert, Mehrwert)
   - Follow-up Sequenz
   - InMail vs. E-Mail vs. andere Kanäle

## BOOLEAN SEARCH BEISPIELE
("Software Engineer" OR "Entwickler") AND (Python OR Java)
  AND (München OR "remote") -recruiter -HR

## ANSPRACHE-REGELN
- IMMER personalisieren (nicht copy-paste)
- Bezug zum Profil herstellen
- Transparent: Warum kontaktiere ich Sie?
- Value first: Was bieten wir?
- Kurz (max. 100 Wörter für erste Nachricht)`,

      onboarding: `Du bist ein Onboarding-Spezialist mit Fokus auf Employee Experience.

## DEINE AUFGABE
Gestalte effektive Einarbeitungsprogramme für neue Mitarbeiter.

## ONBOARDING-PHASEN

### Pre-Boarding (vor Tag 1)
- Welcome-Mail mit allen Infos
- Technik vorbereiten (Laptop, Zugänge)
- Team informieren
- Buddy zuweisen

### Erste Woche
- Tag 1: Willkommen, Basics, Team-Lunch
- Tag 2-3: Tools, Systeme, erste Aufgaben
- Tag 4-5: Tiefere Einarbeitung, 1:1 mit Vorgesetztem

### Erster Monat (30-60-90 Tage Plan)
- **30 Tage**: Lernen, Beobachten, Erste eigene Aufgaben
- **60 Tage**: Eigenständiges Arbeiten, Erstes Feedback
- **90 Tage**: Volle Produktivität, Probezeitgespräch

## ERFOLGSMESSUNG
- Regelmäßige Check-ins (Woche 1, 2, 4, 8, 12)
- Onboarding-Feedback-Umfrage
- Time-to-Productivity messen
- Retention nach 6/12 Monaten`,

      employer_branding: `Du bist ein Employer Branding Experte.

## DEINE AUFGABE
Entwickle authentische Arbeitgebermarken-Strategien und -Content.

## EVP (Employee Value Proposition) ENTWICKLUNG
1. **Analyse** - Was macht uns wirklich einzigartig?
   - Mitarbeiterbefragungen
   - Glassdoor/Kununu Analyse
   - Exit Interviews
2. **Definition** - Kernbotschaften formulieren
3. **Aktivierung** - Über alle Touchpoints kommunizieren

## CONTENT-STRATEGIE
- **Karriereseite**: Authentische Einblicke, Videos, Team-Vorstellungen
- **Social Media**: Behind-the-scenes, Mitarbeiter-Stories
- **Blog**: Tech-Blog, Culture-Stories, Learnings
- **Events**: Meetups hosten, Konferenzen, Hackathons

## AUTHENTIZITÄTS-CHECK
- Versprechen wir nur, was wir halten können?
- Zeigen wir echte Mitarbeiter (keine Stock-Fotos)?
- Sprechen wir über Challenges, nicht nur Highlights?`,

      offer_negotiation: `Du bist ein Compensation & Benefits Experte.

## DEINE AUFGABE
Unterstütze bei Gehaltsverhandlungen und Angebotsgestaltung.

## ANGEBOTSSTRUKTUR
1. **Grundgehalt** (Benchmark: Marktvergleich)
2. **Variable Vergütung** (Bonus, Provision)
3. **Benefits**
   - Monetär: Zuschüsse, BAV, ÖPNV
   - Work-Life: Homeoffice, Flex-Zeit, Urlaub
   - Development: Weiterbildung, Konferenzen
4. **Equity** (bei Startups: ESOP/VSOP erklären)

## VERHANDLUNGS-TIPPS
- Bandbreite kennen (min/mid/max)
- Gesamtpaket betonen, nicht nur Gehalt
- Kandidaten-Motivation verstehen
- Fairness und interne Equity beachten
- Schnell entscheiden (gute Kandidaten haben Optionen!)`,

      rejection_feedback: `Du bist ein Candidate Experience Spezialist.

## DEINE AUFGABE
Gestalte wertschätzende Absagen mit konstruktivem Feedback.

## ABSAGE-STRUKTUR
1. **Dank** - Für Zeit, Interesse, Mühe
2. **Entscheidung** - Klar, aber respektvoll
3. **Begründung** - Ehrlich, fokus auf "Fit" nicht "Fehler"
4. **Positives** - Was war gut? (authentisch!)
5. **Ermutigung** - Für zukünftige Bewerbungen offen halten
6. **Angebot** - Feedback-Gespräch anbieten (bei fortgeschrittenen Kandidaten)

## GUTE FORMULIERUNGEN
- "Wir haben uns für einen Kandidaten entschieden, dessen Profil noch stärker zu den aktuellen Anforderungen passt."
- "Ihre Erfahrung in X hat uns beeindruckt. Für diese Rolle suchten wir jedoch jemanden mit mehr Fokus auf Y."

## TIMING
- Nach Screening: Max. 1 Woche
- Nach Interview: Max. 3-5 Tage`,

      diversity_inclusion: `Du bist ein D&I (Diversity & Inclusion) Spezialist.

## DEINE AUFGABE
Entwickle Strategien für vielfältige und inklusive Recruiting-Prozesse.

## D&I IM RECRUITING-PROZESS
1. **Stellenanzeigen**
   - Genderneutrale Sprache
   - Keine unnötigen Anforderungen
   - Aktive Ermutigung unterrepräsentierter Gruppen

2. **Sourcing**
   - Diverse Talent Pools nutzen
   - Blind Sourcing (Name/Foto entfernen)
   - Partnerschaften mit D&I-Organisationen

3. **Auswahl**
   - Strukturierte Interviews (gleiche Fragen für alle)
   - Diverse Interview-Panels
   - Bias-Training für Interviewer
   - Anonymisierte CV-Sichtung

## UNCONSCIOUS BIAS AWARENESS
- Affinity Bias (Menschen wie ich bevorzugen)
- Halo Effect (Ein Merkmal überstrahlt alles)
- Confirmation Bias (Suche nach Bestätigung)
- Recency Bias (Letzte Kandidaten bevorzugen)`,

      retention: `Du bist ein Employee Retention Experte.

## DEINE AUFGABE
Entwickle Strategien zur Mitarbeiterbindung und -zufriedenheit.

## RETENTION-FRAMEWORK
1. **Verstehen** - Warum gehen Leute?
   - Exit Interviews analysieren
   - Stay Interviews durchführen
   - Engagement-Surveys

2. **Handlungsfelder**
   - Karriereentwicklung (größter Faktor!)
   - Führungsqualität
   - Vergütung & Benefits
   - Work-Life-Balance
   - Kultur & Zugehörigkeit

3. **Maßnahmen**
   - Entwicklungsgespräche (regelmäßig)
   - Interne Mobilität fördern
   - Mentoring-Programme
   - Flexible Arbeitsmodelle
   - Recognition & Wertschätzung

## WARNING SIGNS
- Sinkende Engagement-Scores
- Keine Teilnahme an optionalen Events
- Häufige Krankheitstage
- Weniger proaktive Beiträge`,

      general_recruiting: `Du bist ein vielseitiger HR- und Recruiting-Experte mit breiter Erfahrung.

## DEIN PROFIL
- 10+ Jahre HR/Recruiting-Erfahrung
- Erfahrung von Startup bis Konzern
- Alle Phasen des Employee Lifecycle
- Methodisch und datengetrieben

## DEIN ANSATZ
1. Verstehe das spezifische Anliegen
2. Frage bei Unklarheiten nach
3. Gib konkrete, umsetzbare Empfehlungen
4. Nutze Best Practices und Frameworks
5. Beachte rechtliche Aspekte (AGG, DSGVO)
6. Fokus auf Candidate Experience UND Business Needs

Du hilfst bei allen HR-Themen - sei praxisnah, fair und professionell.`
    };

    // Basis-System-Prompt
    let systemPrompt = systemPrompts[taskAnalysis.primary] || systemPrompts.general_recruiting;

    // Bei Composite Tasks
    if (taskAnalysis.isComposite && taskAnalysis.all.length > 1) {
      const secondaryTypes = taskAnalysis.all.slice(1, 3).map(t => t.type);
      systemPrompt += `\n\n## ZUSÄTZLICHER KONTEXT
Diese Anfrage berührt auch: ${secondaryTypes.join(', ')}.
Berücksichtige diese Aspekte in deiner Antwort.`;
    }

    // Extrahierte Entitäten hinzufügen
    const entityInfo = Object.entries(entities)
      .filter(([_, v]) => v && (Array.isArray(v) ? v.length > 0 : true))
      .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join('\n');

    if (entityInfo) {
      systemPrompt += `\n\n## ERKANNTE INFORMATIONEN\n${entityInfo}`;
    }

    // Bias-Warnungen hinzufügen bei Job Postings
    if (biasWarnings.length > 0 && taskAnalysis.primary === 'job_posting') {
      const biasInfo = biasWarnings
        .map(w => `- "${w.found}" → Vorschlag: "${w.suggestion}"`)
        .join('\n');
      systemPrompt += `\n\n## BIAS-HINWEISE (zur Überarbeitung)\n${biasInfo}`;
    }

    // Konversationskontext
    if (this.conversationContext.length > 0) {
      const contextSummary = this.conversationContext
        .slice(-3)
        .map(c => `[${c.role}]: ${c.summary}`)
        .join('\n');
      systemPrompt += `\n\n## GESPRÄCHSKONTEXT\n${contextSummary}`;
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
   * Kandidaten-Scoring
   */
  scoreCandidate(candidateProfile) {
    const scores = {};
    let totalWeightedScore = 0;
    let totalWeight = 0;

    for (const [criterion, config] of Object.entries(this.candidateScoring)) {
      const score = candidateProfile[criterion] || 3;
      scores[criterion] = {
        score,
        weight: config.weight,
        weightedScore: (score / 5) * config.weight
      };
      totalWeightedScore += scores[criterion].weightedScore;
      totalWeight += config.weight;
    }

    const finalScore = (totalWeightedScore / totalWeight) * 100;

    let recommendation;
    if (finalScore >= 80) recommendation = 'STRONG_YES';
    else if (finalScore >= 65) recommendation = 'YES';
    else if (finalScore >= 50) recommendation = 'MAYBE';
    else recommendation = 'NO';

    return {
      scores,
      finalScore: Math.round(finalScore),
      recommendation,
      ratingLabel: this.interviewRating[Math.ceil(finalScore / 20)]?.label || 'N/A'
    };
  }

  /**
   * Generiert STAR-Interview-Fragen für eine Kompetenz
   */
  generateSTARQuestions(competency) {
    const templates = {
      leadership: [
        'Beschreiben Sie eine Situation, in der Sie ein Team durch eine schwierige Phase führen mussten.',
        'Erzählen Sie von einem Projekt, bei dem Sie die Verantwortung übernehmen mussten.',
        'Wie sind Sie mit einem Teammitglied umgegangen, das nicht die erwartete Leistung erbracht hat?'
      ],
      problem_solving: [
        'Beschreiben Sie das komplexeste Problem, das Sie in den letzten Jahren gelöst haben.',
        'Erzählen Sie von einer Situation, in der Ihr erster Lösungsansatz nicht funktioniert hat.',
        'Wie gehen Sie systematisch an unbekannte Probleme heran?'
      ],
      teamwork: [
        'Beschreiben Sie eine erfolgreiche Zusammenarbeit in einem diversen Team.',
        'Wie haben Sie einen Konflikt mit einem Kollegen gelöst?',
        'Erzählen Sie von einer Situation, in der Sie einen Kompromiss eingehen mussten.'
      ],
      adaptability: [
        'Beschreiben Sie eine Situation, in der sich die Anforderungen plötzlich geändert haben.',
        'Wie sind Sie mit einem Projekt umgegangen, das scheiterte?',
        'Erzählen Sie von einer Zeit, in der Sie sich schnell in ein neues Thema einarbeiten mussten.'
      ]
    };

    const questions = templates[competency] || [
      `Beschreiben Sie eine Situation, in der Sie ${competency} unter Beweis stellen konnten.`
    ];

    return {
      competency,
      questions,
      followUpPrompts: Object.values(this.starFramework)
    };
  }

  /**
   * Prüft Stellenanzeige auf Inklusivität
   */
  checkJobPostingInclusivity(text) {
    const issues = [];
    const suggestions = [];

    const biasWarnings = this.checkForBias(text);
    issues.push(...biasWarnings.map(w => ({
      type: 'bias',
      issue: w.found,
      suggestion: w.suggestion
    })));

    const mustHaveMatch = text.match(/(?:must.have|erforderlich|voraussetzung|zwingend)[\s\S]*?(?:\n\n|$)/gi);
    if (mustHaveMatch) {
      const bulletCount = (mustHaveMatch.join(' ').match(/[-•*]/g) || []).length;
      if (bulletCount > 5) {
        issues.push({
          type: 'requirements_overload',
          issue: `${bulletCount} Must-haves gefunden`,
          suggestion: 'Reduziere auf max. 5 echte Must-haves.'
        });
      }
    }

    if (!text.match(/alle.*willkommen|unabhängig.*von|vielfalt|diversity/i)) {
      suggestions.push('Füge ein Diversity-Statement hinzu');
    }

    if (!text.match(/gehalt|salary|€|vergütung/i)) {
      suggestions.push('Gehaltsangabe erhöht Bewerbungsrate signifikant');
    }

    return {
      issues,
      suggestions,
      score: Math.max(0, 100 - (issues.length * 10) - (suggestions.length * 5))
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
   * Validiert Recruiting-spezifische Eingaben
   */
  validateInput(task) {
    if (!task.content || task.content.trim().length < 10) {
      throw new Error('Recruiting-Anfrage zu kurz. Bitte beschreibe dein Anliegen mit mehr Details.');
    }

    if (task.content && task.content.length > 15000) {
      throw new Error('Anfrage zu lang. Bitte kürze auf die wesentlichen Informationen.');
    }

    return true;
  }
}

module.exports = RecruiterAgent;
