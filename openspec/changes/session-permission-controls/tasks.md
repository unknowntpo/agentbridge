## 1. Spec

- [x] 1.1 Define the unified AgentBridge permission model and trusted workspace catalog.
- [x] 1.2 Define the explicit permission decision table and provider capability table.
- [x] 1.3 Define the local approval queue UX for high-risk Discord session creation.

## 2. Implementation

- [x] 2.1 Introduce centralized permission-policy modules instead of scattered conditional logic.
- [x] 2.2 Persist workspace and permission profile into thread bindings.
- [x] 2.3 Add pending approval storage and local approvals commands.
- [x] 2.4 Extend Discord `/new` flows to collect workspace and permission profile, then route through the policy table.
- [x] 2.5 Update provider adapters to map unified permission profiles into provider-specific runtime settings.

## 3. Verification

- [x] 3.1 Add tests for the decision table, provider capability table, and pending approval queue.
- [x] 3.2 Add end-to-end Discord/local CLI tests for allow vs queued approval flows.
- [x] 3.3 Run `bun run test`, `bun run check`, and `spectra validate "session-permission-controls"`.
