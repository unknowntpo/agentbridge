## ADDED Requirements

### Requirement: AgentBridge owns a self-hosted Codex app-server

AgentBridge SHALL start and supervise a Codex app-server process under its own control and SHALL use that app-server as the canonical control plane for managed Codex threads.

#### Scenario: Daemon starts a managed app-server

- **WHEN** AgentBridge daemon starts successfully
- **THEN** it starts or reconnects to a self-hosted Codex app-server instance that AgentBridge owns

##### Example: daemon-owned websocket listener

- **GIVEN** AgentBridge is configured to run a shared app-server listener
- **WHEN** the daemon finishes startup
- **THEN** a Codex app-server process is running under AgentBridge supervision and is ready for Discord and local CLI clients

### Requirement: Managed thread ids are canonical session identifiers

AgentBridge SHALL treat the Codex app-server `thread.id` as the canonical managed session identifier for Discord and local attach flows.

#### Scenario: Managed thread id is persisted

- **WHEN** AgentBridge creates or resumes a managed Codex conversation through the app-server
- **THEN** it stores the app-server `thread.id` as the canonical session identity

### Requirement: Codex.app private sessions are ignored

AgentBridge SHALL NOT depend on or adopt Codex.app private sessions or Codex.app private app-server processes.

#### Scenario: Private Codex.app process exists

- **WHEN** Codex.app is running on the same machine with its own app-server child process
- **THEN** AgentBridge ignores that private process and continues using only the self-hosted app-server it owns
