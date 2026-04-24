## Why

The current AgentBridge architecture has two separate control planes:

- Discord slash commands create and resume local Codex sessions directly.
- The local `/agentbridge` feature relies on custom prompt discovery and one-shot session export.

That split is brittle. Codex CLI custom prompt discovery is currently unreliable, and the bridge has no single canonical thread identity shared by Discord and local entry points. We need one self-hosted Codex app-server that AgentBridge owns, so both Discord and local CLI flows operate on the same thread model.

## What Changes

- Add a self-hosted Codex app-server managed by AgentBridge instead of relying on local unmanaged Codex session ids for the primary Discord flow.
- Migrate `/codex new` and `/codex chat` to create and resume app-server threads owned by AgentBridge.
- Introduce a stable local CLI entry, `agentbridge session attach`, as the primary local integration path.
- Keep `~/.codex/prompts/agentbridge.md` only as optional sugar; when it works, it delegates to the stable CLI command instead of being the only entry point.
- Explicitly ignore Codex.app private sessions and private app-server processes in this design.

## Impact

- Affected specs:
  - `codex-app-server-control-plane`
  - `discord-session-activation`
  - `discord-session-continuation`
  - `discord-recovery-and-state`
  - `local-codex-command`
- Expected code areas:
  - daemon startup and lifecycle supervision
  - Discord bridge routing
  - local CLI command surface
  - SQLite state model
  - optional custom prompt installation
