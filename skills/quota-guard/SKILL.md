---
name: quota-guard
description: Open the local quota management page and manage monitoring for explicitly selected Windows Codex desktop chats, including quota-based pause and recovery, pending recoveries, and observe/live settings.
---

Use the plugin's `quota_guard` MCP tools. The shared local helper checks quota without model polling.

- Use `show_control_panel` when the user wants native buttons. It declares sidebar and conversation entrypoints on compatible hosts. Opening or refreshing this panel uses cached state and must not start the monitor.
- Use `service_status` to check whether the helper is running without starting it. Use `service_control` with `action:enable`, `disable`, or `shutdown` for explicit service controls. Shutdown first saves monitoring as disabled, then exits the helper; the MCP panel stays available for restarting it. Disable and shutdown do not stop the chats' current tasks. Enabling preserves the saved observe/live choice.
- `quota_status` intentionally starts the helper to read real quota. Do not use it to poll after the user exited the helper; that would undo their exit.

- When asked to open or start the management page, use `open_dashboard`. It starts the shared helper and launches the default browser; return its URL if browser launch fails. Opening the page does not enroll chats or enable live mode. Closing the browser does not stop monitoring.
- The page offers chat checkboxes (each selection saves immediately), manual start/stop buttons, monitoring controls, thresholds, immediate checks and recovery records. Changes to the monitoring switch and observe/live choice are drafts until “保存设置”; thresholds and interval use “保存规则”. Both saves confirm success with inline text and a short toast. An immediate check applies saved rules and re-evaluates current turns, including chats exempted from background checks after new work appeared.

- Start with `service_status` for service controls, or `quota_status` when the user explicitly requests current quota. Report whether the helper is running and its saved observe/live mode accurately.
- For the current chat, obtain its exact UUID from executor metadata or supported app tools. Use `watch_thread` only for a chat the user selected; do not infer selection from recency or titles.
- New installations default to automatic control (`observeOnly:false`), with no chats enrolled. Existing saved observe/live choices survive upgrades. Enrolling a chat uses its saved mode, so make that consequence clear when adding selected chats. Querying quota or opening a page does not enroll chats or change modes. Only change an existing mode when the user requests it; observe mode logs proposals without automatic stop/continuation. Manual start/stop buttons act immediately in either mode.
- Thresholds use **remaining** percentage. Defaults: pause at 5%, resume at 100%, check every 300 seconds. Preserve user-specified values.
- `set_enabled:false` pauses the helper's control, not the chats themselves. `unwatch_thread` cancels that chat's unsent automatic recovery without stopping its work.
- A chat must remain loaded in the running desktop app. After a restart it may need to be opened once. A desktop connection, accepted request, started turn, and continuing Goal are different observations.
- If an episode needs attention, report its reason. Do not resend an uncertain continuation or tell the user that the Goal resumed just because a message was delivered. The helper verifies subsequent Goal execution separately.

If MCP tools are missing, the CLI has equivalent commands in `bin/quota-guard.mjs`: `ui` opens the page, `ui --no-open` returns a URL, and `doctor` performs a read-only check. Use the installed plugin's CLI (or the same CODEX_QUOTA_GUARD_HOME) to share state with its MCP tools. Plugin registration or desktop restart is a separate installation action; do not silently change the user's global setup.
