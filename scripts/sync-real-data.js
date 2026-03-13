const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const dataDir = path.join(root, 'data');
const configPath = path.join(dataDir, 'config.json');
const syncLogPath = path.join(dataDir, 'sync-log.json');

function writeJson(name, value) {
  fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value, null, 2));
}

function runJson(args) {
  const out = execFileSync('openclaw', args, { encoding: 'utf8' });
  return JSON.parse(out);
}

function appendLog(entry) {
  let current = [];
  try { current = JSON.parse(fs.readFileSync(syncLogPath, 'utf8')); } catch {}
  current.unshift(entry);
  current = current.slice(0, 20);
  fs.writeFileSync(syncLogPath, JSON.stringify(current, null, 2));
}

function main() {
  const now = new Date().toISOString();
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const cron = runJson(['cron', 'list', '--json']);
    const sessions = runJson(['sessions', '--all-agents', '--active', String(config.sessionActiveMinutes || 1440), '--json']);

    const cronJobs = (cron.jobs || []).map(job => ({
      id: job.id,
      name: job.name,
      enabled: job.enabled,
      schedule: job.schedule?.kind === 'every' ? `every ${job.schedule.everyMs}ms` : `${job.schedule?.expr || 'unknown'} ${job.schedule?.tz || ''}`.trim(),
      lastStatus: job.state?.lastStatus || job.state?.lastRunStatus || 'unknown',
      nextRunAtMs: job.state?.nextRunAtMs || null
    }));

    const realSessions = (sessions.sessions || []).map(s => ({
      key: s.key,
      displayName: s.displayName || s.label || s.key,
      channel: s.channel || 'unknown',
      updatedAt: s.updatedAt || null,
      model: s.model || 'unknown',
      inputTokens: s.inputTokens || 0,
      outputTokens: s.outputTokens || 0,
      totalTokens: s.totalTokens || 0
    }));

    const normalized = cronJobs.map(job => String(job.lastStatus).toLowerCase());
    const errorCount = normalized.filter(s => s === 'error').length;
    const okCount = normalized.filter(s => s === 'ok').length;
    const unknownCount = normalized.filter(s => s !== 'ok' && s !== 'error').length;
    const errorJobs = cronJobs.filter(j => String(j.lastStatus).toLowerCase() === 'error');

    writeJson('cron-real.json', cronJobs);
    writeJson('sessions-real.json', realSessions);
    writeJson('errors-real.json', {
      generatedAt: now,
      summary: { errorCount, okCount, unknownCount },
      jobs: errorJobs
    });
    writeJson('sync-status.json', {
      lastSyncAt: now,
      source: 'openclaw-cli',
      cronCount: cronJobs.length,
      sessionCount: realSessions.length,
      errorCount,
      status: 'ok',
      lastError: null
    });
    appendLog({ at: now, status: 'ok', cronCount: cronJobs.length, sessionCount: realSessions.length, errorCount });

    // 运行成本分析
    try {
      execFileSync('node', [path.join(__dirname, 'analyze-cost.js')], { encoding: 'utf8' });
      console.log('Cost analysis completed');
    } catch (costErr) {
      console.error('Cost analysis failed:', costErr.message);
    }

    console.log(`Synced ${cronJobs.length} cron jobs and ${realSessions.length} sessions at ${now}`);
  } catch (err) {
    writeJson('sync-status.json', {
      lastSyncAt: now,
      source: 'openclaw-cli',
      cronCount: 0,
      sessionCount: 0,
      errorCount: 1,
      status: 'error',
      lastError: err.message
    });
    appendLog({ at: now, status: 'error', cronCount: 0, sessionCount: 0, errorCount: 1, error: err.message });
    console.error(err.message);
    process.exit(1);
  }
}

main();
