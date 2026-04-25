# AgentHub Dashboard Preview

## ADDED Requirements

### Requirement: Project opening renders local state before remote enrichment

The dashboard SHALL load local worktree state separately from GitHub enrichment.

#### Scenario: User opens a project

- **WHEN** the user clicks an Open Project action
- **THEN** the dashboard shows a visible loading state immediately
- **AND** local worktree cards render as soon as local Git scan completes
- **AND** GitHub/PR state may continue loading afterward.

### Requirement: Remote enrichment is explicit asynchronous state

GitHub and PR status refresh SHALL be represented as asynchronous UI state.

#### Scenario: GitHub enrichment is running

- **WHEN** the dashboard is refreshing remote state
- **THEN** the UI shows remote loading status
- **AND** the user can still inspect worktrees and open the agent drawer.

### Requirement: Agent creation uses a drawer flow

The dashboard SHALL create agents through a drawer instead of one-click hard-coded provider buttons.

#### Scenario: User opens the Agent Create drawer

- **WHEN** the user clicks Deploy agent
- **THEN** the drawer opens with the selected worktree as context
- **AND** the working directory defaults to the selected worktree path
- **AND** the user can choose provider, permission profile, and prompt before creating the session.

#### Scenario: User creates an agent from the drawer

- **WHEN** the user submits the drawer
- **THEN** the agent session is attached to the selected worktree
- **AND** the drawer closes
- **AND** the session detail is selected.
