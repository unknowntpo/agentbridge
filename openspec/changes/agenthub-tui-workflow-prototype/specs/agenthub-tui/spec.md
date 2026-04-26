# AgentHub TUI Prototype

## ADDED Requirements

### Requirement: Workflow YAML preview

AgentBridge SHALL provide an isolated prototype that loads an AgentHub workflow YAML file and derives project, work item, worktree, agent, and pull request relationships without mutating external systems.

#### Scenario: User previews a workflow file

- **WHEN** the user runs `agentbridge tui --file <path> --print`
- **THEN** the command prints a deterministic terminal tree
- **AND** the tree includes projects, epics, issues, linked worktrees, linked agents, and linked PR state.

#### Scenario: Workflow references are invalid

- **WHEN** a workflow file references a missing work item or worktree
- **THEN** the command fails before rendering
- **AND** the error identifies the invalid reference.

### Requirement: TUI prototype is isolated

The TUI prototype SHALL be read-only and decoupled from the existing desktop dashboard and daemon runtime.

#### Scenario: User starts the TUI

- **WHEN** the user runs `agentbridge tui --file <path>`
- **THEN** AgentBridge reads only the requested workflow file
- **AND** does not call Git, GitHub, provider CLIs, or daemon state handlers.

### Requirement: Domain model is reusable

AgentBridge SHALL keep workflow parsing and relationship derivation in a pure module that can later be reused by CLI, Tauri, or daemon surfaces.

#### Scenario: Renderer consumes workflow data

- **WHEN** the CLI print renderer or Ink renderer needs workflow state
- **THEN** it receives the same derived view model from the parser
- **AND** renderer code does not reimplement relationship lookup.
