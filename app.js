const sampleData = [
  {
    episode_category: "LEJR",
    cases: 180,
    avg_spend: 25500,
    target_price: 24800,
    snf_rate: 0.34,
    home_health_rate: 0.41,
    home_rate: 0.25,
    readmission_rate: 0.082,
    quality_score: 0.66,
  },
  {
    episode_category: "Spinal Fusion",
    cases: 72,
    avg_spend: 38200,
    target_price: 36500,
    snf_rate: 0.29,
    home_health_rate: 0.38,
    home_rate: 0.33,
    readmission_rate: 0.109,
    quality_score: 0.61,
  },
  {
    episode_category: "CABG",
    cases: 54,
    avg_spend: 59400,
    target_price: 57200,
    snf_rate: 0.42,
    home_health_rate: 0.31,
    home_rate: 0.27,
    readmission_rate: 0.128,
    quality_score: 0.58,
  },
  {
    episode_category: "Major Bowel",
    cases: 60,
    avg_spend: 44600,
    target_price: 42900,
    snf_rate: 0.37,
    home_health_rate: 0.3,
    home_rate: 0.33,
    readmission_rate: 0.117,
    quality_score: 0.6,
  },
];

const state = {
  rows: sampleData,
  datasetName: "Built-in sample hospital",
  scenario: {
    snfToHomeHealthPoints: 5,
    snfToHomePoints: 3,
    readmissionReductionPoints: 1.5,
    qualityLift: 0.08,
  },
};

const elements = {
  datasetName: document.getElementById("dataset-name"),
  datasetRows: document.getElementById("dataset-rows"),
  uploadStatus: document.getElementById("upload-status"),
  baselineTotal: document.getElementById("baseline-total"),
  scenarioTotal: document.getElementById("scenario-total"),
  improvementTotal: document.getElementById("improvement-total"),
  baselineCaption: document.getElementById("baseline-caption"),
  scenarioCaption: document.getElementById("scenario-caption"),
  improvementCaption: document.getElementById("improvement-caption"),
  dataPreview: document.getElementById("data-preview"),
  episodeCards: document.getElementById("episode-cards"),
  resultsTable: document.getElementById("results-table"),
  insightsList: document.getElementById("insights-list"),
  csvUpload: document.getElementById("csv-upload"),
  resetScenario: document.getElementById("reset-scenario"),
  snfToHh: document.getElementById("snf-to-hh"),
  snfToHome: document.getElementById("snf-to-home"),
  readmissionReduction: document.getElementById("readmission-reduction"),
  qualityLift: document.getElementById("quality-lift"),
  snfToHhValue: document.getElementById("snf-to-hh-value"),
  snfToHomeValue: document.getElementById("snf-to-home-value"),
  readmissionValue: document.getElementById("readmission-value"),
  qualityValue: document.getElementById("quality-value"),
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseNumber(value) {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function qualityMultiplier(score) {
  return 0.85 + clamp(score, 0, 1) * 0.3;
}

function calculateBaseline(row) {
  const variancePerCase = row.target_price - row.avg_spend;
  const grossVariance = variancePerCase * row.cases;
  return grossVariance * qualityMultiplier(row.quality_score);
}

function calculateScenario(row, scenario) {
  const snfShift = scenario.snfToHomeHealthPoints / 100;
  const homeShift = scenario.snfToHomePoints / 100;
  const totalShift = snfShift + homeShift;
  const maxShift = Math.min(row.snf_rate, totalShift);
  const actualSnfToHh = Math.min(snfShift, maxShift);
  const actualSnfToHome = Math.max(0, maxShift - actualSnfToHh);

  const spendReduction =
    row.target_price * (actualSnfToHh * 0.035 + actualSnfToHome * 0.06);
  const readmissionReduction =
    row.target_price * clamp(scenario.readmissionReductionPoints / 100, 0, row.readmission_rate) * 0.4;
  const adjustedSpend = Math.max(0, row.avg_spend - spendReduction - readmissionReduction);
  const adjustedQuality = clamp(row.quality_score + scenario.qualityLift, 0, 1);
  const variancePerCase = row.target_price - adjustedSpend;
  return variancePerCase * row.cases * qualityMultiplier(adjustedQuality);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function render() {
  const results = state.rows.map((row) => {
    const baseline = calculateBaseline(row);
    const scenario = calculateScenario(row, state.scenario);
    return {
      ...row,
      baseline,
      scenario,
      improvement: scenario - baseline,
    };
  });

  const baselineTotal = results.reduce((sum, row) => sum + row.baseline, 0);
  const scenarioTotal = results.reduce((sum, row) => sum + row.scenario, 0);
  const improvementTotal = scenarioTotal - baselineTotal;

  elements.datasetName.textContent = state.datasetName;
  elements.datasetRows.textContent = String(state.rows.length);
  elements.uploadStatus.textContent =
    state.datasetName === "Built-in sample hospital"
      ? "Using built-in sample data"
      : `Loaded successfully: ${state.datasetName}`;
  elements.baselineTotal.textContent = formatCurrency(baselineTotal);
  elements.scenarioTotal.textContent = formatCurrency(scenarioTotal);
  elements.improvementTotal.textContent = formatCurrency(improvementTotal);
  elements.baselineCaption.textContent = baselineTotal >= 0 ? "Projected upside under current mix" : "Projected repayment risk under current mix";
  elements.scenarioCaption.textContent = scenarioTotal >= 0 ? "Projected upside after scenario changes" : "Projected repayment risk after scenario changes";
  elements.improvementCaption.textContent = improvementTotal >= 0 ? "Estimated improvement vs. baseline" : "Scenario performs worse than baseline";

  renderEpisodeCards(results);
  renderPreview(results);
  renderTable(results);
  renderInsights(results, baselineTotal, scenarioTotal, improvementTotal);
}

function renderPreview(results) {
  elements.dataPreview.innerHTML = "";

  results.forEach((row) => {
    const item = document.createElement("div");
    item.className = "preview-row";
    item.innerHTML = `
      <strong>${row.episode_category}</strong>
      <span>${row.cases} cases</span>
      <span>Spend ${formatCurrency(row.avg_spend)}</span>
      <span>Target ${formatCurrency(row.target_price)}</span>
      <span>SNF ${formatPercent(row.snf_rate)}</span>
    `;
    elements.dataPreview.appendChild(item);
  });
}

function renderEpisodeCards(results) {
  elements.episodeCards.innerHTML = "";

  results.forEach((row) => {
    const card = document.createElement("article");
    card.className = "episode-card";

    const signalClass =
      row.improvement > 150000 ? "pill-opportunity" : row.improvement > 50000 ? "pill-watch" : "pill-risk";
    const signalLabel =
      row.improvement > 150000 ? "High opportunity" : row.improvement > 50000 ? "Moderate opportunity" : "Watch";

    card.innerHTML = `
      <div class="episode-header">
        <div>
          <p class="episode-name">${row.episode_category}</p>
          <p class="meta-label">${row.cases} annual cases</p>
        </div>
        <span class="pill ${signalClass}">${signalLabel}</span>
      </div>
      <div class="metric-row">
        <span>Baseline</span>
        <strong>${formatCurrency(row.baseline)}</strong>
      </div>
      <div class="metric-row">
        <span>Scenario</span>
        <strong>${formatCurrency(row.scenario)}</strong>
      </div>
      <div class="metric-row">
        <span>Improvement</span>
        <strong>${formatCurrency(row.improvement)}</strong>
      </div>
      <div class="metric-row">
        <span>SNF mix</span>
        <strong>${formatPercent(row.snf_rate)}</strong>
      </div>
    `;

    elements.episodeCards.appendChild(card);
  });
}

function renderTable(results) {
  elements.resultsTable.innerHTML = "";

  results
    .slice()
    .sort((a, b) => b.improvement - a.improvement)
    .forEach((row) => {
      const tr = document.createElement("tr");
      const signal =
        row.improvement > 150000
          ? "Lead with discharge redesign"
          : row.improvement > 50000
            ? "Review by service line"
            : "Monitor, lower immediate ROI";

      tr.innerHTML = `
        <td data-label="Episode">${row.episode_category}</td>
        <td data-label="Cases">${row.cases}</td>
        <td data-label="Baseline">${formatCurrency(row.baseline)}</td>
        <td data-label="Scenario">${formatCurrency(row.scenario)}</td>
        <td data-label="Improvement">${formatCurrency(row.improvement)}</td>
        <td data-label="Priority Signal">${signal}</td>
      `;
      elements.resultsTable.appendChild(tr);
    });
}

function renderInsights(results, baselineTotal, scenarioTotal, improvementTotal) {
  elements.insightsList.innerHTML = "";

  const topOpportunity = results.slice().sort((a, b) => b.improvement - a.improvement)[0];
  const highestRisk = results.slice().sort((a, b) => a.baseline - b.baseline)[0];
  const insights = [
    {
      title: "Finance readout",
      copy:
        baselineTotal >= 0
          ? `The loaded hospital is currently projecting ${formatCurrency(baselineTotal)} in reconciliation upside. The modeled scenario lifts that to ${formatCurrency(scenarioTotal)}, creating ${formatCurrency(improvementTotal)} in additional upside.`
          : `The loaded hospital is currently projecting ${formatCurrency(Math.abs(baselineTotal))} in repayment risk. The modeled scenario reduces that gap by ${formatCurrency(improvementTotal)} and moves the forecast to ${formatCurrency(scenarioTotal)}.`,
    },
    {
      title: "Best initial service line",
      copy: `${topOpportunity.episode_category} produces the largest modeled improvement at ${formatCurrency(topOpportunity.improvement)}. This is the best candidate for an early pilot and an executive proof point.`,
    },
    {
      title: "Operational focus",
      copy: `${highestRisk.episode_category} has the weakest baseline economics in the current dataset. If this were a real deployment, this category should be reviewed first for discharge mix, PAC patterns, and readmission drivers.`,
    },
  ];

  insights.forEach((insight) => {
    const item = document.createElement("article");
    item.className = "insight-item";
    item.innerHTML = `
      <p class="insight-title">${insight.title}</p>
      <p class="insight-copy">${insight.copy}</p>
    `;
    elements.insightsList.appendChild(item);
  });
}

function updateScenarioLabelValues() {
  elements.snfToHhValue.textContent = `${elements.snfToHh.value} pts`;
  elements.snfToHomeValue.textContent = `${elements.snfToHome.value} pts`;
  elements.readmissionValue.textContent = `${Number.parseFloat(elements.readmissionReduction.value).toFixed(1)} pts`;
  elements.qualityValue.textContent = Number.parseFloat(elements.qualityLift.value).toFixed(2);
}

function updateScenarioState() {
  state.scenario.snfToHomeHealthPoints = parseNumber(elements.snfToHh.value);
  state.scenario.snfToHomePoints = parseNumber(elements.snfToHome.value);
  state.scenario.readmissionReductionPoints = parseNumber(elements.readmissionReduction.value);
  state.scenario.qualityLift = parseNumber(elements.qualityLift.value);
  updateScenarioLabelValues();
  render();
}

function resetScenario() {
  elements.snfToHh.value = "5";
  elements.snfToHome.value = "3";
  elements.readmissionReduction.value = "1.5";
  elements.qualityLift.value = "0.08";
  updateScenarioState();
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error("CSV must include a header and at least one data row.");
  }

  const headers = lines[0].split(",").map((header) => header.trim());
  const requiredHeaders = [
    "episode_category",
    "cases",
    "avg_spend",
    "target_price",
    "snf_rate",
    "home_health_rate",
    "home_rate",
    "readmission_rate",
    "quality_score",
  ];

  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length) {
    throw new Error(`Missing required columns: ${missingHeaders.join(", ")}`);
  }

  return lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim());
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));

    return {
      episode_category: row.episode_category,
      cases: parseNumber(row.cases),
      avg_spend: parseNumber(row.avg_spend),
      target_price: parseNumber(row.target_price),
      snf_rate: parseNumber(row.snf_rate),
      home_health_rate: parseNumber(row.home_health_rate),
      home_rate: parseNumber(row.home_rate),
      readmission_rate: parseNumber(row.readmission_rate),
      quality_score: parseNumber(row.quality_score),
    };
  });
}

function handleCsvUpload(event) {
  const [file] = event.target.files;
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = parseCsv(String(reader.result));
      state.rows = rows;
      state.datasetName = file.name;
      render();
    } catch (error) {
      state.datasetName = "Built-in sample hospital";
      state.rows = sampleData;
      render();
      window.alert(error.message);
    }
  };
  reader.readAsText(file);
}

elements.csvUpload.addEventListener("change", handleCsvUpload);
elements.resetScenario.addEventListener("click", resetScenario);
elements.snfToHh.addEventListener("input", updateScenarioState);
elements.snfToHome.addEventListener("input", updateScenarioState);
elements.readmissionReduction.addEventListener("input", updateScenarioState);
elements.qualityLift.addEventListener("input", updateScenarioState);

updateScenarioLabelValues();
render();
