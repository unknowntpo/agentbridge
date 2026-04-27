# TUI Lifecycle Capability Check

## Current Verdict

The current TUI can open a real project snapshot, switch projections, scroll long views, and auto-refresh when project files or Git metadata change. It cannot directly create projects, create worktrees, deploy agents, or chat with agents from inside the TUI.

Those lifecycle operations exist today as AgentBridge CLI/service paths:

- `project create`: implemented by the project command handler.
- `worktree create`: implemented by the worktree command handler.
- `agent deploy`: implemented by the agent command handler and covered with a fake Codex app-server e2e.
- `session open` / `session attach`: implemented as CLI handoff paths, but not connected to a TUI action.

## Required TUI Actions

The TUI should add an action mode instead of a static `lifecycle` view:

```text
Project TUI
  ├─ open/create project action
  ├─ selected commit/ref
  │    └─ create worktree action
  ├─ selected worktree
  │    └─ deploy agent action
  └─ selected agent
       ├─ open chat/session action
       └─ copy attach command fallback
```

## Refresh Model

Manual refresh is not a product action. Interactive `--project` TUI sessions subscribe to filesystem changes and reload the project model after a short debounce.

```text
repo/.git or files change
        │
      fs.watch
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
5. Add an agent deploy action scoped to the selected worktree with provider and permission profile fields.
6. Add session open/chat handoff for selected agents, with copyable terminal command as fallback.
7. Keep fs.watch as the only refresh path and reload after each successful mutation.

## Test Plan

- Unit: action reducer/form validation for project/worktree/agent/session actions.
- Integration: service-handler tests for create project, create worktree, deploy agent, and session handoff.
- TUI: non-interactive Ink tests for available controls and action state transitions.
- E2E: fake Git repo plus fake Codex app-server covers create project -> create worktree -> deploy agent -> open/chat handoff.
