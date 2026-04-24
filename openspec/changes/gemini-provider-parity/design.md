## Context

Codex and Gemini can support similar user-facing flows, but not through the same backend topology.

- Codex supports a reconnectable app-server and remains suitable for a daemon-owned control plane.
- Gemini CLI exposes stable local session persistence and `--resume`, plus non-interactive JSON output that includes `session_id`.
- Gemini ACP is useful for IDE integrations, but the current official implementation advertises `loadSession: false`, which means AgentBridge cannot rely on ACP for reconnectable shared-session parity.

The design therefore targets UX parity, not backend uniformity.

## Goals

- Keep one CLI surface for local entry:
  - `agentbridge session new --provider <provider>`
  - `agentbridge session open --provider <provider>`
  - `agentbridge session attach` remains Codex bootstrap-only for now.
- Keep one Discord interaction shape:
  - `/codex new`, `/codex chat`
  - `/gemini new`, `/gemini chat`
- Persist enough metadata to reopen the correct provider backend later.
- Avoid regressing the current Codex flow.

## Non-Goals

- Forcing Gemini onto the Codex app-server topology.
- Making Gemini ACP the canonical AgentBridge control plane.
- Bootstrapping unmanaged Gemini CLI sessions into AgentBridge in v1.
- Mirroring every Gemini local CLI turn back into Discord in v1 beyond the managed-thread prompts already routed through AgentBridge.

## Provider Model

AgentBridge should treat provider choice as part of the binding identity.

Each managed binding stores:

- `provider`: `codex` or `gemini`
- `backend`: provider-specific backend kind
- `sessionId`: provider session identifier
- Discord thread id/state/timestamps/cursor

Runtime components receive a provider registry and resolve the correct adapter/launcher from the binding.

## Codex Provider

Codex remains unchanged in principle:

- daemon supervises a self-hosted app-server
- Discord and local open/new target Codex app-server threads
- local open uses `codex resume <threadId> --remote ...`

## Gemini Provider

Gemini uses persisted CLI sessions rather than daemon-owned ACP sessions.

### Start

`agentbridge session new --provider gemini --prompt "<text>"`

- runs Gemini non-interactively in JSON mode with an initial prompt
- extracts `session_id` and assistant output
- creates and binds a Discord thread
- by default opens local interactive Gemini CLI with `gemini --resume <session_id>`

### Continue

Discord `/gemini chat`:

- looks up the bound Gemini session id
- runs Gemini non-interactively with `--resume <session_id>` and the prompt
- posts the visible quoted prompt plus the returned assistant output into the same Discord thread

### Reopen

`agentbridge session open --provider gemini ...`

- resolves an existing managed Gemini binding
- launches local interactive Gemini CLI with `--resume <session_id>`

## UX Contract

Provider parity means:

- same `new` / `chat` / `open` verbs
- same Discord quote-and-reply formatting
- same default local launcher behavior after `session new`
- same managed-thread persistence model

It does not require identical transport internals.

## Risks and Mitigations

### Gemini subprocess stability

Gemini CLI is invoked as a subprocess for managed Discord turns. JSON parsing and exit handling must be strict so failures surface as user-visible errors rather than silent partial output.

### Provider confusion

A managed thread must never switch providers in place. The binding is authoritative; reopen/chat must route to the bound provider or fail loudly.

### Config sprawl

Provider-specific commands/flags should stay shallow. Shared command verbs remain stable, with provider choice expressed by an explicit provider option locally and a provider-specific slash root in Discord.
