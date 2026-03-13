const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const metricsPath = path.join(dataDir, 'metrics.json');
const cronRealPath = path.join(dataDir, 'cron-real.json');
const sessionsRealPath = path.join(dataDir, 'sessions-real.json');
const costBreakdownPath = path.join(dataDir, 'cost-breakdown.json');
const costTrendsPath = path.join(dataDir, 'cost-trends.json');

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

// 估算成本（简化版本，实际应该根据真实 token 使用量计算）
function estimateCost(item) {
  // 这里使用简化的估算逻辑
  // 实际应该根据模型类型、token 数量等计算
  const baseRate = 0.01; // 每次调用基础成本
  const tokenRate = 0.00001; // 每 token 成本
  
  let cost = baseRate;
  
  if (item.tokens) {
    cost += item.tokens * tokenRate;
  } else if (item.inputTokens && item.outputTokens) {
    cost += (item.inputTokens + item.outputTokens) * tokenRate;
  }
  
  return cost;
}

// 分析成本
function analyzeCost() {
  const metrics = loadJSON(metricsPath, {});
  let cronReal = loadJSON(cronRealPath, []);
  let sessionsReal = loadJSON(sessionsRealPath, []);
  
  // 兼容不同的数据格式
  if (Array.isArray(cronReal)) {
    cronReal = { jobs: cronReal };
  }
  if (Array.isArray(sessionsReal)) {
    sessionsReal = { sessions: sessionsReal };
  }
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  // 初始化成本分解数据
  const breakdown = {
    timestamp: now.toISOString(),
    daily: {
      total: 0,
      byAgent: {},
      byCron: {},
      bySession: {},
      byModel: {}
    },
    weekly: {
      total: 0,
      byAgent: {},
      byCron: {},
      bySession: {},
      byModel: {}
    },
    monthly: {
      total: 0,
      byAgent: {},
      byCron: {},
      bySession: {},
      byModel: {}
    }
  };
  
  // 分析 Cron 任务成本
  cronReal.jobs.forEach(job => {
    const runs = job.runs || [];
    runs.forEach(run => {
      const runDate = new Date(run.timestamp || run.startedAt);
      const cost = estimateCost(run);
      
      // 日成本
      if (runDate >= today) {
        breakdown.daily.total += cost;
        breakdown.daily.byCron[job.name] = (breakdown.daily.byCron[job.name] || 0) + cost;
        if (run.agent) {
          breakdown.daily.byAgent[run.agent] = (breakdown.daily.byAgent[run.agent] || 0) + cost;
        }
        if (run.model) {
          breakdown.daily.byModel[run.model] = (breakdown.daily.byModel[run.model] || 0) + cost;
        }
      }
      
      // 周成本
      if (runDate >= thisWeek) {
        breakdown.weekly.total += cost;
        breakdown.weekly.byCron[job.name] = (breakdown.weekly.byCron[job.name] || 0) + cost;
        if (run.agent) {
          breakdown.weekly.byAgent[run.agent] = (breakdown.weekly.byAgent[run.agent] || 0) + cost;
        }
        if (run.model) {
          breakdown.weekly.byModel[run.model] = (breakdown.weekly.byModel[run.model] || 0) + cost;
        }
      }
      
      // 月成本
      if (runDate >= thisMonth) {
        breakdown.monthly.total += cost;
        breakdown.monthly.byCron[job.name] = (breakdown.monthly.byCron[job.name] || 0) + cost;
        if (run.agent) {
          breakdown.monthly.byAgent[run.agent] = (breakdown.monthly.byAgent[run.agent] || 0) + cost;
        }
        if (run.model) {
          breakdown.monthly.byModel[run.model] = (breakdown.monthly.byModel[run.model] || 0) + cost;
        }
      }
    });
  });
  
  // 分析 Session 成本
  sessionsReal.sessions.forEach(session => {
    const sessionDate = new Date(session.updatedAt || session.createdAt || session.timestamp);
    const cost = estimateCost(session);
    
    // 日成本
    if (sessionDate >= today) {
      breakdown.daily.total += cost;
      breakdown.daily.bySession[session.key || session.id] = cost;
      if (session.agent) {
        breakdown.daily.byAgent[session.agent] = (breakdown.daily.byAgent[session.agent] || 0) + cost;
      }
      if (session.model) {
        breakdown.daily.byModel[session.model] = (breakdown.daily.byModel[session.model] || 0) + cost;
      }
    }
    
    // 周成本
    if (sessionDate >= thisWeek) {
      breakdown.weekly.total += cost;
      breakdown.weekly.bySession[session.key || session.id] = cost;
      if (session.agent) {
        breakdown.weekly.byAgent[session.agent] = (breakdown.weekly.byAgent[session.agent] || 0) + cost;
      }
      if (session.model) {
        breakdown.weekly.byModel[session.model] = (breakdown.weekly.byModel[session.model] || 0) + cost;
      }
    }
    
    // 月成本
    if (sessionDate >= thisMonth) {
      breakdown.monthly.total += cost;
      breakdown.monthly.bySession[session.key || session.id] = cost;
      if (session.agent) {
        breakdown.monthly.byAgent[session.agent] = (breakdown.monthly.byAgent[session.agent] || 0) + cost;
      }
      if (session.model) {
        breakdown.monthly.byModel[session.model] = (breakdown.monthly.byModel[session.model] || 0) + cost;
      }
    }
  });
  
  // 生成成本优化建议
  breakdown.recommendations = generateRecommendations(breakdown);
  
  // 保存成本分解数据
  saveJSON(costBreakdownPath, breakdown);
  
  // 更新成本趋势
  updateCostTrends(breakdown);
  
  return breakdown;
}

// 生成成本优化建议
function generateRecommendations(breakdown) {
  const recommendations = [];
  
  // 检查高成本 Agent
  const topAgents = Object.entries(breakdown.daily.byAgent)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  
  if (topAgents.length > 0 && topAgents[0][1] > breakdown.daily.total * 0.5) {
    recommendations.push({
      type: 'high_cost_agent',
      severity: 'warning',
      title: '单个 Agent 成本占比过高',
      description: `Agent "${topAgents[0][0]}" 占今日总成本的 ${((topAgents[0][1] / breakdown.daily.total) * 100).toFixed(1)}%`,
      suggestion: '考虑优化该 Agent 的调用频率或使用更经济的模型'
    });
  }
  
  // 检查高成本 Cron
  const topCrons = Object.entries(breakdown.daily.byCron)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  
  if (topCrons.length > 0 && topCrons[0][1] > breakdown.daily.total * 0.3) {
    recommendations.push({
      type: 'high_cost_cron',
      severity: 'info',
      title: '高成本 Cron 任务',
      description: `Cron "${topCrons[0][0]}" 占今日总成本的 ${((topCrons[0][1] / breakdown.daily.total) * 100).toFixed(1)}%`,
      suggestion: '检查该 Cron 的运行频率是否合理'
    });
  }
  
  // 检查成本增长趋势
  if (breakdown.daily.total > breakdown.weekly.total / 7 * 1.5) {
    recommendations.push({
      type: 'cost_spike',
      severity: 'warning',
      title: '今日成本异常增长',
      description: `今日成本 ¥${breakdown.daily.total.toFixed(2)} 明显高于周平均 ¥${(breakdown.weekly.total / 7).toFixed(2)}`,
      suggestion: '检查是否有异常任务或调用'
    });
  }
  
  // 检查模型使用
  const expensiveModels = Object.entries(breakdown.daily.byModel)
    .filter(([model]) => model.includes('gpt-4') || model.includes('claude-opus'))
    .reduce((sum, [, cost]) => sum + cost, 0);
  
  if (expensiveModels > breakdown.daily.total * 0.7) {
    recommendations.push({
      type: 'expensive_model',
      severity: 'info',
      title: '高成本模型使用占比高',
      description: `高成本模型占今日总成本的 ${((expensiveModels / breakdown.daily.total) * 100).toFixed(1)}%`,
      suggestion: '考虑在非关键任务中使用更经济的模型'
    });
  }
  
  // 如果成本很低，给出正面反馈
  if (breakdown.daily.total < 10) {
    recommendations.push({
      type: 'cost_healthy',
      severity: 'success',
      title: '成本控制良好',
      description: `今日成本 ¥${breakdown.daily.total.toFixed(2)}，处于健康水平`,
      suggestion: '继续保持当前的使用模式'
    });
  }
  
  return recommendations;
}

// 更新成本趋势
function updateCostTrends(breakdown) {
  let trends = loadJSON(costTrendsPath, { daily: [], weekly: [], monthly: [] });
  
  const today = new Date().toISOString().split('T')[0];
  
  // 更新日趋势
  const existingDayIndex = trends.daily.findIndex(d => d.date === today);
  const dayData = {
    date: today,
    total: breakdown.daily.total,
    byAgent: breakdown.daily.byAgent,
    byCron: breakdown.daily.byCron,
    byModel: breakdown.daily.byModel
  };
  
  if (existingDayIndex >= 0) {
    trends.daily[existingDayIndex] = dayData;
  } else {
    trends.daily.push(dayData);
  }
  
  // 只保留最近 30 天
  trends.daily = trends.daily.slice(-30);
  
  // 更新周趋势（每周一次）
  const weekNumber = getWeekNumber(new Date());
  const existingWeekIndex = trends.weekly.findIndex(w => w.week === weekNumber);
  const weekData = {
    week: weekNumber,
    total: breakdown.weekly.total,
    byAgent: breakdown.weekly.byAgent,
    byCron: breakdown.weekly.byCron,
    byModel: breakdown.weekly.byModel
  };
  
  if (existingWeekIndex >= 0) {
    trends.weekly[existingWeekIndex] = weekData;
  } else {
    trends.weekly.push(weekData);
  }
  
  // 只保留最近 12 周
  trends.weekly = trends.weekly.slice(-12);
  
  // 更新月趋势
  const month = new Date().toISOString().substring(0, 7);
  const existingMonthIndex = trends.monthly.findIndex(m => m.month === month);
  const monthData = {
    month: month,
    total: breakdown.monthly.total,
    byAgent: breakdown.monthly.byAgent,
    byCron: breakdown.monthly.byCron,
    byModel: breakdown.monthly.byModel
  };
  
  if (existingMonthIndex >= 0) {
    trends.monthly[existingMonthIndex] = monthData;
  } else {
    trends.monthly.push(monthData);
  }
  
  // 只保留最近 12 个月
  trends.monthly = trends.monthly.slice(-12);
  
  saveJSON(costTrendsPath, trends);
}

// 获取周数
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// 主函数
function main() {
  console.log('[Cost Analysis] Starting...');
  const breakdown = analyzeCost();
  console.log(`[Cost Analysis] Daily total: ¥${breakdown.daily.total.toFixed(2)}`);
  console.log(`[Cost Analysis] Weekly total: ¥${breakdown.weekly.total.toFixed(2)}`);
  console.log(`[Cost Analysis] Monthly total: ¥${breakdown.monthly.total.toFixed(2)}`);
  console.log(`[Cost Analysis] Recommendations: ${breakdown.recommendations.length}`);
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = { analyzeCost };
