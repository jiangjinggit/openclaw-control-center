const summary = document.getElementById('summary');
const runs = document.getElementById('runs');
const alerts = document.getElementById('alerts');
const nodes = document.getElementById('nodes');
const jobs = document.getElementById('jobs');
const adapters = document.getElementById('adapters');
const probe = document.getElementById('probe');
const cronReal = document.getElementById('cronReal');
const sessionsReal = document.getElementById('sessionsReal');
const syncStatus = document.getElementById('syncStatus');
const runtimeStatus = document.getElementById('runtimeStatus');
const syncLog = document.getElementById('syncLog');
const exportLog = document.getElementById('exportLog');
const errorsReal = document.getElementById('errorsReal');
const projectSelect = document.getElementById('projectSelect');
const latencyChart = document.getElementById('latencyChart');
const successChart = document.getElementById('successChart');
const costChart = document.getElementById('costChart');
const failureChart = document.getElementById('failureChart');
const errorOnlyBtn = document.getElementById('errorOnly');
const syncNowBtn = document.getElementById('syncNow');
const exportNowBtn = document.getElementById('exportNow');
const workspaceName = document.getElementById('workspaceName');
const workspaceMeta = document.getElementById('workspaceMeta');
const workspaceStatus = document.getElementById('workspaceStatus');
const heroLastSync = document.getElementById('heroLastSync');
const heroSource = document.getElementById('heroSource');
const heroRuntime = document.getElementById('heroRuntime');
const primaryRisk = document.getElementById('primaryRisk');
const costSignal = document.getElementById('costSignal');
const healthSignal = document.getElementById('healthSignal');

let metricsData, projectsData, seriesData, jobsData, adaptersData, costSeriesData, probeData, cronRealData, sessionsRealData, syncData, errorsData, syncLogData, configData, runtimeData, exportLogData;
let errorOnly = false;

function statusClass(status) {
  if (['success', 'healthy', 'ready', 'ok', true].includes(status)) return 'ok';
  if (['warning', 'medium', 'planned', 'unknown', 'unavailable', 'idle'].includes(status)) return 'warn';
  return 'error';
}

function statusPillClass(status) {
  const s = String(status || '').toLowerCase();
  if (['success', 'healthy', 'ok', 'ready', 'true'].includes(s)) return 'status-pill status-ok';
  if (['warning', 'medium', 'planned', 'unknown', 'idle'].includes(s)) return 'status-pill status-warn';
  return 'status-pill status-error';
}

function metricCard(label, value, note = '') {
  return `
    <article class="kpi-card">
      <span class="kpi-label">${label}</span>
      <strong class="kpi-value">${value}</strong>
      ${note ? `<span class="kpi-note">${note}</span>` : ''}
    </article>
  `;
}

function stackItem(leftTitle, leftMeta, rightValue, rightClass = '') {
  return `
    <div class="list-row">
      <div class="list-row-left">
        <span class="list-row-name">${leftTitle}</span>
        ${leftMeta ? `<span class="list-row-meta">${leftMeta}</span>` : ''}
      </div>
      <div class="list-row-right">
        <span class="${rightClass}">${rightValue}</span>
      </div>
    </div>
  `;
}

function formatSessionName(name = '') {
  if (name.length <= 48) return name;
  const parts = name.split(':');
  if (parts.length >= 4) {
    return `${parts[0]}:${parts[1]}:…:${parts[parts.length - 1]}`;
  }
  return `${name.slice(0, 20)}…${name.slice(-14)}`;
}

function entityCard(title, status, lines = []) {
  return `
    <article class="entity-card">
      <strong title="${title}">${title}</strong>
      <p class="${statusClass(status)}">${status}</p>
      ${lines.map((line) => `<span>${line}</span>`).join('')}
    </article>
  `;
}

function renderWorkspace(currentProject) {
  workspaceName.textContent = currentProject.name;
  workspaceMeta.textContent = `${currentProject.env} · owner ${currentProject.owner}`;
  workspaceStatus.textContent = currentProject.status;
  workspaceStatus.className = statusPillClass(currentProject.status);
  heroLastSync.textContent = syncData.lastSyncAt || '未同步';
  heroSource.textContent = syncData.source || '-';
  heroRuntime.textContent = runtimeData.autoSyncEnabled ? 'auto sync on' : 'manual';
}

function renderSummary(s) {
  summary.innerHTML = [
    metricCard('活跃 Session', s.activeSessions, '当前已纳入可视范围'),
    metricCard('成功率', `${s.successRate}%`, '当前任务成功占比'),
    metricCard('失败率', `${s.errorRate}%`, '需要优先排障的部分'),
    metricCard('平均延迟', `${s.avgLatencyMs} ms`, '看响应是否开始变慢'),
    metricCard('今日成本', `¥${s.costToday}`, '适合做高频任务成本控制'),
    metricCard('异常任务', `${(errorsData.summary || {}).errorCount || 0}`, '真实 cron 异常聚合')
  ].join('');

  const topAlert = (metricsData.alerts || [])[0];
  primaryRisk.textContent = topAlert ? `${topAlert.title}。${topAlert.hint}` : '当前没有明显高优先级风险。';
  costSignal.textContent = s.costToday >= 30 ? `今日成本已到 ¥${s.costToday}，建议优先检查高频任务、重试链路和模型档位。` : `今日成本为 ¥${s.costToday}，当前仍处在可控区间。`;
  healthSignal.textContent = s.successRate >= 90 ? `当前成功率 ${s.successRate}% ，整体运行仍可控，但要继续盯住失败任务和延迟抬升。` : `当前成功率 ${s.successRate}% ，已经需要优先处理运行质量问题。`;
}

function renderSync() {
  syncStatus.innerHTML = [
    stackItem('同步状态', `${syncData.cronCount} cron / ${syncData.sessionCount} sessions / ${syncData.errorCount} errors`, `<span class="${statusClass(syncData.status)}">${syncData.status}</span>`),
    stackItem('最后同步', '当前面板最近一次拉到的数据', syncData.lastSyncAt || '未同步'),
    stackItem('自动同步间隔', '服务端当前配置值', `${Math.round((configData.syncIntervalMs || 0) / 60000)} 分钟`),
    syncData.lastError ? stackItem('最近错误', '同步时返回的最近失败信息', syncData.lastError, 'error') : ''
  ].join('');
}

function renderRuntime() {
  runtimeStatus.innerHTML = [
    stackItem('自动同步', '服务启动后自动启用', runtimeData.autoSyncEnabled ? 'enabled' : 'disabled', runtimeData.autoSyncEnabled ? 'ok' : 'warn'),
    stackItem('最近自动同步', '系统记录的最近一次自动动作', runtimeData.lastAutoSyncAt || '暂无'),
    stackItem('下一次自动同步', '按当前间隔推算', runtimeData.nextAutoSyncAt || '暂无'),
    stackItem('最近导出', '最近一次数据导出时间', runtimeData.lastExportAt || '暂无')
  ].join('');
}

function renderSyncLog() {
  syncLog.innerHTML = (syncLogData || []).map((item) => stackItem(item.status, item.at, `${item.cronCount} cron / ${item.sessionCount} sessions / ${item.errorCount} errors`, statusClass(item.status))).join('') || stackItem('暂无同步日志', '', '等待下一次同步');
}

function renderExportLog() {
  exportLog.innerHTML = (exportLogData || []).map((item) => stackItem('导出完成', item.at, item.path)).join('') || stackItem('暂无导出记录', '', '等待第一次导出');
}

function renderErrors() {
  const s = errorsData.summary || {};
  const items = [
    stackItem('异常总数', `generatedAt: ${errorsData.generatedAt || '-'}`, s.errorCount || 0, 'error'),
    stackItem('状态分布', 'ok / unknown', `${s.okCount || 0} / ${s.unknownCount || 0}`)
  ];
  (errorsData.jobs || []).forEach((job) => {
    items.push(stackItem(job.name, job.schedule, job.lastStatus, statusClass(job.lastStatus)));
  });
  errorsReal.innerHTML = items.join('');
}

function renderRuns() {
  const list = errorOnly ? metricsData.recentRuns.filter((item) => item.status !== 'success') : metricsData.recentRuns;
  runs.innerHTML = list.map((item) => stackItem(item.name, item.updatedAt, `${item.status} · ${item.latencyMs}ms`, statusClass(item.status))).join('') || stackItem('当前无异常任务', '', '运行正常');
}

function renderAlerts() {
  alerts.innerHTML = metricsData.alerts.map((item, index) => stackItem(`#${index + 1} ${item.title}`, item.hint, item.level, statusClass(item.level))).join('');
}

function renderNodes() {
  nodes.innerHTML = metricsData.nodes.map((item) => entityCard(item.name, item.health, [`Uptime: ${item.uptime}`])).join('');
}

function renderJobs() {
  jobs.innerHTML = jobsData.map((item) => entityCard(item.name, item.status, [`类型: ${item.kind}`, `失败次数: ${item.failures}`, `最近执行: ${item.lastRun}`])).join('');
}

function renderAdapters() {
  adapters.innerHTML = adaptersData.map((item) => entityCard(item.name, item.status, [item.note])).join('');
}

function renderProbe() {
  probe.innerHTML = [stackItem('OpenClaw 健康探针', `source: ${probeData.source}`, probeData.health, statusClass(probeData.health))].join('');
}

function renderCronReal() {
  cronReal.innerHTML = cronRealData.slice(0, 8).map((item) => entityCard(item.name, item.lastStatus, [`enabled: ${item.enabled}`, item.schedule])).join('');
}

function renderSessionsReal() {
  sessionsReal.innerHTML = sessionsRealData.slice(0, 12).map((item) => entityCard(formatSessionName(item.displayName), item.channel, [`model: ${item.model}`, `updatedAt: ${item.updatedAt}`])).join('');
}

function renderBars(el, values, labels, className = '') {
  const max = Math.max(...values, 1);
  el.innerHTML = values.map((value, idx) => `
    <div class="bar-wrap">
      <div class="bar ${className}" style="height:${Math.max(16, (value / max) * 124)}px"></div>
      <div class="muted">${labels[idx]}</div>
      <div class="muted">${value}</div>
    </div>
  `).join('');
}

function renderAll() {
  const currentProject = projectsData.find((p) => p.id === projectSelect.value) || projectsData[0];
  renderWorkspace(currentProject);
  renderSummary(metricsData.summary);
  renderSync();
  renderRuntime();
  renderSyncLog();
  renderExportLog();
  renderErrors();
  renderRuns();
  renderAlerts();
  renderNodes();
  renderJobs();
  renderAdapters();
  renderProbe();
  renderCronReal();
  renderSessionsReal();
  renderBars(latencyChart, seriesData.latency, seriesData.labels);
  renderBars(successChart, seriesData.successRate, seriesData.labels, 'bar-success');
  renderBars(costChart, costSeriesData.cost, costSeriesData.labels, 'bar-cost');
  renderBars(failureChart, costSeriesData.failures, costSeriesData.labels, 'bar-failure');
}

function loadAll() {
  return Promise.all([
    fetch('/api/metrics').then((r) => r.json()),
    fetch('/api/projects').then((r) => r.json()),
    fetch('/api/series').then((r) => r.json()),
    fetch('/api/jobs').then((r) => r.json()),
    fetch('/api/adapters').then((r) => r.json()),
    fetch('/api/cost-series').then((r) => r.json()),
    fetch('/api/live/openclaw').then((r) => r.json()),
    fetch('/api/cron-real').then((r) => r.json()),
    fetch('/api/sessions-real').then((r) => r.json()),
    fetch('/api/sync-status').then((r) => r.json()),
    fetch('/api/errors-real').then((r) => r.json()),
    fetch('/api/sync-log').then((r) => r.json()),
    fetch('/api/config').then((r) => r.json()),
    fetch('/api/runtime').then((r) => r.json()),
    fetch('/api/export-log').then((r) => r.json())
  ]).then(([m, p, s, j, a, c, probeResp, cronResp, sessionsResp, syncResp, errorResp, logResp, configResp, runtimeResp, exportResp]) => {
    metricsData = m;
    projectsData = p;
    seriesData = s;
    jobsData = j;
    adaptersData = a;
    costSeriesData = c;
    probeData = probeResp;
    cronRealData = cronResp;
    sessionsRealData = sessionsResp;
    syncData = syncResp;
    errorsData = errorResp;
    syncLogData = logResp;
    configData = configResp;
    runtimeData = runtimeResp;
    exportLogData = exportResp;
    projectSelect.innerHTML = projectsData.map((item) => `<option value="${item.id}">${item.name} · ${item.env}</option>`).join('');
    renderAll();
  });
}

loadAll();
projectSelect.addEventListener('change', renderAll);
errorOnlyBtn.addEventListener('click', () => {
  errorOnly = !errorOnly;
  errorOnlyBtn.textContent = errorOnly ? '显示全部任务' : '只看异常任务';
  renderRuns();
});
syncNowBtn.addEventListener('click', async () => {
  syncNowBtn.disabled = true;
  syncNowBtn.textContent = '同步中...';
  const res = await fetch('/api/sync-now', { method: 'POST' });
  syncNowBtn.disabled = false;
  syncNowBtn.textContent = '立即同步';
  await loadAll();
  if (!res.ok) alert('同步失败');
});
exportNowBtn.addEventListener('click', async () => {
  exportNowBtn.disabled = true;
  exportNowBtn.textContent = '导出中...';
  const res = await fetch('/api/export', { method: 'POST' });
  const data = await res.json();
  exportNowBtn.disabled = false;
  exportNowBtn.textContent = '导出数据';
  await loadAll();
  alert(res.ok ? `已导出: ${data.output}` : `导出失败: ${data.error}`);
});
