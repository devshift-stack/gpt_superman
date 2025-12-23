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
    const queueStats = this.queue.getStats();
    const uptime = Math.floor((Date.now() - new Date(this.startedAt).getTime()) / 1000);

    return {
      ok: true,
      status: "running",
      startedAt: this.startedAt,
      now: new Date().toISOString(),
      uptime,
      version: "2.0.0",
      agents_online: 8,
      agents_total: 8,
      queue_size: queueStats.pending + queueStats.processing,
      memory_usage: process.memoryUsage().heapUsed / 1024 / 1024,
      cpu_usage: 0,
      dbPath: this.dbPath,
      queue: queueStats,
      cache: this.cache.stats(),
      vector: {
        enabled: false,
        mode: "sqlite-like"
      }
    };
  }

  // Sessions
  async createSession(input) {
    const id = input.id || randomUUID();
    const now = new Date().toISOString();
    const session = {
      id,
      name: input.name || `Session ${id.substring(0, 8)}`,
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

  async getSessions() {
    return this.db.getSessions();
  }

  async deleteSession(id) {
    return this.db.deleteSession(id);
  }

  // Tasks
  async createTask(input) {
    const id = input.id || randomUUID();
    const now = new Date().toISOString();
    const type = input.type || "research";
    const agent = getAgentByType(type);

    const task = {
      id,
      type,
      content: input.content || "",
      priority: input.priority || "normal",
      assignedAgent: agent ? agent.id : null,
      status: "queued",
      result: null,
      error: null,
      usage: null,
      metadata: input.metadata || {},
      sessionId: input.session_id || null,
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

  async getTasks({ status, limit, offset }) {
    return this.db.getTasks({ status, limit, offset });
  }

  async cancelTask(id) {
    const task = this.db.getTask(id);
    if (!task) return false;
    if (task.status === 'completed' || task.status === 'failed') return false;

    this.db.updateTask(id, { status: 'cancelled', updatedAt: new Date().toISOString() });
    return true;
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
      result = this.simulateAgentResponse(agent, task);
      usage = result.usage || null;

      if (usage && this.enableCostTracking) {
        this.db.insertCost({
          taskId: task.id,
          agent: agent.id,
          tokensPrompt: usage.tokensPrompt || 0,
          tokensCompletion: usage.tokensCompletion || 0,
          costUsd: usage.costUsd || 0,
          createdAt: now
        });
      }

      this.cache.set(cacheKeyParts, result);

      this.db.updateTask(task.id, {
        status: "completed",
        result,
        error: null,
        usage
      });
    } catch (e) {
      error = e.message;
      this.db.updateTask(task.id, {
        status: "failed",
        result: null,
        error
      });
    }
  }

  simulateAgentResponse(agent, task) {
    const base = {
      agent: agent.id,
      type: agent.type,
      taskId: task.id,
      usage: {
        tokensPrompt: Math.floor(100 + Math.random() * 400),
        tokensCompletion: Math.floor(200 + Math.random() * 600),
        costUsd: 0.001
      }
    };

    if (agent.type === "research") {
      return {
        ...base,
        output: "Stub-Research: Markt-Insights und Quellensammlung.",
        sources: ["quelle1.com", "quelle2.org"],
        summary: "Eine kurze Zusammenfassung aus dem Research-Agenten.",
        mode: "stub",
        cacheHit: false
      };
    }

    if (agent.type === "analysis") {
      return {
        ...base,
        output: "Stub-Analysis: Dein Input wurde analysiert.",
        insights: [
          "Insight 1: Trends zeigen stabile Entwicklung.",
          "Insight 2: Marktpotenzial in neuen Segmenten.",
          "Insight 3: Risiken bei bestimmten Abhängigkeiten."
        ],
        kpis: { trend: 0.85, sentiment: 0.6, quality: 0.75 },
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
        email: "Hallo, dies ist eine Stub-E-Mail deines Creative-Agents.",
        mode: "stub",
        cacheHit: false
      };
    }

    if (agent.type === "coding") {
      return {
        ...base,
        output: "Stub-Coding: Beispiel-Code-Snippet auf Basis des Inputs.",
        snippet: "<section>\n  <h1>Emir-Superman Supervisor</h1>\n</section>",
        language: "html",
        mode: "stub",
        cacheHit: false
      };
    }

    return {
      ...base,
      output: "Generische Stub-Antwort eines unbekannten Agententyps.",
      mode: "stub",
      cacheHit: false
    };
  }

  // Knowledge
  async addKnowledge(input) {
    const id = input.id || randomUUID();
    const now = new Date().toISOString();
    const item = {
      id,
      text: input.text || input.content || "",
      source: input.source || "manual",
      metadata: input.metadata || {},
      tags: input.tags || [],
      createdAt: now
    };
    this.db.insertKnowledge(item);
    return item;
  }

  async searchKnowledge({ query, limit }) {
    if (!query || !query.trim()) {
      return { mode: "sqlite-like", count: 0, results: [], entries: [], total: 0, query: "" };
    }
    const rows = this.db.searchKnowledge({ query, limit });
    return {
      mode: "sqlite-like",
      count: rows.length,
      total: rows.length,
      query,
      results: rows.map((r) => ({
        id: r.id,
        source: r.source,
        snippet: r.text,
        content: r.text,
        metadata: r.metadata,
        createdAt: r.createdAt
      })),
      entries: rows.map((r) => ({
        id: r.id,
        content: r.text,
        source: r.source,
        metadata: r.metadata,
        created_at: r.createdAt
      }))
    };
  }

  async getKnowledgeStats() {
    const stats = this.db.getKnowledgeStats();
    return {
      total_entries: stats.total,
      total_size: stats.totalSize,
      categories: stats.categories || {}
    };
  }

  // Queue
  async getQueueStats() {
    const stats = this.queue.getStats();
    const taskStats = this.db.getTaskStats();

    return {
      total_tasks: taskStats.total,
      pending: stats.pending || taskStats.pending,
      processing: stats.processing || taskStats.processing,
      completed: taskStats.completed,
      failed: taskStats.failed,
      by_priority: taskStats.byPriority || { low: 0, normal: 0, high: 0, critical: 0 },
      by_agent: taskStats.byAgent || {}
    };
  }

  // Cache
  async getCacheStats() {
    return this.cache.stats();
  }

  async invalidateCache(pattern) {
    return this.cache.invalidate(pattern || "*");
  }

  // Costs
  async getCosts(period = 'month') {
    if (!this.enableCostTracking) {
      return {
        enabled: false,
        total_cost: 0,
        by_agent: {},
        by_task_type: {},
        period,
        breakdown: []
      };
    }
    const summary = this.db.getCostsSummary(period);
    return {
      enabled: true,
      total_cost: summary.totals?.costUsd || 0,
      by_agent: summary.byAgent || {},
      by_task_type: summary.byTaskType || {},
      period,
      breakdown: summary.breakdown || []
    };
  }
}

module.exports = { Supervisor };
