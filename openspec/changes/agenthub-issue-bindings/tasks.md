# Tasks

- [x] Capture product decision and MVP design.
- [x] Add IssueBinding type and JSON loader.
- [x] Add `--issues-file <path>` to `agentbridge tui` and `agentbridge workflow`.
- [x] Auto-discover project `.agenthub/issues.json` when `--issues-file` is omitted.
- [x] Project tracked issues into Work Items from IssueBinding records.
- [x] Stop synthesizing commit tickets when issue bindings are present.
- [x] Link issue bindings to local worktrees by branch.
- [x] Add TUI `w` action to create a worktree from a selected tracked issue.
- [x] Persist the created branch back into the issue binding file.
- [x] Add CLI/TUI issue creation through GitHub CLI.
- [x] Append created GitHub issues into the issue binding file.
- [x] Link persisted agents to issue work items through their worktree.
- [x] Rename interactive issue-backed task list to `Tracked Issues`.
- [x] Add example issue binding fixture.
- [x] Add tests for issue projection, branch/worktree linking, and TUI output.
- [x] Run targeted tests.
- [x] Run `bun run check`.
- [x] Run `bun run test`.
