## ADDED Requirements

### Requirement: Bound thread resumes Codex session through slash chat

The bridge SHALL route `/codex chat <prompt>` in a bound Discord thread to the Codex session referenced by the current Thread Binding. Session continuation SHALL use the persisted Codex session identifier instead of creating a new session for each turn.

#### Scenario: Chat command resumes existing session

- **WHEN** a bound Discord thread receives `/codex chat <prompt>`
- **THEN** the bridge resumes the mapped Codex session and keeps the existing Thread Binding

##### Example: persisted session continuation

- **GIVEN** thread `thread-123` is bound to Codex session `session-7`
- **WHEN** the user sends `/codex chat continue with the bridge design`
- **THEN** the bridge resumes Codex session `session-7` for that turn

### Requirement: Chat command outside a bound thread is rejected

The bridge SHALL reject `/codex chat <prompt>` when the command is used outside a bound Discord thread created by `/codex new`.

#### Scenario: Parent-channel chat is rejected

- **WHEN** a non-thread Discord channel receives `/codex chat <prompt>`
- **THEN** the bridge does not start a new Codex session and returns guidance to use `/codex new <prompt>` first

#### Scenario: Unbound thread chat is rejected

- **WHEN** an unbound Discord thread receives `/codex chat <prompt>`
- **THEN** the bridge does not resume a session and returns guidance to use `/codex new <prompt>` from a parent channel first

### Requirement: Plain thread messages do not resume Codex

The bridge SHALL NOT resume a Codex session from a plain non-command message in a bound Discord thread.

#### Scenario: Plain follow-up is ignored

- **WHEN** a bound Discord thread receives a normal message that is not `/codex chat <prompt>`
- **THEN** the bridge ignores that message for Codex execution

### Requirement: Slash chat syncs unseen visible thread transcript

Before resuming Codex for `/codex chat <prompt>`, the bridge SHALL read the bound thread's unseen visible transcript since the last synchronized message and SHALL prepend that transcript to the Codex prompt. The synchronized transcript SHALL include user messages and bot-authored visible replies, and SHALL exclude ephemeral slash acknowledgements, system event messages, and slash-command UI.

#### Scenario: Incremental transcript is included before resume

- **WHEN** a bound thread receives `/codex chat <prompt>` after new visible messages have appeared since the last sync point
- **THEN** the bridge includes those unseen visible messages in the Codex prompt before the current chat prompt

##### Example: invoice number is recovered from unseen user message

- **GIVEN** thread `thread-123` is bound to Codex session `session-7` and the last synchronized visible message was earlier than a user message containing `發票號碼 12345`
- **WHEN** the user sends `/codex chat 請告訴我目前對話中 發票號碼`
- **THEN** the bridge resumes Codex with a prompt that includes the unseen visible message containing `發票號碼 12345`

### Requirement: Successful turn advances the transcript cursor

After a successful `/codex chat <prompt>` or `/codex new <prompt>` delivery, the bridge SHALL persist the latest visible message id in the thread as the next transcript sync cursor for that Thread Binding.

#### Scenario: Cursor advances after successful delivery

- **WHEN** the bridge finishes delivering a successful assistant reply in a bound thread
- **THEN** the Thread Binding stores the latest visible thread message id as its next sync cursor

##### Example: cursor moves to latest bot reply

- **GIVEN** thread `thread-123` finishes a successful `/codex chat` turn and the latest visible message id in the thread is `message-9`
- **WHEN** the bridge persists the updated Thread Binding after delivery
- **THEN** the binding stores `message-9` as its `lastReadMessageId`
