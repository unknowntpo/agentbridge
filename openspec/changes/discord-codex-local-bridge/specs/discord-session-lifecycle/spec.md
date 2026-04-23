## ADDED Requirements

### Requirement: Lifecycle commands manage thread binding

The bridge SHALL interpret lifecycle bridge commands before normal user turn routing. The bridge SHALL support `/codex status`, `/codex reset`, and `/codex stop` for the current Discord thread.

#### Scenario: Status reports current binding

- **WHEN** a bound thread receives `/codex status`
- **THEN** the bridge replies with the current Thread Binding status for that thread

#### Scenario: Reset replaces existing binding

- **WHEN** a bound thread receives `/codex reset`
- **THEN** the bridge ends the existing Thread Binding and starts a fresh Codex session for the same thread

#### Scenario: Stop clears binding

- **WHEN** a bound thread receives `/codex stop`
- **THEN** the bridge removes or marks stopped the Thread Binding and confirms that later turns require re-activation
