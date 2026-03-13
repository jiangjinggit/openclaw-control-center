const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const dataDir = path.join(__dirname, '..', 'data');
const environmentsPath = path.join(dataDir, 'environments.json');

// 读取 JSON 文件
function loadJSON(filePath, defaultValue = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return defaultValue;
  }
}

// 保存 JSON 文件
function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// 同步多个环境的数据
function syncMultiEnv(callback) {
  const environments = loadJSON(environmentsPath, { environments: [] });
  const enabledEnvs = environments.environments.filter(env => env.enabled);
  
  if (enabledEnvs.length === 0) {
    return callback(new Error('No enabled environments'));
  }
  
  console.log(`[Multi-Env Sync] Syncing ${enabledEnvs.length} environments...`);
  
  // 对于本地环境，直接运行标准同步
  // 对于远程环境，需要通过 API 或 SSH 获取数据
  const syncPromises = enabledEnvs.map(env => {
    return new Promise((resolve, reject) => {
      if (env.type === 'local') {
        // 本地环境：运行标准同步脚本
        execFile('node', [path.join(__dirname, 'sync-real-data.js')], (err, stdout, stderr) => {
          if (err) {
            console.error(`[Multi-Env Sync] ${env.name} failed:`, stderr);
            resolve({ env: env.id, success: false, error: stderr });
          } else {
            console.log(`[Multi-Env Sync] ${env.name} completed`);
            resolve({ env: env.id, success: true, output: stdout });
          }
        });
      } else if (env.type === 'remote') {
        // 远程环境：通过 API 获取数据
        syncRemoteEnv(env).then(result => {
          resolve({ env: env.id, success: true, data: result });
        }).catch(err => {
          console.error(`[Multi-Env Sync] ${env.name} failed:`, err.message);
          resolve({ env: env.id, success: false, error: err.message });
        });
      } else {
        resolve({ env: env.id, success: false, error: 'Unknown environment type' });
      }
    });
  });
  
  Promise.all(syncPromises).then(results => {
    const summary = {
      total: results.length,
      success: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results: results
    };
    
    console.log(`[Multi-Env Sync] Completed: ${summary.success}/${summary.total} succeeded`);
    callback(null, summary);
  });
}

// 同步远程环境
async function syncRemoteEnv(env) {
  // 这里实现远程环境的数据同步逻辑
  // 可以通过 HTTP API、SSH 等方式获取远程数据
  
  if (!env.config || !env.config.apiEndpoint) {
    throw new Error('Remote environment requires apiEndpoint in config');
  }
  
  const https = require('https');
  const http = require('http');
  
  return new Promise((resolve, reject) => {
    const url = new URL(env.config.apiEndpoint);
    const client = url.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + '/api/sync-data',
      method: 'GET',
      headers: env.config.apiKey ? { 'Authorization': `Bearer ${env.config.apiKey}` } : {}
    };
    
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const result = JSON.parse(data);
            
            // 保存远程数据到本地（带环境前缀）
            const envDataDir = path.join(dataDir, 'envs', env.id);
            if (!fs.existsSync(envDataDir)) {
              fs.mkdirSync(envDataDir, { recursive: true });
            }
            
            // 保存各类数据
            if (result.cron) {
              saveJSON(path.join(envDataDir, 'cron-real.json'), result.cron);
            }
            if (result.sessions) {
              saveJSON(path.join(envDataDir, 'sessions-real.json'), result.sessions);
            }
            if (result.errors) {
              saveJSON(path.join(envDataDir, 'errors-real.json'), result.errors);
            }
            
            resolve(result);
          } catch (err) {
            reject(new Error('Failed to parse remote data: ' + err.message));
          }
        } else {
          reject(new Error(`Remote API returned ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

// 获取环境数据
function getEnvData(envId) {
  const environments = loadJSON(environmentsPath, { environments: [] });
  const env = environments.environments.find(e => e.id === envId);
  
  if (!env) {
    throw new Error(`Environment ${envId} not found`);
  }
  
  if (env.type === 'local' || env.isDefault) {
    // 本地环境：读取标准数据目录
    return {
      cron: loadJSON(path.join(dataDir, 'cron-real.json'), { jobs: [] }),
      sessions: loadJSON(path.join(dataDir, 'sessions-real.json'), { sessions: [] }),
      errors: loadJSON(path.join(dataDir, 'errors-real.json'), { errors: [] }),
      metrics: loadJSON(path.join(dataDir, 'metrics.json'), {})
    };
  } else {
    // 远程环境：读取环境专属目录
    const envDataDir = path.join(dataDir, 'envs', envId);
    return {
      cron: loadJSON(path.join(envDataDir, 'cron-real.json'), { jobs: [] }),
      sessions: loadJSON(path.join(envDataDir, 'sessions-real.json'), { sessions: [] }),
      errors: loadJSON(path.join(envDataDir, 'errors-real.json'), { errors: [] }),
      metrics: loadJSON(path.join(envDataDir, 'metrics.json'), {})
    };
  }
}

// 对比多个环境
function compareEnvironments(envIds) {
  const comparison = {
    environments: [],
    summary: {
      totalCrons: 0,
      totalSessions: 0,
      totalErrors: 0,
      totalCost: 0
    }
  };
  
  envIds.forEach(envId => {
    try {
      const data = getEnvData(envId);
      const environments = loadJSON(environmentsPath, { environments: [] });
      const env = environments.environments.find(e => e.id === envId);
      
      const envStats = {
        id: envId,
        name: env ? env.name : envId,
        cronCount: data.cron.jobs ? data.cron.jobs.length : 0,
        sessionCount: data.sessions.sessions ? data.sessions.sessions.length : 0,
        errorCount: data.errors.errors ? data.errors.errors.length : 0,
        cost: data.metrics.cost || 0,
        successRate: data.metrics.successRate || 0,
        avgLatency: data.metrics.avgLatency || 0
      };
      
      comparison.environments.push(envStats);
      comparison.summary.totalCrons += envStats.cronCount;
      comparison.summary.totalSessions += envStats.sessionCount;
      comparison.summary.totalErrors += envStats.errorCount;
      comparison.summary.totalCost += envStats.cost;
    } catch (err) {
      console.error(`Failed to get data for ${envId}:`, err.message);
    }
  });
  
  return comparison;
}

// 主函数
function main() {
  const action = process.argv[2] || 'sync';
  
  if (action === 'sync') {
    console.log('[Multi-Env] Starting multi-environment sync...');
    syncMultiEnv((err, summary) => {
      if (err) {
        console.error('[Multi-Env] Sync failed:', err.message);
        process.exit(1);
      } else {
        console.log('[Multi-Env] Sync completed:', JSON.stringify(summary, null, 2));
      }
    });
  } else if (action === 'compare') {
    const envIds = process.argv.slice(3);
    if (envIds.length === 0) {
      console.error('[Multi-Env] Usage: node sync-multi-env.js compare <env1> <env2> ...');
      process.exit(1);
    }
    
    console.log(`[Multi-Env] Comparing environments: ${envIds.join(', ')}`);
    const comparison = compareEnvironments(envIds);
    console.log(JSON.stringify(comparison, null, 2));
  } else {
    console.error('[Multi-Env] Unknown action:', action);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = { syncMultiEnv, getEnvData, compareEnvironments };
