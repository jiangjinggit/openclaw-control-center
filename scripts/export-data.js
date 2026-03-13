const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dataDir = path.join(root, 'data');
const outDir = path.join(root, 'exports');
const exportLogPath = path.join(dataDir, 'export-log.json');
const runtimePath = path.join(dataDir, 'runtime.json');
fs.mkdirSync(outDir, { recursive: true });

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
}

const bundle = {
  exportedAt: new Date().toISOString(),
  syncStatus: read('sync-status.json'),
  cronReal: read('cron-real.json'),
  sessionsReal: read('sessions-real.json'),
  errorsReal: read('errors-real.json')
};

const outPath = path.join(outDir, `monitor-export-${Date.now()}.json`);
fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2));
let exportLog = [];
try { exportLog = JSON.parse(fs.readFileSync(exportLogPath, 'utf8')); } catch {}
exportLog.unshift({ at: new Date().toISOString(), path: outPath });
exportLog = exportLog.slice(0, 20);
fs.writeFileSync(exportLogPath, JSON.stringify(exportLog, null, 2));
try {
  const runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
  runtime.lastExportAt = new Date().toISOString();
  fs.writeFileSync(runtimePath, JSON.stringify(runtime, null, 2));
} catch {}
console.log(outPath);
