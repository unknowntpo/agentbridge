## ADDED Requirements

### Requirement: Reply delivery chunks assistant output

The bridge SHALL publish assistant output back to the same reply target that originated the user turn. If the assistant output exceeds Discord message limits, the bridge SHALL split it into multiple ordered chunks.

#### Scenario: Long reply is chunked in order

- **WHEN** the assistant output for a turn exceeds a single Discord message limit
- **THEN** the bridge posts multiple ordered reply chunks to the same thread

##### Example: oversized reply

- **GIVEN** assistant output length is greater than one Discord message limit
- **WHEN** the bridge formats the reply
- **THEN** the bridge posts chunk 1 before chunk 2 in the same thread

### Requirement: Bridge echoes quoted user prompt before assistant reply

Before posting assistant output for `/codex new <prompt>` or `/codex chat <prompt>`, the bridge SHALL post the user prompt in the thread as a Markdown quote block using `>`.

#### Scenario: Prompt is echoed as quote

- **WHEN** the bridge handles a slash command prompt
- **THEN** the thread receives a quoted copy of the user prompt before the assistant reply

##### Example: quoted thread prompt

- **GIVEN** the user prompt is `what commands exist now?`
- **WHEN** the bridge prepares the visible thread messages
- **THEN** the bridge posts a message containing `> what commands exist now?` before the assistant output

### Requirement: Delivery failure surfaces to reply target

If Discord delivery fails after assistant output is prepared, the bridge SHALL record the delivery failure in the Thread Binding state and SHALL post or log an actionable error message for the operator and thread user when possible.

#### Scenario: Discord post failure is surfaced

- **WHEN** Discord rejects a reply during delivery
- **THEN** the bridge marks the turn as failed and surfaces a delivery failure message instead of silently dropping the output

##### Example: permission error during post

- **GIVEN** the reply target thread exists but Discord rejects the post with a permission error
- **WHEN** the bridge attempts to send the prepared assistant output
- **THEN** the bridge records delivery failure state and surfaces an actionable delivery error

### Requirement: Chat replies begin by tagging the requesting user

For `/codex chat <prompt>` replies, the first visible thread message for that turn SHALL begin with a mention of the requesting user before the quoted prompt.

#### Scenario: Chat turn mentions requester

- **WHEN** a bound thread receives `/codex chat <prompt>`
- **THEN** the bridge posts the requesting user mention before the quoted prompt for that turn
