# OpenClaw Control Center

面向**已安装 OpenClaw** 用户的图形化增强控制台。

> 不打包 OpenClaw runtime，不替代 OpenClaw。
> 运行方式是：用户先装好 OpenClaw，再额外安装本项目作为外挂式增强层。

## 当前目标

第一阶段先补齐 ClawX / Qclaw 这类产品里，普通用户真正需要的高频能力：

- 实例总览
- 会话查看
- 定时任务查看
- 告警配置
- 成本估算
- 日志 / 错误聚合
- 配置检查基础能力

后续再逐步增强：

- Skills 管理
- Channels 管理
- Models / Provider 管理
- 任务手动执行 / 启停
- 安全体检与报告导出

## 设计原则

1. **外挂式增强**：建立在已安装 OpenClaw 之上，而不是集成 runtime
2. **真实数据优先**：尽量来自 OpenClaw CLI / Gateway / 本地文件，不展示伪数据
3. **普通用户可读**：界面术语尽量中文化、非 CLI 化
4. **先可用，再完整**：先做控制台骨架，再补高级功能

## 当前可运行能力

- 首页总览
- 定时任务列表
- 最近 24 小时会话列表
- 告警配置页
- 成本分析页（估算）
- 从 OpenClaw CLI 同步真实 cron / session 数据

## 启动方式

```bash
cd apps/openclaw-control-center
npm start
```

默认端口：

```text
http://localhost:4312
```

## 数据来源

主要来自：

- `openclaw cron list --json`
- `openclaw sessions --all-agents --active <minutes> --json`

## 仓库路线

本项目不是另一个 OpenClaw 发行版，而是：

**OpenClaw 的图形化管理增强层 / 运维增强层 / 安全增强层**

## 开发优先级

详见：

- `docs/PRODUCT_PRD.md`
- `docs/TASK_BREAKDOWN.md`
