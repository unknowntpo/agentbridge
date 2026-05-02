# GitHub Project Agent Workflow

## Why

AgentHub is pivoting from a local TUI-first workflow to a GitHub Project-first workflow. Users should operate the Kanban board in GitHub Web UI, while AgentBridge works as the local backend that reconciles GitHub issue/project state with local worktrees and Codex sessions.

## What

- Add a repo-local `.agentbridge/project.yml` contract for GitHub Project sync.
- Add `agentbridge github sync` for one-shot reconciliation.
- Add `agentbridge github daemon` for polling reconciliation.
- Treat GitHub Issue as the work item, GitHub Project Status as the Kanban column, and `agentbridge` label as the explicit deploy trigger.
- Deploy Codex with `workspace-write` only when an issue is open, in `In Progress`, has the deploy label, and has no existing AgentBridge binding.
- Create deterministic branch/worktree names: `agent/<issue-number>-<slug>`.
- Comment back to the GitHub issue with a local handoff command after deploy.
- Return to GitHub at PR milestones: open PR moves the item to Review; merged PR or closed issue moves it to Done.

## Non-goals

- No Probot/webhook in Phase 1.
- No GitHub issue comment chat in Phase 1.
- No multi-provider selection in Phase 1, though config keeps provider/profile extension points.
- No automatic agent kill when label is removed.
- No full-access automatic deploy.

