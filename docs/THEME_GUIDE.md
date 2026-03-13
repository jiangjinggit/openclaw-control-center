# 主题系统集成指南

## 概述
OpenClaw 控制中心支持亮色/暗色主题切换，主题配置会自动保存到 localStorage。

## 快速集成

### 1. 在 HTML 中引入主题文件

```html
<head>
  <!-- 其他 head 内容 -->
  <link rel="stylesheet" href="/theme-vars.css">
  <script src="/theme.js"></script>
</head>
```

### 2. 使用 CSS 变量

在你的样式中使用主题变量而不是硬编码颜色：

```css
/* ❌ 不推荐 */
body {
  background: #f5f7fb;
  color: #111827;
}

/* ✅ 推荐 */
body {
  background: var(--bg-primary);
  color: var(--text-primary);
}
```

## 可用的 CSS 变量

### 背景色
- `--bg-primary`: 主背景色
- `--bg-secondary`: 次要背景色（卡片、面板）
- `--bg-tertiary`: 第三级背景色
- `--bg-hover`: 悬停背景色

### 边框色
- `--border-primary`: 主边框色
- `--border-secondary`: 次要边框色
- `--border-hover`: 悬停边框色

### 文字色
- `--text-primary`: 主文字色
- `--text-secondary`: 次要文字色
- `--text-tertiary`: 第三级文字色
- `--text-muted`: 弱化文字色

### 强调色
- `--accent-primary`: 主强调色（按钮、链接）
- `--accent-hover`: 悬停强调色
- `--accent-light`: 浅色强调背景

### 状态色
- `--success`: 成功文字色
- `--success-bg`: 成功背景色
- `--success-border`: 成功边框色
- `--warning`: 警告文字色
- `--warning-bg`: 警告背景色
- `--warning-border`: 警告边框色
- `--error`: 错误文字色
- `--error-bg`: 错误背景色
- `--error-border`: 错误边框色
- `--info`: 信息文字色
- `--info-bg`: 信息背景色
- `--info-border`: 信息边框色

## JavaScript API

主题系统提供了全局 API：

```javascript
// 获取当前主题
const theme = window.OpenClawTheme.get(); // 'light' 或 'dark'

// 设置主题
window.OpenClawTheme.set('dark');

// 切换主题
window.OpenClawTheme.toggle();

// 初始化主题（通常不需要手动调用）
window.OpenClawTheme.init();
```

## 主题切换按钮

主题系统会自动在页面右下角添加一个浮动的主题切换按钮。

如果你不想显示这个按钮，可以在 CSS 中隐藏：

```css
.theme-toggle {
  display: none;
}
```

## 示例：完整页面集成

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>示例页面</title>
  <link rel="stylesheet" href="/theme-vars.css">
  <style>
    body {
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 12px;
      padding: 16px;
    }
    .btn {
      background: var(--accent-primary);
      color: white;
      border: none;
      padding: 10px 16px;
      border-radius: 8px;
      cursor: pointer;
    }
    .btn:hover {
      background: var(--accent-hover);
    }
  </style>
  <script src="/theme.js"></script>
</head>
<body>
  <div class="card">
    <h1>示例标题</h1>
    <p>这是一个支持主题切换的示例页面。</p>
    <button class="btn">示例按钮</button>
  </div>
</body>
</html>
```

## 注意事项

1. **平滑过渡**: 主题切换时会有 0.2s 的过渡动画
2. **持久化**: 主题选择会自动保存到 localStorage
3. **全局一致**: 所有页面共享同一个主题设置
4. **自动初始化**: 页面加载时会自动应用保存的主题

## 迁移现有页面

如果你有现有页面需要支持主题：

1. 引入 `theme-vars.css` 和 `theme.js`
2. 将所有硬编码的颜色值替换为对应的 CSS 变量
3. 测试亮色和暗色模式下的显示效果
4. 调整任何在暗色模式下不清晰的元素

## 自定义主题

如果需要自定义主题颜色，可以在 `theme-vars.css` 中修改 CSS 变量的值。
