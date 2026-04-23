## Why

AgentBridge needs a durable way to route Discord conversations into a locally running Codex instance on macOS without relying on fragile terminal automation. A spec-driven design is needed now so the bridge can standardize session routing, delivery behavior, and recovery before implementation starts.

## What Changes

- Add a Discord-to-Codex bridge that starts and resumes local Codex sessions from Discord slash commands.
- Define thread binding behavior so one Discord thread maps to one Codex session with durable local state.
- Restrict the user-facing command surface to `/codex new <prompt>` and `/codex chat <prompt>`.
- Add reply delivery rules for Discord-safe formatting, chunking, and failure reporting.
- Add recovery behavior so persisted bindings can be restored or marked failed after bridge restart.

## Capabilities

### New Capabilities

- `discord-session-activation`: Start a new Codex session from `/codex new <prompt>`.
- `discord-reply-delivery`: Publish Codex output back to Discord with chunking and error reporting.
- `discord-session-continuation`: Continue a Codex session only through `/codex chat <prompt>` inside a thread created by `/codex new`.
- `discord-recovery-and-state`: Persist and recover thread bindings and in-flight status across bridge restarts.

### Modified Capabilities

(none)

## Impact

- Affected specs: `discord-session-activation`, `discord-session-continuation`, `discord-reply-delivery`, `discord-recovery-and-state`
- Affected code:
  - New: `src/bridge/`, `src/discord/`, `src/codex/`, `src/state/`, `src/config/`
  - Modified: `AGENTS.md`
  - Removed: (none)
