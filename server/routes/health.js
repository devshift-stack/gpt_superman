const express = require("express");

function createHealthRouter() {
  const router = express.Router();

  router.get("/", (_req, res) => {
    res.json({
      status: "ok",
      service: "emir-superman-supervisor",
      now: new Date().toISOString()
    });
  });

  return router;
}

module.exports = { createHealthRouter };
