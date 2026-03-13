const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const dataDir = path.join(__dirname, '..', 'data');
const rulesPath = path.join(dataDir, 'alert-rules.json');
const historyPath = path.join(dataDir, 'alert-history.json');
const notificationConfigPath = path.join(dataDir, 'notification-config.json');
const metricsPath = path.join(dataDir, 'metrics.json');
const cronRealPath = path.join(dataDir, 'cron-real.json');
const errorsRealPath = path.join(dataDir, 'errors-real.json');

// 读取配置
function loadJSON(filePath, defaultValue = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return defaultValue;
  }
}

// 保存数据
function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// 发送 Telegram 通知
function sendTelegram(config, message) {
  if (!config.enabled || !config.botToken || !config.chatId) {
    console.log('[Telegram] Not configured, skipping');
    return Promise.resolve();
  }

  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
  const data = JSON.stringify({
    chat_id: config.chatId,
    text: message,
    parse_mode: 'Markdown'
  });

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('[Telegram] Sent successfully');
          resolve();
        } else {
          console.error('[Telegram] Failed:', body);
          reject(new Error(body));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 发送飞书通知
function sendFeishu(config, message) {
  if (!config.enabled || !config.webhookUrl) {
    console.log('[Feishu] Not configured, skipping');
    return Promise.resolve();
  }

  const url = new URL(config.webhookUrl);
  const data = JSON.stringify({
    msg_type: 'text',
    content: {
      text: message
    }
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('[Feishu] Sent successfully');
          resolve();
        } else {
          console.error('[Feishu] Failed:', body);
          reject(new Error(body));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 发送通知
async function sendNotification(channels, message) {
  const config = loadJSON(notificationConfigPath);
  const promises = [];

  for (const channel of channels) {
    if (channel === 'telegram') {
      promises.push(sendTelegram(config.telegram, message));
    } else if (channel === 'feishu') {
      promises.push(sendFeishu(config.feishu, message));
    }
  }

  try {
    await Promise.all(promises);
    return true;
  } catch (err) {
    console.error('[Notification] Error:', err.message);
    return false;
  }
}

// 检查告警规则
function checkAlertRules() {
  const rules = loadJSON(rulesPath, { rules: [] }).rules;
  const history = loadJSON(historyPath, []);
  const metrics = loadJSON(metricsPath, {});
  let cronReal = loadJSON(cronRealPath, []);
  let errorsReal = loadJSON(errorsRealPath, []);
  
  // 兼容不同的数据格式
  if (Array.isArray(cronReal)) {
    cronReal = { jobs: cronReal };
  }
  if (Array.isArray(errorsReal)) {
    errorsReal = { errors: errorsReal };
  }

  const now = Date.now();
  const triggeredAlerts = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    // 检查冷却时间
    const lastAlert = history.find(h => h.ruleId === rule.id);
    if (lastAlert && (now - new Date(lastAlert.timestamp).getTime()) < (rule.cooldown * 1000)) {
      continue;
    }

    let shouldTrigger = false;
    let currentValue = null;
    let message = '';

    // 根据规则类型检查条件
    switch (rule.type) {
      case 'cost':
        // 检查成本
        currentValue = metrics.cost || 0;
        shouldTrigger = evaluateCondition(currentValue, rule.condition);
        if (shouldTrigger) {
          message = `🚨 *${rule.name}*\n\n` +
                   `当前成本: ¥${currentValue.toFixed(2)}\n` +
                   `阈值: ¥${rule.condition.threshold}\n` +
                   `时间: ${new Date().toLocaleString('zh-CN')}`;
        }
        break;

      case 'error_rate':
        // 检查错误率
        const total = (metrics.successCount || 0) + (metrics.failureCount || 0);
        currentValue = total > 0 ? (metrics.failureCount || 0) / total : 0;
        shouldTrigger = evaluateCondition(currentValue, rule.condition);
        if (shouldTrigger) {
          message = `🚨 *${rule.name}*\n\n` +
                   `当前错误率: ${(currentValue * 100).toFixed(1)}%\n` +
                   `阈值: ${(rule.condition.threshold * 100).toFixed(1)}%\n` +
                   `失败次数: ${metrics.failureCount || 0}\n` +
                   `总次数: ${total}\n` +
                   `时间: ${new Date().toLocaleString('zh-CN')}`;
        }
        break;

      case 'cron_failure':
        // 检查 Cron 连续失败
        const failedCrons = cronReal.jobs.filter(job => {
          const recentRuns = job.runs || [];
          if (recentRuns.length < rule.condition.threshold) return false;
          const lastN = recentRuns.slice(-rule.condition.threshold);
          return lastN.every(run => run.status === 'failed');
        });
        
        if (failedCrons.length > 0) {
          shouldTrigger = true;
          const cronNames = failedCrons.map(c => c.name).join(', ');
          message = `🚨 *${rule.name}*\n\n` +
                   `失败的 Cron: ${cronNames}\n` +
                   `连续失败次数: ${rule.condition.threshold}\n` +
                   `时间: ${new Date().toLocaleString('zh-CN')}`;
        }
        break;

      case 'session_timeout':
        // 检查 Session 超时（暂时跳过，需要更多数据）
        break;
    }

    if (shouldTrigger) {
      triggeredAlerts.push({
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        message: message,
        currentValue: currentValue,
        threshold: rule.condition.threshold,
        timestamp: new Date().toISOString()
      });

      // 发送通知
      sendNotification(rule.channels, message).then(success => {
        if (success) {
          console.log(`[Alert] Triggered: ${rule.name}`);
        }
      });
    }
  }

  // 保存告警历史
  if (triggeredAlerts.length > 0) {
    history.push(...triggeredAlerts);
    // 只保留最近 1000 条
    if (history.length > 1000) {
      history.splice(0, history.length - 1000);
    }
    saveJSON(historyPath, history);
  }

  return triggeredAlerts;
}

// 评估条件
function evaluateCondition(value, condition) {
  switch (condition.operator) {
    case '>':
      return value > condition.threshold;
    case '>=':
      return value >= condition.threshold;
    case '<':
      return value < condition.threshold;
    case '<=':
      return value <= condition.threshold;
    case '==':
      return value == condition.threshold;
    case '!=':
      return value != condition.threshold;
    default:
      return false;
  }
}

// 主函数
function main() {
  console.log('[Alert Check] Starting...');
  const alerts = checkAlertRules();
  console.log(`[Alert Check] Triggered ${alerts.length} alerts`);
  
  if (alerts.length > 0) {
    alerts.forEach(alert => {
      console.log(`  - ${alert.ruleName} (${alert.severity})`);
    });
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = { checkAlertRules, sendNotification };
