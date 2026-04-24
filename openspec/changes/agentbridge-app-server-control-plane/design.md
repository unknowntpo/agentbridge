## Context

AgentBridge currently binds Discord threads to local Codex session identifiers and uses a separate one-shot export path for local `/agentbridge`. That makes Discord and local workflows inconsistent, and it leaves the local entry path dependent on custom prompt discovery in Codex CLI.

The target state is one AgentBridge-managed Codex app-server. Discord slash commands and local attach commands both talk to that shared server and operate on app-server thread ids. Codex.app is out of scope and remains unmanaged.

## Goals

- Make the self-hosted app-server the canonical session control plane for AgentBridge.
- Let `/codex new` and `/codex chat` operate on app-server threads instead of direct local session resume semantics.
- Provide a stable local command, `agentbridge session attach`, that works even when Codex custom prompts are not discoverable.
- Preserve the existing Discord thread UX while changing the backend identity from local session id to app-server thread id.
- Allow the optional `/agentbridge` prompt to remain as a thin wrapper around the stable CLI command.

## Non-Goals

- Adopting or driving Codex.app private sessions.
- Multiplexing arbitrary existing Codex.app app-server processes.
- Real-time bidirectional synchronization of every unmanaged local Codex CLI turn into AgentBridge-managed threads.
- Removing the existing local session summary exporter immediately if it remains useful as a bootstrap utility.

## Topology

AgentBridge daemon starts a shared websocket `codex app-server` instance under its own control. The daemon owns the websocket auth material and exposes enough local metadata for trusted local CLI commands to connect to that same server.

There are two entry paths:

1. Discord:
   - `/codex new` creates a Discord thread and a fresh app-server thread.
   - `/codex chat` resumes the same app-server thread and starts a new turn.

2. Local CLI:
   - `agentbridge session new --prompt "<text>"` creates a fresh managed app-server thread directly from the terminal and then opens a local Codex CLI against that same thread by default.
   - `agentbridge session open --latest` reopens an existing managed app-server thread in local Codex CLI.
   - `agentbridge session attach` discovers the current unmanaged local Codex session by cwd.
   - It builds a visible-chat bootstrap summary from that local session.
   - It creates or resumes an AgentBridge-managed app-server thread for that cwd.
   - It optionally creates or focuses a Discord thread bound to that app-server thread.

## Canonical Identity

After this migration, the canonical session identifier stored by AgentBridge is the Codex app-server `thread.id`, not a local rollout/session id from an unmanaged Codex CLI process.

SQLite bindings therefore become:

- `discordThreadId`
- `codexThreadId`
- `state`
- timestamps / failure metadata
- Discord transcript cursor

This lets Discord turns and local attach flows refer to the same managed thread without pretending that unmanaged local CLI sessions are directly controllable.

## Local Attach Semantics

`agentbridge session attach` is intentionally not a magical adoption of the current unmanaged TUI session. That is not technically reliable. Instead, attach works as a bootstrap:

- discover the latest local session for the current cwd
- summarize visible user/assistant chat
- seed or update an AgentBridge-managed app-server thread with that context

This gives the user a practical path from local Codex work into the shared AgentBridge control plane without depending on Codex CLI custom prompt discovery or on private Codex.app processes.

## Prompt Strategy

The custom prompt file at `~/.codex/prompts/agentbridge.md` becomes optional sugar only.

- If Codex CLI exposes it, `/agentbridge` should shell out to `agentbridge session attach`.
- If prompt discovery fails, the stable CLI command remains fully supported and documented.

This avoids coupling the feature to a slash-menu regression outside this repository.

## Risks and Mitigations

### Shared websocket semantics

App-server multi-client behavior has had rough edges in public issues. To reduce risk, AgentBridge should own the server lifecycle and treat local attach as a controlled client, not as an arbitrary external multiplexer.

### Split-brain context

A user may continue working in an unmanaged local Codex CLI session after bootstrapping into AgentBridge. That unmanaged session is not the same as the app-server thread. The UX and docs must say this explicitly.

### Migration safety

Existing Discord thread bindings currently store local session ids. Migration needs a clear compatibility story:

- either one-time invalidation with user-visible guidance
- or explicit data migration only for bindings that can be safely mapped

V1 should prefer correctness over preserving ambiguous bindings.
