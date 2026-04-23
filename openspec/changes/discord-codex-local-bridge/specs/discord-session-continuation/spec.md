## ADDED Requirements

### Requirement: Bound thread resumes Codex session

The bridge SHALL route every user turn in a bound Discord thread to the Codex session referenced by the current Thread Binding. Session continuation SHALL use the persisted Codex session identifier instead of creating a new session for each turn.

#### Scenario: Later thread turn resumes existing session

- **WHEN** a bound Discord thread receives a new user turn
- **THEN** the bridge resumes the mapped Codex session and keeps the existing Thread Binding

##### Example: persisted session continuation

- **GIVEN** thread `thread-123` is bound to Codex session `session-7`
- **WHEN** the user sends `continue with the bridge design`
- **THEN** the bridge resumes Codex session `session-7` for that turn

### Requirement: Busy thread rejects overlapping turn

The bridge MUST NOT execute more than one active user turn for the same Thread Binding at a time. If a second user turn arrives while the thread is already executing or delivering output, the bridge SHALL reject the second turn with a busy-session message.

#### Scenario: Overlapping turn is rejected

- **WHEN** a second user turn arrives for a thread whose binding is already executing
- **THEN** the bridge does not start another Codex execution and returns a busy-session response

##### Example: duplicate turn while executing

- **GIVEN** thread `thread-123` is bound to session `session-7` and currently executing a turn
- **WHEN** another message arrives in `thread-123`
- **THEN** the bridge returns a busy-session response and does not start another Codex execution
