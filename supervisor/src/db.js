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
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }

  insertSession(session) {
    const stmt = this.db.prepare(
      `INSERT INTO sessions (id, user_id, metadata, created_at, updated_at, deleted)
       VALUES (@id, @user_id, @metadata, @created_at, @updated_at, @deleted)`
    );
    stmt.run({
      id: session.id,
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
    return {
      id: row.id,
      userId: row.user_id,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deleted: !!row.deleted
    };
  }

  deleteSession(id) {
    const info = this.db
      .prepare(`UPDATE sessions SET deleted = 1, updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), id);
    return info.changes > 0;
  }

  insertTask(task) {
    const stmt = this.db.prepare(
      `INSERT INTO tasks (id, type, content, priority, assigned_agent, status, result, error, usage, metadata, created_at, updated_at)
       VALUES (@id, @type, @content, @priority, @assigned_agent, @status, @result, @error, @usage, @metadata, @created_at, @updated_at)`
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
      created_at: task.createdAt,
      updated_at: task.updatedAt
    });
  }

  getTask(id) {
    const row = this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id);
    if (!row) return null;
    return {
      id: row.id,
      type: row.type,
      content: row.content,
      priority: row.priority,
      assignedAgent: row.assigned_agent,
      status: row.status,
      result: row.result ? JSON.parse(row.result) : null,
      error: row.error ? JSON.parse(row.error) : null,
      usage: row.usage ? JSON.parse(row.usage) : null,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      createdAt: row.created_at,
      updatedAt: row.updated_at
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
      assigned_agent: updated.assignedAgent || null,
      result: updated.result ? JSON.stringify(updated.result) : null,
      error: updated.error ? JSON.stringify(updated.error) : null,
      usage: updated.usage ? JSON.stringify(updated.usage) : null,
      metadata: JSON.stringify(updated.metadata || {}),
      updated_at: updated.updatedAt
    });
    return updated;
  }

  insertKnowledge(item) {
    const stmt = this.db.prepare(
      `INSERT INTO knowledge (id, text, source, metadata, created_at)
       VALUES (@id, @text, @source, @metadata, @created_at)`
    );
    stmt.run({
      id: item.id,
      text: item.text,
      source: item.source || "manual",
      metadata: JSON.stringify(item.metadata || {}),
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
      createdAt: r.created_at
    }));
  }

  getKnowledgeStats() {
    const row = this.db.prepare(`SELECT COUNT(*) as cnt FROM knowledge`).get();
    return { total: row ? row.cnt : 0 };
  }

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

  getCostsSummary() {
    const totalRow = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(tokens_prompt), 0) as tokens_prompt,
           COALESCE(SUM(tokens_completion), 0) as tokens_completion,
           COALESCE(SUM(cost_usd), 0) as cost_usd
         FROM costs`
      )
      .get();

    const perAgent = this.db
      .prepare(
        `SELECT agent,
                COALESCE(SUM(tokens_prompt), 0) as tokens_prompt,
                COALESCE(SUM(tokens_completion), 0) as tokens_completion,
                COALESCE(SUM(cost_usd), 0) as cost_usd
         FROM costs
         GROUP BY agent`
      )
      .all();

    return {
      totals: {
        tokensPrompt: totalRow.tokens_prompt,
        tokensCompletion: totalRow.tokens_completion,
        costUsd: totalRow.cost_usd
      },
      byAgent: perAgent.map((r) => ({
        agent: r.agent,
        tokensPrompt: r.tokens_prompt,
        tokensCompletion: r.tokens_completion,
        costUsd: r.cost_usd
      }))
    };
  }
}

module.exports = { DB };
