# Codex Quota Guard · MacBook M 系列版

**为 Apple Silicon（M 系列芯片）MacBook 上选定的 Codex 本地会话提供额度监控、暂停和续跑。**

作者：dingyang · MIT · 实验版 **0.4.6** · [English](README.en.md)

> **Windows 用户请前往 [Windows 版本（main 分支）](https://github.com/DoubleYang168/codex-quota-guard/tree/main)。** 本文及当前分支 `feat/macos-support` 面向 macOS；Windows 的安装步骤见 [Windows 安装说明](https://github.com/DoubleYang168/codex-quota-guard/blob/main/INSTALL.md)。

在浏览器管理页选择会话、设置剩余额度阈值，由本机后台判断何时中断当前轮次、何时提交续跑。无需让模型持续轮询额度。

这是使用未公开桌面接口的独立实验项目，不是 OpenAI 官方插件。当前只验证了特定的 arm64 桌面／CLI 组合，不承诺所有 M 系列机型或任意新版都兼容。普通 ChatGPT 网页聊天、云任务、Intel Mac 和 Linux 不在本分支支持范围内。

![模拟数据管理页](docs/assets/dashboard-demo.png)

截图只使用模拟数据。原生 MCP Apps 面板能否显示取决于宿主；浏览器管理页可作为入口。

## 功能

- 读取账户 5 小时及周额度，按可配置间隔检查。
- 只管理明确加入名单的本地聊天，初始名单为空。
- 剩余额度不高于暂停阈值时，先保存会话和轮次记录，再中断该轮次。
- 达到恢复条件后，在原聊天提交一次续跑；有 Goal 时尝试重新激活原 Goal。
- 手动停止／继续、加入／移出监控，查看待恢复记录和事件日志。
- 任务、账户、Goal、排队输入或轮次变化时阻止不合适的恢复；结果不明时不自动重发。
- 提供浏览器管理页、MCP 工具、原生控制面板和命令行入口。

“暂停”是中断模型当前轮次，“恢复”是发送新的续跑消息，不是恢复进程快照。已经完成的文件修改、命令和外部操作不会回滚；续跑本身会消耗额度。

## 环境与兼容性

| 项目 | 要求／已验证组合 |
| --- | --- |
| 设备 | Apple Silicon（M 系列）MacBook；Node 进程必须为 `arm64` |
| 桌面宿主 | 已登录且支持本地插件的 Codex 桌面环境，并保持运行 |
| 桌面版本 | `26.1016.62342`，本机 build `21477` |
| 桌面附带 CLI | `codex-cli 0.163.0-alpha.11.2` |
| Node.js | 22+，`node`、`npm` 在 PATH 中；无需 `npm install` |

在 macOS 终端检查：

```sh
uname -m
node -p 'process.arch'
node --version
npm --version
```

架构应为 `arm64`。即使硬件是 M 系列，通过 Rosetta 运行的 x64 Node 也不符合本分支的控制兼容检查。其他版本、路径选择和错误排查见 [兼容性](docs/COMPATIBILITY.md) 与 [常见问题](docs/TROUBLESHOOTING.md)。

## 安装

使用 **Mac 分支的源码**，进入包含 `package.json` 的项目根目录。GitHub 默认分支 `main` 是 Windows 版本；如果网页还没有 `feat/macos-support` 分支，表示 Mac 分支尚未推送，请不要将默认分支的源码当作 Mac 版下载。

```sh
npm run check
npm run doctor
npm run package
npm run install:local
```

- `check` 检查源码清单、版本和文档链接。
- `doctor` 查询真实额度并保存本机诊断，不停止或续跑聊天；通过后再安装。
- `package` 生成本地安装包。
- **`install:local` 才会修改当前用户的 Codex 插件注册。** 安装后重新加载插件，需要时重启桌面端，再在新聊天中使用。

Mac 新安装的数据默认保存在 `~/Library/Application Support/Codex Quota Guard/`。自定义目录、旧数据、源码包与运行 ZIP 的不同步骤，见 [安装、升级与卸载](INSTALL.md)。

## 第一次使用

1. 在已加载插件的聊天输入：**“使用 quota-guard 打开额度管理页。”**
2. 首次保持默认的 **观察模式**，在专用测试聊天检查读数和规则。
3. 在“额度规则”设置阈值与间隔，点击 **保存规则**。
4. 需要实际自动控制时，选择自动控制并点击 **保存设置**。
5. 搜索并勾选明确要管理的聊天，或点击 **加入自动监控**。
6. 在“暂停与恢复”和“运行记录”核对结果。

两个保存按钮各自负责一组设置，未保存的草稿不会生效。名单修改立即生效；加入时使用当前已保存的观察／自动模式。

| 新数据目录默认设置 | 值 |
| --- | --- |
| 监控名单 | 空 |
| 控制方式 | **观察模式**，不自动暂停或继续 |
| 监控开关 | 启用 |
| 暂停阈值 | 5 小时剩余额度 ≤ 5% |
| 恢复阈值 | 5 小时剩余额度 ≥ 100%，且周额度和任务身份等检查通过 |
| 后台检查间隔 | 300 秒，可设置 15–3600 秒 |
| 页面状态刷新 | 每 10 秒读取缓存，与后台额度检查不同 |

升级保留已保存的设置。阈值使用**剩余百分比**；恢复阈值必须大于暂停阈值。“立即检查”执行已保存规则，启用自动控制时可能立即中断或恢复名单中的会话。

## 手动控制与后台启停

| 操作 | 行为 |
| --- | --- |
| 启动／继续 | 空闲聊天发送续跑；运行中不重复启动；符合条件时尝试激活原 Goal |
| 停止 | 中断当前轮次，不安排自动恢复，不结束整个桌面应用 |
| 加入／移出自动监控 | 修改名单；不立即发出手动启动或停止 |
| 观察模式 | 自动检查只记录拟执行动作 |
| 停用监控 | 停止自动管理，当前任务继续，后台仍在 |
| 退出后台 | 保存监控为停用并退出后台，不停止聊天当前任务 |
| 关闭管理页 | 后台继续运行 |

**手动启动／停止在观察模式或监控停用时仍会执行。** 手动控制会取消该聊天尚未完成的旧自动恢复。

聊天中输入 **“显示 Quota Guard 控制面板”** 可使用宿主支持的原生按钮；没有原生面板时用浏览器管理页或 [命令行](docs/USAGE.md#命令行)。

## 已验证范围

- 在真实 Mac 桌面上验证额度、实时轮次、手动停止、续跑完成及重复请求去重。
- 真实额度配合临时阈值触发自动暂停；在隔离测试中仅注入恢复额度条件，验证一次续跑、原 Goal 自动后续轮次及完成。
- 验证测试后台崩溃重启、续跑发出后进程退出不重发、新用户输入取消旧恢复，以及失联时不控制。
- 隔离 `CODEX_HOME` 下验证安装、重复安装、数据保留和 10 个 MCP 工具发现。
- Node 24、25 下各 **78 项自动化测试通过**。

**这些证据来自源码运行、专用聊天与隔离安装，不代表已验证当前用户环境中的完整安装后使用流程。** 恢复条件注入不等于账户真实额度重置；自然重置与整机休眠未测试。完整方法和边界见 [Mac 适配与验收](docs/MACOS.md) 与 [验证记录](docs/VALIDATION.md)。

## 已知限制

- 使用未公开协议，桌面更新后可能失效；不要修改版本字段绕过检查。
- 采样有延迟，不能保证恰好在阈值处停止。严格要求 100% 恢复时，其他聊天可能继续等待。
- 桌面需保持运行并持有目标会话。关闭桌面、休眠或注销后不保证监控；没有 LaunchAgent 或开机启动项。
- 自动恢复只处理本插件因额度中断的记录。新用户输入、账户或任务身份变化等会阻止或取消恢复。
- Goal 很快完成并被宿主清除时，若尚未获得后续轮次证据，会保守显示 `needs_attention`，不会重复续跑。

## 卸载

先用控制面板 **退出后台**，或从对应代码目录执行：

```sh
node bin/quota-guard.mjs stop
node bin/quota-guard.mjs service-status
```

确认 `running:false` 后，在桌面插件管理中移除 Quota Guard。自定义或旧数据目录必须沿用原路径；数据默认保留，确认不再需要后再删除。关闭网页、停用监控或禁用连接均不能代替退出后台。完整步骤见 [卸载说明](INSTALL.md#卸载)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [安装、升级与卸载](INSTALL.md) | Mac 源码／运行 ZIP、数据目录和卸载 |
| [使用手册](docs/USAGE.md) | 控制语义、恢复状态和 CLI |
| [Mac 适配与验收](docs/MACOS.md) | 已验证功能、测试方法、平台细节 |
| [兼容性](docs/COMPATIBILITY.md) | M 系列、arm64 和精确版本要求 |
| [常见问题](docs/TROUBLESHOOTING.md) | Rosetta、应用路径、未停止／未恢复、离线 |
| [架构](docs/ARCHITECTURE.md) | 后台、IPC 与数据流 |
| [隐私](docs/PRIVACY.md)／[安全](SECURITY.md) | 本地数据和凭证 |
| [贡献指南](CONTRIBUTING.md)／[更新记录](CHANGELOG.md) | 开发规范和版本变化 |
| [Git 工作流](docs/GIT_WORKFLOW.md)／[发布指南](docs/RELEASING.md) | Mac 分支维护和打包 |
| [Windows 版本](https://github.com/DoubleYang168/codex-quota-guard/tree/main) | Windows `main` 分支及其文档 |

## 开发

```sh
npm run check
npm test
npm run demo
```

`demo` 只使用模拟聊天，在终端按 Ctrl+C 退出。运行时无 npm 依赖，Python 3 只用于维护者的 ZIP 校验和源码归档。测试不控制真实聊天。

采用 [MIT](LICENSE)。设计参考见 [NOTICE.md](NOTICE.md)。作者 **dingyang**（GitHub：**DoubleYang168**）。仓库：[DoubleYang168/codex-quota-guard](https://github.com/DoubleYang168/codex-quota-guard)。本地安装不代表已上架官方公共插件目录。
