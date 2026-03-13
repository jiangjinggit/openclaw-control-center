# OpenClaw Control Center - 产品定义（v1）

## 1. 产品定位

OpenClaw Control Center 是一个面向**已安装 OpenClaw** 用户的外挂式图形化增强台。

它不负责：
- 安装 OpenClaw
- 打包 OpenClaw runtime
- 替代 OpenClaw 核心

它负责：
- 读取 OpenClaw 状态
- 提供图形化管理视图
- 增强运维、告警、会话与任务可见性
- 后续补齐安全检查与报告能力

## 2. 目标用户

### 第一批用户
1. 已安装 OpenClaw 的个人开发者
2. 想给 OpenClaw 补一个中文 GUI 的用户
3. 需要查看任务 / 会话 / 成本 / 告警的自托管用户

### 第二批用户
1. 小团队内部试用 OpenClaw 的负责人
2. 提供 OpenClaw 部署服务的服务商
3. 需要安全体检 / 上线前检查的团队

## 3. 与 ClawX / Qclaw 的区别

### ClawX / Qclaw
- 倾向于一体化 GUI / 安装体验
- 可能集成 runtime 或强绑定 OpenClaw 生命周期

### OpenClaw Control Center
- 要求 OpenClaw 已安装
- 作为外挂层连接既有 OpenClaw 实例
- 更偏控制台 / 运维 / 安全增强

## 4. v1 必须解决的问题

1. 用户能不能一眼看到 OpenClaw 当前是否正常运行
2. 用户能不能看清楚最近有哪些任务、哪些失败了
3. 用户能不能看清楚最近有哪些会话、用了哪些模型
4. 用户能不能收到基础告警
5. 用户能不能看懂，而不是看到一堆 CLI 术语

## 5. v1 功能模块

### P0
- 总览首页
- 定时任务列表
- 会话列表
- 错误与告警
- 成本估算
- 基础日志与同步状态

### P1
- Skills 页面
- Channels 页面
- Models / Providers 页面
- 配置页面
- 任务手动执行 / 启停

### P2
- 安全体检
- 风险评分
- 报告导出
- 多实例汇总
- 团队版增强

## 6. 非目标（当前阶段不做）

- 一键安装 OpenClaw
- 自己打包 OpenClaw runtime
- 重做聊天主界面替代 OpenClaw 原生聊天体验
- 做成另一个桌面发行版
