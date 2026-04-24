## MODIFIED Requirements

### Requirement: State store persists Discord bindings to app-server threads

The bridge SHALL persist each Discord thread binding with the Discord thread identifier, the managed Codex app-server `thread.id`, lifecycle state, timestamps, failure metadata, and Discord transcript sync cursor in the local SQLite state store.

#### Scenario: App-server-backed binding survives restart

- **WHEN** the bridge restarts after persisting a bound idle Discord thread binding
- **THEN** the persisted binding still identifies the same managed app-server thread for later `/codex chat` continuation

##### Example: sqlite-backed app-server thread binding

- **GIVEN** SQLite stores Discord thread `thread-123`, app-server thread `thr-7`, and state `bound_idle`
- **WHEN** the bridge process restarts and reopens the same database
- **THEN** the bridge can continue using app-server thread `thr-7` for `thread-123`
