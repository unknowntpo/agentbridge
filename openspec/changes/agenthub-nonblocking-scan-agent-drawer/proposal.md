# AgentHub Nonblocking Scan And Agent Drawer

## Why

Opening a project currently waits for local Git scan and GitHub/PR enrichment in one synchronous Tauri command. On real repositories with multiple worktrees this can take several seconds, leaving the dashboard without clear progress feedback.

Agent deployment is also too direct: the UI exposes hard-coded provider buttons instead of a deliberate flow where the user chooses provider, permission profile, working directory, and task prompt.

## What

- Split project loading into a fast local scan and explicit GitHub enrichment.
- Render the dashboard as soon as local worktree state is available.
- Show visible project loading/progress states while async operations are running.
- Add an Agent Create drawer for provider, permission profile, working directory, and prompt selection.
- Default the working directory to the selected worktree path.
- Keep all long-running Tauri invocations behind `async`/`await` and Promise state so the renderer can keep updating.

## Non-goals

- Do not implement real provider process launching in this change.
- Do not replace all Git operations with a library-backed implementation.
- Do not add a full operation queue or persisted background job store yet.
