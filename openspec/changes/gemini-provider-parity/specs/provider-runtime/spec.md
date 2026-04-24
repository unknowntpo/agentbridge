## ADDED Requirements

### Requirement: AgentBridge runtime is provider-aware

AgentBridge SHALL persist and route managed sessions by provider, not by a single hard-coded Codex backend.

#### Scenario: Binding stores provider identity

- **WHEN** AgentBridge persists a managed session binding
- **THEN** the binding records which provider owns the session
- **AND** reopen/chat flows route through that provider's runtime implementation

#### Scenario: Provider mismatch fails loudly

- **GIVEN** a Discord thread is bound to provider `gemini`
- **WHEN** AgentBridge attempts to continue it through a Codex-only backend
- **THEN** AgentBridge rejects the operation with a user-visible error instead of silently switching providers
