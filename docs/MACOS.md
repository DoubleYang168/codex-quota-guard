# macOS 适配与本机验收

版本 0.4.6，2026-10-24。当前支持为实验性质，优先面向本机 Apple Silicon；Intel Mac 未验收，控制兼容检查会拒绝 x64。

## 已核对环境

| 项目 | 本机结果 |
| --- | --- |
| 架构 | arm64 |
| 桌面 | 26.1016.62342，build 21477 |
| 桌面附带 CLI | codex-cli 0.163.0-alpha.11.2 |
| 验证所用 Node | v24.21.0（测试套件）、v25.5.0（真实只读入口） |
| 桌面协议 | initialize 0、owner discovery 1、interrupt 4、start 2、following 1、snapshot 11 |
| 真实只读连接 | 额度、会话索引、实时轮次、排队输入、Goal、桌面拥有者已读取 |
| 自动化回归 | 75 项通过，0 失败；使用模拟桌面与隔离数据 |
| 隔离安装 | 首次／重复安装、数据保留、10 个 MCP 工具发现通过 |
| 真实停止／续跑 | 专用普通聊天：原轮次 interrupted，新续跑轮次 completed 并返回约定标记；重复请求编号返回原结果，无重复启动 |
| 完整 Goal 自动恢复 | 未验收 |

本机记录保存在被忽略的 `.runtime/` 中；不将账户摘要、聊天标识或 socket 随机名称提交到仓库。

## 安装前要求

- 桌面应用正在运行，已登录并支持本地插件，版本符合上表。
- Node.js 22+ 和 npm 可用于源码检查、打包和启动入口；无需 `npm install`。
- Mac 实时状态通过桌面 IPC 的只读快照获取，支持普通 Node。后台不直接连接带进程来源校验的 app-tools 桥，不修改签名、关闭鉴权或下载运行时。
- 多个桌面应用并存时必须明确选择正在使用的 `.app`，避免把 CLI 和桌面版本混用。

## 从源码使用和安装

在项目目录执行：

```sh
node --version
npm run check
npm test
npm run doctor
npm run package
npm run install:local
```

最后一步才修改当前用户插件注册；前面的检查和打包不注册插件。安装后在桌面重新加载插件，需要时重启桌面。

`node scripts/validate-macos.mjs [本地聊天UUID]` 可复验真实只读链路，报告写入项目 `.runtime/macos-validation.json`。省略 UUID 时选取该项目或其父工作目录的一条本地聊天，只读取，不加入监控。

`doctor` 查询真实额度并将诊断留在本机。需要同时核对实时桌面状态时，执行 `node bin/quota-guard.mjs doctor <本地聊天UUID>`，只读，不停止或续跑聊天。`desktopProbe:null` 表示未指定聊天，不能视为实时控制通道已验收。

新安装的数据目录为 `~/Library/Application Support/Codex Quota Guard/`。`CODEX_QUOTA_GUARD_HOME` 或安装指针优先；已有源码 `.runtime/user/state.json`、`.runtime/state.json` 的位置会保留。使用独立测试目录时，为 doctor、启动、状态和退出命令设置相同的数据目录。

首次默认观察模式，监控名单为空。先在专用测试聊天核对控制行为，再开启自动控制并选择聊天。手动停止／继续仍会立即执行，不受观察模式保护。

## 路径配置

```sh
# 仅在应用不在默认位置或存在多个应用时设置；换成实际应用路径。
export CODEX_QUOTA_GUARD_APP='/Applications/ChatGPT.app'
# 可选：显式指定 CLI 或独立数据位置。
export CODEX_QUOTA_GUARD_CODEX='/path/to/codex'
export CODEX_QUOTA_GUARD_HOME='/path/to/quota-guard-data'
```

默认桌面 IPC 为 `${CODEX_HOME:-~/.codex}/ipc/ipc.sock`，可用 `CODEX_QUOTA_GUARD_IPC_PATH` 显式指定。Mac 临时订阅已发现的桌面拥有者，只接受协议版本 11、同一本地聊天、来自该拥有者的完整快照，然后取消订阅。协议不匹配或断连会阻止控制；不会删除宿主 socket。

桌面 socket 必须属于当前用户、不能是符号链接，且不能允许其他用户写入。后台自己的控制 socket 位于 `/tmp/codex-quota-guard-<uid>/`，目录 0700、socket 0600，名称按数据目录哈希派生，支持包含空格和较长的数据路径。

## 停止、升级与卸载

```sh
node bin/quota-guard.mjs stop
node bin/quota-guard.mjs service-status
```

确认 `running:false` 后再升级或移除插件，升级保留原数据目录。关闭网页不会退出后台。卸载只移除插件；删除本地数据前确认不再需要恢复记录。没有安装 LaunchAgent、开机启动项或系统服务。

睡眠期间不保证监控；唤醒后的检查会重新读取额度和任务身份。桌面关闭、版本变化、实时快照不可用或状态不明时，不应假定任务已停止或已恢复；结果不明的续跑不会自动重发。

## 验收边界

自动化测试使用隔离目录和模拟桌面，不调用真实聊天控制。真实只读检查可以证明本机连接路径和协议查询可用，不能证明完整自动恢复链路。

本机已在用户授权的新建专用普通聊天中确认手动停止、单次续跑及约定标记 `QUOTA_GUARD_TEST_RESUME_OK` 返回，续跑轮次正常完成；重复请求编号不会重发；测试自动监控始终关闭、没有 Goal，测试后台已退出。记录位于 `.runtime/macos-real-control-validation.json`。

仍需验收：真实额度阈值自动暂停、额度恢复后的单次续跑、原 Goal 后续轮次、真实控制期间重启去重及用户新输入取消旧恢复。不得用其他正在工作的聊天代替测试聊天。

公开 app-server 能力参考 [OpenAI 官方文档](https://learn.chatgpt.com/docs/app-server)。本项目使用的桌面 IPC 是独立的实验适配，不属于官方稳定兼容承诺。
