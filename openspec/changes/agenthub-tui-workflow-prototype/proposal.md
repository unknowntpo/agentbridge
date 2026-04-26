# AgentHub TUI Workflow Prototype

## Why

AgentHub is moving from a commit-only mental model toward an issue/worktree/agent workflow. The desktop UI is useful for visual exploration, but it is expensive to validate every domain-model change there first. A small terminal prototype gives us a faster feedback loop for the project layout YAML, issue hierarchy, worktree binding, agent assignment, and PR state before committing the shape to the Tauri app.

The prototype must stay isolated from the current daemon and desktop implementation so it can be discarded or reshaped without destabilizing existing workflows.

## What

- Add a YAML-based AgentHub workflow file format for prototyping projects, work items, worktrees, agents, and PRs.
- Add a pure parser/view-model layer that validates references and derives issue/worktree/agent/PR relationships.
- Add a stable non-interactive CLI preview command for tests and quick review.
- Add an Ink-based interactive TUI entrypoint for local exploration.
- Include a realistic sample workflow with epics, GitHub issues, checked-out worktrees, multiple agents, and PR state.

## Non-goals

- Do not mutate Git repositories, branches, worktrees, or remotes.
- Do not start or control real AgentBridge provider sessions.
- Do not replace the Tauri dashboard in this change.
- Do not require the prototype YAML to become the final persisted product schema.
