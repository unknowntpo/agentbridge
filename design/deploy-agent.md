# AgentHub Deploy Agent Flow Image Prompt

This file records the UI/UX contract and reusable image prompt for deploying an agent from a selected Git commit row/node.

## Product Truth

- The user may click a commit node or commit row in the Git log.
- The right inspector becomes `Selected Commit`.
- `Deploy agent` from the inspector starts an agent attached to a worktree, not directly to an abstract branch.
- The selected commit is context for the task. The working directory must still resolve to a real worktree path.
- If multiple worktrees can use the selected commit as context, the drawer must ask the user to choose one.
- Default working directory should be the currently selected worktree when available.
- Permission model must be explicit before an agent is created.

## Flow

```text
Click commit node / commit row
  -> right inspector shows Selected Commit
     - commit message
     - SHA
     - branch/ref badges
     - touched files
     - linked worktree if any

Click Deploy agent
  -> right-side drawer or modal opens
     - Provider
     - Permission
     - Worktree / working directory
     - Task prompt
     - Context summary

Submit
  -> Agent Session is created
  -> session attaches to selected worktree
  -> selected worktree shows agent chip
  -> inspector switches to session or keeps commit with session status
```

## Drawer Fields

Required fields:

- Provider:
  - Codex
  - Claude
  - Gemini
  - OpenAI
- Permission:
  - Read-only
  - Workspace write
  - Full access
- Worktree:
  - displayed as `Execution target`
  - derived from the already selected worktree
  - not a dropdown and not directly editable in the default flow
  - if no worktree is selected, deployment is disabled until the user selects one from the left panel
- Working directory:
  - default same as worktree path
  - displayed as read-only by default
  - editable only after expanding `Advanced: override working directory`
  - override must remain within the trusted project root
- Task prompt:
  - default generated from selected commit message
- Context:
  - selected commit SHA
  - selected commit message
  - changed files preview
  - branch/ref badges if available

## Permission Rules

- `Read-only`: agent may inspect files, Git state, and logs; no write lock.
- `Workspace write`: agent may edit the selected worktree and owns a write lock.
- `Full access`: risky; requires approval before starting.
- If another write agent already owns the selected worktree, deploying a write agent should create an approval request instead of immediately starting.

## UI Rules

- Keep the Git log visible while the drawer is open.
- Drawer should not replace the whole dashboard.
- The selected commit row remains highlighted.
- The selected commit node in the graph remains highlighted.
- The drawer should visually explain that commit is context, while worktree is execution target.
- Do not show a worktree picker dropdown in the drawer when a worktree is already selected in the left panel.
- Avoid wording that implies an agent is deployed to a branch or commit directly.

## Image Prompt

```text
Create a high-fidelity desktop app UI mockup for AgentHub showing the Deploy Agent flow from a selected Git commit.

Use AgentHub's calm Japanese-inspired design system:
- warm ivory background
- muted teal / Sora primary focus
- warm sand borders and structural lines
- Kurenai muted red only for risky permission
- rounded 20-28px panels
- soft shadows
- compact developer-tool typography
- monospaced SHAs and paths
- no purple
- no dark mode

Layout:
- macOS desktop window
- top project selector: "agentbridge" with dropdown
- left rail icons: Worktrees, Agents, Approvals, Artifacts, Settings
- left worktree list is flat rows, not branch folders
- middle main panel is a Git log table with commit graph lane
- selected commit row is highlighted in soft teal
- selected commit node in graph is highlighted
- right inspector shows "Selected Commit"
- a Deploy Agent drawer is open on the right side, layered above the inspector but not covering the Git log

Middle Git log:
- columns: Graph, Message, Worktree, Agent, Author, Time, Status
- selected row:
  message: "Add Agent Create drawer"
  SHA: d4e5f6a
  worktree: wt/agent-drawer
  agent: Codex write
  status: clean
- other rows:
  "Split local scan from GitHub enrichment"
  "Fix sidebar overflow"
  "Document Git truth for worktree UI"
  "Make AgentHub scan nonblocking"

Right Selected Commit inspector:
- title: "Selected Commit"
- show SHA d4e5f6a
- show message "Add Agent Create drawer"
- show context badges: HEAD, feat/agent-drawer
- show touched files:
  desktop/src/App.vue
  desktop/src/store.ts
  src-tauri/src/lib.rs
- show buttons:
  Deploy agent
  Open session
  Create PR

Deploy Agent drawer:
- title: "Deploy agent"
- subtitle: "Commit is context. Worktree is execution target."
- Provider segmented control:
  Codex selected, Claude, Gemini, OpenAI
- Permission segmented/list control:
  Read-only
  Workspace write selected
  Full access with muted Kurenai risk badge
- Execution target:
  wt/agent-drawer
  branch: feat/agent-drawer
- This is a confirmation card, not a dropdown.
- Working directory read-only field:
  /Users/unknowntpo/repo/unknowntpo/agentbridge/wt/agent-drawer
- Advanced collapsed row:
  "Override working directory"
- Task prompt textarea:
  "Continue from commit d4e5f6a and implement the next AgentHub drawer refinement."
- Context summary card:
  commit d4e5f6a
  changed files 3
  write lock: available
- footer buttons:
  Cancel
  Deploy Codex

Important Git truth:
- Do not imply a commit owns an agent.
- Do not imply a branch owns an agent.
- Agent is deployed to a worktree / working directory.
- Commit is only context for the task.
- Do not show a target worktree dropdown. The user already selected the worktree from the left worktree list.

Rendering requirements:
- 16:9 landscape
- screenshot-like UI composition
- crisp panel boundaries
- readable hierarchy
- product design board quality
```
