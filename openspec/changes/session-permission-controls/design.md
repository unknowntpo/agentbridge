## Summary

AgentBridge should own a provider-agnostic session permission contract. Users select:

1. a workspace
2. a permission profile

AgentBridge then:

1. resolves the workspace against a trusted workspace catalog
2. evaluates one explicit decision table
3. checks one explicit provider capability table
4. either allows the request, queues it for local approval, or rejects it

This keeps the UX coherent while allowing Codex and Gemini to differ internally.

## Product Permission Model

AgentBridge defines its own permission vocabulary:

```ts
type PermissionProfile =
  | "workspace-read"
  | "workspace-write"
  | "full-access"
```

This is intentionally **not** the same as any provider's native runtime flags. It is the public product contract.

### Semantics

- `workspace-read`
  - agent may read the selected workspace
  - agent may not write the selected workspace
  - agent may not expand beyond the selected workspace boundary
- `workspace-write`
  - agent may read and write the selected workspace
  - agent may not expand beyond the selected workspace boundary
- `full-access`
  - high-risk mode
  - agent may exceed the normal selected workspace boundary depending on provider support
  - requires local approval

## Trusted Workspace Catalog

AgentBridge should support multiple configured workspaces. This is not a single default path.

```ts
interface TrustedWorkspace {
  id: string
  label: string
  path: string
}
```

Example:

```text
agentbridge:/Users/unknowntpo/repo/unknowntpo/agentbridge
minishop:/Users/unknowntpo/repo/unknowntpo/minishop
articles:/Users/unknowntpo/repo/unknowntpo/articles
```

### Resolution Rules

- If the user selects a known workspace id, AgentBridge resolves it to that configured path.
- If the user passes an arbitrary path, AgentBridge normalizes it and checks whether it is inside any trusted workspace subtree.
- A request may therefore target:
  - a trusted workspace
  - an untrusted workspace

## Central Permission Decision Table

Risk handling should never be encoded as scattered conditionals. It should be defined in one table.

```ts
interface PermissionDecisionRow {
  workspaceTrusted: boolean
  profile: PermissionProfile
  risk: "low" | "high"
  action: "allow" | "require_local_approval" | "reject"
}
```

The MVP decision table is:

| workspaceTrusted | profile          | risk | action                  |
|------------------|------------------|------|-------------------------|
| true             | workspace-read   | low  | allow                   |
| true             | workspace-write  | low  | allow                   |
| true             | full-access      | high | require_local_approval  |
| false            | workspace-read   | high | require_local_approval  |
| false            | workspace-write  | high | require_local_approval  |
| false            | full-access      | high | require_local_approval  |

This table is explicit by design. Future rows can evolve without hiding behavior inside deeply nested runtime code.

## Provider Capability Table

The permission model is unified, but providers differ internally. That should also be explicit.

```ts
interface ProviderCapabilityRow {
  provider: "codex" | "gemini"
  profile: PermissionProfile
  supported: boolean
  mappedMode: string | null
}
```

The MVP capability table is:

| provider | profile          | supported | mappedMode            |
|----------|------------------|-----------|-----------------------|
| codex    | workspace-read   | true      | read-only             |
| codex    | workspace-write  | true      | workspace-write       |
| codex    | full-access      | true      | danger-full-access    |
| gemini   | workspace-read   | true      | provider-defined      |
| gemini   | workspace-write  | true      | provider-defined      |
| gemini   | full-access      | false     | null                  |

### Why This Table Exists

This lets AgentBridge say:

- "the UI contract is stable"
- "this provider does or does not implement this profile"

without conflating product policy with provider internals.

## Discord Workflow

### Session Creation

The creation flow should be treated as a session contract negotiation:

1. choose workspace
2. choose permission profile

In the MVP this can be implemented with slash options. A later modal flow can preserve the same contract.

### Normal Flow

When the decision table returns `allow`:

- AgentBridge creates the managed session immediately
- binds:
  - provider
  - workspace id/label/path
  - permission profile
- creates the Discord thread

### High-Risk Flow

When the decision table returns `require_local_approval`:

- AgentBridge does **not** start the provider runtime immediately
- AgentBridge writes a pending approval entry locally
- Discord receives:

```text
Full-access request queued for local approval.
Ref: A7K2
```

The short `ref` is for human matching only. The real `requestId` remains local.

## Local Approval Queue

The queue is for high-risk Discord requests, not for every local action.

```ts
interface PendingApproval {
  requestId: string
  ref: string
  source: "discord"
  provider: ProviderKind
  requesterUserId: string
  requesterDisplayName: string
  prompt: string
  parentChannelId: string
  workspaceId: string | null
  workspaceLabel: string
  workspacePath: string
  permissionProfile: PermissionProfile
  createdAt: string
}
```

### Discord View

```text
Full-access request queued for local approval.
Ref: A7K2
```

### Local CLI View

```text
requestId: req-482913
ref: A7K2
user: Eric Chang
provider: codex
workspace: infra-repo
profile: full-access
prompt: refactor deployment scripts
source: Discord
```

### Approval Commands

The MVP local commands are:

```bash
agentbridge approvals list
agentbridge approvals approve <requestId>
```

The `ref` is intentionally display-only in the MVP. The stable internal action key remains `requestId`.

## Binding Model

Thread bindings must persist the session contract so thread continuation remains stable:

```ts
interface ThreadBinding {
  threadId: string
  sessionId: string
  provider: ProviderKind
  backend: SessionBackendKind
  workspaceId: string | null
  workspaceLabel: string
  workspacePath: string
  permissionProfile: PermissionProfile
  ...
}
```

Thread mention continuation must reuse this stored contract. It should not silently drift to a different workspace or permission profile.

## Continuation Semantics

Once a managed thread exists:

- provider is fixed by the binding
- workspace is fixed by the binding
- permission profile is fixed by the binding

Thread mention continuation should only resume within that existing contract.

## Security Model

Discord permissions alone are not sufficient for high-risk actions. The safety model should be layered:

1. Discord visibility and channel allowlist
2. AgentBridge product policy:
   - trusted workspaces
   - decision table
   - provider capability table
   - local approval queue
3. Provider runtime sandbox / approval behavior

This design intentionally treats local approval as a separate control layer above the provider runtime.

## Why This Is Blog-Worthy

This design turns what could have been ad hoc bot behavior into a clean policy architecture:

- product-level permission language
- explicit risk table
- explicit provider capability table
- short public reference vs private internal request id
- Discord as remote intent surface, local machine as final authority for risky execution

It is a strong example of how to build a remote AI control plane without leaking provider-specific implementation details into the user contract.
