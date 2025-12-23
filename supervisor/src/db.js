const Database = require("better-sqlite3");

class DB {
  constructor(dbPath) {
    this.dbPath = dbPath || ":memory:";
    this.db = null;
  }

  init() {
    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");

    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          name TEXT,
          user_id TEXT,
          metadata TEXT,
          created_at TEXT,
          updated_at TEXT,
          deleted INTEGER DEFAULT 0
        )`
      )
      .run();

    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          type TEXT,
          content TEXT,
          priority TEXT,
          assigned_agent TEXT,
          status TEXT,
          result TEXT,
          error TEXT,
          usage TEXT,
          metadata TEXT,
          session_id TEXT,
          created_at TEXT,
          updated_at TEXT
        )`
      )
      .run();

    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS knowledge (
          id TEXT PRIMARY KEY,
          text TEXT,
          source TEXT,
          metadata TEXT,
          tags TEXT,
          created_at TEXT
        )`
      )
      .run();

    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS costs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id TEXT,
          agent TEXT,
          tokens_prompt INTEGER,
          tokens_completion INTEGER,
          cost_usd REAL,
          created_at TEXT
        )`
      )
      .run();

    // Migrate: add name column to sessions if not exists
    try {
      this.db.prepare(`ALTER TABLE sessions ADD COLUMN name TEXT`).run();
    } catch (e) {
      // Column already exists
    }

    // Migrate: add session_id to tasks if not exists
    try {
      this.db.prepare(`ALTER TABLE tasks ADD COLUMN session_id TEXT`).run();
    } catch (e) {
      // Column already exists
    }

    // Migrate: add tags to knowledge if not exists
    try {
      this.db.prepare(`ALTER TABLE knowledge ADD COLUMN tags TEXT`).run();
    } catch (e) {
      // Column already exists
    }
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }

  // Sessions
  insertSession(session) {
    const stmt = this.db.prepare(
      `INSERT INTO sessions (id, name, user_id, metadata, created_at, updated_at, deleted)
       VALUES (@id, @name, @user_id, @metadata, @created_at, @updated_at, @deleted)`
    );
    stmt.run({
      id: session.id,
      name: session.name || `Session ${session.id.substring(0, 8)}`,
      user_id: session.userId || null,
      metadata: JSON.stringify(session.metadata || {}),
      created_at: session.createdAt,
      updated_at: session.updatedAt,
      deleted: session.deleted ? 1 : 0
    });
  }

  getSession(id) {
    const row = this.db
      .prepare(`SELECT * FROM sessions WHERE id = ? AND deleted = 0`)
      .get(id);
    if (!row) return null;

    // Count tasks for this session
    const taskCount = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM tasks WHERE session_id = ?`)
      .get(id);

    return {
      id: row.id,
      name: row.name || `Session ${row.id.substring(0, 8)}`,
      userId: row.user_id,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      created_at: row.created_at,
      updated_at: row.updated_at,
      task_count: taskCount?.cnt || 0,
      status: "active"
    };
  }

  getSessions() {
    const rows = this.db
      .prepare(`SELECT * FROM sessions WHERE deleted = 0 ORDER BY created_at DESC`)
      .all();

    return rows.map(row => {
      const taskCount = this.db
        .prepare(`SELECT COUNT(*) as cnt FROM tasks WHERE session_id = ?`)
        .get(row.id);

      return {
        id: row.id,
        name: row.name || `Session ${row.id.substring(0, 8)}`,
        created_at: row.created_at,
        updated_at: row.updated_at,
        task_count: taskCount?.cnt || 0,
        status: "active"
      };
    });
  }

  deleteSession(id) {
    const info = this.db
      .prepare(`UPDATE sessions SET deleted = 1, updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), id);
    return info.changes > 0;
  }

  // Tasks
  insertTask(task) {
    const stmt = this.db.prepare(
      `INSERT INTO tasks (id, type, content, priority, assigned_agent, status, result, error, usage, metadata, session_id, created_at, updated_at)
       VALUES (@id, @type, @content, @priority, @assigned_agent, @status, @result, @error, @usage, @metadata, @session_id, @created_at, @updated_at)`
    );
    stmt.run({
      id: task.id,
      type: task.type,
      content: task.content,
      priority: task.priority,
      assigned_agent: task.assignedAgent || null,
      status: task.status,
      result: task.result ? JSON.stringify(task.result) : null,
      error: task.error ? JSON.stringify(task.error) : null,
      usage: task.usage ? JSON.stringify(task.usage) : null,
      metadata: JSON.stringify(task.metadata || {}),
      session_id: task.sessionId || null,
      created_at: task.createdAt,
      updated_at: task.updatedAt
    });
  }

  getTask(id) {
    const row = this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id);
    if (!row) return null;
    return this._mapTaskRow(row);
  }

  getTasks({ status, limit = 50, offset = 0 }) {
    let sql = `SELECT * FROM tasks`;
    const params = [];

    if (status) {
      sql += ` WHERE status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = this.db.prepare(sql).all(...params);
    const total = status
      ? this.db.prepare(`SELECT COUNT(*) as cnt FROM tasks WHERE status = ?`).get(status)
      : this.db.prepare(`SELECT COUNT(*) as cnt FROM tasks`).get();

    return {
      tasks: rows.map(row => this._mapTaskRow(row)),
      total: total?.cnt || 0
    };
  }

  getTaskStats() {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' OR status = 'queued' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processing' OR status = 'running' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM tasks
    `).get();

    const byPriority = this.db.prepare(`
      SELECT priority, COUNT(*) as cnt FROM tasks GROUP BY priority
    `).all();

    const byAgent = this.db.prepare(`
      SELECT assigned_agent, COUNT(*) as cnt FROM tasks WHERE assigned_agent IS NOT NULL GROUP BY assigned_agent
    `).all();

    return {
      total: stats?.total || 0,
      pending: stats?.pending || 0,
      processing: stats?.processing || 0,
      completed: stats?.completed || 0,
      failed: stats?.failed || 0,
      byPriority: byPriority.reduce((acc, r) => ({ ...acc, [r.priority || 'normal']: r.cnt }), {}),
      byAgent: byAgent.reduce((acc, r) => ({ ...acc, [r.assigned_agent]: r.cnt }), {})
    };
  }

  _mapTaskRow(row) {
    return {
      id: row.id,
      type: row.type,
      content: row.content,
      priority: row.priority,
      agent_type: row.assigned_agent,
      assignedAgent: row.assigned_agent,
      status: row.status,
      result: row.result ? JSON.parse(row.result) : null,
      error: row.error,
      usage: row.usage ? JSON.parse(row.usage) : null,
      input: row.metadata ? JSON.parse(row.metadata) : {},
      session_id: row.session_id,
      created_at: row.created_at,
      started_at: row.status === 'running' ? row.updated_at : null,
      completed_at: row.status === 'completed' || row.status === 'failed' ? row.updated_at : null
    };
  }

  updateTask(id, patch) {
    const task = this.getTask(id);
    if (!task) return null;
    const updated = { ...task, ...patch, updatedAt: new Date().toISOString() };
    const stmt = this.db.prepare(
      `UPDATE tasks
       SET status = @status,
           assigned_agent = @assigned_agent,
           result = @result,
           error = @error,
           usage = @usage,
           metadata = @metadata,
           updated_at = @updated_at
       WHERE id = @id`
    );
    stmt.run({
      id: updated.id,
      status: updated.status,
      assigned_agent: updated.assignedAgent || updated.agent_type || null,
      result: updated.result ? JSON.stringify(updated.result) : null,
      error: updated.error ? JSON.stringify(updated.error) : null,
      usage: updated.usage ? JSON.stringify(updated.usage) : null,
      metadata: JSON.stringify(updated.input || updated.metadata || {}),
      updated_at: updated.updatedAt
    });
    return updated;
  }

  // Knowledge
  insertKnowledge(item) {
    const stmt = this.db.prepare(
      `INSERT INTO knowledge (id, text, source, metadata, tags, created_at)
       VALUES (@id, @text, @source, @metadata, @tags, @created_at)`
    );
    stmt.run({
      id: item.id,
      text: item.text,
      source: item.source || "manual",
      metadata: JSON.stringify(item.metadata || {}),
      tags: JSON.stringify(item.tags || []),
      created_at: item.createdAt
    });
  }

  searchKnowledge({ query, limit }) {
    const stmt = this.db.prepare(
      `SELECT * FROM knowledge WHERE text LIKE ? ORDER BY created_at DESC LIMIT ?`
    );
    const rows = stmt.all(`%${query}%`, limit);
    return rows.map((r) => ({
      id: r.id,
      text: r.text,
      source: r.source,
      metadata: r.metadata ? JSON.parse(r.metadata) : {},
      tags: r.tags ? JSON.parse(r.tags) : [],
      createdAt: r.created_at
    }));
  }

  getKnowledgeStats() {
    const total = this.db.prepare(`SELECT COUNT(*) as cnt FROM knowledge`).get();
    const totalSize = this.db.prepare(`SELECT SUM(LENGTH(text)) as size FROM knowledge`).get();
    const sources = this.db.prepare(`SELECT source, COUNT(*) as cnt FROM knowledge GROUP BY source`).all();

    return {
      total: total?.cnt || 0,
      totalSize: totalSize?.size || 0,
      categories: sources.reduce((acc, r) => ({ ...acc, [r.source || 'manual']: r.cnt }), {})
    };
  }

  // Costs
  insertCost(entry) {
    const stmt = this.db.prepare(
      `INSERT INTO costs (task_id, agent, tokens_prompt, tokens_completion, cost_usd, created_at)
       VALUES (@task_id, @agent, @tokens_prompt, @tokens_completion, @cost_usd, @created_at)`
    );
    stmt.run({
      task_id: entry.taskId,
      agent: entry.agent,
      tokens_prompt: entry.tokensPrompt || 0,
      tokens_completion: entry.tokensCompletion || 0,
      cost_usd: entry.costUsd || 0,
      created_at: entry.createdAt
    });
  }

  getCostsSummary(period = 'month') {
    // Calculate date filter based on period
    let dateFilter = '';
    const now = new Date();
    if (period === 'day') {
      dateFilter = ` WHERE created_at >= '${now.toISOString().split('T')[0]}'`;
    } else if (period === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      dateFilter = ` WHERE created_at >= '${weekAgo.toISOString()}'`;
    } else if (period === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      dateFilter = ` WHERE created_at >= '${monthAgo.toISOString()}'`;
    }

    const totalRow = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(tokens_prompt), 0) as tokens_prompt,
           COALESCE(SUM(tokens_completion), 0) as tokens_completion,
           COALESCE(SUM(cost_usd), 0) as cost_usd
         FROM costs${dateFilter}`
      )
      .get();

    const perAgent = this.db
      .prepare(
        `SELECT agent,
                COALESCE(SUM(cost_usd), 0) as cost_usd
         FROM costs${dateFilter}
         GROUP BY agent`
      )
      .all();

    // Daily breakdown
    const breakdown = this.db
      .prepare(
        `SELECT DATE(created_at) as date,
                SUM(cost_usd) as cost,
                COUNT(*) as tasks
         FROM costs${dateFilter}
         GROUP BY DATE(created_at)
         ORDER BY date DESC
         LIMIT 30`
      )
      .all();

    return {
      totals: {
        tokensPrompt: totalRow.tokens_prompt,
        tokensCompletion: totalRow.tokens_completion,
        costUsd: totalRow.cost_usd
      },
      byAgent: perAgent.reduce((acc, r) => ({ ...acc, [r.agent]: r.cost_usd }), {}),
      byTaskType: {},
      breakdown: breakdown.map(r => ({ date: r.date, cost: r.cost, tasks: r.tasks }))
    };
  }
}

module.exports = { DB };
