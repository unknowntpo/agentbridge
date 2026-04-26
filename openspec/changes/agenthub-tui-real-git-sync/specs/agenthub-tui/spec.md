# AgentHub TUI Prototype

## MODIFIED Requirements

### Requirement: TUI prototype is isolated

The TUI prototype SHALL support both mock workflow YAML and read-only real project snapshots without mutating Git repositories, branches, worktrees, remotes, or provider sessions.

#### Scenario: User previews a real project

- **WHEN** the user runs `agentbridge tui --project <path> --print`
- **THEN** AgentBridge scans the allowed AgentHub project containing that path
- **AND** prints a deterministic terminal projection derived from real Git worktree and commit state.

#### Scenario: User refreshes a real project TUI

- **GIVEN** the user started `agentbridge tui --project <path>` interactively
- **WHEN** the user presses `r`
- **THEN** AgentBridge reloads the Git-backed project snapshot
- **AND** updates the TUI model without changing the repository.

### Requirement: Workflow projections are explicit

AgentBridge SHALL expose named workflow projections so task breakdown, dependency graph, ready queue, agent state, and Git commit state do not get confused.

#### Scenario: User prints real commit state

- **WHEN** the user runs `agentbridge workflow --project <path> --view commits`
- **THEN** the command prints a commit projection
- **AND** each commit row includes the short hash, subject, refs, linked worktrees, and local dirty/ahead/behind state where available.
