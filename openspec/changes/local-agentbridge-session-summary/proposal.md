## Why

Users working inside a local Codex session need a fast way to push the current session into Discord without manually copying context. The bridge already knows how to create Discord threads, but it only exposes that flow from Discord itself. A local `/agentbridge` command closes that gap and lets the active Codex session publish a focused summary thread for follow-up.

## What Changes

- Add a local Codex custom prompt `/agentbridge` through `~/.codex/prompts/agentbridge.md`.
- Add a one-shot CLI path that discovers the current local Codex session, builds a visible-chat summary, creates a Discord thread, and posts that summary there.
- Add configuration for the target parent Discord channel and optional user mention used to focus the summary thread.

## Impact

- Affected specs: `local-codex-command`, `discord-session-summary-export`
- Affected code:
  - Modified: `src/cli.ts`, `src/config/config.ts`, `src/index.ts`, `README.md`
  - New: `src/codex/sessionSummary.ts`, `src/discord/discordThreadPublisher.ts`, `test/sessionSummary.test.ts`
