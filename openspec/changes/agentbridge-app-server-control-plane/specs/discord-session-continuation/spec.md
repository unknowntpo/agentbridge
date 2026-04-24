## MODIFIED Requirements

### Requirement: Bound thread resumes an app-server thread through slash chat

The bridge SHALL route `/codex chat <prompt>` in a bound Discord thread to the AgentBridge-managed app-server thread referenced by the current binding. Continuation SHALL resume the persisted app-server `thread.id` instead of creating a new unmanaged local Codex session.

#### Scenario: Chat command resumes existing app-server thread

- **WHEN** a bound Discord thread receives `/codex chat <prompt>`
- **THEN** the bridge resumes the mapped app-server thread and starts a new turn on that thread

##### Example: persisted app-server continuation

- **GIVEN** thread `thread-123` is bound to app-server thread `thr-7`
- **WHEN** the user sends `/codex chat continue with the bridge design`
- **THEN** the bridge resumes app-server thread `thr-7` for that turn
