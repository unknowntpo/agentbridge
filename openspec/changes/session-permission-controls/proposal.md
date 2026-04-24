## Why

AgentBridge is moving from a single implicit runtime policy to explicit session contracts created from Discord. That needs a stable product-level permission model rather than provider-specific flags leaking into UX.

The immediate design problems are:

- Users need to choose a workspace and a permission model when creating a session from Discord.
- Trusted workspace boundaries must be explicit and centrally configured; multiple trusted workspaces are valid.
- High-risk requests should not execute immediately from Discord. They should enter a local approval queue.
- Risk logic must be auditable. The decision table should live in one place rather than being spread across the codebase via ad hoc `if/else`.
- Provider runtimes differ. Codex can map cleanly to per-thread app-server sandbox settings, while Gemini may only support a subset. AgentBridge still needs one unified interface.

## What Changes

- Introduce an AgentBridge-owned permission model:
  - `workspace-read`
  - `workspace-write`
  - `full-access`
- Introduce a trusted workspace catalog with multiple configured workspaces.
- Define a centralized decision table that maps:
  - trusted vs untrusted workspace
  - permission profile
  to a single action:
  - `allow`
  - `require_local_approval`
  - `reject`
- Define a centralized provider capability table that maps AgentBridge permission profiles into provider-specific runtime settings.
- Add a local approval queue for high-risk Discord session creation requests.
- Show only a short human-readable `ref` in Discord while keeping the real `requestId` local.

## Impact

- Affected specs:
  - `session-permission-controls`
  - `discord-session-approvals`
- Expected code areas:
  - config parsing
  - Discord slash/new UX
  - state storage
  - provider runtime mapping
  - local CLI approvals commands
  - README / operational docs
