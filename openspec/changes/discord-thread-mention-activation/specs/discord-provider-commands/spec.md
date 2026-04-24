## ADDED Requirements

### Requirement: Discord slash commands create provider-specific threads

AgentBridge SHALL expose provider-specific Discord slash commands for creating new managed threads from parent channels.

#### Scenario: Slash registration keeps provider-specific `new` entrypoints

- **WHEN** AgentBridge registers Discord slash commands
- **THEN** it exposes `/codex new` and `/gemini new`
- **AND** it does not require thread continuation slash commands as part of the primary UX

#### Scenario: Mention workflow is advertised in thread setup

- **WHEN** a user starts a managed thread with `/codex new` or `/gemini new`
- **THEN** the created thread can be continued by mentioning the bot in that thread
