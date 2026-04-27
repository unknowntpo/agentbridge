# AgentHub TUI Prototype

## MODIFIED Requirements

### Requirement: TUI prototype is isolated

The TUI prototype SHALL support both mock workflow YAML and read-only real project snapshots without mutating Git repositories, branches, worktrees, remotes, or provider sessions.

#### Scenario: User previews a real project

- **WHEN** the user runs `agentbridge tui --project <path> --print`
- **THEN** AgentBridge scans the local Git project containing that path
- **AND** prints a deterministic terminal projection derived from real Git worktree and commit state.

#### Scenario: Project changes auto-refresh the TUI

- **GIVEN** the user started `agentbridge tui --project <path>` interactively
- **WHEN** files or Git metadata under that project change
- **THEN** AgentBridge reloads the project snapshot after a short debounce
- **AND** updates the TUI without requiring manual refresh.

### Requirement: Lifecycle operations

The TUI SHALL not expose a fake lifecycle view. Project creation, worktree creation, agent deployment, and session chat/open SHALL be implemented as real actions before they appear as interactive TUI affordances.

#### Scenario: User evaluates lifecycle support

- **WHEN** AgentHub lifecycle support is tested
- **THEN** project creation, worktree creation, agent deployment, and session chat/open are verified through AgentBridge command handlers where those handlers exist
- **AND** unsupported direct TUI actions are tracked as implementation gaps instead of being presented as a lifecycle view.

### Requirement: Workflow projections are explicit

AgentBridge SHALL expose named workflow projections so task breakdown, dependency graph, ready queue, agent state, and Git commit state do not get confused.

#### Scenario: User prints real commit state

- **WHEN** the user runs `agentbridge workflow --project <path> --view commits`
- **THEN** the command prints a commit projection
- **AND** each commit row includes the short hash, subject, refs, linked worktrees, and local dirty/ahead/behind state where available.
