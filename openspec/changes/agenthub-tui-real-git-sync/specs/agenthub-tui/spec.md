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

#### Scenario: User deploys an agent from the TUI

- **GIVEN** the user opened `agentbridge tui --project <path>` interactively
- **AND** a worktree is available from the selected task or project snapshot
- **WHEN** the user presses `d`
- **THEN** AgentBridge opens a deploy draft that shows provider, permission profile, workspace path, branch, and initial prompt
- **AND** the workspace path defaults to the target worktree location
- **WHEN** the user confirms the draft
- **THEN** AgentBridge deploys a Codex agent with the selected permission profile for that worktree
- **AND** persists enough session state for handoff
- **AND** shows a copyable `agentbridge session open ...` command for continuing in another terminal.

#### Scenario: Persisted agent sessions appear in project projections

- **GIVEN** AgentBridge has persisted a managed session binding for a worktree path
- **WHEN** the user opens or prints `agentbridge tui --project <path> --view agents`
- **THEN** AgentBridge joins the persisted binding to the scanned worktree by canonical workspace path
- **AND** renders the provider, mode, status, branch, and worktree path in the agents projection
- **AND** exposes a copyable `agentbridge session open ...` handoff command when a managed session id is available.
- **AND** in interactive TUI mode, the selected agent handoff command is rendered inside the focused agent card and can be copied to the system clipboard from the keyboard or terminal mouse reporting.
- **AND** the focused agent card shows a short copied effect after the handoff command is copied.

#### Scenario: Tasks and dependencies show agent presence

- **GIVEN** a task or commit has one or more linked agents
- **WHEN** AgentBridge renders task-tree, dependency, ready, selected-detail, or agents projections
- **THEN** the task or dependency label includes provider icons so the user can see active agent ownership without switching to the agents view.

#### Scenario: User navigates the deploy draft as a keyboard form

- **GIVEN** the deploy draft is open
- **WHEN** the user presses Tab or Shift+Tab
- **THEN** the focused form field changes
- **AND** provider, permission, prompt, deploy, and cancel are distinct focus targets.
- **WHEN** the user presses Enter on a non-terminal field
- **THEN** the current row is accepted and focus moves to the next row.
- **AND** the provider field can switch between Codex and Gemini before deployment.

### Requirement: Workflow projections are explicit

AgentBridge SHALL expose named workflow projections so task breakdown, dependency graph, ready queue, agent state, and Git commit state do not get confused.

#### Scenario: User prints real commit state

- **WHEN** the user runs `agentbridge workflow --project <path> --view commits`
- **THEN** the command prints a commit projection
- **AND** each commit row includes the short hash, subject, refs, linked worktrees, and local dirty/ahead/behind state where available.
