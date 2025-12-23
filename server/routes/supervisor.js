const express = require("express");

function createSupervisorRouter({ supervisor }) {
  const router = express.Router();

  router.get("/status", async (_req, res, next) => {
    try {
      const status = await supervisor.getStatus();
      res.json(status);
    } catch (e) {
      next(e);
    }
  });

  // Tasks
  router.post("/tasks", async (req, res, next) => {
    try {
      const input = req.body || {};
      const task = await supervisor.createTask(input);
      res.status(202).json({ task });
    } catch (e) {
      next(e);
    }
  });

  router.get("/tasks", async (req, res, next) => {
    try {
      const status = req.query.status || null;
      const limit = Number(req.query.limit) || 50;
      const offset = Number(req.query.offset) || 0;
      const tasks = await supervisor.getTasks({ status, limit, offset });
      res.json(tasks);
    } catch (e) {
      next(e);
    }
  });

  router.get("/tasks/:id", async (req, res, next) => {
    try {
      const task = await supervisor.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ error: "TASK_NOT_FOUND" });
      }
      res.json(task);
    } catch (e) {
      next(e);
    }
  });

  router.get("/tasks/:id/result", async (req, res, next) => {
    try {
      const result = await supervisor.getTaskResult(req.params.id);
      if (!result) {
        return res.status(404).json({ error: "TASK_NOT_FOUND_OR_NO_RESULT" });
      }
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  router.post("/tasks/:id/cancel", async (req, res, next) => {
    try {
      const result = await supervisor.cancelTask(req.params.id);
      res.json({ success: result });
    } catch (e) {
      next(e);
    }
  });

  // Sessions
  router.post("/sessions", async (req, res, next) => {
    try {
      const session = await supervisor.createSession(req.body || {});
      res.status(201).json(session);
    } catch (e) {
      next(e);
    }
  });

  router.get("/sessions", async (_req, res, next) => {
    try {
      const sessions = await supervisor.getSessions();
      res.json(sessions);
    } catch (e) {
      next(e);
    }
  });

  router.get("/sessions/:id", async (req, res, next) => {
    try {
      const session = await supervisor.getSession(req.params.id);
      if (!session) return res.status(404).json({ error: "SESSION_NOT_FOUND" });
      res.json(session);
    } catch (e) {
      next(e);
    }
  });

  router.delete("/sessions/:id", async (req, res, next) => {
    try {
      const ok = await supervisor.deleteSession(req.params.id);
      if (!ok) return res.status(404).json({ error: "SESSION_NOT_FOUND" });
      res.json({ deleted: true, success: true });
    } catch (e) {
      next(e);
    }
  });

  // Knowledge
  router.post("/knowledge", async (req, res, next) => {
    try {
      const item = await supervisor.addKnowledge(req.body || {});
      res.status(201).json(item);
    } catch (e) {
      next(e);
    }
  });

  router.get("/knowledge/search", async (req, res, next) => {
    try {
      const query = (req.query.query || "").toString();
      const limit = Number(req.query.limit || 10);
      const result = await supervisor.searchKnowledge({ query, limit });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  router.get("/knowledge/stats", async (_req, res, next) => {
    try {
      const stats = await supervisor.getKnowledgeStats();
      res.json(stats);
    } catch (e) {
      next(e);
    }
  });

  // Queue
  router.get("/queue/stats", async (_req, res, next) => {
    try {
      const stats = await supervisor.getQueueStats();
      res.json(stats);
    } catch (e) {
      next(e);
    }
  });

  // Cache
  router.get("/cache/stats", async (_req, res, next) => {
    try {
      const stats = await supervisor.getCacheStats();
      res.json(stats);
    } catch (e) {
      next(e);
    }
  });

  router.post("/cache/invalidate", async (req, res, next) => {
    try {
      const pattern = (req.body && req.body.pattern) || "*";
      const result = await supervisor.invalidateCache(pattern);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // Costs
  router.get("/costs", async (req, res, next) => {
    try {
      const period = req.query.period || 'month';
      const costs = await supervisor.getCosts(period);
      res.json(costs);
    } catch (e) {
      next(e);
    }
  });

  return router;
}

module.exports = { createSupervisorRouter };
