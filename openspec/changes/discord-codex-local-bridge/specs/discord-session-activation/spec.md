## ADDED Requirements

### Requirement: Activation message starts bound session

The bridge SHALL create a new Thread Binding when a Discord thread has no active binding and the inbound message matches the activation rules. The activation rules SHALL recognize a `discord ...` activation message and SHALL reject normal messages that do not match activation rules when no binding exists.

#### Scenario: Prefix activation creates session

- **WHEN** a Discord thread without an active binding receives a message beginning with `discord `
- **THEN** the bridge creates a new Thread Binding and starts a new Codex session for that thread

##### Example: first thread turn

- **GIVEN** thread `thread-123` has no persisted binding
- **WHEN** the user sends `discord summarize this repo`
- **THEN** the bridge records a binding for `thread-123` and starts a Codex session

#### Scenario: Non-activation message is rejected before binding

- **WHEN** a Discord thread without an active binding receives a message that does not match the activation rules
- **THEN** the bridge does not start a Codex session and returns an activation guidance message

##### Example: plain message without activation

- **GIVEN** thread `thread-456` has no persisted binding
- **WHEN** the user sends `hello there`
- **THEN** the bridge does not create a Thread Binding and replies with activation guidance

### Requirement: Bridge command starts session

The bridge SHALL recognize explicit bridge commands for session startup before evaluating normal activation message routing. The `/codex new` bridge command SHALL create a new Thread Binding for the current thread when no active binding exists.

#### Scenario: Explicit new command starts session

- **WHEN** a Discord thread without an active binding receives `/codex new`
- **THEN** the bridge creates a new Thread Binding and starts a new Codex session for the thread
