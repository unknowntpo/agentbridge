# AgentHub TUI Prototype

## ADDED Requirements

### Requirement: Workflow YAML preview

AgentBridge SHALL provide an isolated prototype that loads an AgentHub workflow YAML file and derives project, work item, worktree, agent, and pull request relationships without mutating external systems.

#### Scenario: User previews a workflow file

- **WHEN** the user runs `agentbridge tui --file <path> --print`
- **THEN** the command prints a deterministic terminal tree
- **AND** the tree includes projects, epics, issues, linked worktrees, linked agents, linked PR state, and work item dependencies.

#### Scenario: Workflow references are invalid

- **WHEN** a workflow file references a missing work item or worktree
- **THEN** the command fails before rendering
- **AND** the error identifies the invalid reference.

#### Scenario: Work item depends on multiple tasks

- **WHEN** a work item declares `depends_on` with multiple work item ids
- **THEN** the derived model exposes all dependencies with their current statuses
- **AND** each dependency exposes the dependent work item as something it unblocks.

#### Scenario: Work item dependencies contain a cycle

- **WHEN** work items depend on each other in a cycle
- **THEN** AgentBridge rejects the workflow file before rendering
- **AND** the error identifies that a dependency cycle exists.

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

### Requirement: Workflow projections are explicit

AgentBridge SHALL expose named workflow projections so task breakdown, dependency graph, ready queue, and agent state do not get confused with Git commit graph views.

#### Scenario: User prints task breakdown

- **WHEN** the user runs `agentbridge workflow --file <path> --view task-tree`
- **THEN** the command prints epic/issue hierarchy and linked worktree, agent, PR, and dependency metadata.

#### Scenario: User prints dependency graph

- **WHEN** the user runs `agentbridge workflow --file <path> --view dependency`
- **THEN** the command prints task dependency arrows
- **AND** does not represent the output as a Git commit graph.

#### Scenario: User prints actionable ready queue

- **WHEN** the user runs `agentbridge workflow --file <path> --view ready`
- **THEN** the command prints tasks that can start now
- **AND** separately lists blocked tasks with unmet dependencies.

#### Scenario: User prints agent assignment view

- **WHEN** the user runs `agentbridge workflow --file <path> --view agents`
- **THEN** the command prints each agent with provider, mode, status, worktree, task, and task dependencies.
