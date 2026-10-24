# MacBook M 系列使用说明

本分支 `feat/macos-support` 面向 Apple Silicon（M 系列芯片）MacBook。安装、升级和卸载见 [安装说明](../INSTALL.md)，功能和操作入口见 [README](../README.md)。

> Windows 用户请前往 [Windows 版本（main 分支）](https://github.com/DoubleYang168/codex-quota-guard/tree/main) 和 [Windows 安装说明](https://github.com/DoubleYang168/codex-quota-guard/blob/main/INSTALL.md)。

## 运行环境

使用原生 arm64 Node.js 22+，保持 Codex 桌面端运行并登录。Node 通过 Rosetta 以 x64 运行时不能执行聊天控制。桌面与附带 CLI 的版本要求见 [兼容性说明](COMPATIBILITY.md)。

```sh
uname -m
node -p 'process.arch'
node --version
```

前两项应输出 `arm64`。运行时无 npm 依赖，无需 `npm install`。

## 夜间使用

睡前安排好长任务，在额度管理页选择“启用”和“自动控制”，点击 **保存设置**；设置额度阈值和检查间隔，点击 **保存规则**，再将目标会话 **加入自动监控**。

默认在 5 小时剩余额度 ≤ 5% 时暂停，恢复到 100% 且其他恢复条件满足后尝试继续。Mac 新安装默认观察模式，观察模式只记录拟执行动作；需要自动暂停和续跑时应先切换控制方式。

请保持 MacBook 唤醒、Codex 桌面端和插件后台运行，并让桌面加载目标会话。请勿让合盖或系统节能设置使电脑进入休眠。关闭浏览器管理页后后台继续运行；关闭桌面、注销或休眠会影响监控。插件不创建 LaunchAgent 或开机启动项。

## 应用与数据路径

默认在 `/Applications` 和 `~/Applications` 中寻找 `ChatGPT.app`／`Codex.app`。多个应用并存或应用安装在其他位置时，应指定实际使用的桌面应用：

```sh
export CODEX_QUOTA_GUARD_APP='/Applications/ChatGPT.app'
npm run doctor
```

`doctor` 只读查询额度和兼容状态。无论宿主应用名称是什么，这里管理的都是其中的 Codex 本地会话。

Mac 新安装的数据目录为：

```text
~/Library/Application Support/Codex Quota Guard/
```

升级应沿用原数据目录。环境变量、自定义安装指针和旧源码目录可能覆盖默认路径，具体优先级见 [数据目录与后台启停](../INSTALL.md#数据目录与后台启停)。应用、CLI 和数据目录的自定义示例也见安装说明。

## 停用与退出

停用监控只停止自动管理，当前聊天任务继续运行；关闭管理页不会退出后台。需要结束后台时，使用控制面板的 **退出后台**，或按 [卸载说明](../INSTALL.md#卸载) 执行。手动启动／停止在观察模式和监控停用时仍会执行。

额度条件已满足但会话没有续跑时，查看“暂停与恢复”和“运行记录”，按 [常见问题](TROUBLESHOOTING.md) 处理。
