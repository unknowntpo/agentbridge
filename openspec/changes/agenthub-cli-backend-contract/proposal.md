# AgentHub CLI Backend Contract

## Why

AgentHub should not duplicate Git, GitHub, worktree, and agent orchestration logic in the desktop UI. The desktop app needs a stable backend contract that is also available from the AgentBridge CLI, so the same operations can be exercised locally, tested end-to-end, and later exposed through a Tauri or service API.

Long-running Git operations such as clone, worktree creation, push, and pull request creation must not block UI rendering. The backend contract should expose async handlers and structured operation results so the frontend can render progress while work continues.

## What

- Add AgentHub project/worktree backend handlers behind CLI commands.
- Encode the user's plain project layout as first-class AgentBridge behavior:

  ```text
  <plain-dir>/
    main/
    <worktree-slug>/
  ```

- Provide CLI JSON contracts for project listing, project scanning, project creation, worktree listing, and worktree creation.
- Centralize Git process usage behind a controlled runner instead of calling shell aliases or scattering `git` commands.
- Keep read/write Git behavior behind interfaces so read-heavy paths can later move to a library-backed provider without changing CLI or frontend contracts.
- Cover the behavior with unit, integration, and CLI end-to-end tests.

## Non-goals

- Do not replace every Git operation with a pure JavaScript Git library in this change.
- Do not require users to install the author's personal Git aliases.
- Do not implement production GitHub PR creation in the backend contract yet.
- Do not add new desktop UI features in this change.
