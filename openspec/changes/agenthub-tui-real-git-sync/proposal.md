# AgentHub TUI Real Git Sync

## Why

The AgentHub TUI currently previews a mock workflow YAML. That is useful for product-model exploration, but it does not answer the core operational question: whether the terminal view reflects the real project, Git worktrees, and commit state.

AgentHub needs one sync path where CLI/TUI can read the same Git-backed project truth that the desktop app will later consume from the daemon.

## What

- Extend project scanning to include a bounded commit snapshot from the real Git repository.
- Add a pure projection from `ProjectScan` to the existing TUI `WorkflowViewModel`.
- Allow `agentbridge tui --project <path>` and `agentbridge workflow --project <path>` to render real project state without a YAML file.
- Add a commit projection view that shows commit messages, refs, worktree bindings, dirty/clean state, ahead/behind state, and detached worktrees where available.
- Add a refresh control in the interactive TUI so project-backed views can reload the Git snapshot.

## Non-goals

- Do not start provider agents from the TUI in this change.
- Do not mutate Git state.
- Do not replace the YAML prototype; YAML remains useful for issue/work planning.
- Do not implement continuous filesystem watching here. Live events can reuse this scan/projection path later.
