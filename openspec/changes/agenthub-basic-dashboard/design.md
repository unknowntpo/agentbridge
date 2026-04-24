# AgentHub Basic Dashboard Design

## Product Model

The main screen renders one project with multiple worktrees. A worktree is the primary object. Agents, approvals, runs, and artifacts hang from a worktree.

```text
Project
  Worktree
    AgentSession
    ApprovalRequest
    Run
    Artifact
```

## Layout

- Left sidebar: project identity, navigation, deploy action, trusted root.
- Center workspace: top project bar, worktree tree canvas, bottom run timeline.
- Right inspector: selected worktree state, writer/readers, GitHub status, approvals, artifacts.

## Mock State

- `main`: clean, unlocked, no agents.
- `feat/worktree-tree`: clean, write locked by Codex, Gemini/Claude as read-only side agents.
- `docs/permissions`: dirty, Gemini read-only.
- `wt/experiment-cache`: approval required.
- `wt/perf-proto`: clean and idle.

## Design Rules

- Use the existing Sora/Warm Sand/Kurenai design tokens.
- Keep Codex, Claude, and Gemini as the provider set.
- Display local Git state and remote GitHub state separately.
- A write-locked worktree can still have read-only agents.
- Approval rows must show actor, action, command/scope, and decision controls.
