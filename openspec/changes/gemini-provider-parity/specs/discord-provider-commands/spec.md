## ADDED Requirements

### Requirement: Discord exposes provider-parity slash commands

AgentBridge SHALL expose provider-specific Discord slash commands that preserve the same UX contract for managed threads.

#### Scenario: `/gemini new` creates a fresh managed Gemini thread

- **WHEN** a user runs `/gemini new <prompt>` from an allowed parent channel
- **THEN** AgentBridge creates a Discord thread
- **AND** starts a fresh managed Gemini session
- **AND** posts the quoted prompt followed by the Gemini reply in that thread

#### Scenario: `/gemini chat` continues a bound Gemini thread

- **WHEN** a user runs `/gemini chat <prompt>` inside a Discord thread already bound to Gemini
- **THEN** AgentBridge resumes that managed Gemini session
- **AND** posts the same mention-plus-quote formatting used by Codex mode before the assistant reply

#### Scenario: `/gemini chat` rejects unbound threads

- **WHEN** a user runs `/gemini chat <prompt>` in a thread with no Gemini binding
- **THEN** AgentBridge replies ephemerally with guidance to start from `/gemini new <prompt>` first
