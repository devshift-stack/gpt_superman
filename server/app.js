const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const path = require("path");
const { createHealthRouter } = require("./routes/health");
const { createSupervisorRouter } = require("./routes/supervisor");

function createApp({ supervisor }) {
  const app = express();

  app.use(helmet());

  app.use(
    cors({
      origin: function (origin, callback) {
        const allowed = (process.env.ALLOWED_ORIGINS || "*").toString();
        if (!origin) return callback(null, true);
        if (allowed === "*") return callback(null, true);
        const list = allowed
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (list.includes(origin)) return callback(null, true);
        return callback(new Error("CORS_NOT_ALLOWED"), false);
      }
    })
  );

  const publicDir = path.join(__dirname, "..", "public");
  app.use(express.static(publicDir));

  app.use(express.json({ limit: "2mb" }));
  app.use(morgan("combined"));

  const maxReq = Number(process.env.RATE_LIMIT || 200);
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: maxReq,
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  app.use("/health", createHealthRouter());

  const apiVersion = (process.env.API_VERSION || "v1").toString();
  app.use(`/api/${apiVersion}`, createSupervisorRouter({ supervisor }));

  app.use((_req, res) => {
    res.status(404).json({ error: "NOT_FOUND" });
  });

  app.use((err, _req, res, _next) => {
    console.error("[api_error]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message || "Internal error" });
  });

  return app;
}

module.exports = { createApp };
