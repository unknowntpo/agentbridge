## ADDED Requirements

### Requirement: Bound Discord threads continue by bot mention

AgentBridge SHALL continue a bound Discord thread when a user mentions the bot in that thread and includes non-empty prompt text.

#### Scenario: Mention resumes the provider already bound to the thread

- **GIVEN** a Discord thread is already bound to a managed provider session
- **WHEN** a user posts a message in that thread that mentions the bot and includes prompt text after the mention
- **THEN** AgentBridge adds a `👍` reaction to that user message
- **AND** resumes the provider already bound to the thread
- **AND** quotes only the user prompt text without the bot mention
- **AND** posts the provider reply in that same thread

#### Scenario: Plain thread messages remain ignored

- **GIVEN** a Discord thread is already bound to a managed provider session
- **WHEN** a user posts a message in that thread without mentioning the bot
- **THEN** AgentBridge ignores the message

#### Scenario: Mention in unbound thread returns setup guidance

- **WHEN** a user mentions the bot in a Discord thread that is not bound to a managed session
- **THEN** AgentBridge replies with guidance to start a thread from a parent channel using `/codex new` or `/gemini new`
