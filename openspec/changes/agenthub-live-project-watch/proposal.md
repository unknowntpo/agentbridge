# AgentHub Live Project Watch

## Why

AgentHub is a control dashboard for local worktrees. If a developer creates a branch or worktree outside the app, the UI must not become stale until the next manual scan.

## What Changes

- Add a desktop live-watch MVP for selected projects.
- Watch Git worktree/ref state in a background Tauri thread.
- Emit a frontend event when branch/worktree state changes.
- Refresh local project state without waiting for GitHub enrichment.

## MVP Scope

- Detect branch creation and worktree list changes.
- Update the worktree list and commit workflow preview automatically.
- Keep remote GitHub refresh as a separate background operation.

## Out Of Scope

- Per-file dirty-state streaming.
- Cross-platform filesystem watcher optimization.
- Push/PR/check webhook subscriptions.
