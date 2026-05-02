# agenthub-github-project

## ADDED Requirements

### Requirement: GitHub Project Web UI Control Plane

AgentBridge SHALL support GitHub Project as the primary user-facing Kanban control plane.

#### Scenario: Issue in project triggers local deploy only with explicit label

- **WHEN** a GitHub issue is open
- **AND** its GitHub Project status equals the configured deploy status
- **AND** it has the configured deploy label
- **AND** no local AgentBridge deployment binding exists for the issue
- **THEN** AgentBridge SHALL create a deterministic local worktree and deploy a Codex workspace-write session.

#### Scenario: Issue without deploy label does not trigger local deploy

- **WHEN** a GitHub issue is in the configured deploy status
- **AND** it does not have the configured deploy label
- **THEN** AgentBridge SHALL NOT deploy an agent.

### Requirement: Local Handoff Comment

AgentBridge SHALL write a concise GitHub issue comment after deploying an agent.

#### Scenario: Handoff comment contains local open command

- **WHEN** AgentBridge deploys a local session
- **THEN** it SHALL comment with provider, permission, worktree, branch, session id, and `agentbridge session open ...`.

### Requirement: Remote PR Milestone Sync

AgentBridge SHALL reconcile PR milestones back into GitHub Project status.

#### Scenario: PR exists for agent branch

- **WHEN** a PR exists for the issue branch
- **THEN** AgentBridge SHALL update the GitHub Project status to the configured review status.

#### Scenario: PR merged or issue closed

- **WHEN** the PR for the issue branch is merged
- **OR** the issue is closed
- **THEN** AgentBridge SHALL update the GitHub Project status to the configured done status.

