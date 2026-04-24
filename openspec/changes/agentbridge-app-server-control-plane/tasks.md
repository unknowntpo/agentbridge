## 1. Spec

- [x] 1.1 Define the self-hosted Codex app-server as AgentBridge's canonical control plane.
- [x] 1.2 Define Discord `/codex new` and `/codex chat` in terms of app-server thread lifecycle instead of unmanaged local session ids.
- [x] 1.3 Define a stable local CLI entry, `agentbridge session attach`, and make the `/agentbridge` custom prompt optional sugar only.

## 2. Implementation

- [x] 2.1 Add daemon-side supervision for a self-hosted Codex app-server instance and authenticated local connection metadata.
- [x] 2.2 Replace Discord routing to create/resume app-server threads and persist `codexThreadId` bindings.
- [x] 2.3 Implement `agentbridge session attach` to bootstrap from local visible chat into an AgentBridge-managed app-server thread.
- [x] 2.4 Update optional prompt installation so `~/.codex/prompts/agentbridge.md` delegates to the stable CLI command instead of being the primary feature surface.
- [x] 2.5 Define or implement safe handling for pre-migration bindings that still reference unmanaged local session ids.

## 3. Verification

- [x] 3.1 Add tests for app-server lifecycle supervision and Discord thread-to-`codexThreadId` persistence.
- [x] 3.2 Add tests for local attach bootstrap behavior and optional prompt delegation.
- [x] 3.3 Run `bun run test`, `bun run check`, and `spectra validate "agentbridge-app-server-control-plane"`.
