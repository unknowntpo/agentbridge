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

### Requirement: Delivery failure surfaces to reply target

If Discord delivery fails after assistant output is prepared, the bridge SHALL record the delivery failure in the Thread Binding state and SHALL post or log an actionable error message for the operator and thread user when possible.

#### Scenario: Discord post failure is surfaced

- **WHEN** Discord rejects a reply during delivery
- **THEN** the bridge marks the turn as failed and surfaces a delivery failure message instead of silently dropping the output

##### Example: permission error during post

- **GIVEN** the reply target thread exists but Discord rejects the post with a permission error
- **WHEN** the bridge attempts to send the prepared assistant output
- **THEN** the bridge records delivery failure state and surfaces an actionable delivery error
