# AgentHub Issue Bindings

## ADDED Requirements

### Requirement: Issue bindings define tracked work

AgentHub SHALL represent tracked work items from explicit issue bindings rather than synthesizing issues from Git commits.

#### Scenario: User previews tracked issues from a local fixture

- **WHEN** the user runs `agentbridge tui --project <path> --issues-file <file> --print`
- **THEN** AgentBridge loads issue bindings from the file
- **AND** renders those issue bindings as work items.

#### Scenario: User previews tracked issues from the project default file

- **GIVEN** the project root contains `.agenthub/issues.json`
- **WHEN** the user runs `agentbridge tui --project <path>` without `--issues-file`
- **THEN** AgentBridge loads issue bindings from `.agenthub/issues.json`
- **AND** renders those issue bindings as tracked issues.

#### Scenario: Commits remain separate from issues

- **GIVEN** a project has Git commit history
- **AND** issue bindings are provided
- **WHEN** AgentBridge renders the task-tree view
- **THEN** commits are not rendered as `ticket commit-...` work items
- **AND** commits remain available from the commits view.

#### Scenario: TUI names the issue-backed work list clearly

- **GIVEN** issue bindings are rendered in the interactive TUI
- **WHEN** the task-tree view is visible
- **THEN** the list title says `Tracked Issues` instead of the generic `Work Items`.

#### Scenario: Issue bindings link to local worktrees

- **GIVEN** an issue binding declares a branch
- **AND** the scanned project has a worktree checked out on that branch
- **WHEN** AgentBridge derives the workflow view model
- **THEN** the issue work item links to that worktree.

#### Scenario: Agent sessions attach to issue work items through worktrees

- **GIVEN** an issue binding is linked to a worktree
- **AND** AgentBridge has a persisted agent session binding for that worktree path
- **WHEN** AgentBridge renders task, dependency, ready, or agents views
- **THEN** the agent appears on the issue work item rather than on a synthetic commit ticket.

### Requirement: Remote issue sync is an adapter over IssueBinding

AgentHub SHALL treat GitHub or other remote issue tracker integration as a producer of IssueBinding records.

#### Scenario: GitHub bot design is deferred

- **WHEN** AgentBridge adds local issue binding support
- **THEN** it does not require a GitHub bot, webhook, or Cloudflare Worker
- **AND** the later GitHub integration can reuse the same projection path.
