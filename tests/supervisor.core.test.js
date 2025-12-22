const { Supervisor } = require("../supervisor/src/Supervisor");

describe("Supervisor Core", () => {
  let supervisor;

  beforeAll(async () => {
    supervisor = new Supervisor({
      dbPath: ":memory:",
      enableCaching: true,
      enableCostTracking: true
    });
    await supervisor.initialize();
  });

  afterAll(async () => {
    await supervisor.shutdown();
  });

  test("status returns ok", async () => {
    const status = await supervisor.getStatus();
    expect(status.ok).toBe(true);
    expect(status.queue).toBeDefined();
  });

  test("can create, process and read a task", async () => {
    const created = await supervisor.createTask({
      type: "research",
      content: "Test-Content",
      priority: "medium",
      metadata: { test: true }
    });
    expect(created).toHaveProperty("id");
    const taskId = created.id;

    await new Promise((resolve) => setTimeout(resolve, 50));

    const task = await supervisor.getTask(taskId);
    expect(task).not.toBeNull();
    expect(task.status === "completed" || task.status === "failed").toBe(true);

    const result = await supervisor.getTaskResult(taskId);
    expect(result).not.toBeNull();
    expect(result.taskId).toBe(taskId);
  });

  test("knowledge insert and search", async () => {
    const item = await supervisor.addKnowledge({
      text: "Berlin ist die Hauptstadt von Deutschland.",
      source: "test",
      metadata: { tag: "hauptstadt" }
    });
    expect(item.id).toBeDefined();

    const search = await supervisor.searchKnowledge({ query: "Hauptstadt", limit: 5 });
    expect(search.count).toBeGreaterThan(0);
  });
});
