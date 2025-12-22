const apiBase = "/api/v1";

let currentTaskId = null;
let pollIntervalId = null;

function $(id) {
  return document.getElementById(id);
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (e) {
    return String(value);
  }
}

async function fetchJson(url, options) {
  const resp = await fetch(url, options);
  const text = await resp.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_e) {
      data = null;
    }
  }
  if (!resp.ok) {
    const err = new Error((data && data.error) || `HTTP ${resp.status}`);
    err.status = resp.status;
    err.data = data;
    throw err;
  }
  return data;
}

function showToast(message, type) {
  const toast = $("app-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("toast-hidden", "toast-type-error");
  if (type === "error") toast.classList.add("toast-type-error");
  setTimeout(() => {
    toast.classList.add("toast-hidden");
  }, 3000);
}

/* STATUS */

async function loadStatus() {
  const healthEl = $("status-health");
  const supEl = $("status-supervisor");
  const subsEl = $("status-subsystems");

  try {
    const [health, status] = await Promise.all([fetchJson("/health"), fetchJson(`${apiBase}/status`)]);

    if (healthEl) healthEl.textContent = safeJsonStringify(health);
    if (supEl) {
      const view = {
        ok: status.ok,
        startedAt: status.startedAt,
        now: status.now,
        dbPath: status.dbPath
      };
      supEl.textContent = safeJsonStringify(view);
    }
    if (subsEl) {
      const view = {
        queue: status.queue,
        cache: status.cache,
        vector: status.vector
      };
      subsEl.textContent = safeJsonStringify(view);
    }
  } catch (e) {
    if (healthEl) healthEl.textContent = "Fehler beim Laden.";
    if (supEl) supEl.textContent = safeJsonStringify({ error: e.message });
    if (subsEl) subsEl.textContent = "";
    showToast(`Status konnte nicht geladen werden: ${e.message}`, "error");
  }
}

/* AGENTS */

async function loadAgents() {
  const container = $("agents-list");
  if (!container) return;

  try {
    container.textContent = "Lade Agents...";
    const data = await fetchJson(`${apiBase}/agents`);
    const agents = Array.isArray(data.agents) ? data.agents : [];

    if (agents.length === 0) {
      container.textContent = "Keine Agents registriert.";
      return;
    }

    container.innerHTML = "";
    for (const a of agents) {
      const div = document.createElement("div");
      div.className = "agent-card";

      const header = document.createElement("div");
      header.className = "agent-header";

      const left = document.createElement("div");
      left.textContent = a.name || a.id;

      const typeBadge = document.createElement("span");
      typeBadge.className = "agent-type";
      typeBadge.textContent = a.type || "unknown";

      header.appendChild(left);
      header.appendChild(typeBadge);

      const desc = document.createElement("div");
      desc.className = "agent-desc";
      desc.textContent = a.description || "";

      const meta = document.createElement("div");
      meta.className = "agent-meta";

      const chipPrimary = document.createElement("span");
      chipPrimary.className = "chip";
      chipPrimary.textContent = `primary: ${a.primary?.provider || "-"} · ${a.primary?.model || "-"}`;

      const chipFallback = document.createElement("span");
      chipFallback.className = "chip";
      chipFallback.textContent = `fallback: ${a.fallback?.provider || "-"} · ${a.fallback?.model || "-"}`;

      meta.appendChild(chipPrimary);
      meta.appendChild(chipFallback);

      div.appendChild(header);
      div.appendChild(desc);
      div.appendChild(meta);

      container.appendChild(div);
    }
  } catch (e) {
    container.textContent = "Fehler beim Laden der Agents.";
    showToast(`Agents konnten nicht geladen werden: ${e.message}`, "error");
  }
}

/* TASKS */

function clearPollInterval() {
  if (pollIntervalId != null) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
}

function updateCurrentTaskSummary(task) {
  const el = $("task-current-summary");
  if (!el) return;
  if (!task) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = "";

  const pillId = document.createElement("span");
  pillId.className = "pill pill-strong";
  pillId.textContent = `id: ${task.id}`;
  el.appendChild(pillId);

  const pillType = document.createElement("span");
  pillType.className = "pill";
  pillType.textContent = `type: ${task.type}`;
  el.appendChild(pillType);

  const pillAgent = document.createElement("span");
  pillAgent.className = "pill";
  pillAgent.textContent = `agent: ${task.assignedAgent || "-"}`;
  el.appendChild(pillAgent);

  const pillStatus = document.createElement("span");
  pillStatus.className = "pill";
  pillStatus.textContent = `status: ${task.status || "-"}`;
  el.appendChild(pillStatus);

  const input = $("task-id-input");
  if (input && !input.value) input.value = task.id;
}

async function createTaskFromForm(event) {
  event.preventDefault();
  const typeEl = $("task-type");
  const priorityEl = $("task-priority");
  const contentEl = $("task-content");
  const cacheEl = $("task-cache");
  const msgEl = $("task-form-message");
  if (!typeEl || !contentEl) return;

  const payload = {
    type: typeEl.value,
    content: contentEl.value,
    priority: priorityEl ? priorityEl.value : "medium",
    metadata: { source: "frontend-ui" },
    options: { cache: !!(cacheEl && cacheEl.checked) }
  };

  if (msgEl) {
    msgEl.textContent = "Task wird angelegt...";
    msgEl.style.color = "";
  }

  try {
    const data = await fetchJson(`${apiBase}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const task = data.task;
    if (!task) throw new Error("Response enthält kein Task-Objekt.");

    currentTaskId = task.id;
    updateCurrentTaskSummary({
      id: task.id,
      type: payload.type,
      assignedAgent: task.assignedAgent,
      status: task.status
    });

    if (msgEl) {
      msgEl.textContent = `Task erstellt (id: ${task.id}). Ergebnis wird geladen...`;
      msgEl.style.color = "#a5b4fc";
    }

    const autoPoll = $("task-auto-poll");
    if (autoPoll && autoPoll.checked) {
      startPollingTask(task.id);
    } else {
      loadTask(task.id);
    }

    showToast("Task erfolgreich erstellt.", "info");
  } catch (e) {
    if (msgEl) {
      msgEl.textContent = `Fehler beim Erstellen des Tasks: ${e.message}`;
      msgEl.style.color = "#fca5a5";
    }
    showToast(`Task konnte nicht erstellt werden: ${e.message}`, "error");
  }
}

async function loadTask(taskId) {
  const id = taskId || ($("task-id-input") && $("task-id-input").value.trim());
  const detailsEl = $("task-details-output");
  const resultEl = $("task-result-output");
  const pollStatusEl = $("task-poll-status");

  if (!id) {
    showToast("Bitte eine Task‑ID angeben.", "error");
    return;
  }

  if (pollStatusEl) pollStatusEl.textContent = "Lade Task...";

  try {
    const task = await fetchJson(`${apiBase}/tasks/${encodeURIComponent(id)}`);
    if (detailsEl) detailsEl.textContent = safeJsonStringify(task);
    updateCurrentTaskSummary(task);

    if (resultEl) {
      if (task.result || task.error) {
        const resView = {
          status: task.status,
          result: task.result || null,
          error: task.error || null,
          usage: task.usage || null
        };
        resultEl.textContent = safeJsonStringify(resView);
      } else {
        resultEl.textContent = "Noch kein Resultat vorhanden. Status: " + (task.status || "unbekannt");
      }
    }

    if (pollStatusEl) {
      if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
        pollStatusEl.textContent = `Status: ${task.status}`;
      } else {
        pollStatusEl.textContent = `Status: ${task.status} – kann weiter gepollt werden.`;
      }
    }

    currentTaskId = id;
  } catch (e) {
    if (detailsEl) detailsEl.textContent = "Task konnte nicht geladen werden.";
    if (resultEl) resultEl.textContent = "";
    if (pollStatusEl) pollStatusEl.textContent = "";
    showToast(`Task‑Laden fehlgeschlagen: ${e.message}`, "error");
  }
}

function startPollingTask(taskId) {
  clearPollInterval();
  const pollStatusEl = $("task-poll-status");
  currentTaskId = taskId;

  pollIntervalId = setInterval(async () => {
    if (!currentTaskId) {
      clearPollInterval();
      return;
    }
    try {
      const task = await fetchJson(`${apiBase}/tasks/${encodeURIComponent(currentTaskId)}`);
      updateCurrentTaskSummary(task);
      if (pollStatusEl) pollStatusEl.textContent = `Auto‑Refresh · Status: ${task.status}`;

      const detailsEl = $("task-details-output");
      const resultEl = $("task-result-output");
      if (detailsEl) detailsEl.textContent = safeJsonStringify(task);
      if (resultEl && (task.result || task.error)) {
        const resView = {
          status: task.status,
          result: task.result || null,
          error: task.error || null,
          usage: task.usage || null
        };
        resultEl.textContent = safeJsonStringify(resView);
      }

      if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
        clearPollInterval();
        if (pollStatusEl) pollStatusEl.textContent = `Finaler Status: ${task.status}`;
      }
    } catch (e) {
      if (pollStatusEl) pollStatusEl.textContent = "Fehler beim Polling.";
      showToast(`Fehler beim Polling: ${e.message}`, "error");
      clearPollInterval();
    }
  }, 1000);
}

/* KNOWLEDGE */

async function saveKnowledge(event) {
  event.preventDefault();
  const textEl = $("kb-text");
  const sourceEl = $("kb-source");
  const msgEl = $("kb-form-message");
  if (!textEl) return;

  const payload = {
    text: textEl.value,
    source: sourceEl && sourceEl.value ? sourceEl.value : "frontend",
    metadata: { origin: "frontend-ui" }
  };

  if (msgEl) {
    msgEl.textContent = "Speichere...";
    msgEl.style.color = "";
  }

  try {
    const data = await fetchJson(`${apiBase}/knowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (msgEl) {
      msgEl.textContent = `Gespeichert (id: ${data.id}).`;
      msgEl.style.color = "#a5b4fc";
    }
    showToast("Knowledge gespeichert.", "info");
    textEl.value = "";
  } catch (e) {
    if (msgEl) {
      msgEl.textContent = `Fehler beim Speichern: ${e.message}`;
      msgEl.style.color = "#fca5a5";
    }
    showToast(`Knowledge konnte nicht gespeichert werden: ${e.message}`, "error");
  }
}

async function searchKnowledge(event) {
  event.preventDefault();
  const queryEl = $("kb-query");
  const resultsEl = $("kb-search-results");
  const metaEl = $("kb-search-meta");
  if (!queryEl || !resultsEl) return;

  const q = queryEl.value.trim();
  if (!q) {
    showToast("Bitte einen Suchbegriff eingeben.", "error");
    return;
  }

  if (metaEl) metaEl.textContent = "Suche...";
  resultsEl.innerHTML = "";

  try {
    const data = await fetchJson(`${apiBase}/knowledge/search?query=${encodeURIComponent(q)}&limit=10`);
    const mode = data.mode || "unknown";
    const count = data.count || 0;

    if (metaEl) metaEl.textContent = `Treffer: ${count} · Modus: ${mode}`;

    if (!Array.isArray(data.results) || data.results.length === 0) {
      resultsEl.textContent = "Keine Treffer.";
      return;
    }

    resultsEl.innerHTML = "";
    for (const item of data.results) {
      const div = document.createElement("div");
      div.className = "kb-item";

      const header = document.createElement("div");
      header.className = "kb-item-header";

      const idSpan = document.createElement("span");
      idSpan.textContent = item.id || "(ohne id)";
      header.appendChild(idSpan);

      const metaWrap = document.createElement("div");
      metaWrap.className = "kb-item-meta";

      if (item.source) {
        const s = document.createElement("span");
        s.textContent = item.source;
        metaWrap.appendChild(s);
      }

      header.appendChild(metaWrap);

      const snippet = document.createElement("div");
      snippet.className = "kb-item-snippet";
      snippet.textContent = item.snippet || (item.metadata && item.metadata.text) || "";

      div.appendChild(header);
      div.appendChild(snippet);
      resultsEl.appendChild(div);
    }
  } catch (e) {
    if (metaEl) metaEl.textContent = "Fehler bei der Suche.";
    resultsEl.textContent = "";
    showToast(`Knowledge‑Suche fehlgeschlagen: ${e.message}`, "error");
  }
}

/* TOOLS */

async function loadQueueStats() {
  const out = $("queue-stats-output");
  if (!out) return;
  out.textContent = "Lade...";
  try {
    const data = await fetchJson(`${apiBase}/queue/stats`);
    out.textContent = safeJsonStringify(data);
  } catch (e) {
    out.textContent = "Fehler beim Laden der Queue‑Stats.";
    showToast(`Queue‑Stats konnten nicht geladen werden: ${e.message}`, "error");
  }
}

async function loadCacheStats() {
  const out = $("cache-stats-output");
  if (!out) return;
  out.textContent = "Lade...";
  try {
    const data = await fetchJson(`${apiBase}/cache/stats`);
    out.textContent = safeJsonStringify(data);
  } catch (e) {
    out.textContent = "Fehler beim Laden der Cache‑Stats.";
    showToast(`Cache‑Stats konnten nicht geladen werden: ${e.message}`, "error");
  }
}

async function invalidateCache() {
  const out = $("cache-stats-output");
  try {
    const data = await fetchJson(`${apiBase}/cache/invalidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pattern: "emir:cache:*" })
    });
    if (out) out.textContent = `Cache invalidiert: ${safeJsonStringify(data)}`;
    showToast("Cache invalidiert.", "info");
  } catch (e) {
    if (out) out.textContent = "Fehler beim Invalidieren.";
    showToast(`Cache konnte nicht invalidiert werden: ${e.message}`, "error");
  }
}

async function loadCosts() {
  const out = $("costs-output");
  if (!out) return;
  out.textContent = "Lade...";
  try {
    const data = await fetchJson(`${apiBase}/costs`);
    out.textContent = safeJsonStringify(data);
  } catch (e) {
    out.textContent = "Fehler beim Laden der Kosten.";
    showToast(`Kosten‑Report konnte nicht geladen werden: ${e.message}`, "error");
  }
}

/* GUIDE */

const guideFlows = [
  {
    id: "startup-status",
    title: "System starten & Status prüfen",
    summary: "npm install, Server starten, /health & /status checken.",
    steps: [
      {
        title: "Projekt vorbereiten",
        description:
          "Prüfe, ob du im richtigen Projektordner bist und installiere die Abhängigkeiten. Lege eine .env auf Basis der .env.example an.",
        actions: [
          { kind: "shell", label: "Im Projektordner", code: "cd /pfad/zu/deinem/GPT_SupermanV1" },
          { kind: "shell", label: "Dependencies installieren", code: "npm install" },
          { kind: "shell", label: ".env anlegen", code: "cp .env.example .env" }
        ],
        hints:
          "Du kannst die Default-Werte in .env erstmal so lassen. Ohne echte LLM-Keys läuft alles über sichere Stubs."
      },
      {
        title: "Server starten",
        description:
          "Starte den Development-Server. Er lädt Backend und Frontend und lauscht standardmäßig auf Port 3000.",
        actions: [
          { kind: "shell", label: "Server starten", code: "npm run dev" },
          { kind: "ui", label: "Browser öffnen", code: "Öffne http://localhost:3000/ im Browser." }
        ],
        hints: "Wenn Port 3000 belegt ist, passe PORT in der .env an (z.B. auf 3001)."
      },
      {
        title: "Health & Status prüfen",
        description:
          "Nutze Health- und Status-Endpunkte, um zu prüfen, ob Supervisor, Queue, Cache und Knowledge-System laufen.",
        actions: [
          { kind: "http", label: "Health", code: "curl -s http://localhost:3000/health | jq" },
          { kind: "http", label: "Status", code: "curl -s http://localhost:3000/api/v1/status | jq" },
          {
            kind: "ui",
            label: "Status im UI",
            code: "Tab „Status“ im Frontend öffnen und die drei Boxen (Health, Supervisor, Queue/Cache/Vector) prüfen."
          }
        ],
        hints: "ok sollte true sein. queue.mode ist 'in-memory'. vector.mode ist 'sqlite-like'."
      }
    ]
  },
  {
    id: "first-task",
    title: "Ersten Task anlegen & Ergebnis holen",
    summary: "Task erstellen (research), Status und Resultat ansehen.",
    steps: [
      {
        title: "Aufgabe definieren",
        description:
          "Überlege dir eine kleine Frage oder einen Auftrag für den research-Agenten, zum Beispiel eine Markt- oder Trend-Analyse.",
        actions: [
          {
            kind: "chat",
            label: "Beispiel-Auftrag",
            code: "„Fasse in 5 Stichpunkten zusammen, warum KI im Vertrieb nützlich ist.“"
          },
          { kind: "ui", label: "Zum Tasks-Tab wechseln", code: "Öffne im Frontend den Tab „Tasks“." }
        ],
        hints:
          "Je konkreter dein Auftrag, desto hilfreicher der Output. Nutze später Analysis/Creative/Coding, um darauf aufzubauen."
      },
      {
        title: "Task im UI erstellen",
        description:
          "Lege über das Formular im Tasks-Tab einen neuen research-Task an. Der Supervisor wählt automatisch den passenden Agent und stellt ihn in die InMemory-Queue.",
        actions: [
          {
            kind: "ui",
            label: "Formular ausfüllen",
            code:
              "Agent‑Typ: research\nPriorität: medium\nInhalt: z.B. „Fasse in 5 Stichpunkten zusammen, warum KI im Vertrieb nützlich ist.“\nCache: aktiviert lassen"
          },
          { kind: "ui", label: "Task starten", code: "Auf „Task starten“ klicken und rechts den aktuellen Task beobachten." }
        ],
        hints:
          "Die UI zeigt dir Task-ID und Status. Auto-Refresh aktualisiert Details und Resultat jede Sekunde, bis der Task fertig ist."
      },
      {
        title: "Task per API anlegen",
        description:
          "Rufe denselben Flow per HTTP auf, um zu verstehen, wie du Tasks auch von anderen Systemen aus anstoßen kannst.",
        actions: [
          {
            kind: "http",
            label: "Task erstellen (curl)",
            code:
              "curl -s -X POST http://localhost:3000/api/v1/tasks \\n  -H "Content-Type: application/json" \\n  -d '{\\n    "type": "research",\\n    "content": "Fasse in 5 Stichpunkten zusammen, warum KI im Vertrieb nützlich ist.",\\n    "priority": "medium",\\n    "metadata": {"source":"guide"}\\n  }' | jq"
          }
        ],
        hints:
          "Die Antwort enthält task.id. Mit /tasks/:id und /tasks/:id/result kannst du Status und Ergebnis per API abfragen."
      }
    ]
  }
];

let guideSelectedFlowId = null;
let guideSelectedStepIndex = 0;

function getSelectedFlow() {
  return guideFlows.find((f) => f.id === guideSelectedFlowId) || null;
}

function renderGuideFlowList() {
  const container = $("guide-flow-list");
  if (!container) return;
  container.innerHTML = "";
  for (const flow of guideFlows) {
    const div = document.createElement("div");
    div.className = "guide-flow-item";
    if (flow.id === guideSelectedFlowId) div.classList.add("guide-flow-item-active");
    const title = document.createElement("div");
    title.className = "guide-flow-item-title";
    title.textContent = flow.title;
    const desc = document.createElement("div");
    desc.className = "guide-flow-item-desc";
    desc.textContent = flow.summary || "";
    div.appendChild(title);
    div.appendChild(desc);
    div.addEventListener("click", () => {
      guideSelectedFlowId = flow.id;
      guideSelectedStepIndex = 0;
      renderGuideFlowList();
      renderGuideStep();
    });
    container.appendChild(div);
  }
}

function renderGuideStep() {
  const flow = getSelectedFlow();
  const flowTitleEl = $("guide-step-flow-title");
  const idxEl = $("guide-step-index");
  const titleEl = $("guide-step-title");
  const descEl = $("guide-step-description");
  const actionsEl = $("guide-step-actions");
  const hintsEl = $("guide-step-hints");

  if (!flow || !flow.steps || flow.steps.length === 0) {
    if (flowTitleEl) flowTitleEl.textContent = "Kein Flow ausgewählt";
    if (idxEl) idxEl.textContent = "";
    if (titleEl) titleEl.textContent = "Bitte links einen Use‑Case auswählen.";
    if (descEl) descEl.textContent = "";
    if (actionsEl) actionsEl.innerHTML = "";
    if (hintsEl) hintsEl.textContent = "";
    return;
  }

  const step = flow.steps[guideSelectedStepIndex] || flow.steps[0];

  if (flowTitleEl) flowTitleEl.textContent = flow.title;
  if (idxEl) idxEl.textContent = `Schritt ${guideSelectedStepIndex + 1} von ${flow.steps.length}`;
  if (titleEl) titleEl.textContent = step.title || "";
  if (descEl) descEl.textContent = step.description || "";
  if (actionsEl) {
    actionsEl.innerHTML = "";
    const actions = Array.isArray(step.actions) ? step.actions : [];
    for (const act of actions) {
      const wrapper = document.createElement("div");
      wrapper.className = "guide-step-command";

      if (act.label) {
        const label = document.createElement("div");
        label.className = "guide-step-command-label";
        let kindLabel = "";
        if (act.kind === "shell") kindLabel = "Terminal";
        else if (act.kind === "http") kindLabel = "HTTP / curl";
        else if (act.kind === "ui") kindLabel = "UI";
        else if (act.kind === "chat") kindLabel = "ChatGPT / Prompt";
        label.textContent = kindLabel ? `${kindLabel}: ${act.label}` : act.label;
        wrapper.appendChild(label);
      }

      const code = document.createElement("pre");
      code.textContent = act.code || "";
      wrapper.appendChild(code);

      actionsEl.appendChild(wrapper);
    }
  }
  if (hintsEl) hintsEl.textContent = step.hints || "";
}

function goGuidePrev() {
  const flow = getSelectedFlow();
  if (!flow) {
    showToast("Bitte zuerst links einen Use‑Case auswählen.", "error");
    return;
  }
  if (guideSelectedStepIndex > 0) {
    guideSelectedStepIndex -= 1;
    renderGuideStep();
  }
}

function goGuideNext() {
  const flow = getSelectedFlow();
  if (!flow) {
    showToast("Bitte zuerst links einen Use‑Case auswählen.", "error");
    return;
  }
  if (guideSelectedStepIndex < flow.steps.length - 1) {
    guideSelectedStepIndex += 1;
    renderGuideStep();
  }
}

function initGuide() {
  renderGuideFlowList();
  renderGuideStep();
  const prevBtn = $("guide-prev");
  const nextBtn = $("guide-next");
  if (prevBtn) prevBtn.addEventListener("click", goGuidePrev);
  if (nextBtn) nextBtn.addEventListener("click", goGuideNext);
}

/* INIT */

function initEventHandlers() {
  const statusRefresh = $("status-refresh");
  if (statusRefresh) statusRefresh.addEventListener("click", () => loadStatus());

  const agentsRefresh = $("agents-refresh");
  if (agentsRefresh) agentsRefresh.addEventListener("click", () => loadAgents());

  const taskForm = $("task-form");
  if (taskForm) taskForm.addEventListener("submit", createTaskFromForm);

  const taskLoadBtn = $("task-load");
  if (taskLoadBtn) taskLoadBtn.addEventListener("click", () => loadTask());

  const kbForm = $("kb-form");
  if (kbForm) kbForm.addEventListener("submit", saveKnowledge);

  const kbSearchForm = $("kb-search-form");
  if (kbSearchForm) kbSearchForm.addEventListener("submit", searchKnowledge);

  const queueRefresh = $("queue-refresh");
  if (queueRefresh) queueRefresh.addEventListener("click", () => loadQueueStats());

  const cacheStatsRefresh = $("cache-stats-refresh");
  if (cacheStatsRefresh) cacheStatsRefresh.addEventListener("click", () => loadCacheStats());

  const cacheInvalidateBtn = $("cache-invalidate-btn");
  if (cacheInvalidateBtn) cacheInvalidateBtn.addEventListener("click", () => invalidateCache());

  const costsRefresh = $("costs-refresh");
  if (costsRefresh) costsRefresh.addEventListener("click", () => loadCosts());
}

function init() {
  initEventHandlers();
  initGuide();
  loadStatus();
  loadAgents();
  loadQueueStats();
  loadCacheStats();
  loadCosts();
}

document.addEventListener("DOMContentLoaded", init);
