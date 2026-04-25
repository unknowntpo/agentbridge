## MODIFIED Requirements

### Requirement: Agent deployment from selected worktree

The dashboard SHALL allow the user to deploy a provider agent from the selected worktree drawer.

#### Scenario: Codex deploy uses backend contract

- **GIVEN** a selected worktree inside an allowed project
- **WHEN** the user creates a Codex agent
- **THEN** the desktop app invokes the AgentBridge deploy backend
- **AND** the created session is attached to the selected worktree
- **AND** the session indicates whether provider execution was real or mocked.

#### Scenario: Backend deploy failure remains usable

- **GIVEN** the backend deploy command is unavailable or fails
- **WHEN** the user creates an agent from the drawer
- **THEN** the dashboard falls back to a mock session
- **AND** the notice clearly explains that real deploy was blocked.
