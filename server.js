const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const port = process.env.PORT || 4311;
const publicDir = path.join(__dirname, 'public');
const dataPath = path.join(__dirname, 'data', 'metrics.json');
const projectsPath = path.join(__dirname, 'data', 'projects.json');
const seriesPath = path.join(__dirname, 'data', 'series.json');
const jobsPath = path.join(__dirname, 'data', 'jobs.json');
const adaptersPath = path.join(__dirname, 'data', 'adapters.json');
const costSeriesPath = path.join(__dirname, 'data', 'cost-series.json');
const cronRealPath = path.join(__dirname, 'data', 'cron-real.json');
const sessionsRealPath = path.join(__dirname, 'data', 'sessions-real.json');
const syncStatusPath = path.join(__dirname, 'data', 'sync-status.json');
const errorsRealPath = path.join(__dirname, 'data', 'errors-real.json');
const syncLogPath = path.join(__dirname, 'data', 'sync-log.json');
const configPath = path.join(__dirname, 'data', 'config.json');
const runtimePath = path.join(__dirname, 'data', 'runtime.json');
const exportLogPath = path.join(__dirname, 'data', 'export-log.json');
const alertRulesPath = path.join(__dirname, 'data', 'alert-rules.json');
const alertHistoryPath = path.join(__dirname, 'data', 'alert-history.json');
const notificationConfigPath = path.join(__dirname, 'data', 'notification-config.json');
const costBreakdownPath = path.join(__dirname, 'data', 'cost-breakdown.json');
const costTrendsPath = path.join(__dirname, 'data', 'cost-trends.json');
const environmentsPath = path.join(__dirname, 'data', 'environments.json');
const openclawConfigPath = path.join(process.env.OPENCLAW_STATE_DIR || '/root/.openclaw', 'openclaw.json');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    send(res, 200, data, types[path.extname(filePath)] || 'application/octet-stream');
  });
}

function updateRuntime(patch) {
  let runtime = { autoSyncEnabled: true, lastAutoSyncAt: null, nextAutoSyncAt: null, lastExportAt: null };
  try { runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf8')); } catch {}
  runtime = { ...runtime, ...patch };
  fs.writeFileSync(runtimePath, JSON.stringify(runtime, null, 2));
  return runtime;
}

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadOpenClawConfig() {
  return loadJson(openclawConfigPath, {});
}

function getControlCenterSummary() {
  const metrics = loadJson(dataPath, {});
  const syncStatus = loadJson(syncStatusPath, {});
  const cronJobs = loadJson(cronRealPath, []);
  const sessions = loadJson(sessionsRealPath, []);
  const cost = loadJson(costBreakdownPath, { daily: { total: 0 } });
  const errors = loadJson(errorsRealPath, { summary: { errorCount: 0 }, jobs: [] });
  const runtime = loadJson(runtimePath, {});
  const cfg = loadOpenClawConfig();
  const agents = cfg.agents?.list || [];
  const providerMap = cfg.models?.providers || {};
  const providers = Object.keys(providerMap);
  const enabledChannels = Object.entries(cfg.channels || {}).filter(([, v]) => v && v.enabled).map(([k]) => k);
  const activeCrons = cronJobs.filter(j => j.enabled).length;
  const failedCrons = cronJobs.filter(j => String(j.lastStatus).toLowerCase() === 'error').length;
  const summary = metrics.summary || {};
  const derivedSuccessRate = cronJobs.length ? Math.round((errors.summary?.okCount || 0) / cronJobs.length * 100) : 0;

  return {
    gateway: syncStatus.status === 'ok' ? 'online' : 'warning',
    lastSyncAt: syncStatus.lastSyncAt || null,
    activeSessions24h: sessions.length,
    cronCount: cronJobs.length,
    activeCronCount: activeCrons,
    failedCronCount: failedCrons,
    dailyCostEstimate: Number(cost.daily?.total || 0),
    successRate: Number(summary.successRate || derivedSuccessRate || 0),
    errorCount: Number(errors.summary?.errorCount || 0),
    agentCount: agents.length,
    providerCount: providers.length,
    enabledChannels,
    autoSyncEnabled: runtime.autoSyncEnabled !== false
  };
}

function getAgentsSummary() {
  const cfg = loadOpenClawConfig();
  return (cfg.agents?.list || []).map(agent => ({
    id: agent.id,
    name: agent.name || agent.id,
    workspace: agent.workspace,
    model: agent.model?.primary || cfg.agents?.defaults?.model?.primary || 'unknown',
    isDefault: !!agent.default,
    heartbeat: agent.heartbeat?.every || null
  }));
}

function getChannelsSummary() {
  const cfg = loadOpenClawConfig();
  return Object.entries(cfg.channels || {}).map(([channel, value]) => {
    const accounts = Object.entries(value?.accounts || {}).filter(([key]) => key !== 'default');
    const enabledAccounts = accounts.filter(([, account]) => account?.enabled !== false);
    const hasCredentials = !!(value?.botToken || value?.appId || value?.clientSecret || value?.appSecret || value?.webhook || value?.webhookUrl || enabledAccounts.some(([, account]) => account?.botToken || account?.appId || account?.appSecret));
    const issues = [];
    if (value?.enabled && !hasCredentials) issues.push('已启用但缺少可识别凭据');
    if (value?.enabled && accounts.length && !enabledAccounts.length) issues.push('账号列表存在，但没有启用账号');
    if (value?.enabled && !accounts.length && !['qqbot', 'feishu'].includes(channel) && !value?.botToken && !value?.webhook && !value?.webhookUrl) issues.push('未配置独立账号或直连 Token');

    return {
      channel,
      enabled: !!value?.enabled,
      accountCount: accounts.length,
      enabledAccountCount: enabledAccounts.length,
      hasProxy: !!(value?.proxy || value?.proxyUrl),
      hasCredentials,
      groupPolicy: value?.groupPolicy || null,
      allowFromCount: (value?.allowFrom || []).length,
      issues,
      health: issues.length ? 'warn' : (value?.enabled ? 'ok' : 'off')
    };
  });
}

function getModelsSummary() {
  const cfg = loadOpenClawConfig();
  return Object.entries(cfg.models?.providers || {}).map(([provider, value]) => {
    const models = value?.models || [];
    const reasoningCount = models.filter(model => !!model?.reasoning).length;
    const issues = [];
    if (!value?.baseUrl) issues.push('未配置 baseUrl');
    if (!value?.api) issues.push('未配置 API 协议');
    if (!models.length) issues.push('未配置模型');
    return {
      provider,
      api: value?.api || 'unknown',
      baseUrl: value?.baseUrl || '',
      modelCount: models.length,
      reasoningCount,
      issues,
      health: issues.length ? 'warn' : 'ok',
      models: models.slice(0, 12).map(m => ({ id: m.id, name: m.name || m.id, reasoning: !!m.reasoning }))
    };
  });
}

function getSkillsSummary() {
  const baseDir = process.env.OPENCLAW_STATE_DIR || '/root/.openclaw';
  const dirs = [
    path.join(baseDir, 'skills'),
    path.join(baseDir, 'workspace', 'skills')
  ];
  const items = [];
  dirs.forEach(dir => {
    try {
      fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
        if (!entry.isDirectory()) return;
        const fullPath = path.join(dir, entry.name);
        const hasSkill = fs.existsSync(path.join(fullPath, 'SKILL.md'));
        const hasReadme = fs.existsSync(path.join(fullPath, 'README.md'));
        const hasPackageJson = fs.existsSync(path.join(fullPath, 'package.json'));
        const source = fullPath.includes(`${path.sep}workspace${path.sep}skills`) ? 'workspace' : 'global';
        items.push({
          name: entry.name,
          location: dir,
          fullPath,
          source,
          hasSkill,
          hasReadme,
          hasPackageJson,
          issues: hasSkill ? [] : ['缺少 SKILL.md']
        });
      });
    } catch {}
  });
  const dedup = new Map();
  items.forEach(item => {
    if (!dedup.has(item.name)) {
      dedup.set(item.name, item);
      return;
    }
    const current = dedup.get(item.name);
    if (current.source === 'global' && item.source === 'workspace') dedup.set(item.name, item);
  });
  return Array.from(dedup.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function parseSessionKey(sessionKey = '') {
  const parts = String(sessionKey || '').split(':').filter(Boolean);
  const result = {
    raw: sessionKey,
    scope: parts[0] || 'unknown',
    agentId: parts[1] || 'unknown',
    kind: 'unknown',
    channel: 'unknown',
    accountId: null,
    target: null,
    cronId: null,
    runId: null,
    isRun: false
  };

  if (parts[2] === 'cron') {
    result.kind = 'cron';
    result.cronId = parts[3] || null;
    const runIndex = parts.indexOf('run');
    if (runIndex >= 0) {
      result.isRun = true;
      result.kind = 'cron-run';
      result.runId = parts[runIndex + 1] || null;
    }
    return result;
  }

  if (parts.length >= 5) {
    result.kind = 'channel';
    result.channel = parts[2] || 'unknown';
    result.accountId = parts[3] || null;
    result.target = parts.slice(4).join(':') || null;
    return result;
  }

  if (parts[2] === 'main') {
    result.kind = 'main';
    return result;
  }

  result.kind = parts[2] || 'unknown';
  return result;
}

function getCronDetail(cronId) {
  const cronJobs = loadJson(cronRealPath, []);
  const sessions = loadJson(sessionsRealPath, []);
  const syncLog = loadJson(syncLogPath, []);
  const errors = loadJson(errorsRealPath, { summary: {}, jobs: [] });
  const job = cronJobs.find(item => item.id === cronId);
  if (!job) return null;

  const related = sessions
    .map(item => ({ ...item, parsed: parseSessionKey(item.key) }))
    .filter(item => item.parsed.cronId === cronId)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));

  const runs = related.filter(item => item.parsed.isRun);
  const currentSession = related.find(item => !item.parsed.isRun) || null;
  const aggregate = runs.reduce((acc, item) => {
    acc.runCount += 1;
    acc.inputTokens += Number(item.inputTokens || 0);
    acc.outputTokens += Number(item.outputTokens || 0);
    acc.totalTokens += Number(item.totalTokens || 0);
    acc.latestUpdatedAt = Math.max(acc.latestUpdatedAt, Number(item.updatedAt || 0));
    if (item.model) acc.models.add(item.model);
    return acc;
  }, { runCount: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, latestUpdatedAt: 0, models: new Set() });

  const statusHistory = syncLog.slice(0, 10).map(item => ({
    at: item.at,
    status: item.status,
    errorCount: Number(item.errorCount || 0),
    sessionCount: Number(item.sessionCount || 0)
  }));

  const errorJob = (errors.jobs || []).find(item => item.id === cronId || item.name === job.name) || null;

  return {
    job,
    aggregate: {
      runCount: aggregate.runCount,
      inputTokens: aggregate.inputTokens,
      outputTokens: aggregate.outputTokens,
      totalTokens: aggregate.totalTokens,
      avgTokensPerRun: aggregate.runCount ? Math.round(aggregate.totalTokens / aggregate.runCount) : 0,
      latestUpdatedAt: aggregate.latestUpdatedAt || currentSession?.updatedAt || null,
      models: Array.from(aggregate.models)
    },
    currentSession: currentSession ? {
      key: currentSession.key,
      updatedAt: currentSession.updatedAt || null,
      model: currentSession.model || 'unknown',
      totalTokens: Number(currentSession.totalTokens || 0),
      inputTokens: Number(currentSession.inputTokens || 0),
      outputTokens: Number(currentSession.outputTokens || 0)
    } : null,
    recentRuns: runs.slice(0, 8).map(item => ({
      key: item.key,
      runId: item.parsed.runId || null,
      updatedAt: item.updatedAt || null,
      model: item.model || 'unknown',
      totalTokens: Number(item.totalTokens || 0),
      inputTokens: Number(item.inputTokens || 0),
      outputTokens: Number(item.outputTokens || 0)
    })),
    statusHistory,
    errorSummary: errorJob ? {
      name: errorJob.name,
      lastStatus: errorJob.lastStatus || 'error',
      schedule: errorJob.schedule || job.schedule
    } : null
  };
}

function getSessionDetail(sessionKey) {
  const sessions = loadJson(sessionsRealPath, []);
  const current = sessions.find(item => item.key === sessionKey);
  if (!current) return null;

  const parsed = parseSessionKey(sessionKey);
  const enriched = sessions.map(item => ({ ...item, parsed: parseSessionKey(item.key) }));
  const sameAgent = enriched.filter(item => item.parsed.agentId === parsed.agentId);
  const sameFamily = enriched.filter(item => {
    if (parsed.cronId) return item.parsed.cronId === parsed.cronId;
    if (parsed.kind === 'channel') return item.parsed.channel === parsed.channel && item.parsed.target === parsed.target;
    return item.parsed.kind === parsed.kind && item.parsed.agentId === parsed.agentId;
  });
  const familySorted = sameFamily.slice().sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  const normalizedCurrent = {
    ...current,
    parsed,
    inputTokens: Number(current.inputTokens || 0),
    outputTokens: Number(current.outputTokens || 0),
    totalTokens: Number(current.totalTokens || 0),
    updatedAt: Number(current.updatedAt || 0) || null
  };

  const aggregate = sameFamily.reduce((acc, item) => {
    acc.runCount += 1;
    acc.inputTokens += Number(item.inputTokens || 0);
    acc.outputTokens += Number(item.outputTokens || 0);
    acc.totalTokens += Number(item.totalTokens || 0);
    acc.latestUpdatedAt = Math.max(acc.latestUpdatedAt, Number(item.updatedAt || 0));
    acc.maxTokens = Math.max(acc.maxTokens, Number(item.totalTokens || 0));
    if (item.model) acc.models.add(item.model);
    return acc;
  }, { runCount: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, latestUpdatedAt: 0, maxTokens: 0, models: new Set() });

  const familyByTokens = familySorted.slice().sort((a, b) => Number(b.totalTokens || 0) - Number(a.totalTokens || 0));
  const tokenRank = Math.max(1, familyByTokens.findIndex(item => item.key === sessionKey) + 1);
  const now = Date.now();
  const active24h = sameFamily.filter(item => now - Number(item.updatedAt || 0) <= 24 * 60 * 60 * 1000);
  const outputRatio = normalizedCurrent.totalTokens ? Number((normalizedCurrent.outputTokens / normalizedCurrent.totalTokens).toFixed(4)) : 0;
  const inputShare = aggregate.inputTokens ? Number((normalizedCurrent.inputTokens / aggregate.inputTokens).toFixed(4)) : 0;
  const totalShare = aggregate.totalTokens ? Number((normalizedCurrent.totalTokens / aggregate.totalTokens).toFixed(4)) : 0;
  const avgTokens = aggregate.runCount ? Math.round(aggregate.totalTokens / aggregate.runCount) : normalizedCurrent.totalTokens;
  const diagnostics = [];

  if (normalizedCurrent.totalTokens >= avgTokens * 1.8 && normalizedCurrent.totalTokens >= 5000) {
    diagnostics.push({ level: 'warn', title: '当前会话成本明显偏高', detail: `当前 ${normalizedCurrent.totalTokens} Tokens，高于同族平均 ${avgTokens} Tokens。` });
  }
  if (outputRatio <= 0.08 && normalizedCurrent.totalTokens >= 3000) {
    diagnostics.push({ level: 'warn', title: '输出占比偏低', detail: `输出仅占总 Tokens 的 ${(outputRatio * 100).toFixed(1)}%，可能存在长上下文输入或工具调用堆积。` });
  }
  if (normalizedCurrent.updatedAt && now - normalizedCurrent.updatedAt > 12 * 60 * 60 * 1000) {
    diagnostics.push({ level: 'info', title: '会话已超过 12 小时未活跃', detail: '适合结合最近运行记录判断是否已自然结束，避免把历史会话误判为活跃问题。' });
  }
  if (!diagnostics.length) {
    diagnostics.push({ level: 'ok', title: '当前会话无明显异常信号', detail: '从同族用量、输出占比和活跃时间看，暂未发现高风险偏离。' });
  }

  const topPeers = sameAgent
    .filter(item => item.key !== sessionKey)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, 8)
    .map(item => ({
      key: item.key,
      displayName: item.displayName || item.key,
      updatedAt: item.updatedAt || null,
      model: item.model || 'unknown',
      totalTokens: Number(item.totalTokens || 0),
      kind: item.parsed.kind,
      channel: item.parsed.channel
    }));

  return {
    session: normalizedCurrent,
    aggregate: {
      ...aggregate,
      latestUpdatedAt: aggregate.latestUpdatedAt || normalizedCurrent.updatedAt || null,
      avgTokensPerRun: avgTokens,
      maxTokens: aggregate.maxTokens,
      models: Array.from(aggregate.models)
    },
    familyInsights: {
      tokenRank,
      familySize: sameFamily.length,
      activeIn24h: active24h.length,
      outputRatio,
      inputShare,
      totalShare,
      topModel: aggregate.models.size === 1 ? Array.from(aggregate.models)[0] : 'mixed',
      diagnostics
    },
    relatedRuns: familySorted.slice(0, 12).map(item => ({
      key: item.key,
      displayName: item.displayName || item.key,
      updatedAt: item.updatedAt || null,
      model: item.model || 'unknown',
      inputTokens: Number(item.inputTokens || 0),
      outputTokens: Number(item.outputTokens || 0),
      totalTokens: Number(item.totalTokens || 0),
      kind: item.parsed.kind,
      runId: item.parsed.runId || null,
      isCurrent: item.key === sessionKey
    })),
    peerSessions: topPeers,
    links: {
      cronBoard: parsed.cronId ? `/crons.html` : null,
      cronId: parsed.cronId || null
    }
  };
}

function triggerSync(reason = 'manual', cb) {
  execFile('node', [path.join(__dirname, 'scripts', 'sync-real-data.js')], (err, stdout, stderr) => {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const nextAutoSyncAt = new Date(Date.now() + (config.syncIntervalMs || 3600000)).toISOString();
    updateRuntime({ lastAutoSyncAt: new Date().toISOString(), nextAutoSyncAt, autoSyncEnabled: true });
    cb(err, stdout, stderr);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/metrics') {
    return serveFile(res, dataPath);
  }

  if (url.pathname === '/api/control-center-summary') {
    return send(res, 200, JSON.stringify(getControlCenterSummary()), 'application/json; charset=utf-8');
  }

  if (url.pathname === '/api/agents-summary') {
    return send(res, 200, JSON.stringify(getAgentsSummary()), 'application/json; charset=utf-8');
  }

  if (url.pathname === '/api/channels-summary') {
    return send(res, 200, JSON.stringify(getChannelsSummary()), 'application/json; charset=utf-8');
  }

  if (url.pathname === '/api/models-summary') {
    return send(res, 200, JSON.stringify(getModelsSummary()), 'application/json; charset=utf-8');
  }

  if (url.pathname === '/api/skills-summary') {
    return send(res, 200, JSON.stringify(getSkillsSummary()), 'application/json; charset=utf-8');
  }

  if (url.pathname === '/api/projects') {
    return serveFile(res, projectsPath);
  }

  if (url.pathname === '/api/series') {
    return serveFile(res, seriesPath);
  }

  if (url.pathname === '/api/jobs') {
    return serveFile(res, jobsPath);
  }

  if (url.pathname === '/api/adapters') {
    return serveFile(res, adaptersPath);
  }

  if (url.pathname === '/api/cost-series') {
    return serveFile(res, costSeriesPath);
  }

  if (url.pathname === '/api/cron-real') {
    return serveFile(res, cronRealPath);
  }

  if (url.pathname === '/api/sessions-real') {
    return serveFile(res, sessionsRealPath);
  }

  if (url.pathname === '/api/session-detail') {
    const sessionKey = url.searchParams.get('key') || '';
    if (!sessionKey) return send(res, 400, JSON.stringify({ ok: false, error: 'missing key' }), 'application/json; charset=utf-8');
    const detail = getSessionDetail(sessionKey);
    if (!detail) return send(res, 404, JSON.stringify({ ok: false, error: 'session not found' }), 'application/json; charset=utf-8');
    return send(res, 200, JSON.stringify({ ok: true, ...detail }), 'application/json; charset=utf-8');
  }

  if (url.pathname === '/api/doctor' && req.method === 'POST') {
    try {
      const { execSync } = require('child_process');
      const output = execSync('openclaw doctor --json', { encoding: 'utf-8', timeout: 30000 });
      const parsed = JSON.parse(output);
      return send(res, 200, JSON.stringify({ ok: true, raw: parsed, checks: parsed.checks || [] }), 'application/json; charset=utf-8');
    } catch (err) {
      return send(res, 500, JSON.stringify({ ok: false, error: err.message }), 'application/json; charset=utf-8');
    }
  }

  if (url.pathname === '/api/proxy-config' && req.method === 'GET') {
    const proxyConfigPath = path.join(dataDir, 'proxy-config.json');
    try {
      const config = loadJson(proxyConfigPath, {});
      return send(res, 200, JSON.stringify(config), 'application/json; charset=utf-8');
    } catch (err) {
      return send(res, 200, JSON.stringify({}), 'application/json; charset=utf-8');
    }
  }

  if (url.pathname === '/api/proxy-config' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const config = JSON.parse(body);
        const proxyConfigPath = path.join(dataDir, 'proxy-config.json');
        fs.writeFileSync(proxyConfigPath, JSON.stringify(config, null, 2), 'utf-8');
        return send(res, 200, JSON.stringify({ ok: true }), 'application/json; charset=utf-8');
      } catch (err) {
        return send(res, 500, JSON.stringify({ ok: false, error: err.message }), 'application/json; charset=utf-8');
      }
    });
    return;
  }

  if (url.pathname === '/api/proxy-test' && req.method === 'POST') {
    try {
      const { execSync } = require('child_process');
      const start = Date.now();
      execSync('curl -I -s -m 5 https://www.google.com', { encoding: 'utf-8', timeout: 10000 });
      const latency = Date.now() - start;
      return send(res, 200, JSON.stringify({ ok: true, latency }), 'application/json; charset=utf-8');
    } catch (err) {
      return send(res, 200, JSON.stringify({ ok: false, error: '连接失败' }), 'application/json; charset=utf-8');
    }
  }

  if (url.pathname === '/api/cron-detail') {
    const cronId = url.searchParams.get('id') || '';
    if (!cronId) return send(res, 400, JSON.stringify({ ok: false, error: 'missing id' }), 'application/json; charset=utf-8');
    const detail = getCronDetail(cronId);
    if (!detail) return send(res, 404, JSON.stringify({ ok: false, error: 'cron not found' }), 'application/json; charset=utf-8');
    return send(res, 200, JSON.stringify({ ok: true, ...detail }), 'application/json; charset=utf-8');
  }

  if (url.pathname === '/api/cron-runs') {
    const cronId = url.searchParams.get('id') || '';
    const limit = url.searchParams.get('limit') || '8';
    if (!cronId) return send(res, 400, JSON.stringify({ ok: false, error: 'missing id' }), 'application/json; charset=utf-8');
    execFile('openclaw', ['cron', 'runs', '--id', cronId, '--limit', limit], (err, stdout, stderr) => {
      if (err) return send(res, 500, JSON.stringify({ ok: false, error: stderr || err.message }), 'application/json; charset=utf-8');
      try {
        return send(res, 200, JSON.stringify({ ok: true, ...JSON.parse(stdout) }), 'application/json; charset=utf-8');
      } catch (parseErr) {
        return send(res, 500, JSON.stringify({ ok: false, error: parseErr.message }), 'application/json; charset=utf-8');
      }
    });
    return;
  }

  if (url.pathname === '/api/cron-run' && req.method === 'POST') {
    const cronId = url.searchParams.get('id') || '';
    if (!cronId) return send(res, 400, JSON.stringify({ ok: false, error: 'missing id' }), 'application/json; charset=utf-8');
    execFile('openclaw', ['cron', 'run', cronId], (err, stdout, stderr) => {
      if (err) return send(res, 500, JSON.stringify({ ok: false, error: stderr || err.message }), 'application/json; charset=utf-8');
      triggerSync('cron-run', () => {});
      return send(res, 200, JSON.stringify({ ok: true, output: stdout.trim() }), 'application/json; charset=utf-8');
    });
    return;
  }

  if (url.pathname === '/api/cron-enable' && req.method === 'POST') {
    const cronId = url.searchParams.get('id') || '';
    if (!cronId) return send(res, 400, JSON.stringify({ ok: false, error: 'missing id' }), 'application/json; charset=utf-8');
    execFile('openclaw', ['cron', 'enable', cronId], (err, stdout, stderr) => {
      if (err) return send(res, 500, JSON.stringify({ ok: false, error: stderr || err.message }), 'application/json; charset=utf-8');
      triggerSync('cron-enable', () => {});
      return send(res, 200, JSON.stringify({ ok: true, output: stdout.trim() }), 'application/json; charset=utf-8');
    });
    return;
  }

  if (url.pathname === '/api/cron-disable' && req.method === 'POST') {
    const cronId = url.searchParams.get('id') || '';
    if (!cronId) return send(res, 400, JSON.stringify({ ok: false, error: 'missing id' }), 'application/json; charset=utf-8');
    execFile('openclaw', ['cron', 'disable', cronId], (err, stdout, stderr) => {
      if (err) return send(res, 500, JSON.stringify({ ok: false, error: stderr || err.message }), 'application/json; charset=utf-8');
      triggerSync('cron-disable', () => {});
      return send(res, 200, JSON.stringify({ ok: true, output: stdout.trim() }), 'application/json; charset=utf-8');
    });
    return;
  }

  if (url.pathname === '/api/sync-status') {
    return serveFile(res, syncStatusPath);
  }

  if (url.pathname === '/api/errors-real') {
    return serveFile(res, errorsRealPath);
  }

  if (url.pathname === '/api/sync-log') {
    return serveFile(res, syncLogPath);
  }

  if (url.pathname === '/api/config') {
    return serveFile(res, configPath);
  }

  if (url.pathname === '/api/runtime') {
    return serveFile(res, runtimePath);
  }

  if (url.pathname === '/api/export-log') {
    return serveFile(res, exportLogPath);
  }

  if (url.pathname === '/api/alert-rules') {
    if (req.method === 'GET') {
      return serveFile(res, alertRulesPath);
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          fs.writeFileSync(alertRulesPath, JSON.stringify(data, null, 2));
          return send(res, 200, JSON.stringify({ ok: true }), 'application/json; charset=utf-8');
        } catch (err) {
          return send(res, 400, JSON.stringify({ ok: false, error: err.message }), 'application/json; charset=utf-8');
        }
      });
      return;
    }
  }

  if (url.pathname === '/api/alert-history') {
    return serveFile(res, alertHistoryPath);
  }

  if (url.pathname === '/api/notification-config') {
    if (req.method === 'GET') {
      return serveFile(res, notificationConfigPath);
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          fs.writeFileSync(notificationConfigPath, JSON.stringify(data, null, 2));
          return send(res, 200, JSON.stringify({ ok: true }), 'application/json; charset=utf-8');
        } catch (err) {
          return send(res, 400, JSON.stringify({ ok: false, error: err.message }), 'application/json; charset=utf-8');
        }
      });
      return;
    }
  }

  if (url.pathname === '/api/check-alerts' && req.method === 'POST') {
    execFile('node', [path.join(__dirname, 'scripts', 'check-alerts.js')], (err, stdout, stderr) => {
      if (err) return send(res, 500, JSON.stringify({ ok: false, error: stderr || err.message }), 'application/json; charset=utf-8');
      return send(res, 200, JSON.stringify({ ok: true, output: stdout.trim() }), 'application/json; charset=utf-8');
    });
    return;
  }

  if (url.pathname === '/api/test-notification' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { channel, message } = JSON.parse(body);
        const { sendNotification } = require('./scripts/check-alerts.js');
        sendNotification([channel], message || '测试通知').then(success => {
          return send(res, 200, JSON.stringify({ ok: success }), 'application/json; charset=utf-8');
        }).catch(err => {
          return send(res, 500, JSON.stringify({ ok: false, error: err.message }), 'application/json; charset=utf-8');
        });
      } catch (err) {
        return send(res, 400, JSON.stringify({ ok: false, error: err.message }), 'application/json; charset=utf-8');
      }
    });
    return;
  }

  if (url.pathname === '/api/cost-breakdown') {
    return serveFile(res, costBreakdownPath);
  }

  if (url.pathname === '/api/cost-trends') {
    return serveFile(res, costTrendsPath);
  }

  if (url.pathname === '/api/analyze-cost' && req.method === 'POST') {
    execFile('node', [path.join(__dirname, 'scripts', 'analyze-cost.js')], (err, stdout, stderr) => {
      if (err) return send(res, 500, JSON.stringify({ ok: false, error: stderr || err.message }), 'application/json; charset=utf-8');
      return send(res, 200, JSON.stringify({ ok: true, output: stdout.trim() }), 'application/json; charset=utf-8');
    });
    return;
  }

  if (url.pathname === '/api/environments') {
    if (req.method === 'GET') {
      return serveFile(res, environmentsPath);
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          fs.writeFileSync(environmentsPath, JSON.stringify(data, null, 2));
          return send(res, 200, JSON.stringify({ ok: true }), 'application/json; charset=utf-8');
        } catch (err) {
          return send(res, 400, JSON.stringify({ ok: false, error: err.message }), 'application/json; charset=utf-8');
        }
      });
      return;
    }
  }

  if (url.pathname === '/api/sync-multi-env' && req.method === 'POST') {
    execFile('node', [path.join(__dirname, 'scripts', 'sync-multi-env.js'), 'sync'], (err, stdout, stderr) => {
      if (err) return send(res, 500, JSON.stringify({ ok: false, error: stderr || err.message }), 'application/json; charset=utf-8');
      return send(res, 200, JSON.stringify({ ok: true, output: stdout.trim() }), 'application/json; charset=utf-8');
    });
    return;
  }

  if (url.pathname === '/api/compare-environments' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { envIds } = JSON.parse(body);
        const { compareEnvironments } = require('./scripts/sync-multi-env.js');
        const comparison = compareEnvironments(envIds);
        return send(res, 200, JSON.stringify(comparison), 'application/json; charset=utf-8');
      } catch (err) {
        return send(res, 400, JSON.stringify({ ok: false, error: err.message }), 'application/json; charset=utf-8');
      }
    });
    return;
  }

  if (url.pathname === '/api/env-data' && req.method === 'GET') {
    const envId = url.searchParams.get('envId') || 'local';
    try {
      const { getEnvData } = require('./scripts/sync-multi-env.js');
      const data = getEnvData(envId);
      return send(res, 200, JSON.stringify(data), 'application/json; charset=utf-8');
    } catch (err) {
      return send(res, 404, JSON.stringify({ ok: false, error: err.message }), 'application/json; charset=utf-8');
    }
  }

  if (url.pathname === '/api/export' && req.method === 'POST') {
    execFile('node', [path.join(__dirname, 'scripts', 'export-data.js')], (err, stdout, stderr) => {
      if (err) return send(res, 500, JSON.stringify({ ok: false, error: stderr || err.message }), 'application/json; charset=utf-8');
      return send(res, 200, JSON.stringify({ ok: true, output: stdout.trim() }), 'application/json; charset=utf-8');
    });
    return;
  }

  if (url.pathname === '/api/sync-now' && req.method === 'POST') {
    triggerSync('manual', (err, stdout, stderr) => {
      if (err) return send(res, 500, JSON.stringify({ ok: false, error: stderr || err.message }), 'application/json; charset=utf-8');
      return send(res, 200, JSON.stringify({ ok: true, output: stdout.trim() }), 'application/json; charset=utf-8');
    });
    return;
  }

  // Cron 操作 API
  if (url.pathname === '/api/cron/toggle' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { jobId, enabled } = JSON.parse(body);
        execFile('openclaw', ['cron', 'update', jobId, '--enabled', enabled ? 'true' : 'false'], (err, stdout, stderr) => {
          if (err) return send(res, 500, JSON.stringify({ ok: false, error: stderr || err.message }), 'application/json; charset=utf-8');
          triggerSync('manual', () => {});
          return send(res, 200, JSON.stringify({ ok: true }), 'application/json; charset=utf-8');
        });
      } catch (err) {
        return send(res, 400, JSON.stringify({ ok: false, error: err.message }), 'application/json; charset=utf-8');
      }
    });
    return;
  }

  if (url.pathname === '/api/cron/run' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { jobId } = JSON.parse(body);
        execFile('openclaw', ['cron', 'run', jobId], (err, stdout, stderr) => {
          if (err) return send(res, 500, JSON.stringify({ ok: false, error: stderr || err.message }), 'application/json; charset=utf-8');
          return send(res, 200, JSON.stringify({ ok: true, output: stdout.trim() }), 'application/json; charset=utf-8');
        });
      } catch (err) {
        return send(res, 400, JSON.stringify({ ok: false, error: err.message }), 'application/json; charset=utf-8');
      }
    });
    return;
  }

  if (url.pathname === '/api/cron/delete' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { jobId } = JSON.parse(body);
        execFile('openclaw', ['cron', 'remove', jobId], (err, stdout, stderr) => {
          if (err) return send(res, 500, JSON.stringify({ ok: false, error: stderr || err.message }), 'application/json; charset=utf-8');
          triggerSync('manual', () => {});
          return send(res, 200, JSON.stringify({ ok: true }), 'application/json; charset=utf-8');
        });
      } catch (err) {
        return send(res, 400, JSON.stringify({ ok: false, error: err.message }), 'application/json; charset=utf-8');
      }
    });
    return;
  }

  if (url.pathname === '/api/live/openclaw' && req.method === 'GET') {
    Promise.all([
      fetch('http://127.0.0.1:3000/health').then(r => r.text()).catch(() => 'unavailable')
    ]).then(([health]) => {
      send(res, 200, JSON.stringify({ ok: true, source: 'probe', health }), 'application/json; charset=utf-8');
    });
    return;
  }

  let filePath = path.join(publicDir, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!filePath.startsWith(publicDir)) return send(res, 403, 'Forbidden');
  serveFile(res, filePath);
}).listen(port, () => {
  let config = { syncIntervalMs: 3600000 };
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
  const nextAutoSyncAt = new Date(Date.now() + (config.syncIntervalMs || 3600000)).toISOString();
  updateRuntime({ autoSyncEnabled: true, nextAutoSyncAt });
  setInterval(() => {
    triggerSync('auto', () => {});
  }, config.syncIntervalMs || 3600000);
  console.log(`OpenClaw Control Center running at http://localhost:${port}`);
});
