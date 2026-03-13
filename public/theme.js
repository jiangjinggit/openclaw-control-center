// 主题管理脚本
(function() {
  // 初始化主题
  function initTheme() {
    const savedTheme = localStorage.getItem('openclaw-theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    return savedTheme;
  }

  // 切换主题
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('openclaw-theme', next);
    updateToggleButton(next);
    return next;
  }

  // 更新切换按钮
  function updateToggleButton(theme) {
    const btn = document.getElementById('themeToggle');
    if (btn) {
      btn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
      btn.title = theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式';
    }
  }

  // 创建主题切换按钮
  function createToggleButton() {
    const existing = document.getElementById('themeToggle');
    if (existing) return;

    const btn = document.createElement('button');
    btn.id = 'themeToggle';
    btn.className = 'theme-toggle';
    btn.onclick = toggleTheme;
    
    const currentTheme = document.documentElement.getAttribute('data-theme');
    updateToggleButton(currentTheme);
    
    document.body.appendChild(btn);
  }

  // 初始化
  const theme = initTheme();
  
  // 页面加载完成后添加按钮
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createToggleButton);
  } else {
    createToggleButton();
  }

  // 导出到全局
  window.OpenClawTheme = {
    init: initTheme,
    toggle: toggleTheme,
    get: () => document.documentElement.getAttribute('data-theme'),
    set: (theme) => {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('openclaw-theme', theme);
      updateToggleButton(theme);
    }
  };
})();
