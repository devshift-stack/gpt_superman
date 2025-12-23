const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const http = require("http");
const fs = require("fs");
const { createApp } = require("./app");
const { Supervisor } = require("../supervisor/src/Supervisor");

async function ensureDataDir(dbPath) {
  if (!dbPath || dbPath === ":memory:") return;
  const dir = path.dirname(path.resolve(dbPath));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function bootstrap() {
  const port = Number(process.env.PORT || 3000);
  const dbPath = process.env.DB_PATH || "./data/emir-superman.db";
  const enableCaching = String(process.env.ENABLE_CACHING || "true") === "true";
  const enableCostTracking = String(process.env.ENABLE_COST_TRACKING || "true") === "true";

  await ensureDataDir(dbPath);

  const supervisor = new Supervisor({
    dbPath,
    enableCaching,
    enableCostTracking
  });

  await supervisor.initialize();

  const app = createApp({ supervisor });
  const server = http.createServer(app);

  server.listen(port, () => {
    console.log(`[server] Emir-Superman Supervisor läuft auf http://localhost:${port}/`);
  });

  const shutdown = async (signal) => {
    console.log(`\n[server] Signal empfangen (${signal}), fahre sauber herunter...`);
    try {
      await supervisor.shutdown();
    } catch (e) {
      console.error("[server] Fehler beim Shutdown des Supervisors:", e);
    } finally {
      server.close(() => {
        console.log("[server] HTTP-Server gestoppt.");
        process.exit(0);
      });
      setTimeout(() => {
        console.warn("[server] Force-Exit nach Timeout.");
        process.exit(1);
      }, 5000).unref();
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

bootstrap().catch((err) => {
  console.error("[server] Kritischer Fehler beim Start:", err);
  process.exit(1);
});
