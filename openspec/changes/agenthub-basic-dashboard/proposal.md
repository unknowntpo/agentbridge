# AgentHub Basic Dashboard

## Why

AgentHub needs a concrete desktop mock that demonstrates the worktree-first workflow before the UI connects to live AgentBridge service state. The design system page already defines tokens and component primitives, but the main app route should show how those pieces compose into the everyday dashboard.

## What

- Add a basic AgentHub dashboard layout backed by mock data.
- Keep the source of truth as Git worktrees, not abstract branches.
- Show writer/read-only agent sessions on a selected worktree.
- Show local Git state, GitHub-oriented remote state, approvals, runs, and artifacts as mock data.
- Add navigation from the design system page back to the main dashboard preview.

## Non-goals

- No live Git, GitHub, filesystem, or AgentBridge service integration yet.
- No production routing framework.
- No persistence.
