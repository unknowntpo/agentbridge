## Context

The existing bridge is Discord-first: `/codex new` and `/codex chat` start from Discord and route into local Codex sessions. The new feature flips that direction. A local Codex session should be able to emit a Discord thread that summarizes the current session so the user can shift attention to Discord when needed.

## Goals

- Make `/agentbridge` appear as a local Codex slash prompt.
- Let the local prompt use a deterministic CLI path instead of reimplementing Discord publishing in prompt text.
- Summarize only visible user and assistant chat from the selected Codex session.
- Keep Discord publishing one-shot and independent from the long-running daemon event loop.

## Non-Goals

- Real-time mirroring of every local Codex turn into Discord.
- Editing or continuing the local Codex session from Discord through this command.
- Cross-machine session synchronization.

## Session Discovery

The one-shot exporter will read `~/.codex/session_index.jsonl` and choose the most recently updated session whose `session_meta.payload.cwd` matches the current working directory. This is the operational definition of "current local session" for `/agentbridge`. The command also accepts an explicit session id override for debugging.

Rationale:

- The prompt is invoked from inside the active session, so the current session is expected to be the newest session for that cwd.
- Session JSONL files already contain the visible chat stream and do not require scraping the TUI.

## Summary Content

The exporter will summarize only visible chat:

- `event_msg.payload.type == "user_message"`
- `event_msg.payload.type == "agent_message"`

It excludes tool calls, system/developer instructions, slash UI, and the `/agentbridge` prompt marker itself. The generated summary is deterministic Markdown with separate user-request and assistant-reply sections so the Discord thread stays focused and auditable.

## Discord Publishing

Publishing uses a short-lived Discord client instead of the daemon gateway adapter. The exporter:

1. Logs in with the existing bot token.
2. Creates a public thread under a configured parent channel.
3. Posts the summary, chunked by the existing reply formatter.
4. Optionally prepends a configured user mention to the first visible message.

This keeps the export path isolated from slash-command registration and normal daemon routing.
