# Design

## Shape

The prototype has three layers:

```text
agenthub.yml
    |
    v
workflowConfig.ts       parse + validate + normalize references
    |
    v
workflowTree.ts         pure printable tree for tests and CLI review
    |
    v
WorkflowTui.tsx         Ink interactive renderer
```

The parser is the source of truth. Both `--print` and Ink consume the same derived view model.

## YAML Model

The YAML file is intentionally project-management-first:

```yaml
version: 1
projects:
  - id: minishop
    name: MiniShop Demo
    repo:
      provider: github
      owner: unknowntpo
      name: minishop
    work_items:
      - id: epic-checkout
        type: epic
        title: Checkout reliability
        status: in_progress
        children: [gh-120, gh-121]
      - id: gh-120
        type: issue
        title: Fix checkout timeout
        status: todo
        branch: agent/gh-120-checkout-timeout
    worktrees:
      - id: wt-gh-121
        name: checkout-retry
        branch: agent/gh-121-checkout-retry
        work_item: gh-121
    agents:
      - id: codex-gh-121
        provider: codex
        mode: write
        worktree: wt-gh-121
        work_item: gh-121
    pull_requests:
      - id: pr-44
        work_item: gh-121
        status: open
```

## CLI Contract

`agentbridge tui --file <path> --print` prints a deterministic ASCII tree and exits. This is the TDD surface and avoids raw terminal interaction in CI.

`agentbridge tui --file <path>` starts the Ink prototype when stdin/stdout are TTYs. In non-TTY environments it automatically falls back to the printable tree.

## Isolation

This change reads one YAML file and writes only stdout. It does not call Git, GitHub, AgentBridge daemon APIs, provider CLIs, or the Tauri frontend.

## Future Path

If the workflow model is useful, the parser can become a backend domain module, and the Ink renderer can be deleted. The Tauri app and CLI can then consume the same domain view model through the daemon.
