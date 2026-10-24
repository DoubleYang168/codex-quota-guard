# MacBook M 系列兼容性

维护日期：2026-10-24 · 插件版本：0.4.6 · Mac 分支：`feat/macos-support`。

> Windows 用户请使用 [Windows 版本（main 分支）](https://github.com/DoubleYang168/codex-quota-guard/tree/main) 和 [Windows 兼容性说明](https://github.com/DoubleYang168/codex-quota-guard/blob/main/docs/COMPATIBILITY.md)。

## 支持范围

本分支面向 Apple Silicon（M 系列芯片）MacBook 上的 Codex 桌面本地会话。需要当前用户已登录、宿主支持本地插件、桌面保持运行，以及 Node.js 22+。Node 进程架构必须为 `arm64`。

| 项目 | 已核对值 |
| --- | --- |
| 系统／进程架构 | macOS／arm64 |
| 桌面版本 | `26.1016.62342` |
| 本机桌面 build | `21477` |
| 桌面附带 CLI | `codex-cli 0.163.0-alpha.11.2` |
| 本机运行测试 | Node 24.21.0、25.5.0 |

这是一个版本组合的实验适配，不是每个 M 系列型号逐一验收，也不承诺未来桌面版本兼容。未建立最低 macOS 系统版本的独立覆盖记录。Intel Mac、Rosetta 下的 x64 Node、Linux、普通 ChatGPT 网页聊天和远程云任务不在支持范围内。

## 版本检查的实际行为

- Mac 必须读取到桌面版本，且 Node 进程为 `arm64`；读不到版本或架构不符时禁止聊天控制。
- 默认基线只接受已审阅的 CLI／桌面组合；显式自定义固定值仍使用精确匹配，不代表额外版本经过验收。
- 真实操作还需通过 IPC 协议、桌面拥有者、轮次、账户及任务身份检查。
- `compatible:true` 表示版本检查通过，不保证目标聊天已经加载，也不是一次成功控制的证据。
- 验收元数据只对应上表中的平台、架构与版本。`recoveryConditionValidation:controlled_quota_condition` 表示恢复条件在隔离测试中注入；`naturalQuotaResetValidated:false` 表示未等待自然额度重置。

不要通过修改版本白名单来绕过错误。新增版本需要重新审阅协议、回归测试和真实测试聊天验收。

## 自查

在 Mac 源码根目录执行：

```sh
uname -m
node -p 'process.arch'
node --version
npm run doctor
```

`uname -m` 和 Node 架构应为 `arm64`。M 系列硬件仍可能通过 Rosetta 启动 x64 Node；检查实际运行时，而不只看芯片名称。

默认寻找桌面应用附带的 CLI。应用不在默认位置或有多个候选时，使用 `CODEX_QUOTA_GUARD_APP`；显式 CLI 路径使用 `CODEX_QUOTA_GUARD_CODEX`，示例见 [安装说明](../INSTALL.md)。

doctor 只读查询真实状态并保存本机诊断，不停止或续跑聊天。不要将包含账户摘要和本机路径的诊断原样公开。

## 已有证据与剩余边界

已验证真实额度和实时轮次读取、普通聊天控制、受控恢复条件下的原 Goal 后续自动轮次、重启去重、新输入保护和隔离安装。源码运行、隔离插件注册、真实聊天控制是不同证据层级；当前用户环境中的完整安装后使用流程、自然额度重置和整机休眠未验收。详情见 [Mac 适配与验收](MACOS.md)。

## 与官方安装机制的关系

打包结构和本地 marketplace 说明参考 [OpenAI 官方插件文档](https://developers.openai.com/plugins/build/plugins)。本项目额外依赖已核对 CLI 的本地安装行为，以及未公开桌面 IPC；官方插件机制不为这些私有接口提供稳定兼容保证。

GitHub 开源、本地安装和上架官方公共插件目录是不同事项；本项目不宣称已获官方审核或上架。
