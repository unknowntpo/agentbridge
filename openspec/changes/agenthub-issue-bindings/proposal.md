# AgentHub Issue Bindings

## Why

AgentHub currently has a confusing real-project projection: when no workflow YAML exists, Git commits are rendered as `ticket commit-... [done]` work items. That makes the TUI imply that commits are issues and that every commit is completed work. This is wrong for the product model.

AgentHub should treat Git commits as repository truth and issues as work intent. A work item should come from an explicit issue binding, not from commit history.

## What

- Add a local IssueBinding input path for fast product validation before introducing a GitHub bot or webhook service.
- Let `agentbridge tui --project <path> --issues-file <file>` and `agentbridge workflow --project <path> --issues-file <file>` render tracked issues as Work Items.
- Link issue bindings to local worktrees by branch name first.
- Keep commits in the Commit View only; do not synthesize fake ticket work items from commits when issue bindings are present.
- Document the future GitHub path as an adapter over the same IssueBinding model, not as a separate product concept.

## Non-goals

- Do not implement the GitHub bot/webhook in this change.
- Do not fetch every GitHub issue by default.
- Do not make local YAML/JSON the long-term source of truth for remote issues.
- Do not remove the existing workflow YAML prototype.

