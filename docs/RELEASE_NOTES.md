# 0.4.6 实验版发行说明 · MacBook M 系列

这是 Mac 分支 `feat/macos-support` 的待发布正文模板，不代表已经推送分支或创建 GitHub Release。

> Windows 用户请前往 [Windows 版本（main 分支）](https://github.com/DoubleYang168/codex-quota-guard/tree/main)，安装步骤见 [Windows 安装说明](https://github.com/DoubleYang168/codex-quota-guard/blob/main/INSTALL.md)。

## 变化

- 新增 Apple Silicon（M 系列）MacBook 实验适配：桌面应用和 CLI 路径发现、IPC 实时快照、平台版本与架构检查。
- Mac 新安装默认观察模式、空名单，数据保存在用户 Library；保留原数据目录和已保存模式。
- 后台使用短路径 Unix socket，适应含空格和较长的路径。
- 修正续跑响应解析与断连处理，提供具体版本的验收元数据。
- 统一 Mac 文档、终端示例和 Windows 分支跳转，补充隔离安装与真实控制的证据边界。

## 环境

本机已核对 macOS arm64、桌面 `26.1016.62342`（build `21477`）、桌面附带 CLI `0.163.0-alpha.11.2`。要求 Node.js 22+；运行时无 npm 依赖。

M 系列硬件需要原生 arm64 Node；不支持 Rosetta 下的 x64 Node。Intel Mac、其他桌面版本和所有 M 系列型号未逐一验证。详见 [兼容性](COMPATIBILITY.md)。

## 安装

源码包按 [源码安装](../INSTALL.md#从源码安装推荐) 操作；运行 ZIP 按 [运行 ZIP 安装](../INSTALL.md#从运行-zip-安装) 操作，不能使用源码安装脚本。核对 ZIP 旁的 SHA-256，再使用对应 Mac 包。

`doctor` 只读查询真实额度，`package` 只打包；`install:local` 才注册到当前用户插件环境。默认数据目录为 `~/Library/Application Support/Codex Quota Guard/`，旧版或自定义目录必须保留并沿用。

## 验证

2026-10-24，本机 Mac 验证包括：

- 真实额度、实时状态、普通聊天停止和续跑完成。
- 用真实额度与临时阈值触发自动暂停；仅在隔离测试中注入恢复额度条件，真实原 Goal 续跑、自动后续轮次和完成通过。
- 暂停后后台崩溃重启、发送后未记成功时进程退出不重发、新用户输入取消旧恢复和连接失效保护。
- 隔离 `CODEX_HOME` 中的安装、重复安装、数据保留及 10 个 MCP 工具发现。
- Node 24、25 下各 78 项自动化测试通过，以及公开源码、文档链接和归档一致性校验。

这不是在当前用户日常插件环境中完成的安装后使用验收；自然额度重置、整机休眠和长时间持续运行未覆盖。CI 需以实际 GitHub Action 结果为准。完整记录见 [Mac 验收](MACOS.md) 与 [验证范围](VALIDATION.md)。Windows 历史记录保留在其分支及验证文档中，不作为 Mac 验收证据。

## 限制

独立项目依赖未公开接口，不是 OpenAI 官方产品。只管理选定的 Codex 本地聊天，不管理普通 ChatGPT 网页聊天或云任务。

暂停是中断轮次，恢复是新续跑消息，不提供执行快照或外部操作回滚。采样有延迟，严格 100% 恢复可能分批等待。桌面需运行并加载目标聊天。

Goal 完成后若被宿主清除、插件又尚未获得原 Goal 的后续轮次证据，会保守提示 `needs_attention`，不会自动重发。原生 MCP Apps 面板能否显示取决于宿主，可使用浏览器管理页。
