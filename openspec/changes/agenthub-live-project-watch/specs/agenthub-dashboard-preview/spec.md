## MODIFIED Requirements

### Requirement: Live local Git updates

The dashboard SHALL refresh local project state when the selected project changes outside the UI.

#### Scenario: Branch creation updates the dashboard

- **GIVEN** the user has opened a project in AgentHub
- **AND** a branch is created in that project by another tool
- **WHEN** the project watcher detects changed Git refs
- **THEN** AgentHub emits a project-change event
- **AND** the frontend reloads local worktree state without blocking on GitHub enrichment.

#### Scenario: Watch failure does not block manual scans

- **GIVEN** live project watching cannot start
- **WHEN** the project opens
- **THEN** the dashboard shows a notice
- **AND** manual scan and background GitHub refresh remain available.
