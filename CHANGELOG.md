# 更新记录

## 0.4.6 — 2026-10-24

- Add experimental macOS Apple Silicon support for the reviewed desktop version.
- Discover the desktop bundled CLI and use Unix IPC owner snapshots for live state, including detached helpers.
- Default new Mac installations to observe mode and a stable Library data directory; preserve existing state.
- Use short private helper sockets for long paths and surface platform compatibility in the dashboard.
- Unwrap desktop continuation responses and fail promptly when the live bridge disconnects.
- Add macOS platform/regression tests and a Windows/macOS CI matrix.
- Dedicated Mac chat acceptance verified exact-turn interruption, one continuation completing with the expected marker, idempotent replay, and helper shutdown.
- Verify condition-triggered pause, original Goal reactivation and automatic successor execution using real desktop actions with a controlled recovery quota dependency. Verify daemon crash recovery, post-dispatch restart deduplication, superseding user input and disconnected-endpoint safety.
- Report validation method separately from natural quota-reset coverage; preserve conservative attention state when a completed Goal disappears before successor evidence. See docs/MACOS.md.

## Unreleased

- 在中英文 README 增加卸载入口，补全退出后台、核对原数据目录、移除插件和保留／清理数据的步骤。
- 建立保留远程提交历史的 Git 维护流程，补充日常分支、提交、推送和升级说明。
- 按既有 `.gitattributes` 统一早期网页上传文件的文本换行，不改变运行逻辑。

## 0.4.5 — 2026-10-23（开源整理版，实验）

- 基于 0.4.4 的运行逻辑独立整理公开源码，不复制原开发运行数据。
- 补充中文使用文档、英文简介、架构、兼容性、隐私、排查、贡献与发布说明。
- 增加发布前检查、源码归档、安装包校验、版本同步和 CI 配置。
- 公开作者署名 dingyang，保留 MIT 与参考项目说明；截图使用模拟数据。
- 完整真实 Goal 自动恢复与宿主原生面板显示仍待专项验收。

## 0.4.4 — 2026-10-23

- 两张设置卡片在并排布局下统一底部对齐，保存按钮与提示文字处于同一水平线。

## 0.4.3 — 2026-10-23

- “保存监控设置”缩短为“保存设置”，与“保存规则”统一尺寸。

## 0.4.2 — 2026-10-23

- 新数据目录默认自动控制，名单为空；升级保留保存的模式。
- 监控开关与模式改为点击保存后提交，独立保留两表单草稿。
- 保存确认显示行内文字与短暂提示，失败保留草稿并显示错误。

## 0.4.1 — 2026-10-23

- 显式立即检查重新判断同周期因新工作而被背景检查跳过的当前轮次。
- 保留背景检查的新工作保护与其他身份／额度检查，页面显示本次判断结果。

## 0.4.0 — 2026-10-23

- 会话手动启动／继续、停止、加入／移出自动监控。
- 持久化操作去重、并发互斥、结果不明阻止与人工解除。
- 新增审阅过的 CLI／桌面组合和 Goal 暂停复核。

## 0.3.x 及更早（内部实验）

建立本地额度监控、指定会话暂停与恢复、浏览器页面、MCP 控制面板、稳定数据目录和打包安装流程。未作为此公开目录的历史发行包分发。
