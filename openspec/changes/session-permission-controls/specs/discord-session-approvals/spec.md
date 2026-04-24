## ADDED Requirements

### Requirement: High-risk Discord session creation is queued for local approval

AgentBridge SHALL queue high-risk Discord session creation requests locally instead of executing them immediately.

#### Scenario: Discord receives a short reference for a queued request

- **WHEN** a high-risk session creation request is submitted from Discord
- **THEN** AgentBridge stores a local pending approval entry with a stable internal `requestId`
- **AND** Discord receives only a short human-readable `ref`

#### Scenario: Local CLI shows full approval detail

- **WHEN** a user runs `agentbridge approvals list`
- **THEN** AgentBridge shows the full pending request details including:
  - `requestId`
  - `ref`
  - requester
  - provider
  - workspace
  - permission profile
  - prompt

#### Scenario: Local approval executes the deferred request

- **WHEN** a user runs `agentbridge approvals approve <requestId>`
- **THEN** AgentBridge executes the queued Discord request using the previously selected workspace and permission profile
- **AND** creates the managed session only after that local approval succeeds
