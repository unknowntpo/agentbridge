## MODIFIED Requirements

### Requirement: Stable local CLI commands are the primary AgentBridge entry

AgentBridge SHALL provide stable local CLI commands, including `agentbridge session new`, `agentbridge session attach`, and `agentbridge session list`, as the primary local entry for connecting current work into the AgentBridge-managed control plane.

#### Scenario: Local CLI command works without custom prompt discovery

- **WHEN** a user runs `agentbridge session attach` from a local terminal in a repository
- **THEN** AgentBridge performs the attach flow without requiring Codex custom prompt discovery

##### Example: attach from shell

- **GIVEN** Codex custom prompts are not visible in the local CLI slash menu
- **WHEN** the user runs `agentbridge session attach`
- **THEN** AgentBridge still connects the current workstream into the managed app-server flow

#### Scenario: Local CLI can enumerate attachable sessions

- **WHEN** a user runs `agentbridge session list`
- **THEN** AgentBridge prints attachable unmanaged local Codex sessions without requiring the daemon process lock

#### Scenario: Local CLI can start a fresh managed session directly

- **WHEN** a user runs `agentbridge session new --prompt "<text>"`
- **THEN** AgentBridge creates a fresh app-server thread, creates a Discord thread, and persists the binding without requiring an existing unmanaged local rollout

#### Scenario: Local CLI opens the managed thread after creation by default

- **WHEN** a user runs `agentbridge session new --prompt "<text>"`
- **THEN** AgentBridge launches a local interactive Codex CLI connected to the same managed app-server thread unless `--no-open` is specified

#### Scenario: Local CLI can reopen an existing managed session

- **WHEN** a user runs `agentbridge session open --latest`
- **THEN** AgentBridge opens the most recently updated managed app-server thread in a local interactive Codex CLI

### Requirement: Optional /agentbridge prompt delegates to the stable CLI command

The local `~/.codex/prompts/agentbridge.md` prompt MAY be installed as convenience sugar, but it SHALL delegate to the stable `agentbridge session attach` command instead of being the only supported entry point.

#### Scenario: Prompt acts as wrapper

- **WHEN** a local Codex installation exposes `/agentbridge` from `~/.codex/prompts/agentbridge.md`
- **THEN** invoking that prompt shells out to `agentbridge session attach`

### Requirement: Local attach bootstraps context into a managed app-server thread

`agentbridge session attach` SHALL bootstrap an AgentBridge-managed app-server thread using visible chat discovered from the latest unmanaged local Codex session for the current working directory.

#### Scenario: Local visible chat seeds the managed thread

- **WHEN** the user runs `agentbridge session attach` from a repository with an existing unmanaged local Codex session
- **THEN** AgentBridge discovers the latest visible user and assistant chat for that cwd and uses it to seed or update the managed app-server thread

##### Example: bootstrap from local session summary

- **GIVEN** the latest local Codex session for cwd `/repo/x` contains visible user and assistant chat
- **WHEN** `agentbridge session attach` runs in `/repo/x`
- **THEN** AgentBridge builds bootstrap context from that visible chat and applies it to an AgentBridge-managed app-server thread for `/repo/x`
