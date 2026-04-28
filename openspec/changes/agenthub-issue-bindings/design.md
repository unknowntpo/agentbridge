# Design: Issue Bindings as Work Intent

## Product Decision

AgentBridge is a personal control plane. It should not become a team issue tracker. The issue tracker remains the source of truth for issue state. AgentBridge stores a local projection only for issues explicitly marked for the user's agent workflow.

For the first implementation, the source is a local `--issues-file` fixture. Later, GitHub sync or a bot can produce the same IssueBinding records.

## Domain Separation

```text
Git commits
  source: local Git repository
  meaning: immutable repository history
  view: Commit View

Issue bindings
  source: explicit local fixture now, GitHub/GitLab/Linear adapter later
  meaning: work intent selected by the user
  view: Work Items / Tracked Issues

Worktrees
  source: local Git worktree state
  meaning: checkout for one branch/ref
  role: bridge between issue and agent session

Agents
  source: AgentBridge session bindings
  meaning: active or resumable provider session
  role: execution attached to a worktree
```

## MVP Data Flow

```text
examples/tw-example.issues.json
        │
        ▼
loadIssueBindings(file)
        │
        ▼
deriveWorkflowViewModelFromProjectScan(scan, { issueBindings, bindings })
        │
        ├─ Work Items = tracked issues
        ├─ Worktrees linked by branch
        ├─ Agents linked through worktree
        └─ Commits remain in Commit View
```

## Future GitHub Adapter

The later GitHub adapter should emit the same IssueBinding shape:

```text
GitHub Issues API / webhook / bot mention
        │
        ▼
IssueBinding[]
        │
        ▼
same projection path as local fixture
```

Recommended filter for personal workflow:

```text
repo in configured repos
AND label in configured tracked labels, e.g. agentbridge
AND assignee == configured user
```

Optional filters can include mentions, author, milestone, or project board membership. Fetching every issue is not the default.

## Blog Notes

This change is a good blog section because it captures the core product insight:

- Commits are facts, not tasks.
- Issues are intent, but only explicitly tracked issues should enter a personal agent control plane.
- Worktrees are execution slots.
- Agents are sessions attached to worktrees.
- A local fixture is a faster way to validate UX than designing a cloud bot first.

