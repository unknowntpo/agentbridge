## MODIFIED Requirements

### Requirement: Slash new starts a bound app-server thread in a new Discord thread

The bridge SHALL create a new Discord thread and a new AgentBridge-managed Codex app-server thread when a user invokes `/codex new <prompt>` from a non-thread channel. The new Discord thread binding SHALL persist the created app-server `thread.id`.

#### Scenario: Channel new command creates app-server-backed thread binding

- **WHEN** a non-thread Discord channel receives `/codex new <prompt>`
- **THEN** the bridge creates a new Discord thread, starts a fresh app-server thread, persists that `thread.id`, and starts the first turn there

##### Example: new Discord thread bound to app-server thread

- **GIVEN** channel `channel-123` is not a thread
- **WHEN** the user sends `/codex new summarize this repo`
- **THEN** the bridge creates a Discord thread, records a binding to a fresh app-server `thread.id`, and starts the first turn with `summarize this repo`
