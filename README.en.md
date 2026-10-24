# Codex Quota Guard

**Quota monitoring, pause and continuation for selected local Codex desktop chats on Apple Silicon (M-series) MacBooks.**

By dingyang · MIT · Experimental **0.4.6** · [中文说明](README.md)

Dear Codex Plus user, have you ever had your 5-hour quota run out before a task finished, then had to return and click “Continue” after it recovered? It is especially frustrating to leave a long task running before bed and discover the next morning that it stopped halfway through the night.

Codex Quota Guard helps you spend less time watching over those tasks. Select the chats to monitor: when remaining quota reaches your low-quota threshold, the local helper interrupts the current turn and records the task for recovery. Once the 5-hour quota reaches your recovery threshold and other recovery conditions are met, it attempts to continue. By default, it pauses at ≤5% remaining and attempts to continue at 100%.

**This plugin pairs especially well with Codex at night.** Set up your task before bed, save your rules and add the chat to automatic monitoring. Keep your computer awake, Codex desktop running and the plugin helper running.

> Windows users: open the [Windows version on `main`](https://github.com/DoubleYang168/codex-quota-guard/tree/main) or its [installation guide](https://github.com/DoubleYang168/codex-quota-guard/blob/main/INSTALL.md).

> This branch supports local Codex desktop chats on Apple Silicon MacBooks through undocumented desktop interfaces. Ordinary ChatGPT web chats, cloud tasks and Intel Macs are outside its scope. This is not an official OpenAI project.

![Dashboard with simulated data](docs/assets/dashboard-demo.png)

The screenshot uses simulated data without connecting to real chats. Native MCP Apps panel availability depends on the host.

## Features

- Read account 5-hour and weekly quota at configurable intervals.
- Manage only explicitly selected chats; the initial watch list is empty.
- Record the chat and turn before interrupting at the pause threshold.
- Submit a continuation in the original chat when recovery conditions are met; attempt to reactivate the original Goal when present.
- Manually start/continue, stop, and add/remove chats from automatic monitoring.
- Save settings, rules, recovery records and events; block automatic replay when the outcome is unclear.
- Use a browser dashboard, MCP tools, native control panel or CLI.

“Pause” interrupts a model turn; “resume” sends a new continuation message. Completed file changes, commands and external actions are not rolled back.

## Requirements and installation

- An Apple Silicon MacBook with a signed-in desktop host supporting local plugins.
- Native `arm64` Node.js **22+**, with `node` and `npm` on PATH. No runtime npm dependencies or `npm install` required.
- A CLI/desktop combination listed in [compatibility](docs/COMPATIBILITY.md). Arbitrary newer versions may not work.

Download and extract the source ZIP for the Mac branch, `feat/macos-support`. Enter the directory containing `package.json` and run in macOS Terminal:

```sh
node --version
npm run doctor
npm run package
npm run install:local
```

Doctor queries real quota read-only and saves diagnostics locally. Installation changes the current user's plugin registration. Reload the plugin or restart the desktop host, then use a new chat.

New Mac installations store runtime data in `~/Library/Application Support/Codex Quota Guard/`. Preserve the original data directory when upgrading. **Runtime ZIP and source ZIP installation steps differ**; see [installation, upgrades and uninstall](INSTALL.md).

## First use

1. In a chat with the plugin loaded, ask: **“使用 quota-guard 打开额度管理页。”** (Open the Quota Guard dashboard.)
2. Choose monitoring status and control mode, then click **保存设置** (Save settings). Mac defaults to observe mode; select automatic control for automatic pause and continuation.
3. Set thresholds and interval, then click **保存规则** (Save rules).
4. Find the target chat and select **加入自动监控** (Add to automatic monitoring). Watch-list changes take effect immediately.
5. Review recovery records and events.

Both save buttons confirm success after the helper accepts the change. Unsaved settings do not take effect. Watch-list changes and manual start/stop actions need no additional save.

| Defaults for new data directories | Value |
| --- | --- |
| Watch list | Empty |
| Control mode | Observe; switch to automatic control for automatic pause/resume |
| Monitoring | Enabled |
| Pause threshold | 5-hour remaining quota ≤5% |
| Recovery threshold | ≥100%, plus weekly quota and task identity checks |
| Background interval | 300 seconds; configurable from 15–3600 seconds |
| Dashboard refresh | Cached state every 10 seconds, separate from quota polling |

Upgrades preserve saved settings. Thresholds mean **remaining percentage**; recovery must exceed pause. Opening or refreshing chats reads real quota. “Check now” executes saved rules and can interrupt or resume selected chats when automatic control is enabled.

## Manual controls and helper lifecycle

| Action | Behavior |
| --- | --- |
| Start/continue | Continue an idle chat; avoid duplicate starts; attempt to activate its original Goal when eligible |
| Stop | Interrupt the current turn without scheduling automatic recovery |
| Add/remove monitoring | Change the watch list; subsequent checks follow saved rules |
| Observe mode | Record proposed automatic actions |
| Disable monitoring | Stop automatic management; the helper and current tasks continue |
| Exit helper | Save monitoring as disabled and exit; current chat tasks continue |
| Close dashboard | The helper continues running |

**Manual start/stop still executes in observe mode or with monitoring disabled.** Manual control cancels that chat's unfinished recovery record. Chats remaining on the watch list are still subject to subsequent quota checks.

Ask **“显示 Quota Guard 控制面板”** to open the native control panel. If unavailable, use the [CLI](docs/USAGE.md#命令行). Exit the helper before disabling or removing the host plugin connection.

## Uninstall

1. Use **退出后台** (Exit helper), or follow [uninstall instructions](INSTALL.md#卸载) with the original data directory and confirm `running:false` through `service-status`.
2. Remove Quota Guard in desktop plugin management. Closing the dashboard or disabling a plugin connection does not reliably stop the helper.
3. Data is retained by default. Preserve it for reinstallation; delete it only when you no longer need settings, recovery records or logs.

Uninstalling does not automatically continue paused chats. Continue them manually if needed.

## Known limits

- Sampling has a delay and cannot guarantee stopping at exactly 5%.
- Recovery is sequential. With a strict 100% threshold, quota consumed by the first chat may leave others waiting.
- Keep the computer awake, the desktop running and target chats loaded. There is no tray app, LaunchAgent or login startup item.
- Automatic recovery handles only interruptions caused by this plugin. Changes to account, task, Goal, turn or queued input can block or cancel recovery.
- Continuations consume quota. Exhausted quota, protocol changes or unclear outcomes may require manual action.

## Documentation

| Document | Contents |
| --- | --- |
| [Installation](INSTALL.md) | Source/runtime ZIP installation, upgrades, rollback and uninstall |
| [Mac guide](docs/MACOS.md) | Application paths, native runtime and overnight use |
| [Usage](docs/USAGE.md) | Controls, recovery states, CLI and examples |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Thresholds, recovery, offline state, versions and data directories |
| [Architecture](docs/ARCHITECTURE.md) | Processes, communication and data flow |
| [Compatibility](docs/COMPATIBILITY.md) | Exact version combinations and runtime requirements |
| [Privacy](docs/PRIVACY.md) / [Security](SECURITY.md) | Local records, access credentials and reporting |
| [Contributing](CONTRIBUTING.md) / [Changelog](CHANGELOG.md) | Development and changes |
| [Git workflow](docs/GIT_WORKFLOW.md) | Branches, commits and updates |
| [Releasing](docs/RELEASING.md) | Packaging and maintainer release steps |

Detailed guides and dashboard labels are primarily Chinese.

## Development

```sh
npm run check
npm run demo
```

Demo uses simulated chats; press Ctrl+C in the terminal to exit. The helper uses Node.js standard libraries and the frontend uses HTML, CSS and vanilla JavaScript. Python 3 is required only for maintainer archive checks and source packaging.

[MIT](LICENSE) · [Third-party notices](NOTICE.md) · By **dingyang** (**DoubleYang168**). Repository: [DoubleYang168/codex-quota-guard](https://github.com/DoubleYang168/codex-quota-guard). Availability on GitHub does not imply listing in the official plugin directory.
