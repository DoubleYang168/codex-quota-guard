# Design references

This implementation was written for Codex Quota Guard. Its exact-chat identity,
quota episode tracking, and Windows desktop IPC design were informed by the
MIT-licensed Codex Auto Resume Advanced project:

https://github.com/songyb111-gachon/codex-auto-resume-windows

Reviewed release: v0.6.16, commit 52cfb70e201fd1056d0eecf4047d86fe3f400299.
The upstream application, installer, GUI, and dependencies are not bundled.
No upstream reference source or research artifacts are included in this source
export or in plugin release archives. Windows IPC and app-tools are
undocumented interfaces of the installed OpenAI desktop app, not public plugin APIs.
