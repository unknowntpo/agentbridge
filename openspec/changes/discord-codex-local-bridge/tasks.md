## 1. State and recovery foundation

- [x] 1.1 Implement Discord Thread Binding persistence so State store persists thread binding with thread id, Codex session id, lifecycle state, timestamps, and failure metadata.
- [x] 1.2 Implement Recovery and Startup Reconciliation so Recovery reconciles persisted bindings on startup and restores or marks uncertain bindings correctly.

## 2. Session routing and Codex execution

- [x] 2.1 Implement the New Session Flow plus the `Slash new starts bound session in a new thread` and `Slash new inside a thread is ignored` requirements so `/codex new <prompt>` from a non-thread channel creates a new thread and starts a bound session there, while `/codex new` inside a thread is ignored.
- [x] 2.2 Implement the Continued Session Flow and restore the Codex Exec Adapter behavior plus the `Bound thread resumes Codex session through slash chat`, `Chat command outside a bound thread is rejected`, `Plain thread messages do not resume Codex`, and `Slash chat syncs unseen visible thread transcript` requirements through `codex exec resume ... --json` for `/codex chat <prompt>` inside a bound thread, while continuing to ignore plain later thread messages.
- [x] 2.3 Implement Command and Concurrency Model enforcement so Busy thread rejects overlapping turn instead of starting a second execution.

## 3. Reply delivery

- [x] 3.1 Restore `/codex chat` command registration and route it only inside threads created by `/codex new`, rejecting `/codex chat` in unbound threads and outside threads.
- [x] 3.2 Keep `Reply delivery chunks assistant output` and `Bridge echoes quoted user prompt before assistant reply` behavior for `/codex new`, restore the `Chat replies begin by tagging the requesting user` requirement for `/codex chat`, and implement the `Successful turn advances the transcript cursor` requirement by persisting the latest visible message id after successful delivery.
- [x] 3.3 Implement Reply Delivery Pipeline failure handling so Delivery failure surfaces to reply target and updates binding failure state.

## 4. Verification and examples

- [x] 4.1 Update tests to cover `/codex new` thread creation, `/codex new` ignore-in-thread behavior, `/codex chat` continuation in a bound thread, `/codex chat` rejection outside a bound thread, transcript cursor persistence, unseen visible transcript sync, quoted prompt echo, tagged chat reply formatting, chunked assistant output, and continued ignoring of plain thread follow-up messages.
- [x] 4.2 Add tests that cover Recovery reconciles persisted bindings and Delivery failure surfaces to reply target during restart and Discord error scenarios, covering the Failure and Recovery Flow.
