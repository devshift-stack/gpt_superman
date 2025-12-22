const { randomUUID } = require("crypto");
const { DB } = require("./db");
const { InMemoryQueue } = require("./queue");
const { CacheService } = require("./cache");
const { AGENTS, getAgentByType } = require("./agents");

class Supervisor {
  constructor({ dbPath, enableCaching, enableCostTracking }) {
    this.dbPath = dbPath || ":memory:";
    this.enableCostTracking = !!enableCostTracking;
    this.db = new DB(this.dbPath);
    this.queue = new InMemoryQueue();
    this.cache = new CacheService({ enabled: enableCaching });
    this.startedAt = new Date().toISOString();
  }

  async initialize() {
    this.db.init();
    this.queue.setWorker(async (job) => {
      await this.processTask(job.taskId);
    });
  }

  async shutdown() {
    this.db.close();
  }

  getAgents() {
    return AGENTS;
  }

  async getStatus() {
    return {
      ok: true,
      startedAt: this.startedAt,
      now: new Date().toISOString(),
      dbPath: this.dbPath,
      queue: this.queue.getStats(),
      cache: this.cache.stats(),
      vector: {
        enabled: false,
        mode: "sqlite-like"
      }
    };
  }

  async createSession(input) {
    const id = input.id || randomUUID();
    const now = new Date().toISOString();
    const session = {
      id,
      userId: input.userId || null,
      metadata: input.metadata || {},
      createdAt: now,
      updatedAt: now,
      deleted: false
    };
    this.db.insertSession(session);
    return session;
  }

  async getSession(id) {
    return this.db.getSession(id);
  }

  async deleteSession(id) {
    return this.db.deleteSession(id);
  }

  async createTask(input) {
    const id = input.id || randomUUID();
    const now = new Date().toISOString();
    const type = input.type || "research";
    const agent = getAgentByType(type);

    const task = {
      id,
      type,
      content: input.content || "",
      priority: input.priority || "medium",
      assignedAgent: agent ? agent.id : null,
      status: "queued",
      result: null,
      error: null,
      usage: null,
      metadata: input.metadata || {},
      createdAt: now,
      updatedAt: now
    };

    this.db.insertTask(task);

    await this.queue.add({ taskId: id });

    return {
      id: task.id,
      type: task.type,
      assignedAgent: task.assignedAgent,
      status: task.status,
      priority: task.priority
    };
  }

  async getTask(id) {
    return this.db.getTask(id);
  }

  async getTaskResult(id) {
    const task = this.db.getTask(id);
    if (!task) return null;
    return {
      taskId: task.id,
      status: task.status,
      result: task.result,
      error: task.error,
      usage: task.usage
    };
  }

  async processTask(taskId) {
    const task = this.db.getTask(taskId);
    if (!task) {
      console.warn("[supervisor] Task nicht gefunden:", taskId);
      return;
    }
    if (task.status !== "queued" && task.status !== "running") {
      return;
    }

    const agent = getAgentByType(task.type);
    const now = new Date().toISOString();

    const cacheKeyParts = ["task", task.type, task.assignedAgent || "none", task.content.trim()];
    const cached = this.cache.get(cacheKeyParts);
    if (cached) {
      const updated = this.db.updateTask(task.id, {
        status: "completed",
        result: { ...cached, cacheHit: true },
        error: null,
        usage: cached.usage || null
      });
      return updated;
    }

    this.db.updateTask(task.id, { status: "running" });

    let result;
    let error = null;
    let usage = null;
    try {
      result = this.runStubAgent(agent, task);
      usage = {
        tokensPrompt: Math.max(1, Math.round(task.content.length / 4)),
        tokensCompletion: Math.max(1, Math.round((result.output || "").length / 4)),
        costUsd: 0
      };
    } catch (e) {
      console.error("[supervisor] Fehler im Agent:", e);
      error = { message: e.message || "Agent-Fehler" };
      result = null;
    }

    const finalTask = this.db.updateTask(task.id, {
      status: error ? "failed" : "completed",
      result: result,
      error,
      usage
    });

    if (!error && result) {
      this.cache.set(cacheKeyParts, result, 600);
    }

    if (this.enableCostTracking && usage) {
      this.db.insertCost({
        taskId: task.id,
        agent: agent ? agent.id : "unknown",
        tokensPrompt: usage.tokensPrompt,
        tokensCompletion: usage.tokensCompletion,
        costUsd: usage.costUsd,
        createdAt: now
      });
    }

    return finalTask;
  }

  runStubAgent(agent, task) {
    const base = {
      agentId: agent ? agent.id : null,
      type: task.type,
      content: task.content,
      createdAt: new Date().toISOString()
    };

    if (!agent) {
      return {
        ...base,
        output:
          "Kein spezifischer Agent konfiguriert. Dies ist eine generische Stub-Antwort basierend auf dem eingegebenen Text.",
        mode: "stub",
        cacheHit: false
      };
    }

    if (agent.type === "research") {
      return {
        ...base,
        output: `Stub-Research-Ergebnis: Zusammenfassung von (${task.content.slice(0, 120)}...).`,
        bullets: [
          "Punkt 1: Diese Stub-Antwort demonstriert das Verhalten des Research-Agents.",
          "Punkt 2: In einer echten Umgebung würde hier ein LLM aufgerufen.",
          "Punkt 3: Du kannst dieses System bereits für Strukturen und Flows nutzen.",
          "Punkt 4: Ergebnisse werden in SQLite gespeichert und sind über die API abrufbar."
        ],
        mode: "stub",
        cacheHit: false
      };
    }

    if (agent.type === "analysis") {
      return {
        ...base,
        output: "Stub-Analyse: extrahierte Kernpunkte und einfache Bewertung.",
        findings: [
          { label: "Zielgruppen", value: "Mehrere potenzielle Segmente basierend auf dem Input." },
          { label: "Pain-Points", value: "Die Stub-Analyse benennt typische Probleme und Risiken." },
          { label: "Chancen", value: "Identifiziert Opportunities, die du im echten Business prüfen kannst." }
        ],
        mode: "stub",
        cacheHit: false
      };
    }

    if (agent.type === "creative") {
      return {
        ...base,
        output: "Stub-Creative: Beispiel-Text, Hooks und eine Mini-Mail.",
        hook: "Emir-Superman: Dein KI-Supervisor für Sales, Prozesse und Wissen.",
        subjectLines: [
          "Wie dein KI-Supervisor Sales-Aufgaben übernimmt",
          "Dein digitaler Superheld im Business-Alltag",
          "Supervisor-Agents, die wirklich arbeiten"
        ],
        email: "Hallo, dies ist eine Stub-E-Mail deines Creative-Agents. In einer echten Umgebung würdest du hier produktionsreife Texte bekommen.",
        mode: "stub",
        cacheHit: false
      };
    }

    if (agent.type === "coding") {
      return {
        ...base,
        output: "Stub-Coding: Beispiel-Code-Snippet auf Basis des Inputs.",
        snippet:
          "<section>\n  <h1>Emir-Superman Supervisor</h1>\n  <p>Dies ist ein Stub-Code-Snippet aus dem Coding-Agenten.</p>\n</section>",
        language: "html",
        mode: "stub",
        cacheHit: false
      };
    }

    return {
      ...base,
      output:
        "Generische Stub-Antwort eines unbekannten Agententyps. Die Architektur funktioniert, aber dieser Typ ist noch nicht spezifiziert.",
      mode: "stub",
      cacheHit: false
    };
  }

  async addKnowledge(input) {
    const id = input.id || randomUUID();
    const now = new Date().toISOString();
    const item = {
      id,
      text: input.text || "",
      source: input.source || "manual",
      metadata: input.metadata || {},
      createdAt: now
    };
    this.db.insertKnowledge(item);
    return item;
  }

  async searchKnowledge({ query, limit }) {
    if (!query || !query.trim()) {
      return { mode: "sqlite-like", count: 0, results: [] };
    }
    const rows = this.db.searchKnowledge({ query, limit });
    return {
      mode: "sqlite-like",
      count: rows.length,
      results: rows.map((r) => ({
        id: r.id,
        source: r.source,
        snippet: r.text,
        metadata: r.metadata,
        createdAt: r.createdAt
      }))
    };
  }

  async getQueueStats() {
    return this.queue.getStats();
  }

  async getCacheStats() {
    return this.cache.stats();
  }

  async invalidateCache(pattern) {
    return this.cache.invalidate(pattern || "*");
  }

  async getCosts() {
    if (!this.enableCostTracking) {
      return {
        enabled: false,
        totals: { tokensPrompt: 0, tokensCompletion: 0, costUsd: 0 },
        byAgent: []
      };
    }
    const summary = this.db.getCostsSummary();
    return {
      enabled: true,
      totals: summary.totals,
      byAgent: summary.byAgent
    };
  }
}

module.exports = { Supervisor };
