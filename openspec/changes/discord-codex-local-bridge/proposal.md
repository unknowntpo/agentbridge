## Why

AgentBridge needs a durable way to route Discord conversations into a locally running Codex instance on macOS without relying on fragile terminal automation. A spec-driven design is needed now so the bridge can standardize session routing, delivery behavior, and recovery before implementation starts.

## What Changes

- Add a Discord-to-Codex bridge that starts and resumes local Codex sessions from Discord messages.
- Define thread binding behavior so one Discord thread maps to one Codex session with durable local state.
- Add lifecycle command handling for session creation, status inspection, reset, and stop operations.
- Add reply delivery rules for Discord-safe formatting, chunking, and failure reporting.
- Add recovery behavior so persisted bindings can be restored or marked failed after bridge restart.

## Capabilities

### New Capabilities

- `discord-session-activation`: Start a new Codex session from an activation message or explicit bridge command.
- `discord-session-continuation`: Continue an existing bound Codex session for later turns in the same Discord thread.
- `discord-session-lifecycle`: Manage bridge commands for inspecting, resetting, and stopping a thread binding.
- `discord-reply-delivery`: Publish Codex output back to Discord with chunking and error reporting.
- `discord-recovery-and-state`: Persist and recover thread bindings and in-flight status across bridge restarts.

### Modified Capabilities

(none)

## Impact

- Affected specs: `discord-session-activation`, `discord-session-continuation`, `discord-session-lifecycle`, `discord-reply-delivery`, `discord-recovery-and-state`
- Affected code:
  - New: `src/bridge/`, `src/discord/`, `src/codex/`, `src/state/`, `src/config/`
  - Modified: `AGENTS.md`
  - Removed: (none)
