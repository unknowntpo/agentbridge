# AgentHub Backend CLI

## ADDED Requirements

### Requirement: Project commands expose a stable JSON contract

AgentBridge SHALL expose project commands that return machine-readable JSON when `--json` is provided.

#### Scenario: User lists AgentHub projects

- **WHEN** the user runs `agentbridge project list --json`
- **THEN** the command returns a JSON array of allowed projects
- **AND** each project includes `id`, `label`, and `path`.

#### Scenario: User scans a project

- **WHEN** the user runs `agentbridge project scan --path <path> --json`
- **THEN** the command returns a project scan object
- **AND** the scan includes the project root, anchor worktree, and worktree list.

### Requirement: Project create follows the plain worktree layout

AgentBridge SHALL create new projects using a plain container directory with `main/` as the anchor checkout.

#### Scenario: User creates a project from a Git repository

- **WHEN** the user runs `agentbridge project create <plain-dir> --repo <repo-url> --branch <branch> --json`
- **THEN** AgentBridge clones the repository into `<plain-dir>/main`
- **AND** refuses to overwrite an existing non-empty target
- **AND** returns a structured command outcome.

### Requirement: Worktree commands follow sibling layout

AgentBridge SHALL create additional worktrees as siblings of `main/` under the same plain project container.

#### Scenario: User creates a worktree

- **WHEN** the user runs `agentbridge worktree create <slug> --project <plain-dir> --branch <branch> --base <ref> --json`
- **THEN** AgentBridge creates `<plain-dir>/<slug>`
- **AND** the new worktree is attached to the requested branch and base ref
- **AND** the command returns a structured command outcome.

### Requirement: Git execution is centralized and safe

AgentBridge SHALL route Git process usage through one controlled runner.

#### Scenario: Handler executes Git

- **WHEN** a handler needs to run Git
- **THEN** it uses the shared Git runner
- **AND** the runner captures stdout, stderr, exit code, elapsed time, and timeout state
- **AND** handlers receive structured errors instead of shell-specific failures.

### Requirement: Long-running operations are UI-safe

AgentHub backend handlers SHALL be asynchronous and suitable for frontend invocation without blocking renderer execution.

#### Scenario: Frontend invokes a long-running operation

- **WHEN** the frontend starts a clone, worktree create, push, or PR operation
- **THEN** the frontend can await a Promise or later bind to an operation tracker
- **AND** rendering is not coupled to synchronous frontend work.
