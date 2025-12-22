const request = require("supertest");
const { createApp } = require("../server/app");
const { Supervisor } = require("../supervisor/src/Supervisor");

let app;
let supervisor;

beforeAll(async () => {
  supervisor = new Supervisor({
    dbPath: ":memory:",
    enableCaching: true,
    enableCostTracking: false
  });
  await supervisor.initialize();
  app = createApp({ supervisor });
});

afterAll(async () => {
  await supervisor.shutdown();
});

describe("API smoke tests", () => {
  test("GET /health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  test("GET /api/v1/status", async () => {
    const res = await request(app).get("/api/v1/status");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("create task and get result", async () => {
    const createRes = await request(app)
      .post("/api/v1/tasks")
      .send({ type: "research", content: "API test task" })
      .set("Content-Type", "application/json");
    expect(createRes.status).toBe(202);
    expect(createRes.body.task.id).toBeDefined();
    const id = createRes.body.task.id;

    await new Promise((resolve) => setTimeout(resolve, 80));

    const getRes = await request(app).get(`/api/v1/tasks/${id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.status === "completed" || getRes.body.status === "failed").toBe(true);

    const resultRes = await request(app).get(`/api/v1/tasks/${id}/result`);
    expect(resultRes.status).toBe(200);
    expect(resultRes.body.taskId).toBe(id);
  });
});
