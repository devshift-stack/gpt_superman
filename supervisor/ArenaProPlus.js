/**
 * MUCI-SUPERMAN: Arena Pro+ Mode
 *
 * Multi-Agent Collaboration System
 *
 * Statt ein einzelnes Model zu wählen, arbeiten ALLE Agenten zusammen:
 *
 * 1. TASK DECOMPOSER - Zerlegt komplexe Aufgaben in Teilaufgaben
 * 2. PARALLEL EXECUTION - Jeder Agent bearbeitet seinen Teil
 * 3. SYNTHESIZER - Kombiniert alle Ergebnisse zum besten Output
 * 4. QUALITY CHECKER - Prüft und verbessert das Endergebnis
 *
 * Ergebnis: Das Beste aus jedem Model kombiniert!
 */

const { v4: uuidv4 } = require('uuid');

class ArenaProPlus {
  constructor(agents, config = {}) {
    this.agents = agents; // Map of agent instances
    this.config = {
      maxParallelTasks: config.maxParallelTasks || 6,
      synthesisAgent: config.synthesisAgent || 'creative',
      qualityCheckAgent: config.qualityCheckAgent || 'coding',
      decomposerAgent: config.decomposerAgent || 'research',
      ...config,
    };
  }

  /**
   * HAUPTMETHODE: Führt Arena Pro+ Collaboration aus
   */
  async execute(task) {
    const arenaId = uuidv4();
    const startTime = Date.now();

    console.log(`[arena] Arena Pro+ gestartet: ${arenaId}`);

    try {
      // PHASE 1: Task Decomposition
      console.log('[arena] Phase 1: Task Decomposition...');
      const subtasks = await this.decomposeTask(task);

      // PHASE 2: Parallel Agent Execution
      console.log(`[arena] Phase 2: Parallel Execution (${subtasks.length} subtasks)...`);
      const results = await this.executeParallel(subtasks);

      // PHASE 3: Synthesis
      console.log('[arena] Phase 3: Synthesis...');
      const synthesized = await this.synthesizeResults(task, subtasks, results);

      // PHASE 4: Quality Check & Enhancement
      console.log('[arena] Phase 4: Quality Check...');
      const finalResult = await this.qualityCheck(task, synthesized);

      const duration = Date.now() - startTime;

      console.log(`[arena] Arena Pro+ abgeschlossen in ${duration}ms`);

      return {
        ok: true,
        success: true,
        arenaId,
        mode: 'arena-pro-plus',
        result: finalResult,
        phases: {
          decomposition: `${subtasks.length} Teilaufgaben`,
          agents: results.filter(r => !r.error).map(r => r.agent),
          agentResults: results.length,
          synthesized: true,
          qualityChecked: true,
        },
        duration,
        usage: this.aggregateUsage(results),
      };

    } catch (error) {
      console.error(`[arena] Arena Pro+ Fehler: ${error.message}`);
      return {
        ok: false,
        success: false,
        arenaId,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * PHASE 1: Zerlegt die Aufgabe in Teilaufgaben
   */
  async decomposeTask(task) {
    const decomposer = this.agents[this.config.decomposerAgent];

    if (!decomposer) {
      console.warn('[arena] Decomposer not found, using fallback');
      return this.createFallbackSubtasks(task);
    }

    const decompositionPrompt = `
Du bist ein Task-Decomposer für ein Multi-Agent KI-System namens MUCI-SUPERMAN.

Deine Aufgabe: Zerlege die folgende Benutzeranfrage in 2-6 SPEZIALISIERTE Teilaufgaben.

VERFÜGBARE AGENTEN:
1. RESEARCH - Fakten recherchieren, Informationen sammeln, Erklärungen
2. CODING - Code schreiben, technische Lösungen, Algorithmen, Debugging
3. CREATIVE - Texte schreiben, Marketing, kreative Inhalte, Storytelling
4. ANALYSIS - Daten analysieren, Trends erkennen, Vergleiche, Bewertungen
5. RECRUITER - HR, Stellenanzeigen, Interviews, Kandidaten-Screening
6. SALES - Vertrieb, Pitches, Einwandbehandlung, Akquise

BENUTZERANFRAGE:
"""
${task.content || task.message}
"""

REGELN:
- Jede Teilaufgabe sollte von dem Agent bearbeitet werden, der dafür am besten geeignet ist
- Teilaufgaben sollten parallel ausführbar sein (unabhängig voneinander)
- Jede Teilaufgabe muss klar und spezifisch sein
- Nutze nur Agenten die wirklich sinnvoll beitragen können (nicht alle 6 müssen verwendet werden)
- Mindestens 2, maximal 6 Teilaufgaben

ANTWORTE NUR mit einem JSON-Array in diesem Format:
[
  {
    "id": 1,
    "agent": "research|coding|creative|analysis|recruiter|sales",
    "task": "Konkrete Aufgabenbeschreibung für diesen Agenten",
    "purpose": "Warum dieser Agent diese Aufgabe bekommt"
  }
]

JSON-Array:`;

    try {
      const result = await decomposer.execute({
        type: 'research',
        content: decompositionPrompt,
      });

      // Parse JSON aus der Antwort
      const jsonMatch = result.result.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        const subtasks = JSON.parse(jsonMatch[0]);
        return subtasks.map(st => ({
          ...st,
          originalTask: task.content || task.message,
        }));
      }
    } catch (e) {
      console.warn(`[arena] JSON Parse Fehler: ${e.message}, verwende Fallback`);
    }

    return this.createFallbackSubtasks(task);
  }

  /**
   * Fallback: Standard-Teilaufgaben wenn Decomposition fehlschlägt
   */
  createFallbackSubtasks(task) {
    const content = task.content || task.message;
    return [
      { id: 1, agent: 'research', task: `Recherchiere Hintergrundinformationen zu: ${content}`, purpose: 'Faktensammlung', originalTask: content },
      { id: 2, agent: 'creative', task: `Formuliere eine ansprechende Antwort zu: ${content}`, purpose: 'Kreative Gestaltung', originalTask: content },
      { id: 3, agent: 'analysis', task: `Analysiere und bewerte die Anfrage: ${content}`, purpose: 'Kritische Analyse', originalTask: content },
    ];
  }

  /**
   * PHASE 2: Führt alle Teilaufgaben parallel aus
   */
  async executeParallel(subtasks) {
    const promises = subtasks.map(async (subtask) => {
      const agent = this.agents[subtask.agent];

      if (!agent) {
        console.warn(`[arena] Agent ${subtask.agent} nicht gefunden, überspringe`);
        return {
          subtaskId: subtask.id,
          agent: subtask.agent,
          error: 'Agent not found',
        };
      }

      const agentPrompt = this.createAgentPrompt(subtask);

      try {
        const result = await agent.execute({
          type: subtask.agent,
          content: agentPrompt,
        });

        return {
          subtaskId: subtask.id,
          agent: subtask.agent,
          task: subtask.task,
          purpose: subtask.purpose,
          result: result.result,
          provider: result.provider,
          latency: result.latency,
        };
      } catch (error) {
        console.error(`[arena] Subtask ${subtask.id} fehlgeschlagen: ${error.message}`);
        return {
          subtaskId: subtask.id,
          agent: subtask.agent,
          task: subtask.task,
          error: error.message,
        };
      }
    });

    const results = await Promise.all(promises);
    return results;
  }

  /**
   * Erstellt spezialisierte Prompts für jeden Agenten
   */
  createAgentPrompt(subtask) {
    return `Du arbeitest als Teil eines Multi-Agent-Teams (MUCI-SUPERMAN Arena Pro+).
Deine Rolle: ${subtask.agent.toUpperCase()} AGENT
Dein Auftrag: ${subtask.purpose}

WICHTIG:
- Konzentriere dich NUR auf deinen Spezialbereich
- Liefere detaillierte, hochwertige Ergebnisse
- Deine Antwort wird mit anderen Agenten kombiniert
- Sei konkret und präzise

AUFGABE:
${subtask.task}

URSPRÜNGLICHE BENUTZERANFRAGE:
${subtask.originalTask}

Deine spezialisierte Antwort:`;
  }

  /**
   * PHASE 3: Kombiniert alle Ergebnisse zu einem Gesamtergebnis
   */
  async synthesizeResults(originalTask, subtasks, results) {
    const synthesizer = this.agents[this.config.synthesisAgent];

    if (!synthesizer) {
      // Fallback: Einfache Kombination
      return results
        .filter(r => !r.error && r.result)
        .map(r => `=== ${r.agent.toUpperCase()} ===\n${r.result}`)
        .join('\n\n---\n\n');
    }

    // Baue Kontext aus allen Ergebnissen
    const resultsContext = results.map(r => {
      if (r.error) {
        return `[${r.agent.toUpperCase()} - FEHLER]: ${r.error}`;
      }
      return `
=== ${r.agent.toUpperCase()} AGENT ===
Aufgabe: ${r.task}
Zweck: ${r.purpose}
Ergebnis:
${r.result}
`;
    }).join('\n---\n');

    const synthesisPrompt = `Du bist der SYNTHESIZER im MUCI-SUPERMAN Arena Pro+ System.

DEINE AUFGABE:
Kombiniere die Ergebnisse von ${results.filter(r => !r.error).length} spezialisierten KI-Agenten zu einer PERFEKTEN Gesamtantwort.

URSPRÜNGLICHE BENUTZERANFRAGE:
"""
${originalTask.content || originalTask.message}
"""

ERGEBNISSE DER AGENTEN:
${resultsContext}

ANWEISUNGEN:
1. Analysiere alle Agenten-Ergebnisse sorgfältig
2. Extrahiere die BESTEN Teile aus jedem Ergebnis
3. Kombiniere sie zu einer kohärenten, vollständigen Antwort
4. Entferne Redundanzen und Widersprüche
5. Strukturiere die Antwort klar und verständlich
6. Die finale Antwort sollte BESSER sein als jede einzelne Agent-Antwort

WICHTIG:
- Beantworte die ursprüngliche Frage des Benutzers vollständig
- Nutze die Stärken jedes Agenten optimal
- Erstelle eine professionelle, hochwertige Antwort

DEINE SYNTHESE:`;

    const result = await synthesizer.execute({
      type: 'creative',
      content: synthesisPrompt,
    });

    return result.result;
  }

  /**
   * PHASE 4: Qualitätsprüfung und Verbesserung
   */
  async qualityCheck(originalTask, synthesizedResult) {
    const checker = this.agents[this.config.qualityCheckAgent];

    if (!checker) {
      // Fallback: Keine Quality Check
      return synthesizedResult;
    }

    const qualityPrompt = `Du bist der QUALITY CHECKER im MUCI-SUPERMAN Arena Pro+ System.

DEINE AUFGABE:
Prüfe und verbessere die folgende Antwort, die von mehreren KI-Agenten gemeinsam erstellt wurde.

URSPRÜNGLICHE BENUTZERANFRAGE:
"""
${originalTask.content || originalTask.message}
"""

ZU PRÜFENDE ANTWORT:
"""
${synthesizedResult}
"""

QUALITÄTSKRITERIEN:
1. Vollständigkeit: Wurde die Frage vollständig beantwortet?
2. Korrektheit: Sind alle Fakten und Informationen korrekt?
3. Klarheit: Ist die Antwort klar und verständlich?
4. Struktur: Ist die Antwort gut strukturiert?
5. Relevanz: Enthält sie nur relevante Informationen?
6. Qualität: Entspricht sie professionellen Standards?

ANWEISUNGEN:
- Wenn die Antwort gut ist: Gib sie leicht verbessert zurück
- Wenn Probleme existieren: Korrigiere sie
- Füge fehlende wichtige Informationen hinzu
- Entferne überflüssige Teile
- Verbessere die Formulierung wo nötig

DEINE FINALE, OPTIMIERTE ANTWORT:`;

    const result = await checker.execute({
      type: 'coding',
      content: qualityPrompt,
    });

    return result.result;
  }

  /**
   * Aggregiert Usage-Statistiken
   */
  aggregateUsage(results) {
    const usage = {
      total_tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
      agents_used: [],
      by_agent: {},
    };

    results.forEach(r => {
      if (!r.error) {
        usage.agents_used.push(r.agent);
        usage.by_agent[r.agent] = {
          provider: r.provider,
          latency: r.latency,
        };
      }
    });

    return usage;
  }
}

module.exports = ArenaProPlus;
