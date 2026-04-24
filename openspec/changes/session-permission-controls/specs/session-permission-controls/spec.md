## ADDED Requirements

### Requirement: AgentBridge owns a unified session permission model

AgentBridge SHALL define its own session permission model independent of provider-specific terminology.

#### Scenario: Permission model exposes workspace-bounded profiles

- **WHEN** a user creates a managed session through AgentBridge
- **THEN** AgentBridge evaluates one of:
  - `workspace-read`
  - `workspace-write`
  - `full-access`
- **AND** that permission profile is part of the session contract

### Requirement: Trusted workspace handling is centralized

AgentBridge SHALL evaluate workspaces against a central trusted workspace catalog.

#### Scenario: Multiple trusted workspaces are configured

- **GIVEN** AgentBridge is configured with multiple trusted workspaces
- **WHEN** a user selects a workspace by id or path
- **THEN** AgentBridge resolves whether the request is inside or outside a trusted workspace boundary

### Requirement: Risk handling is defined by an explicit decision table

AgentBridge SHALL determine session risk through one centralized decision table rather than distributed conditionals.

#### Scenario: Trusted workspace with non-elevated profile is allowed

- **WHEN** a request targets a trusted workspace with `workspace-read` or `workspace-write`
- **THEN** the centralized policy table returns `allow`

#### Scenario: Full access or untrusted workspace requires local approval

- **WHEN** a request targets `full-access`
- **OR** a request targets a workspace outside the trusted workspace catalog
- **THEN** the centralized policy table returns `require_local_approval`
