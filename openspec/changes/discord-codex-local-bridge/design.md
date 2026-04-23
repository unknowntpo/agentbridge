## Context

AgentBridge will bridge Discord conversations into a locally running Codex instance on macOS. The bridge needs a precise domain model because it spans Discord message delivery, local process execution, persistent state, and restart recovery. The repository currently has no existing implementation, so the design should establish the canonical ubiquitous language before any code lands.

The agreed routing model is one Discord thread to one Codex session. Activation can happen either from a `discord ...` activation message or an explicit `/codex ...` bridge command. The MVP SHALL use `codex exec --json` and `codex exec resume ... --json` instead of trying to automate the interactive Codex TUI.

## Goals / Non-Goals

**Goals:**

- Define the bridge around a durable Thread Binding between a Discord thread and a Codex session.
- Keep Codex integration machine-readable by using JSON event output instead of PTY scraping.
- Support session start, session continuation, lifecycle commands, reply delivery, and restart recovery.
- Keep the bridge extensible so a future adapter can replace `codex exec --json` with `codex app-server` without changing the Discord-facing behavior.
- Make the domain terms explicit so proposal, specs, tasks, and implementation use the same vocabulary.

**Non-Goals:**

- Supporting multiple hosts or a remote Codex deployment in the MVP.
- Automating the full-screen interactive Codex TUI.
- Supporting every Discord surface in the MVP; the primary routing unit is a Discord thread.
- Designing the full production observability stack beyond basic structured logging and persisted recovery state.

## Decisions

### Discord Thread Binding

The bridge will use a `Thread Binding` as the primary routing record. One Discord thread maps to at most one active Codex session, and every user turn resolves through that binding before execution.

Rationale:
- Threads give a stable reply target and clear conversation boundary.
- The model keeps Discord identity separate from Codex session identity.
- Recovery can rebuild bridge state by reloading bindings from local storage.

Alternatives considered:
- Channel-level routing was rejected for MVP because it makes concurrent sessions ambiguous.
- One session per Discord user was rejected because a single user can legitimately need multiple parallel conversations.

### Codex Exec Adapter

The MVP Codex adapter will start and resume sessions through `codex exec --json` and `codex exec resume ... --json`. The adapter will normalize Codex JSONL events into bridge-level events such as `TurnExecutionStarted`, `CodexEventReceived`, `AssistantOutputUpdated`, and `TurnExecutionCompleted`.

Rationale:
- JSON event output is easier to parse and validate than PTY escape sequences.
- Resume semantics preserve session continuity without requiring a long-lived interactive terminal.
- The adapter boundary makes it possible to swap in `codex app-server` later.

Alternatives considered:
- Driving the interactive Codex TUI through a PTY was rejected because the output is fragile and not designed for automation.
- Stateless `codex exec` without resume was rejected because it loses conversation continuity.
- `codex app-server` was deferred because it is experimental and unnecessary for MVP.

### Reply Delivery Pipeline

The bridge will treat Discord as the system of record for visible conversation output. The `Reply Formatter` will gather the final assistant output for a turn, chunk it to fit Discord limits, and publish chunks back to the same reply target thread. Delivery failures will be surfaced as explicit bridge-generated error messages.

Rationale:
- Users need predictable, thread-local responses.
- Chunking and formatting belong in one component so Discord constraints do not leak into routing logic.
- Explicit failure messages make delivery issues visible instead of silent.

Alternatives considered:
- Streaming every raw Codex event directly to Discord was rejected because it would be noisy and rate-limit prone.
- Posting replies to a separate logging channel was rejected because it breaks conversational continuity.

### Command and Concurrency Model

Bridge commands such as `/codex new`, `/codex status`, `/codex reset`, and `/codex stop` will be interpreted before normal routing. A `Concurrency Guard` will enforce that only one active turn can execute for a given thread binding at a time.

Rationale:
- Commands need different behavior from normal user turns.
- Rejecting overlapping turns avoids state corruption and confusing reply interleaving.
- The separation keeps session lifecycle logic explicit and testable.

Alternatives considered:
- Queuing unlimited turns per thread was rejected for MVP because it complicates user expectations and recovery.
- Reusing activation-message parsing for lifecycle commands was rejected because explicit commands are clearer and easier to document.

### Recovery and Startup Reconciliation

The bridge will persist thread bindings, execution status, timestamps, and last-known failure metadata in a local SQLite `State Store` with WAL mode enabled. On startup, a recovery pass will mark incomplete executions as failed or resumable, depending on what state can be trusted, and restore idle bindings for continued use.

Rationale:
- A local bridge must tolerate restarts without forgetting active thread/session relationships.
- Recovery should favor explicit degraded states over silently assuming success.
- Persisted metadata makes it possible to explain why a binding was recovered or marked failed.
- SQLite with WAL mode supports durable local writes and concurrent reads during bridge activity without requiring an external service.

Alternatives considered:
- Keeping bindings only in memory was rejected because restarts would destroy continuity.
- Automatically retrying every interrupted turn on startup was rejected because it can duplicate side effects and surprise the operator.
- Plain JSON files were rejected because crash recovery and concurrent access are too fragile for an active bridge.

## Architecture

The bridge is composed of five core components plus the external Discord and Codex systems.

- `Discord Adapter`: receives inbound Discord messages and posts replies.
- `Session Router`: resolves whether an inbound message starts, resumes, resets, or stops a thread binding.
- `Codex Adapter`: executes Codex turns and emits normalized bridge events.
- `State Store`: persists bindings and recovery metadata.
- `Reply Formatter`: creates Discord-safe output and chunks long responses.
- `Concurrency Guard`: prevents overlapping turn execution per thread binding.

## ASCII Architecture Diagram

```text
+--------------+        +-------------------+
| Discord User | -----> |      Discord      |
+--------------+        +-------------------+
                               |
                               v
                     +----------------------+
                     |      AgentBridge     |
                     |----------------------|
                     |  Discord Adapter     |
                     |  Session Router      |
                     |  Reply Formatter     |
                     |  Concurrency Guard   |
                     +----------+-----------+
                                |
                +---------------+----------------+
                |                                |
                v                                v
      +-------------------+            +-------------------+
      |    State Store    |            |   Codex Adapter   |
      | thread bindings   |            | start/resume turn |
      | status/recovery   |            | parse JSON events |
      +-------------------+            +---------+---------+
                                                 |
                                                 v
                                      +----------------------+
                                      |   Local Codex CLI    |
                                      |   session/process    |
                                      +----------------------+
```

## Sequence Flows

### New Session Flow

1. Discord sends an activation message or bridge command into a thread.
2. `Discord Adapter` emits `DiscordMessageReceived` to `Session Router`.
3. `Session Router` creates a new Thread Binding and asks `Codex Adapter` to start a session.
4. `Codex Adapter` runs `codex exec --json` and streams normalized events.
5. `Reply Formatter` builds the final assistant output and sends it back through `Discord Adapter`.
6. `State Store` records the bound idle state once delivery completes.

### Continued Session Flow

1. A later user turn arrives in a bound thread.
2. `Session Router` resolves the existing binding.
3. `Codex Adapter` resumes the session with `codex exec resume ... --json`.
4. `Reply Formatter` publishes the assistant output to the same reply target.

### Reset and Stop Flow

1. A bridge command arrives.
2. `Session Router` interprets the command before normal activation handling.
3. `State Store` updates the binding state.
4. `Discord Adapter` posts a confirmation message to the thread.

### Failure and Recovery Flow

1. If Codex execution or Discord delivery fails, the binding moves to a failed state with error metadata.
2. On startup, recovery reloads stored bindings.
3. Incomplete executions are marked failed or resumable.
4. Idle bindings are restored so later turns can continue the mapped Codex session.

## State Model

A Thread Binding moves through these states:

- `Unbound`: no Codex session exists for the thread.
- `Starting`: the bridge is creating the first Codex session.
- `BoundIdle`: the session exists and is ready for another user turn.
- `Executing`: a user turn is currently running.
- `Delivering`: assistant output is being posted back to Discord.
- `Failed`: the most recent operation failed, but the binding still exists.
- `Stopped`: the binding was intentionally ended or reset.

Valid transitions:
- `Unbound -> Starting -> BoundIdle`
- `BoundIdle -> Executing -> Delivering -> BoundIdle`
- `Executing -> Failed`
- `Delivering -> Failed`
- `BoundIdle -> Stopped`
- `Failed -> Starting` for reset or `Failed -> Executing` for explicit retry/resume

## Risks / Trade-offs

- [Codex event schema drift] -> Mitigation: normalize Codex JSON behind the adapter and keep parsing defensive.
- [Discord length and rate limits] -> Mitigation: centralize chunking and avoid posting raw event noise.
- [Thread-only routing limits some entry points] -> Mitigation: treat thread routing as the MVP boundary and keep the router extensible for channels or DMs later.
- [Persisted recovery state can become stale] -> Mitigation: store timestamps and last-known status, then mark uncertain bindings failed instead of pretending they are healthy.
- [Single-turn concurrency can feel restrictive] -> Mitigation: return a clear busy-session response and consider queued turns in a future change if needed.

## Migration Plan

1. Create the bridge skeleton and local configuration handling.
2. Implement the thread binding store and recovery metadata model.
3. Implement the Codex exec adapter and normalized event pipeline.
4. Implement Discord routing, command handling, and reply delivery.
5. Verify restart recovery locally before expanding the feature set.

Rollback strategy:
- Disable the bridge process and keep Discord traffic unmanaged.
- Clear or archive local bindings if the persisted state format changes incompatibly.

## Open Questions

- Whether MVP should support direct messages in addition to thread routing remains open for a future change.
- Whether partial assistant output should be streamed incrementally or only posted after turn completion remains open for implementation tuning.
- Whether the bridge should expose operator-facing admin commands beyond `/codex status` remains open.
