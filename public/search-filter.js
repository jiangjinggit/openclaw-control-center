// 搜索和过滤工具类
class SearchFilter {
  constructor() {
    this.filters = {
      text: '',
      regex: null,
      timeRange: 'all',
      customStart: null,
      customEnd: null,
      status: 'all',
      type: 'all',
      agent: 'all',
      severity: 'all'
    };
  }

  // 设置文本搜索
  setText(text) {
    this.filters.text = text.toLowerCase();
    return this;
  }

  // 设置正则表达式搜索
  setRegex(pattern) {
    try {
      this.filters.regex = new RegExp(pattern, 'i');
    } catch (err) {
      console.error('Invalid regex:', err);
      this.filters.regex = null;
    }
    return this;
  }

  // 设置时间范围
  setTimeRange(range, customStart = null, customEnd = null) {
    this.filters.timeRange = range;
    this.filters.customStart = customStart;
    this.filters.customEnd = customEnd;
    return this;
  }

  // 设置状态过滤
  setStatus(status) {
    this.filters.status = status;
    return this;
  }

  // 设置类型过滤
  setType(type) {
    this.filters.type = type;
    return this;
  }

  // 设置 Agent 过滤
  setAgent(agent) {
    this.filters.agent = agent;
    return this;
  }

  // 设置严重程度过滤
  setSeverity(severity) {
    this.filters.severity = severity;
    return this;
  }

  // 获取时间范围
  getTimeRange() {
    const now = new Date();
    let start, end;

    switch (this.filters.timeRange) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        end = now;
        break;
      case 'yesterday':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        end = now;
        break;
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = now;
        break;
      case 'custom':
        start = this.filters.customStart ? new Date(this.filters.customStart) : null;
        end = this.filters.customEnd ? new Date(this.filters.customEnd) : null;
        break;
      default:
        return { start: null, end: null };
    }

    return { start, end };
  }

  // 应用所有过滤条件
  apply(items) {
    if (!Array.isArray(items)) return [];

    return items.filter(item => {
      // 文本搜索
      if (this.filters.text) {
        const searchText = JSON.stringify(item).toLowerCase();
        if (!searchText.includes(this.filters.text)) {
          return false;
        }
      }

      // 正则表达式搜索
      if (this.filters.regex) {
        const searchText = JSON.stringify(item);
        if (!this.filters.regex.test(searchText)) {
          return false;
        }
      }

      // 时间范围过滤
      const { start, end } = this.getTimeRange();
      if (start || end) {
        const itemDate = new Date(item.timestamp || item.createdAt || item.startedAt || item.date);
        if (start && itemDate < start) return false;
        if (end && itemDate > end) return false;
      }

      // 状态过滤
      if (this.filters.status !== 'all') {
        if (item.status !== this.filters.status) return false;
      }

      // 类型过滤
      if (this.filters.type !== 'all') {
        if (item.type !== this.filters.type) return false;
      }

      // Agent 过滤
      if (this.filters.agent !== 'all') {
        if (item.agent !== this.filters.agent) return false;
      }

      // 严重程度过滤
      if (this.filters.severity !== 'all') {
        if (item.severity !== this.filters.severity) return false;
      }

      return true;
    });
  }

  // 重置所有过滤条件
  reset() {
    this.filters = {
      text: '',
      regex: null,
      timeRange: 'all',
      customStart: null,
      customEnd: null,
      status: 'all',
      type: 'all',
      agent: 'all',
      severity: 'all'
    };
    return this;
  }

  // 获取当前过滤条件摘要
  getSummary() {
    const active = [];
    
    if (this.filters.text) {
      active.push(`文本: "${this.filters.text}"`);
    }
    if (this.filters.regex) {
      active.push(`正则: ${this.filters.regex.source}`);
    }
    if (this.filters.timeRange !== 'all') {
      active.push(`时间: ${this.filters.timeRange}`);
    }
    if (this.filters.status !== 'all') {
      active.push(`状态: ${this.filters.status}`);
    }
    if (this.filters.type !== 'all') {
      active.push(`类型: ${this.filters.type}`);
    }
    if (this.filters.agent !== 'all') {
      active.push(`Agent: ${this.filters.agent}`);
    }
    if (this.filters.severity !== 'all') {
      active.push(`严重程度: ${this.filters.severity}`);
    }

    return active.length > 0 ? active.join(', ') : '无过滤条件';
  }
}

// 导出为全局变量（用于浏览器）
if (typeof window !== 'undefined') {
  window.SearchFilter = SearchFilter;
}

// 导出为模块（用于 Node.js）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SearchFilter;
}
