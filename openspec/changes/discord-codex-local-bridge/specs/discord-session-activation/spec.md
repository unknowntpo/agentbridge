## ADDED Requirements

### Requirement: Slash new starts bound session in a new thread

The bridge SHALL create a new Discord thread and a new Thread Binding when a user invokes `/codex new <prompt>` from a non-thread channel. The new Thread Binding SHALL be attached to the created thread and SHALL start a fresh Codex session using the provided prompt.

#### Scenario: Channel new command creates thread-bound session

- **WHEN** a non-thread Discord channel receives `/codex new <prompt>`
- **THEN** the bridge creates a new thread, binds that thread to a fresh Codex session, and starts the session there

##### Example: new thread from parent channel

- **GIVEN** channel `channel-123` is not a thread
- **WHEN** the user sends `/codex new summarize this repo`
- **THEN** the bridge creates a new thread, records a binding for that thread, and starts a Codex session there

### Requirement: Slash new inside a thread is ignored

The bridge SHALL NOT create a nested thread when `/codex new <prompt>` is invoked inside an existing Discord thread. The bridge SHALL ignore the request.

#### Scenario: In-thread new command is ignored

- **WHEN** a Discord thread receives `/codex new <prompt>`
- **THEN** the bridge does not create another thread and does not start a new session in the current thread
