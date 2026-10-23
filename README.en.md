# Codex Quota Guard

[中文说明](README.md) · Experimental 0.4.5 · MIT · by dingyang (DoubleYang168)

A local quota monitor for explicitly selected Windows Codex desktop chats. A browser dashboard lets you configure thresholds, select chats, and manually stop or continue a turn. A shared Node.js helper polls quota without continuous model inference.

This is an independent project using undocumented desktop IPC and app-tools interfaces. It is not an official OpenAI product. Ordinary ChatGPT web chats, cloud tasks, macOS and Linux desktop control are outside the supported scope. Full automatic Goal recovery has not passed a dedicated real-desktop end-to-end acceptance test.

## Install

Requires Windows, a signed-in Codex desktop host with local plugin support, Node.js 22+ and a reviewed CLI/desktop combination. See [compatibility](docs/COMPATIBILITY.md). No npm dependencies need to be installed.

From a source checkout in PowerShell:

```powershell
node --version
npm run doctor
npm run package
npm run install:local
```

Doctor is read-only but reads real account quota and writes local diagnostics. Installation changes your local plugin registration. Reload the plugin or restart the desktop app and use a new chat. Data defaults to `.runtime/user` under the source directory; keep that directory. Upgrades must use the existing data directory. Runtime ZIP installation differs: see [INSTALL.md](INSTALL.md).

## Use

Ask Codex: **“使用 quota-guard 打开额度管理页”** (open the Quota Guard dashboard).

1. Select monitoring enabled/disabled and observe/automatic mode; click **保存设置** (save settings).
2. Set thresholds and interval; click **保存规则** (save rules).
3. Select chats using checkboxes or **加入自动监控** (add to monitoring). Membership saves immediately.
4. Review recovery and event records. Successful saves show inline text and a short toast.

Defaults: empty watch list, automatic control enabled, pause at remaining ≤5%, resume at ≥100%, poll every 300 seconds. Automatic control only affects selected chats. Saved settings survive upgrades. The dashboard reads cached status every 10 seconds; this is separate from quota polling.

Manual **停止** interrupts the current turn and does not schedule recovery. Manual **启动／继续** sends a continuation and may reactivate the original Goal. Both manual actions work even in observe mode or with monitoring disabled. **立即检查** runs saved rules immediately and can control selected chats when automatic mode is enabled.

Closing the browser keeps monitoring running. Disabling monitoring leaves the helper alive and does not stop active work. Exiting the helper saves monitoring as disabled. Exit the helper before disabling/uninstalling the host plugin connection.

Pause/resume means interrupting a model turn and submitting a new continuation, not restoring a process snapshot. External effects are not rolled back. Sampling may overshoot the pause threshold. Strict 100% recovery may resume only one chat before quota falls below the threshold. The desktop must stay running and own the target chat. Continuations consume quota.

![Dashboard with simulated data](docs/assets/dashboard-demo.png)

## Uninstall

1. Choose **退出后台** (exit helper) in the Quota Guard control panel, or run `stop` using the original data directory. Verify `running:false` with `service-status`; see [uninstall instructions](INSTALL.md#卸载).
2. Remove Quota Guard in Codex desktop plugin management. Closing the dashboard or disabling the plugin connection does not reliably stop the independent helper.
3. Data is retained. Keep the original data directory for reinstallation; delete it and the source/package files only when settings, recovery records and logs are no longer needed.

Uninstalling does not continue paused chats. Continue them manually in the original chat if needed.

## Develop and report issues

```powershell
npm run check
npm test
npm run demo
```

Demo mode uses a fake desktop only; stop it with Ctrl+C. Runtime has no npm dependencies. Python 3 is optional for maintainer archive validation and source export. See [contributing](CONTRIBUTING.md), [architecture](docs/ARCHITECTURE.md), [usage](docs/USAGE.md), [validation](docs/VALIDATION.md), [privacy](docs/PRIVACY.md) and [release instructions](docs/RELEASING.md). Detailed documentation and the dashboard are currently primarily Chinese.

Never post dashboard URLs containing credentials, control tokens, raw chat histories, account data, or unredacted logs. See [SECURITY.md](SECURITY.md) for security reporting. [MIT license](LICENSE); design references in [NOTICE.md](NOTICE.md).
