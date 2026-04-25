## ADDED Requirements

### Requirement: AgentBridge documents a self-hosted installation model

AgentBridge SHALL present itself as a self-hosted tool where each installation supplies its own Discord bot credentials, local provider setup, trusted workspaces, and SQLite state.

#### Scenario: Public docs describe one bot per installation

- **WHEN** a new user reads the public setup documentation
- **THEN** the documentation explains that the user creates and configures their own Discord bot application
- **AND** the project does not imply a shared hosted bot identity

### Requirement: Discord runtime is default-deny without an allowed channel catalog

AgentBridge SHALL reject Discord commands and mention continuations when no allowed Discord channels are configured.

#### Scenario: Empty allowed channel list rejects Discord traffic

- **GIVEN** `AGENTBRIDGE_ALLOWED_CHANNEL_IDS` is empty
- **WHEN** a Discord user invokes `/codex new`
- **THEN** AgentBridge does not start a provider session
- **AND** replies that the channel is not allowed

### Requirement: Public support boundaries are explicit

AgentBridge SHALL document a public support matrix for provider and platform maturity.

#### Scenario: README exposes stable and experimental areas

- **WHEN** a user reads the project overview
- **THEN** the README identifies Codex as the stable provider path
- **AND** identifies Gemini as experimental
- **AND** identifies macOS as the stable platform baseline for the current public release

### Requirement: Stable CLI packaging is the public entrypoint

AgentBridge SHALL expose `agentbridge` as the supported public CLI entrypoint for package consumers.

#### Scenario: Public package metadata no longer assumes a private repo workflow

- **WHEN** a user installs AgentBridge as a package
- **THEN** package metadata is publishable
- **AND** the package exposes an `agentbridge` bin
- **AND** the bin prefers built runtime artifacts instead of assuming a development-only TypeScript runtime shim
- **AND** the source fallback runs through Bun, not Node or another TypeScript runtime shim
- **AND** the package exposes no public library API until one is intentionally designed
