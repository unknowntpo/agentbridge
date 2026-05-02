# Design

## Product Flow

```text
GitHub Project Web UI
  User moves issue to In Progress and adds label `agentbridge`
        |
        v
AgentBridge local daemon polls GitHub Project
        |
        v
Deploy condition:
  issue open
  project status == In Progress
  label contains agentbridge
  no existing local deployment binding
        |
        v
Local execution:
  branch   agent/<issue-number>-<slug>
  worktree <project-root>/agent/<issue-number>-<slug>
  provider codex
  profile  workspace-write
        |
        v
GitHub issue comment:
  deploy summary + local handoff command
        |
        v
User chats locally in Codex CLI
        |
        v
PR opened/merged:
  AgentBridge sync moves Project status to Review/Done
```

## State Ownership

- GitHub Project Status is the Kanban truth.
- GitHub Issue label `agentbridge` is the explicit deploy trigger.
- `.agentbridge/issues.json` is the local idempotency/projection file.
- SQLite thread bindings are the local session truth.
- GitHub comments are handoff/audit only, not chat storage.

## Config

```yaml
github:
  owner: unknowntpo
  repo: tw-example
  project:
    owner: unknowntpo
    number: 1
    statusField: Status
    deployStatus: In Progress
    reviewStatus: Review
    doneStatus: Done
  labels:
    deploy: agentbridge

agent:
  defaultProvider: codex
  defaultPermission: workspace-write

worktree:
  branchPattern: agent/<issue-number>-<slug>
  pathPattern: <repo-root>/agent/<issue-number>-<slug>

sync:
  pollIntervalSeconds: 30
```

## Idempotency

An issue is deployed at most once while its local binding has `sessionId`. Repeated polling updates projections and PR milestones, but does not create a second worktree, branch, session, or comment.

