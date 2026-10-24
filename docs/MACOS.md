# MacBook M 系列适配与验收

版本 0.4.6，2026-10-24。当前支持为实验性质，优先面向本机 Apple Silicon；Intel Mac 未验收，控制兼容检查会拒绝 x64。

> Windows 用户请跳转 [Windows 版本（main 分支）](https://github.com/DoubleYang168/codex-quota-guard/tree/main)。Mac 安装步骤统一见 [安装、升级与卸载](../INSTALL.md)。

## 已核对环境

| 项目 | 本机结果 |
| --- | --- |
| 架构 | arm64 |
| 桌面 | 26.1016.62342，build 21477 |
| 桌面附带 CLI | codex-cli 0.163.0-alpha.11.2 |
| 验证所用 Node | v24.21.0（测试套件）、v25.5.0（真实只读入口） |
| 桌面协议 | initialize 0、owner discovery 1、interrupt 4、start 2、following 1、snapshot 11 |
| 真实只读连接 | 额度、会话索引、实时轮次、排队输入、Goal、桌面拥有者已读取 |
| 自动化回归 | 78 项通过，0 失败；使用模拟桌面与隔离数据 |
| 隔离安装 | 首次／重复安装、数据保留、10 个 MCP 工具发现通过 |
| 真实停止／续跑 | 专用普通聊天：原轮次 interrupted，新续跑轮次 completed 并返回约定标记；重复请求编号返回原结果，无重复启动 |
| Goal 恢复及后续轮次 | 受控恢复条件下通过：真实暂停、原 Goal 重新激活、一次续跑、原 Goal 自动后续轮次及完成 |
| 暂停后后台崩溃重启 | 真实测试进程 SIGKILL 后恢复同一记录，未提前续跑 |
| 续跑发出后进程退出 | 成功落盘前受控退出；重启找到原续跑证据，未重复发送 |
| 新输入与断连保护 | 新用户输入取消旧恢复；测试连接失效时不控制，连接恢复后可读取 |

本机记录保存在被忽略的 `.runtime/` 中；不将账户摘要、聊天标识或 socket 随机名称提交到仓库。

## 安装前要求

- 桌面应用正在运行，已登录并支持本地插件，版本符合上表。
- Node.js 22+ 和 npm 可用于源码检查、打包和启动入口；无需 `npm install`。
- Mac 实时状态通过桌面 IPC 的只读快照获取，支持普通 Node。后台不直接连接带进程来源校验的 app-tools 桥，不修改签名、关闭鉴权或下载运行时。
- 多个桌面应用并存时必须明确选择正在使用的 `.app`，避免把 CLI 和桌面版本混用。

## 安装入口与只读诊断

源码安装、运行 ZIP、自定义数据目录、升级和卸载统一见 [Mac 安装说明](../INSTALL.md)。本分支默认观察模式、空名单；手动启动／停止仍会立即执行。

源码中可执行以下只读检查，不安装插件、不加入监控、不发送停止或续跑：

```sh
npm run doctor
node scripts/validate-macos.mjs
```

`validate-macos` 省略聊天 UUID 时，会选取该项目或其父工作目录的一条本地聊天；可在命令末尾追加明确的本地聊天 UUID。报告留在项目 `.runtime/macos-validation.json`。doctor 可用 `node bin/quota-guard.mjs doctor <本地聊天UUID>` 核对实时通道；`desktopProbe:null` 表示没有指定聊天，不代表实时控制已验收。

Mac 新数据默认保存在 `~/Library/Application Support/Codex Quota Guard/`；环境变量、安装指针和旧源码数据可能覆盖默认位置。完整优先级见 [数据目录说明](../INSTALL.md#数据目录与后台启停)。

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

## 运行边界

关闭管理页后后台继续运行；退出方式见 [卸载与后台退出](../INSTALL.md#卸载)。没有 LaunchAgent、系统服务或开机启动项。睡眠期间不保证监控；桌面关闭、版本变化、快照不可用或状态不明时，不应假定任务已停止或已恢复。

## 验收边界

验证分为三层：自动化测试使用隔离目录和模拟桌面；隔离安装把 CODEX_HOME 指向项目临时目录；真实控制从源码运行并连接桌面，只操作专用测试聊天。没有安装到当前用户的日常插件环境，也未验收该环境中完整的安装后使用流程。真实只读检查可以证明本机连接路径和协议查询可用，不能证明完整自动恢复链路。

本机已在用户授权的新建专用普通聊天中确认手动停止、单次续跑及约定标记 `QUOTA_GUARD_TEST_RESUME_OK` 返回，续跑轮次正常完成；重复请求编号不会重发；测试自动监控始终关闭、没有 Goal，测试后台已退出。记录位于 `.runtime/macos-real-control-validation.json`。

条件控制验收验证“达到条件自动停止／自动运行”，未等待自然额度重置，也未让整机休眠。结果如下：

| 场景 | 验证方式与结果 |
| --- | --- |
| 达到暂停条件 | 使用真实额度，将隔离测试暂停阈值设为当时剩余百分比；调度器真实中断目标轮次并暂停原 Goal |
| 达到恢复条件 | 仅在隔离测试的额度读取依赖中注入 remaining=100；账户、周额度、任务状态与所有桌面动作均使用真实接口；一次续跑后原 Goal 自动执行下一轮，两个阶段标记齐全 |
| 已暂停时崩溃 | 对测试后台 PID 发 SIGKILL 后重启；同一 episode 保持 waiting_reset，额度未达条件时不恢复 |
| 已发送时退出 | 真实续跑发出后、成功状态落盘前退出测试进程；恢复 resume_pending 为 resume_check，找到原标记，额外启动／停止次数均为 0 |
| 新用户输入 | 专用聊天的新消息使旧恢复 cancelled，同额度周期内不再中断新任务 |
| 连接失效 | 仅注入不存在的测试 IPC 端点；无控制请求，恢复真实端点后可重新读取 |
| 长时间调度间隔 | 自动化测试模拟时间跳跃及过期额度，过期样本禁止暂停与恢复，新鲜读取后才重新判断；没有让整机休眠 |

原始证据位于 `.runtime/goal-acceptance-20261024/`、`.runtime/goal-acceptance-20261024-v2/` 和 `.runtime/user-input-acceptance-20261024/`。所有测试只操作用户授权的专用聊天，测试监控已停用并移出名单。

实际观察到：Goal 很快完成后，宿主可能清除当前 Goal。如果插件尚未观察到原 Goal 的后续轮次，则保守标记 needs_attention，要求检查原聊天，不会自动重发。本机此情况的两阶段任务实际已完成；另一次增加工具等待的测试明确观察到了原 Goal active 时的后续轮次，恢复状态达到 resumed。此保护行为已加入回归测试。

自然额度重置和整机休眠不在此次验收范围；上述受控恢复条件不能表述为实际额度已经重置。

公开 app-server 能力参考 [OpenAI 官方文档](https://learn.chatgpt.com/docs/app-server)。本项目使用的桌面 IPC 是独立的实验适配，不属于官方稳定兼容承诺。
