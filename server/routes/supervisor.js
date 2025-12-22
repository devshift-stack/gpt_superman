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

  router.get("/agents", (_req, res) => {
    res.json({ agents: supervisor.getAgents() });
  });

  router.post("/tasks", async (req, res, next) => {
    try {
      const input = req.body || {};
      const task = await supervisor.createTask(input);
      res.status(202).json({ task });
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

  router.post("/sessions", async (req, res, next) => {
    try {
      const session = await supervisor.createSession(req.body || {});
      res.status(201).json(session);
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
      res.json({ deleted: true });
    } catch (e) {
      next(e);
    }
  });

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

  router.get("/queue/stats", async (_req, res, next) => {
    try {
      const stats = await supervisor.getQueueStats();
      res.json(stats);
    } catch (e) {
      next(e);
    }
  });

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

  router.get("/costs", async (_req, res, next) => {
    try {
      const costs = await supervisor.getCosts();
      res.json(costs);
    } catch (e) {
      next(e);
    }
  });

  return router;
}

module.exports = { createSupervisorRouter };
