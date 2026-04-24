## ADDED Requirements

### Requirement: Local `session new/open` supports Gemini with Codex-like UX

AgentBridge SHALL let local users create and reopen managed Gemini sessions through the same command verbs used for Codex.

#### Scenario: Local session new launches Gemini by default

- **WHEN** a user runs `agentbridge session new --provider gemini --prompt "<text>"`
- **THEN** AgentBridge creates a managed Gemini session
- **AND** creates and binds a Discord thread
- **AND** launches local interactive Gemini CLI against that same managed Gemini session unless `--no-open` is specified

#### Scenario: Local session open reuses a managed Gemini binding

- **WHEN** a user runs `agentbridge session open --provider gemini --latest`
- **THEN** AgentBridge resolves the latest managed Gemini binding
- **AND** launches local interactive Gemini CLI resumed from that managed session id

#### Scenario: Provider option remains explicit

- **WHEN** a user runs `agentbridge session new` or `agentbridge session open`
- **THEN** AgentBridge allows selecting the target provider explicitly
- **AND** preserves Codex as the default provider unless local configuration overrides it
