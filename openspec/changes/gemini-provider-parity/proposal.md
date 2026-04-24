## Why

AgentBridge currently hard-codes Codex across its daemon runtime, Discord commands, local CLI, and persisted bindings. That prevents Gemini from offering the same UX shape as Codex:

- Discord cannot expose a parallel `/gemini new` and `/gemini chat` flow.
- Local `agentbridge session new/open` is implicitly Codex-only.
- Persisted bindings do not record which provider owns a managed session.

Gemini CLI also differs materially from Codex. Its ACP path is not a reconnectable shared control plane for our use case because the official implementation reports `loadSession: false`. For parity, Gemini should use its persisted CLI session ids plus `--resume`, while Codex continues using app-server.

## What Changes

- Introduce provider-aware session/runtime abstractions instead of Codex-only wiring.
- Add Gemini as a first-class provider alongside Codex.
- Add Discord `/gemini new` and `/gemini chat` commands with the same UX contract as the existing Codex commands.
- Extend local CLI to support `agentbridge session new/open --provider gemini` with the same default launcher behavior as Codex mode.
- Persist provider identity in thread bindings so reopen/chat routes back to the correct backend.

## Impact

- Affected specs:
  - `provider-runtime`
  - `discord-provider-commands`
  - `local-agent-command`
- Expected code areas:
  - daemon startup/runtime supervision
  - adapter/provider abstraction
  - Discord slash registration and routing
  - local CLI command surface
  - SQLite state model
  - README and examples
