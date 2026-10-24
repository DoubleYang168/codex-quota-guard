# Codex Quota Guard · MacBook Apple Silicon

A local quota monitor for explicitly selected Codex desktop chats on **Apple Silicon (M-series) MacBooks**.

Experimental **0.4.6** · MIT · by dingyang (DoubleYang168) · [中文说明](README.md)

> **Windows users: open the [Windows version on `main`](https://github.com/DoubleYang168/codex-quota-guard/tree/main), or its [installation guide](https://github.com/DoubleYang168/codex-quota-guard/blob/main/INSTALL.md).** This branch, `feat/macos-support`, documents the Mac version.

Select chats and thresholds in a browser dashboard. A local helper polls account quota, interrupts selected turns when necessary and submits one continuation when recovery conditions are met. Continuous model polling is not required.

This independent experimental project uses undocumented desktop interfaces. It is not an official OpenAI plugin. Ordinary ChatGPT web chats, cloud tasks, Intel Macs and Linux desktop control are outside this branch's support scope.

![Dashboard with simulated data](docs/assets/dashboard-demo.png)

## Requirements

| Component | Requirement / tested combination |
| --- | --- |
| Hardware and runtime | M-series MacBook, native `arm64` Node process |
| Desktop | Signed in, running, local plugin support; tested version `26.1016.62342`, build `21477` |
| Bundled CLI | `codex-cli 0.163.0-alpha.11.2` |
| Node.js | 22+ with `node` and `npm` on PATH; no `npm install` needed |

```sh
uname -m
node -p 'process.arch'
node --version
npm --version
```

Use an arm64 terminal and Node runtime. An x64 Node running through Rosetta does not pass the Mac control compatibility check. A tested arm64 host does not establish compatibility with every M-series model or future desktop release. See [compatibility](docs/COMPATIBILITY.md).

## Install

Use the **Mac branch source**, then enter the directory containing `package.json`. The default `main` branch is the Windows version. If `feat/macos-support` is not visible on GitHub, the Mac branch has not been pushed there yet; do not download the default branch as the Mac version.

```sh
npm run check
npm run doctor
npm run package
npm run install:local
```

Doctor queries real quota and writes local diagnostics without stopping or continuing chats. **Only the final installation command changes the current user's plugin registration.** Reload the plugin or restart the desktop host, then use a new chat.

Mac data defaults to `~/Library/Application Support/Codex Quota Guard/`. Preserve existing data directories during upgrades. Source installation, runtime ZIP installation, custom paths and uninstall instructions are in [INSTALL.md](INSTALL.md).

## Use

Ask Codex: **“使用 quota-guard 打开额度管理页”** (open the Quota Guard dashboard).

1. Start in the default **observe mode**, using a dedicated test chat.
2. Save thresholds and interval with **保存规则**.
3. When ready for actual control, select automatic mode and click **保存设置**.
4. Add only the chats you explicitly want managed.
5. Check recovery records and events for the result.

Defaults: empty watch list, observe mode, monitoring enabled, pause at remaining ≤5%, resume at ≥100%, poll every 300 seconds. Recovery also checks weekly quota and task identity. The dashboard refreshes cached state every 10 seconds. Upgrades retain saved settings.

Manual **停止** interrupts a turn without scheduling recovery. Manual **启动／继续** sends a continuation and may reactivate the original Goal. **Both manual actions execute in observe mode or with monitoring disabled.** Closing the page leaves the helper running; exiting the helper does not stop the current chat task.

## Validation and limits

Real Mac tests verified manual interruption and continuation completion, conditional automatic pause, original Goal reactivation and an automatic successor turn. Recovery quota was injected **only in an isolated test dependency**; account identity, task state and desktop actions remained real. Actual natural quota reset was not tested.

Crash/restart deduplication, new user input cancelling old recovery and disconnected-endpoint safety were verified. Installation was tested under isolated `CODEX_HOME` directories, including repeat installation, retained state and discovery of all 10 MCP tools. Node 24 and 25 each passed 78 automated tests.

This evidence does **not** establish the complete daily-user installation-and-use flow. Actual system sleep was not tested. Detailed methods are in [Mac acceptance](docs/MACOS.md) and [validation records](docs/VALIDATION.md).

Pause/resume means interrupting a model turn and sending a new message, not restoring a process snapshot. Prior file changes and external effects remain. Continuations consume quota; sampling can overshoot thresholds. Keep the desktop running and the target chat loaded. There is no LaunchAgent or login startup item.

If a completed Goal disappears before its successor is verified, the helper conservatively requests inspection instead of replaying a continuation.

## Uninstall

From the corresponding code directory, using the original data directory:

```sh
node bin/quota-guard.mjs stop
node bin/quota-guard.mjs service-status
```

Confirm `running:false`, then remove the plugin in desktop plugin management. Data is retained unless you explicitly delete it. Closing the browser or disabling a plugin connection does not reliably stop the helper. See [uninstall](INSTALL.md#卸载).

## Development and documentation

```sh
npm run check
npm test
npm run demo
```

Demo and automated tests use simulated chats. Python 3 is only required for maintainer archive verification and source packaging. See [usage](docs/USAGE.md), [troubleshooting](docs/TROUBLESHOOTING.md), [architecture](docs/ARCHITECTURE.md), [contributing](CONTRIBUTING.md), [privacy](docs/PRIVACY.md) and [release instructions](docs/RELEASING.md). Detailed documentation and dashboard labels are primarily Chinese.

Never share dashboard URLs containing credentials, tokens, raw account data or chat histories. [Security reporting](SECURITY.md) · [MIT](LICENSE) · [Third-party notices](NOTICE.md).
