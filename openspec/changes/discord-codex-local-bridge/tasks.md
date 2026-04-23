## 1. State and recovery foundation

- [x] 1.1 Implement Discord Thread Binding persistence so State store persists thread binding with thread id, Codex session id, lifecycle state, timestamps, and failure metadata.
- [x] 1.2 Implement Recovery and Startup Reconciliation so Recovery reconciles persisted bindings on startup and restores or marks uncertain bindings correctly.

## 2. Session routing and Codex execution

- [x] 2.1 Implement Activation message starts bound session and Bridge command starts session behavior in the Session Router for unbound threads, covering the New Session Flow.
- [x] 2.2 Implement Codex Exec Adapter support so Bound thread resumes Codex session through `codex exec --json` and `codex exec resume ... --json`, covering the Continued Session Flow.
- [x] 2.3 Implement Command and Concurrency Model enforcement so Busy thread rejects overlapping turn instead of starting a second execution.

## 3. Lifecycle commands and reply delivery

- [x] 3.1 Implement Lifecycle commands manage thread binding for `/codex status`, `/codex reset`, and `/codex stop`, covering the Reset and Stop Flow.
- [x] 3.2 Implement Reply Delivery Pipeline formatting so Reply delivery chunks assistant output to the same Discord reply target.
- [x] 3.3 Implement Reply Delivery Pipeline failure handling so Delivery failure surfaces to reply target and updates binding failure state.

## 4. Verification and examples

- [x] 4.1 Add tests that cover Activation message starts bound session, Bound thread resumes Codex session, Lifecycle commands manage thread binding, and Reply delivery chunks assistant output examples.
- [x] 4.2 Add tests that cover Recovery reconciles persisted bindings and Delivery failure surfaces to reply target during restart and Discord error scenarios, covering the Failure and Recovery Flow.
