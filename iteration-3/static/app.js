const state = {
  data: null,
  activeView: "dashboard",
  activeEpisodeId: null,
  activeUserId: null,
  cmsReport: null,
};

const views = {
  dashboard: document.getElementById("dashboardView"),
  episodes: document.getElementById("episodesView"),
  analytics: document.getElementById("analyticsView"),
  network: document.getElementById("networkView"),
};

const userSelect = document.getElementById("userSelect");
const summaryCards = document.getElementById("summaryCards");
const analyticsCards = document.getElementById("analyticsCards");
const episodeRail = document.getElementById("episodeRail");
const taskList = document.getElementById("taskList");
const auditList = document.getElementById("auditList");
const spotlight = document.getElementById("spotlight");
const episodeList = document.getElementById("episodeList");
const episodeDetail = document.getElementById("episodeDetail");
const goalBars = document.getElementById("goalBars");
const facilityGrid = document.getElementById("facilityGrid");
const cmsReport = document.getElementById("cmsReport");
const followupDialog = document.getElementById("followupDialog");
const followupForm = document.getElementById("followupForm");
const followupEpisodeId = document.getElementById("followupEpisodeId");

function badge(label, tone = "") {
  return `<span class="badge ${tone}">${label}</span>`;
}

function fmtCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtDate(value) {
  if (!value) return "Pending";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (state.activeUserId) {
    headers["X-User-Id"] = state.activeUserId;
  }
  const response = await fetch(path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

async function loadBootstrap() {
  state.data = await api("/api/bootstrap");
  if (!state.activeUserId) {
    state.activeUserId = String(state.data.users[0].id);
  }
  if (!state.activeEpisodeId && state.data.episodes.length) {
    state.activeEpisodeId = state.data.episodes[0].id;
  }
  render();
}

async function loadCmsReport() {
  state.cmsReport = await api("/api/reports/cms");
  cmsReport.textContent = JSON.stringify(state.cmsReport, null, 2);
}

function render() {
  renderUsers();
  renderViews();
  renderSummary();
  renderSpotlight();
  renderEpisodes();
  renderTasks();
  renderAudit();
  renderAnalytics();
  renderFacilities();
  renderFollowupEpisodes();
}

function renderUsers() {
  userSelect.innerHTML = state.data.users
    .map((user) => `<option value="${user.id}" ${String(user.id) === state.activeUserId ? "selected" : ""}>${user.persona} · ${user.name}</option>`)
    .join("");
}

function renderViews() {
  for (const [name, node] of Object.entries(views)) {
    node.classList.toggle("active", state.activeView === name);
  }
  document.querySelectorAll(".nav-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.view === state.activeView);
  });
}

function renderSummary() {
  const cards = [
    { label: "Active Episodes", value: state.data.summary.active_episode_count, detail: "Across pre-op, inpatient, and post-acute phases" },
    { label: "High Risk", value: state.data.summary.high_risk_episode_count, detail: "Readmission watchlist requiring intervention" },
    { label: "Follow-Ups Due", value: state.data.summary.followups_due, detail: "48-hour or 7-day workflows still open" },
    { label: "SDoH Compliance", value: `${state.data.summary.sdoh_compliance}%`, detail: "Documented Z-code and social needs capture" },
    { label: "Projected Margin", value: fmtCurrency(state.data.analytics.projected_margin), detail: "Versus CMS target prices for active book of business" },
  ];
  summaryCards.innerHTML = cards
    .map((card) => `
      <article class="summary-card glass">
        <p class="eyebrow">${card.label}</p>
        <h3>${card.value}</h3>
        <p>${card.detail}</p>
      </article>
    `)
    .join("");

  analyticsCards.innerHTML = [
    ["Identification ≤24h", `${state.data.analytics.episodes_identified_24h}%`],
    ["7-day follow-up", `${state.data.analytics.followup_7d}%`],
    ["SNF LOS reduction", `${state.data.analytics.snf_los_reduction}%`],
    ["Readmission reduction", `${state.data.analytics.readmission_reduction}%`],
  ]
    .map(([label, value]) => `<article class="metric-card"><p class="eyebrow">${label}</p><h3>${value}</h3></article>`)
    .join("");
}

function renderSpotlight() {
  spotlight.innerHTML = state.data.spotlight
    .map((item) => `<article><p class="eyebrow">${item.title}</p><div>${badge(item.tone === "warning" ? "Attention" : "On Track", item.tone === "warning" ? "warning" : "good")}</div><p>${item.detail}</p></article>`)
    .join("");
}

function renderEpisodes() {
  episodeRail.innerHTML = state.data.episodes
    .slice(0, 4)
    .map((episode) => `
      <article class="episode-card">
        <div class="row">
          ${badge(episode.episode_type, "active")}
          ${badge(episode.phase.replace("_", " "), episode.phase === "post_acute" ? "medium" : "")}
          ${badge(`${episode.readmission_risk}% readmission risk`, episode.readmission_risk >= 75 ? "high" : "medium")}
        </div>
        <div>
          <h3>${episode.patient_name}</h3>
          <p>${episode.procedure_label}</p>
        </div>
        <div class="episode-meta">
          <span>Navigator: ${episode.navigator_name}</span>
          <span>Pathway adherence: ${episode.pathway_adherence}%</span>
          <span>Projected spend: ${fmtCurrency(episode.projected_spend)}</span>
        </div>
        <button class="secondary-button" data-open-episode="${episode.id}">Open Episode</button>
      </article>
    `)
    .join("");

  episodeList.innerHTML = `
    <div class="section-header">
      <div>
        <p class="eyebrow">Episode registry</p>
        <h3>TEAM eligible episodes</h3>
      </div>
    </div>
    ${state.data.episodes.map((episode) => `
      <article class="episode-list-item ${episode.id === state.activeEpisodeId ? "active" : ""}" data-open-episode="${episode.id}">
        <div class="row">
          ${badge(episode.episode_type, "active")}
          ${badge(episode.status, episode.status === "watch" ? "warning" : "good")}
        </div>
        <h3>${episode.patient_name}</h3>
        <p>${episode.procedure_label}</p>
        <p class="muted">${episode.mrn} · ${episode.phase.replace("_", " ")}</p>
      </article>
    `).join("")}
  `;
  renderEpisodeDetail();
}

async function renderEpisodeDetail() {
  if (!state.activeEpisodeId) return;
  const detail = await api(`/api/episodes/${state.activeEpisodeId}`);
  const episode = detail.episode;
  episodeDetail.innerHTML = `
    <div class="section-header">
      <div>
        <p class="eyebrow">${episode.episode_type} episode</p>
        <h3>${episode.patient_name}</h3>
        <p>${episode.procedure_label}</p>
      </div>
      <div class="row">
        ${badge(episode.status, episode.status === "watch" ? "warning" : "good")}
        ${badge(episode.phase.replace("_", " "))}
      </div>
    </div>
    <div class="detail-grid">
      <article class="metric-card">
        <p class="eyebrow">Timeline</p>
        <p>Admit: ${fmtDate(episode.admit_date)}</p>
        <p>Discharge: ${episode.discharge_date ? fmtDate(episode.discharge_date) : "Pending"}</p>
        <p>Close: ${fmtDate(episode.episode_close_date)}</p>
      </article>
      <article class="metric-card">
        <p class="eyebrow">Clinical</p>
        <p>HCC: ${episode.hcc_score}</p>
        <p>Readmission Risk: ${episode.readmission_risk}%</p>
        <p>SDoH: ${episode.sdoh_complete ? "Complete" : "Pending"}</p>
      </article>
      <article class="metric-card">
        <p class="eyebrow">Financial</p>
        <p>Target: ${fmtCurrency(episode.target_price)}</p>
        <p>Projected: ${fmtCurrency(episode.projected_spend)}</p>
        <p>Actual: ${fmtCurrency(episode.actual_spend)}</p>
      </article>
      <article class="metric-card">
        <p class="eyebrow">Follow-Up</p>
        <p>Due: ${episode.followup_due_date || "Pending"}</p>
        <p>Telehealth ready: ${episode.telehealth_ready ? "Yes" : "No"}</p>
        <p>Preferred site: ${episode.preferred_site || "None"}</p>
      </article>
    </div>
    <section class="detail-grid">
      <article class="metric-card">
        <p class="eyebrow">Open tasks</p>
        ${detail.tasks.map((task) => `<p>${badge(task.status, task.status)} ${task.title} · ${fmtDate(task.due_at)}</p>`).join("")}
      </article>
      <article class="metric-card">
        <p class="eyebrow">Encounters</p>
        ${detail.encounters.map((encounter) => `<p>${badge(encounter.modality)} ${encounter.encounter_type} · ${fmtDate(encounter.scheduled_at)}</p>`).join("") || "<p>No encounters yet.</p>"}
      </article>
      <article class="metric-card">
        <p class="eyebrow">Post-acute network</p>
        ${detail.facilities.map((facility) => `<p>${facility.name} · ${facility.referral_status} · Quality ${facility.quality_score}</p>`).join("") || "<p>No facility linked.</p>"}
      </article>
      <article class="metric-card">
        <p class="eyebrow">Outcome metrics</p>
        ${detail.metrics.map((metric) => `<p>${metric.metric_name}: ${metric.metric_value}</p>`).join("") || "<p>No metrics yet.</p>"}
      </article>
    </section>
    <section class="note-box">${episode.notes || "No notes yet."}</section>
    <section class="note-box">${detail.audit_logs.map((log) => `${fmtDate(log.created_at)} · ${log.actor_name} · ${log.detail}`).join("\n")}</section>
  `;
}

function renderTasks() {
  taskList.innerHTML = state.data.tasks
    .slice(0, 8)
    .map((task) => `
      <article class="task-item">
        <div class="row">
          ${badge(task.priority, task.priority === "critical" || task.priority === "high" ? "critical" : "medium")}
          ${badge(task.status, task.status)}
          ${task.modality ? badge(task.modality) : ""}
        </div>
        <strong>${task.title}</strong>
        <div class="task-meta">
          <span>${task.patient_name}</span>
          <span>${task.episode_type}</span>
          <span>${fmtDate(task.due_at)}</span>
        </div>
        ${task.status !== "completed" ? `<button class="secondary-button" data-complete-task="${task.id}">Mark Complete</button>` : ""}
      </article>
    `)
    .join("");
}

function renderAudit() {
  auditList.innerHTML = state.data.audit_logs
    .map((log) => `
      <article class="audit-item">
        <div class="row">
          ${badge(log.actor_role)}
          <span>${fmtDate(log.created_at)}</span>
        </div>
        <strong>${log.action.replaceAll("_", " ")}</strong>
        <p>${log.actor_name}</p>
        <p>${log.detail}</p>
      </article>
    `)
    .join("");
}

function renderAnalytics() {
  const goals = [
    ["Episodes identified within 24 hours", state.data.analytics.episodes_identified_24h],
    ["7-day follow-up completion", state.data.analytics.followup_7d],
    ["SNF length-of-stay reduction", state.data.analytics.snf_los_reduction],
    ["Readmission reduction", state.data.analytics.readmission_reduction],
    ["SDoH compliance", state.data.analytics.sdoh_compliance],
  ];
  goalBars.innerHTML = goals
    .map(([label, value]) => `
      <article class="goal-bar">
        <div class="row">
          <strong>${label}</strong>
          <span>${value}%</span>
        </div>
        <div class="goal-track"><div class="goal-fill" style="width: ${Math.min(value, 100)}%"></div></div>
      </article>
    `)
    .join("");
}

function renderFacilities() {
  facilityGrid.innerHTML = state.data.facilities
    .map((facility) => `
      <article class="facility-card">
        <div class="row">
          ${badge(facility.facility_type)}
          ${facility.preferred ? badge("Preferred", "good") : badge("Watch", "warning")}
        </div>
        <h4>${facility.name}</h4>
        <p>Quality score: ${facility.quality_score}</p>
        <p>Avg LOS: ${facility.avg_los || "n/a"} days</p>
        <p>Readmissions: ${facility.readmission_rate}%</p>
      </article>
    `)
    .join("");
}

function renderFollowupEpisodes() {
  followupEpisodeId.innerHTML = state.data.episodes
    .filter((episode) => episode.status !== "complete")
    .map((episode) => `<option value="${episode.id}">${episode.patient_name} · ${episode.episode_type}</option>`)
    .join("");
}

async function completeTask(taskId) {
  await api(`/api/tasks/${taskId}/complete`, { method: "POST", body: "{}" });
  await loadBootstrap();
}

async function scheduleFollowup(event) {
  event.preventDefault();
  const localValue = document.getElementById("followupDateTime").value;
  const scheduledAt = `${localValue}:00Z`;
  await api(`/api/episodes/${followupEpisodeId.value}/followups`, {
    method: "POST",
    body: JSON.stringify({
      scheduled_at: scheduledAt,
      modality: document.getElementById("followupModality").value,
      summary: document.getElementById("followupSummary").value,
    }),
  });
  followupDialog.close();
  followupForm.reset();
  await loadBootstrap();
}

document.addEventListener("click", async (event) => {
  const openEpisode = event.target.closest("[data-open-episode]");
  if (openEpisode) {
    state.activeEpisodeId = Number(openEpisode.dataset.openEpisode);
    state.activeView = "episodes";
    renderViews();
    renderEpisodes();
    return;
  }

  const completeButton = event.target.closest("[data-complete-task]");
  if (completeButton) {
    try {
      await completeTask(completeButton.dataset.completeTask);
    } catch (error) {
      alert(error.message);
    }
  }
});

document.querySelectorAll(".nav-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    state.activeView = chip.dataset.view;
    renderViews();
  });
});

userSelect.addEventListener("change", () => {
  state.activeUserId = userSelect.value;
});

document.getElementById("refreshButton").addEventListener("click", async () => {
  await loadBootstrap();
  await loadCmsReport();
});

document.getElementById("scheduleButton").addEventListener("click", () => {
  followupDialog.showModal();
});

document.getElementById("cancelDialogButton").addEventListener("click", () => {
  followupDialog.close();
});

followupForm.addEventListener("submit", async (event) => {
  try {
    await scheduleFollowup(event);
  } catch (error) {
    alert(error.message);
  }
});

Promise.all([loadBootstrap(), loadCmsReport()]).catch((error) => {
  document.body.innerHTML = `<main style="padding: 40px; font-family: sans-serif;"><h1>Failed to load app</h1><p>${error.message}</p></main>`;
});
