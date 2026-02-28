let chartInstance = null;
let currentCategory = "health";
let currentPeriod = "month";
let currentMetric = "";
let selectedChartMetrics = [];
let currentRows = [];

const categorySelect = document.getElementById("categorySelect");
const periodSelect = document.getElementById("periodSelect");
const exportJsonButton = document.getElementById("exportJsonButton");
const exportMessage = document.getElementById("export-message");
const aiPromptButton = document.getElementById("aiPromptButton");
const aiMessage = document.getElementById("ai-message");
const chartMetricsSelect = document.getElementById("chartMetricsSelect");
const metricSelect = document.getElementById("metricSelect");
const addDataForm = document.getElementById("addDataForm");
const formMessage = document.getElementById("form-message");
const recordDateSelect = document.getElementById("recordDateSelect");
const editDataForm = document.getElementById("editDataForm");
const editMetricSelect = document.getElementById("editMetricSelect");
const editValueInput = document.getElementById("editValue");
const deleteRecordButton = document.getElementById("deleteRecordButton");
const editMessage = document.getElementById("edit-message");
const message = document.getElementById("message");
const canvas = document.getElementById("sleepChart");
const addGoalForm = document.getElementById("addGoalForm");
const goalCategorySelect = document.getElementById("goalCategorySelect");
const goalTargetInput = document.getElementById("goalTargetInput");
const goalPeriodSelect = document.getElementById("goalPeriodSelect");
const goalsMessage = document.getElementById("goals-message");
const goalsList = document.getElementById("goalsList");
const goalsStatusList = document.getElementById("goalsStatusList");
const insightTrend = document.getElementById("insight-trend");
const insightPercent = document.getElementById("insight-percent");
const insightStreak = document.getElementById("insight-streak");
const insightAverage = document.getElementById("insight-average");

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function getExportFileName(category, period) {
  return `${category}_${period}_${getTodayIsoDate()}.json`;
}

function downloadJsonFile(fileName, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatStatValue(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Number(value).toFixed(2);
}

function resetStats() {
  document.getElementById("stat-average").textContent = "—";
  document.getElementById("stat-max").textContent = "—";
  document.getElementById("stat-min").textContent = "—";
  document.getElementById("stat-change").textContent = "—";
}

function resetInsights() {
  insightTrend.textContent = "→ stable";
  insightTrend.className = "text-lg font-semibold text-slate-700";
  insightPercent.textContent = "0.00%";
  insightPercent.className = "text-lg font-semibold text-slate-700";
  insightStreak.textContent = "0";
  insightAverage.textContent = "0.00";
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "0.00%";
  }
  return `${Number(value).toFixed(2)}%`;
}

function setTrendStyle(trend) {
  if (trend === "up") {
    insightTrend.textContent = "↑ up";
    insightTrend.className = "text-lg font-semibold text-emerald-600";
    insightPercent.className = "text-lg font-semibold text-emerald-600";
  } else if (trend === "down") {
    insightTrend.textContent = "↓ down";
    insightTrend.className = "text-lg font-semibold text-rose-600";
    insightPercent.className = "text-lg font-semibold text-rose-600";
  } else {
    insightTrend.textContent = "→ stable";
    insightTrend.className = "text-lg font-semibold text-slate-600";
    insightPercent.className = "text-lg font-semibold text-slate-600";
  }
}

function getGoalStatusClasses(status) {
  if (status === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "warning") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function renderGoals(goals) {
  goalsList.innerHTML = "";
  if (!goals || goals.length === 0) {
    goalsList.innerHTML =
      '<li class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">Целей пока нет</li>';
    return;
  }

  goals.forEach((goal) => {
    const item = document.createElement("li");
    item.className =
      "rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700";
    item.textContent = `${goal.category}: ${goal.target} (${goal.period})`;
    goalsList.appendChild(item);
  });
}

function renderGoalStatuses(statuses) {
  goalsStatusList.innerHTML = "";
  if (!statuses || statuses.length === 0) {
    goalsStatusList.innerHTML =
      '<li class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">Статусы целей появятся после добавления целей</li>';
    return;
  }

  statuses.forEach((item) => {
    const li = document.createElement("li");
    li.className = `rounded-lg border px-3 py-2 text-sm ${getGoalStatusClasses(item.status)}`;
    li.textContent = `${item.category}: ${item.actual}/${item.target} (${item.progress}%)`;
    goalsStatusList.appendChild(li);
  });
}

async function loadGoals() {
  try {
    const response = await fetch("/api/goals");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Ошибка загрузки целей");
    renderGoals(payload);
  } catch (error) {
    goalsList.innerHTML =
      '<li class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">Ошибка загрузки целей</li>';
  }
}

async function loadGoalStatuses() {
  try {
    const response = await fetch("/api/goals/status");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Ошибка загрузки статусов");
    renderGoalStatuses(payload);
  } catch (error) {
    goalsStatusList.innerHTML =
      '<li class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">Ошибка загрузки статусов целей</li>';
  }
}

async function refreshGoalsData() {
  await loadGoals();
  await loadGoalStatuses();
}

function extractMetricKeys(rows) {
  if (!rows || rows.length === 0) return [];
  return Object.keys(rows[0]).filter((key) => key !== "date");
}

function fillSelect(selectElement, keys) {
  selectElement.innerHTML = "";
  keys.forEach((key) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = key;
    selectElement.appendChild(option);
  });
}

function getMultiSelectValues(selectElement) {
  return Array.from(selectElement.selectedOptions).map((option) => option.value);
}

function fillMetricControls(keys, preferredMetric) {
  fillSelect(metricSelect, keys);
  fillSelect(editMetricSelect, keys);
  fillSelect(chartMetricsSelect, keys);

  if (keys.length === 0) {
    currentMetric = "";
    selectedChartMetrics = [];
    return;
  }

  currentMetric = keys.includes(preferredMetric) ? preferredMetric : keys[0];
  metricSelect.value = currentMetric;
  editMetricSelect.value = currentMetric;

  const keptMetrics = selectedChartMetrics.filter((key) => keys.includes(key));
  selectedChartMetrics = keptMetrics.length > 0 ? keptMetrics : [currentMetric];

  Array.from(chartMetricsSelect.options).forEach((option) => {
    option.selected = selectedChartMetrics.includes(option.value);
  });
}

function fillDateSelect(rows) {
  recordDateSelect.innerHTML = "";
  rows.forEach((row) => {
    const dateValue = row.date || "";
    if (!dateValue) return;
    const option = document.createElement("option");
    option.value = dateValue;
    option.textContent = dateValue;
    recordDateSelect.appendChild(option);
  });
}

function setEditValueFromSelectedRow() {
  const selectedDate = recordDateSelect.value;
  const selectedMetric = editMetricSelect.value;
  if (!selectedDate || !selectedMetric) {
    editValueInput.value = "";
    return;
  }

  const row = currentRows.find((item) => item.date === selectedDate);
  if (!row) {
    editValueInput.value = "";
    return;
  }

  const value = row[selectedMetric];
  editValueInput.value = value === undefined || value === null ? "" : value;
}

function drawCharts(category, metricKeys, rows) {
  if (!metricKeys || metricKeys.length === 0) {
    message.textContent = "Выберите хотя бы одну метрику";
    canvas.style.display = "none";
    return;
  }

  const labels = rows.map((row) => row.date);
  const colors = ["#2563eb", "#16a34a", "#dc2626", "#f59e0b", "#7c3aed"];

  const datasets = metricKeys.map((metricKey, index) => ({
    label: `${category}: ${metricKey}`,
    data: rows.map((row) => {
      const numberValue = Number(row[metricKey]);
      return Number.isNaN(numberValue) ? null : numberValue;
    }),
    borderColor: colors[index % colors.length],
    backgroundColor: "rgba(37, 99, 235, 0.1)",
    tension: 0.2,
  }));

  const hasValues = datasets.some((dataset) =>
    dataset.data.some((value) => value !== null)
  );
  if (!hasValues) {
    message.textContent = "Нет данных";
    canvas.style.display = "none";
    return;
  }

  message.textContent = "";
  canvas.style.display = "block";

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels: labels,
      datasets: datasets,
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true },
      },
    },
  });
}

async function loadCategoryStats(category, period, metricKey) {
  try {
    const params = new URLSearchParams({ period });
    if (metricKey) params.set("metric_key", metricKey);

    const response = await fetch(`/api/${category}/stats?${params.toString()}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Ошибка загрузки статистики");

    document.getElementById("stat-average").textContent = formatStatValue(payload.average);
    document.getElementById("stat-max").textContent = formatStatValue(payload.max);
    document.getElementById("stat-min").textContent = formatStatValue(payload.min);
    document.getElementById("stat-change").textContent = formatStatValue(
      payload.change_from_previous_day
    );
  } catch (error) {
    resetStats();
  }
}

async function loadInsights(category, period) {
  try {
    const params = new URLSearchParams({ category, period });
    const response = await fetch(`/api/insights?${params.toString()}`);
    const payload = await response.json();

    if (!response.ok) throw new Error(payload.error || "Ошибка загрузки инсайтов");

    setTrendStyle(payload.trend);
    insightPercent.textContent = formatPercent(payload.percent_change);
    insightStreak.textContent = String(payload.streak ?? 0);
    insightAverage.textContent = Number(payload.average_per_day ?? 0).toFixed(2);
  } catch (error) {
    resetInsights();
  }
}

async function loadCategoryData(category, period, preferredMetric = "") {
  try {
    const response = await fetch(`/api/${category}?period=${period}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Ошибка загрузки данных");

    if (!Array.isArray(payload) || payload.length === 0) {
      currentRows = [];
      fillMetricControls([], "");
      fillDateSelect([]);
      message.textContent = "Нет данных";
      canvas.style.display = "none";
      resetStats();
      resetInsights();
      return;
    }

    currentRows = payload;
    const metricKeys = extractMetricKeys(payload);
    fillMetricControls(metricKeys, preferredMetric || currentMetric);
    fillDateSelect(payload);
    setEditValueFromSelectedRow();

    drawCharts(category, selectedChartMetrics, currentRows);
    await loadCategoryStats(category, period, selectedChartMetrics[0] || "");
    await loadInsights(category, period);
    await loadGoalStatuses();
  } catch (error) {
    message.textContent = `Не удалось получить данные: ${error.message}`;
    canvas.style.display = "none";
    resetStats();
    resetInsights();
  }
}

// По умолчанию показываем health за месяц.
loadCategoryData(currentCategory, currentPeriod);
refreshGoalsData();

categorySelect.addEventListener("change", (event) => {
  currentCategory = event.target.value;
  formMessage.textContent = "";
  editMessage.textContent = "";
  loadCategoryData(currentCategory, currentPeriod, "");
  loadGoalStatuses();
});

periodSelect.addEventListener("change", (event) => {
  currentPeriod = event.target.value;
  formMessage.textContent = "";
  editMessage.textContent = "";
  loadCategoryData(currentCategory, currentPeriod, currentMetric);
  loadGoalStatuses();
});

chartMetricsSelect.addEventListener("change", async () => {
  selectedChartMetrics = getMultiSelectValues(chartMetricsSelect);
  formMessage.textContent = "";
  editMessage.textContent = "";

  drawCharts(currentCategory, selectedChartMetrics, currentRows);
  await loadCategoryStats(currentCategory, currentPeriod, selectedChartMetrics[0] || "");
});

metricSelect.addEventListener("change", (event) => {
  currentMetric = event.target.value;
  editMetricSelect.value = currentMetric;
  setEditValueFromSelectedRow();
});

editMetricSelect.addEventListener("change", () => {
  setEditValueFromSelectedRow();
});

recordDateSelect.addEventListener("change", () => {
  setEditValueFromSelectedRow();
});

addDataForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const date = document.getElementById("entryDate").value;
  const value = document.getElementById("entryValue").value;

  try {
    const response = await fetch(`/api/${currentCategory}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        value,
        value_key: currentMetric,
      }),
    });

    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Ошибка добавления");

    formMessage.textContent = "Запись добавлена";
    addDataForm.reset();
    await loadCategoryData(currentCategory, currentPeriod, currentMetric);
  } catch (error) {
    formMessage.textContent = `Ошибка: ${error.message}`;
  }
});

editDataForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const date = recordDateSelect.value;
  const value = editValueInput.value;
  const valueKey = editMetricSelect.value;

  try {
    const response = await fetch(`/api/${currentCategory}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        value,
        value_key: valueKey,
      }),
    });

    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Ошибка редактирования");

    editMessage.textContent = "Запись обновлена";
    await loadCategoryData(currentCategory, currentPeriod, currentMetric);
  } catch (error) {
    editMessage.textContent = `Ошибка: ${error.message}`;
  }
});

deleteRecordButton.addEventListener("click", async () => {
  const date = recordDateSelect.value;

  try {
    const response = await fetch(`/api/${currentCategory}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
    });

    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Ошибка удаления");

    editMessage.textContent = "Запись удалена";
    await loadCategoryData(currentCategory, currentPeriod, currentMetric);
  } catch (error) {
    editMessage.textContent = `Ошибка: ${error.message}`;
  }
});

exportJsonButton.addEventListener("click", async () => {
  const selectedMetric = currentMetric || "";
  const params = new URLSearchParams({
    category: currentCategory,
    period: currentPeriod,
  });

  // Если метрика выбрана, передаем ее как дополнительный контекст экспорта.
  if (selectedMetric) {
    params.set("metric_key", selectedMetric);
  }

  try {
    const response = await fetch(`/api/export?${params.toString()}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Ошибка экспорта");
    }

    const fileName = getExportFileName(currentCategory, currentPeriod);
    downloadJsonFile(fileName, payload);
    exportMessage.textContent = "Файл успешно сохранён";
  } catch (error) {
    exportMessage.textContent = `Ошибка экспорта: ${error.message}`;
  }
});

aiPromptButton.addEventListener("click", async () => {
  const params = new URLSearchParams({
    category: currentCategory,
    period: currentPeriod,
  });

  try {
    const response = await fetch(`/api/ai-prompt?${params.toString()}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Ошибка генерации запроса");
    }

    await navigator.clipboard.writeText(payload.prompt || "");
    aiMessage.textContent = "Запрос скопирован";
  } catch (error) {
    aiMessage.textContent = `Ошибка AI-анализа: ${error.message}`;
  }
});

addGoalForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    category: goalCategorySelect.value,
    target: goalTargetInput.value,
    period: goalPeriodSelect.value,
  };

  try {
    const response = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Ошибка добавления цели");

    goalsMessage.textContent = "Цель добавлена";
    addGoalForm.reset();
    await refreshGoalsData();
  } catch (error) {
    goalsMessage.textContent = `Ошибка целей: ${error.message}`;
  }
});
