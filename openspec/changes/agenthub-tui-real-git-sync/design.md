# TUI Lifecycle Capability Check

## Current Verdict

The current TUI can open a real project snapshot, switch projections, scroll long views, auto-refresh when project files or Git metadata change, deploy a Codex write agent from an available worktree, and show a copyable handoff command. It still cannot directly create projects, create worktrees, or chat with agents from inside the TUI.

Those lifecycle operations exist today as AgentBridge CLI/service paths:

- `project create`: implemented by the project command handler.
- `worktree create`: implemented by the worktree command handler.
- `agent deploy`: implemented by the agent command handler and exposed through the TUI `d` action.
- `session open` / `session attach`: implemented as CLI handoff paths. TUI deploy now prints a `session open` command; embedded chat is still out of scope.

## Required TUI Actions

The TUI should add an action mode instead of a static `lifecycle` view:

```text
Project TUI
  ├─ open/create project action
  ├─ selected commit/ref
  │    └─ create worktree action
  ├─ selected worktree
  │    └─ deploy agent action -> handoff command
  └─ selected agent
       ├─ open chat/session action (future)
       └─ copy attach command fallback (current handoff pattern)
```

## Refresh Model

Manual refresh is not a product action. Interactive `--project` TUI sessions subscribe to filesystem changes and reload the project model after a short debounce. `fs.watch` is the fast path, but Bun/runtime/filesystem combinations can miss events, so AgentHub also keeps a low-frequency polling fallback.

```text
repo/.git or files change
        │
  fs.watch fast path
        │
        ├─────────────┐
        │             │
        ▼             ▼
 debounce reload   polling fallback
        │
  debounced scanProject()
        │
 deriveWorkflowViewModelFromProjectScan()
        │
      Ink state update
```

## Implementation Plan

1. Add a TUI action palette with keyboard entry, selected entity context, and cancellable forms.
2. Reuse existing service functions instead of shelling out to CLI subprocesses.
3. Add a project create/open action that persists or accepts an allowlisted project path.
4. Add a worktree create action scoped to the selected commit/ref.
5. Add an agent deploy action scoped to the selected worktree with provider and permission profile fields. Initial version uses Codex/write/workspace-write defaults.
6. Add session open handoff for deployed agents, with copyable terminal command as fallback before embedded chat exists.
7. Keep auto-sync as the only refresh path and reload after each successful mutation.
8. Tune polling fallback to avoid turning large repositories into constant full scans.

## Test Plan

- Unit: action reducer/form validation for project/worktree/agent/session actions.
- Integration: service-handler tests for create project, create worktree, deploy agent, and session handoff.
- TUI: non-interactive Ink tests for available controls and action state transitions.
- E2E: fake Git repo plus fake Codex app-server covers create project -> create worktree -> deploy agent -> open/chat handoff.
