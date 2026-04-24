## ADDED Requirements

### Requirement: Local /agentbridge prompt is installed for Codex

The bridge SHALL install a local Codex prompt file at `~/.codex/prompts/agentbridge.md` so the user can invoke `/agentbridge` from a local Codex session.

#### Scenario: Prompt file is present

- **WHEN** AgentBridge starts locally
- **THEN** `~/.codex/prompts/agentbridge.md` exists and describes the `/agentbridge` export command

### Requirement: /agentbridge exports the current local session

The local `/agentbridge` prompt SHALL invoke the AgentBridge CLI to export the current local Codex session for the current working directory into Discord.

#### Scenario: Current cwd session is exported

- **WHEN** the user invokes `/agentbridge` inside a local Codex session in the repository
- **THEN** the exporter selects the most recently updated Codex session for that working directory and creates a Discord summary thread for it
