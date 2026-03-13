// 性能优化模块
// 提供数据缓存、懒加载、防抖节流等功能

class PerformanceOptimizer {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = new Map();
    this.defaultTTL = 30000; // 30 秒缓存
  }

  // 缓存 API 响应
  async cachedFetch(url, options = {}) {
    const cacheKey = `${url}_${JSON.stringify(options)}`;
    const now = Date.now();
    
    // 检查缓存
    if (this.cache.has(cacheKey)) {
      const expiry = this.cacheExpiry.get(cacheKey);
      if (expiry > now) {
        return this.cache.get(cacheKey);
      }
    }
    
    // 获取新数据
    const response = await fetch(url, options);
    const data = await response.json();
    
    // 存入缓存
    this.cache.set(cacheKey, data);
    this.cacheExpiry.set(cacheKey, now + (options.ttl || this.defaultTTL));
    
    return data;
  }

  // 清除缓存
  clearCache(pattern) {
    if (pattern) {
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
          this.cacheExpiry.delete(key);
        }
      }
    } else {
      this.cache.clear();
      this.cacheExpiry.clear();
    }
  }

  // 防抖
  debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // 节流
  throttle(func, limit = 1000) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  // 懒加载图片
  lazyLoadImages(selector = 'img[data-src]') {
    const images = document.querySelectorAll(selector);
    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          observer.unobserve(img);
        }
      });
    });
    
    images.forEach(img => imageObserver.observe(img));
  }

  // 虚拟滚动（大列表优化）
  virtualScroll(container, items, renderItem, itemHeight = 60) {
    const viewport = container;
    const content = document.createElement('div');
    content.style.position = 'relative';
    
    const totalHeight = items.length * itemHeight;
    content.style.height = `${totalHeight}px`;
    
    viewport.appendChild(content);
    
    const render = () => {
      const scrollTop = viewport.scrollTop;
      const viewportHeight = viewport.clientHeight;
      
      const startIndex = Math.floor(scrollTop / itemHeight);
      const endIndex = Math.ceil((scrollTop + viewportHeight) / itemHeight);
      
      const visibleItems = items.slice(startIndex, endIndex);
      
      content.innerHTML = visibleItems.map((item, i) => {
        const actualIndex = startIndex + i;
        const top = actualIndex * itemHeight;
        return `<div style="position: absolute; top: ${top}px; width: 100%; height: ${itemHeight}px;">${renderItem(item)}</div>`;
      }).join('');
    };
    
    viewport.addEventListener('scroll', this.throttle(render, 100));
    render();
  }

  // 批量请求优化
  async batchFetch(urls, batchSize = 5) {
    const results = [];
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(url => fetch(url).then(r => r.json()).catch(e => ({ error: e.message })))
      );
      results.push(...batchResults);
    }
    return results;
  }

  // 预加载关键资源
  preload(urls) {
    urls.forEach(url => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = url;
      document.head.appendChild(link);
    });
  }

  // 性能监控
  measurePerformance(name, fn) {
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    console.log(`[Performance] ${name}: ${(end - start).toFixed(2)}ms`);
    return result;
  }

  // 内存优化：清理未使用的数据
  cleanup() {
    const now = Date.now();
    for (const [key, expiry] of this.cacheExpiry.entries()) {
      if (expiry < now) {
        this.cache.delete(key);
        this.cacheExpiry.delete(key);
      }
    }
  }
}

// 全局实例
window.perfOptimizer = new PerformanceOptimizer();

// 自动清理过期缓存
setInterval(() => {
  window.perfOptimizer.cleanup();
}, 60000); // 每分钟清理一次
