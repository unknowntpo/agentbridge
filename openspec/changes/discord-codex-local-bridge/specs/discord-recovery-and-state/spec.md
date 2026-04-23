## ADDED Requirements

### Requirement: State store persists thread binding

The bridge SHALL persist each Thread Binding with its Discord thread identifier, Codex session identifier, lifecycle state, timestamps, and last-known failure metadata in a local SQLite State Store. The SQLite State Store SHALL enable WAL mode before normal bridge operation so persisted state remains durable and readable during concurrent bridge activity. Persisted state SHALL survive bridge process restarts.

#### Scenario: Binding survives restart

- **WHEN** the bridge restarts after persisting a bound idle Thread Binding
- **THEN** the persisted binding remains available for later session continuation

##### Example: sqlite-backed idle binding

- **GIVEN** SQLite stores thread `thread-123`, session `session-7`, and state `bound_idle`
- **WHEN** the bridge process restarts and reopens the same database
- **THEN** the bridge can continue using the persisted binding for `thread-123`

#### Scenario: SQLite WAL mode is enabled

- **WHEN** the bridge initializes the SQLite State Store
- **THEN** the bridge enables WAL journal mode before executing normal persistence operations

##### Example: journal mode check

- **GIVEN** a new SQLite database file for AgentBridge state
- **WHEN** the State Store finishes initialization
- **THEN** `PRAGMA journal_mode` returns `wal`

### Requirement: Recovery reconciles persisted bindings

On startup, the bridge SHALL load persisted Thread Bindings and reconcile them into recovered runtime state. Bindings that were idle before shutdown SHALL become available for continuation, while bindings that were mid-execution or mid-delivery SHALL be marked failed or resumable according to the persisted status.

#### Scenario: Idle binding is recovered

- **WHEN** startup recovery loads a persisted idle Thread Binding
- **THEN** the bridge restores the binding for continued turns in the same thread

##### Example: recovered idle record

- **GIVEN** SQLite stores thread `thread-123`, session `session-7`, and state `bound_idle`
- **WHEN** startup recovery reads the persisted binding
- **THEN** the runtime binding for `thread-123` is restored as idle

#### Scenario: Interrupted binding is marked uncertain

- **WHEN** startup recovery loads a persisted Thread Binding that was executing when the bridge stopped
- **THEN** the bridge marks that binding failed or resumable instead of assuming the turn completed successfully

##### Example: interrupted execution record

- **GIVEN** SQLite stores thread `thread-999`, session `session-22`, and state `executing`
- **WHEN** startup recovery reads the persisted binding after an unclean shutdown
- **THEN** the runtime binding for `thread-999` is marked failed or resumable instead of bound idle
