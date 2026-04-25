# AgentHub Dashboard Design System

This document defines the design system for AgentHub, the AgentBridge desktop app. It is the source of truth for local Tauri mockups, Figma-to-code work, and future production UI.

## Product Principle

AgentHub is a local, single-user workflow manager for coordinating AI agents across Git worktrees.

Naming boundary:

- AgentHub: desktop app and visual worktree/agent control surface.
- AgentBridge: CLI tool, backend service, provider adapters, and permission control plane.

The core model is:

```text
Project
  -> Worktree
       -> Agent Session
            -> Tasks / Messages / Runs / Artifacts
```

A worktree is the primary visual and operational unit. A branch is metadata on a worktree, not the top-level product object.

Git truth constraints:

- One worktree maps to one checkout directory.
- One worktree has exactly one current `HEAD`.
- `HEAD` is either attached to one branch ref or is detached at a commit.
- A worktree does not contain multiple branches. Do not draw `feat/` or `docs/` as parent folders with multiple worktree rows beneath them.
- Branch refs point to commits; worktrees attach to commits through their current `HEAD`.
- The UI may group or filter by branch prefix, but the row/card identity must still be the worktree path/name.

## Information Architecture

The desktop shell uses four stable regions:

- Left sidebar: trusted project roots, saved views, navigation, and global filters.
- Center canvas: Git worktree tree, rendered as cards connected by ancestry lines.
- Right inspector: selected worktree details, lock owner, agents, runs, artifacts, approvals.
- Bottom timeline drawer: selected agent session messages, tool runs, approvals, and artifacts.

The center canvas is the product's primary surface. Other regions explain or operate on the selected worktree.

Project switching:

- The top project selector is the canonical control for switching repositories/projects.
- Switching project changes the entire worktree/log/session context.
- The selector should show current project name, trusted root path, and recent projects.
- The left sidebar should not mix worktrees from multiple projects unless the user explicitly chooses an all-projects overview.

## Worktree Tree

The central canvas must represent Git ancestry, not arbitrary dependencies.

- Root nodes are trunk worktrees such as `main` or `master`.
- Child nodes are feature worktrees forked from a parent.
- Grandchild nodes are experiments, prototypes, or detached worktrees forked from a feature.
- Connectors represent fork point or merge-base relationships.
- The selected card highlights both itself and its ancestry path.

Do not draw runtime dependency edges in this view. If dependency visualization is needed later, it should be a separate view.

## Commit Log Panel

The Git-log inspired view is the dense default for real projects with many commits.

- The center panel is a vertically scrollable commit tree/log, independent from the sidebar and inspector.
- The graph lane is row-aligned with commit rows, similar to desktop Git tools.
- The graph lane shows commit ancestry only. It must not show provider sessions, runtime dependencies, or worktree ownership.
- Branch refs and tags are metadata on commit rows. A commit with a branch head can use stronger border/fill treatment.
- Worktree is a row column or inspector field, not a parent folder. Do not render `feat/` as a folder containing many worktrees.
- Long commit messages, paths, and branch refs truncate in the row and expand in the right inspector.
- The header stays sticky while the commit body scrolls.
- Selection remains visible and stable while the user scrolls.
- Hundreds or thousands of commits should later use virtualization; until then, use a constrained scroll area so the page itself does not jump.

Deploying an agent from this view:

- User clicks a commit row or graph node.
- Right inspector becomes `Selected Commit`.
- `Deploy agent` opens a drawer.
- The drawer confirms the execution target derived from the selected worktree. It is not a worktree dropdown.
- Working directory defaults to the selected worktree path and is read-only unless the user opens an advanced override.

## Worktree Card Contract

Each card represents one real checkout directory. Show these fields when available:

- Worktree name or display label.
- Current branch name or `(detached)`.
- Upstream branch badge such as `origin/main`.
- Git status: `clean`, `dirty`, or `conflict`.
- Short HEAD SHA.
- Ahead and behind counts.
- Fork point SHA or parent worktree reference.
- Last activity time.
- Active agent chips.
- AgentHub write lock state.

Cards should be compact, information-dense, and scannable. This UI is closer to a local operations console than a marketing dashboard.

## Agent Chips

Agent chips are secondary objects attached to worktree cards.

- Provider labels: `Codex`, `Gemini`, `Claude`, `OpenAI`.
- Mode labels: `read` or `write`.
- State labels: `running`, `waiting`, `done`, or `failed`.
- A write-mode agent implies an exclusive worktree write lock.
- Multiple read-only agents may coexist on the same worktree.

Do not represent agents as top-level canvas nodes in the worktree tree.

## Lock Semantics

`lock` means AgentHub/AgentBridge worktree write lock. It is not a Git lock and not branch protection.

- `Unlocked`: a write-mode agent may be deployed.
- `Write lock: Agent`: a write-mode agent owns this worktree; other write-mode agents must be blocked or queued.
- `Write lock: You`: the human is actively operating this worktree; write agents require confirmation or should downgrade to read-only.
- `Approval required`: the agent requested elevated permission, cross-worktree access, destructive operation, or another risky action.

Lock state exists to prevent concurrent writes and context corruption in a single checkout directory.

## Visual Language

The dashboard should feel like a serious desktop developer tool.

- Use warm light surfaces, graphite text, precise borders, soft shadows, restrained primary focus states, and secondary Git-structure accents.
- Avoid generic AI purple gradients, mascot-like decoration, glassmorphism overload, or chat-app-first layouts.
- Prefer dense but readable cards over oversized empty panels.
- Use terminal-inspired details sparingly: short SHAs, monospace path snippets, compact badges.

### Captured Reference: Spectra

The Spectra screenshot is used as a captured pattern reference, not a brand source to clone.

Observed source facts:

- The layout uses a stable left rail, top project bar, central dotted canvas, and large content panels.
- The selected sidebar item uses a muted red primary fill with white text.
- Secondary controls are quiet rounded rectangles with soft gray fills and thin borders.
- The page uses a truthful empty state: "No active changes" appears in a large panel instead of implying hidden work.
- The typography is compact, neutral, and UI-first; labels are short and direct.

Transferable patterns for AgentHub:

- Keep a persistent left rail for project/worktree views and global controls.
- Use a top bar for current project, scan/sync controls, and global actions.
- Use a dotted canvas grid to make draggable tree layout feel spatial without visual noise.
- Prefer segmented controls for view switches such as `Tree / Grid`, `Active / Archived`, or `Agents / Runs`.
- Use truthful empty states for no agents, no approvals, no artifacts, and no dirty files.

Anti-clone transform:

- Do not copy Spectra's red brand as AgentHub primary.
- Do not copy Spectra's logo, icon shape, tab bar, or exact spacing.
- Translate the pattern into AgentHub-owned Sora / 空色 primary, Warm Sand / 砂色 secondary, and worktree-tree semantics.

### Captured Reference: Clarc

Reference:

- https://github.com/ttnear/Clarc
- Public project discussion: https://www.reddit.com/r/SwiftUI/comments/1su9t5n/i_built_a_native_macos_gui_for_claude_code/

Clarc is a useful reference for wrapping Claude Code CLI without rebuilding the agent runtime.

Observed source facts:

- It spawns the real `claude` CLI under the hood.
- Existing `CLAUDE.md`, skills, MCP, and slash commands continue to work unchanged.
- It adds a native macOS GUI around the CLI.
- It exposes native approval modals with actual diffs before tools run.
- It supports per-project windows for parallel sessions.
- It includes project-centric affordances such as drag-and-drop attachments, GitHub OAuth, automatic SSH key setup, file explorer with Git status, memo pad, embedded terminal, shortcut buttons, and custom slash commands.

Transferable patterns for AgentHub:

- Treat provider CLIs as authoritative runtimes. AgentHub should wrap Codex, Claude Code, Gemini, and OpenAI provider surfaces instead of rebuilding their tool execution loops.
- Preserve each provider's native project files and conventions: `AGENTS.md`, `CLAUDE.md`, skills, MCP config, slash commands, and provider-specific session state.
- Put safety and clarity in the wrapper layer: preview diffs, explain permissions, show the exact command/tool request, and make approvals durable.
- Use project/worktree windows or tabs as the main isolation boundary for parallel sessions.
- Keep GitHub setup and repo onboarding as first-class UX, not an afterthought.
- Provide an embedded terminal and file/status explorer for cases where the user needs to inspect or override agent behavior.

Anti-clone transform:

- Do not copy Clarc's visual design or feature order directly.
- AgentHub's core remains `Project -> Worktree -> Agent Session`; Clarc informs provider wrapping and permission UX, not the product model.
- AgentHub should stay provider-neutral. Claude Code is one backend, not the only runtime.

Color semantics:

- Sora / 空色 primary: selected worktree, active path, focus, primary actions, active write lock. It should feel bright, soft, calm, and hopeful without becoming electric blue.
- Warm Sand / 砂色 secondary: Git tree structure, neutral active navigation, low-risk secondary operations, empty worktree drop zones.
- Green: clean, success, completed run.
- Orange: dirty, waiting, warning.
- Red: conflict, failed run, risky approval.
- Graphite and warm neutrals: default text, surfaces, dividers.

## Design Tokens

Tokens are currently CSS custom properties in `desktop/src/styles.css`.

The palette is a profile adaptation from the current AgentHub mock, not a copy of a third-party design system. The captured pattern is:

- Calm operations console: ivory surfaces, graphite copy, low-glare background, and a hopeful Sora focus color.
- Git ancestry tree: secondary structural lines and compact cards.
- Primary focus path: one calm action/focus hue for selection and write-lock clarity.
- Semantic status: success, warning, and danger remain separate from brand colors.

Required token families:

- `neutral`: app background, canvas, surfaces, text, borders.
- `primary`: focus, selected card, active ancestry path, primary action, active write lock.
- `secondary`: Git tree connectors, navigation selection, low-emphasis structure, empty/drop surfaces.
- `success`: clean state, completed run, healthy status.
- `warning`: dirty state, waiting state, recoverable issue.
- `danger`: Kurenai Muted / 淡紅 for conflict, failed run, approval risk, destructive action.
- `shadow`: raised cards and floating panels.
- `typography`: sans UI stack and monospace stack.

Token level usage:

- `50 / 100`: subtle backgrounds and soft fills.
- `300`: borders, dividers, connector lines.
- `500 / 600`: badges, controls, links, selected states.
- `900`: primary text and high-contrast marks.

Current primary and secondary roles:

```text
Sora / 空色 primary:
  role: action and focus
  example: selected card outline, Deploy Agent button, selected tree path
  avoid: high-saturation electric blue, harsh contrast, or decorative page wash

Warm Sand / 砂色 secondary:
  role: Git structure and quiet operations
  example: tree connector baseline, active nav fill, drop target, brand mark
  avoid: using secondary for error/warning states
```

Do not hardcode repeated colors, shadows, or font stacks in component code. Add or refine tokens first.

## Design System Page Standard

AgentHub should have a dedicated design system page like Minishop's design page: an engineering-facing reference that documents decisions once instead of rediscovering them in CSS.

The page should include:

- Hero: design goal, product truth, and non-goals.
- Pattern capture: what was learned from references and what must not be cloned.
- Tokens: neutral, primary, secondary, success, warning, danger with level usage.
- Typography: font stack, type roles, line-height, label behavior.
- Shape and elevation: radius, border, shadow, panel density.
- Component primitives: buttons, badges, worktree cards, agent chips, lock badges, panels, segmented controls.
- State model: clean, dirty, conflict, unlocked, locked, approval required, running, waiting, done, failed, empty.
- Loading rules: only spin for active async work, never for stale or unknown state.
- Notification rules: dedupe updates, treat notifications as helpful but not source-of-truth.
- Breakpoints: behavior for phone, tablet, desktop, wide desktop.
- Decisions: do/don't rules with short rationale.
- Preview: realistic worktree tree screen with fake data.

The initial static artifact is `desktop/design-system.html`.

## Component Model

The current mock uses vanilla TypeScript, Vite, and global CSS:

- `desktop/src/main.ts`: fake data and render functions.
- `desktop/src/styles.css`: design tokens and component styles.
- `src-tauri/`: Tauri v2 shell.

If the dashboard grows beyond mock stage, extract components by product concept:

- `WorktreeTreeCanvas`
- `WorktreeCard`
- `TreeConnector`
- `CommitLogPanel`
- `CommitGraphLane`
- `CommitRow`
- `SelectedCommitInspector`
- `DeployAgentDrawer`
- `ExecutionTargetCard`
- `ReadonlyPathField`
- `PermissionOption`
- `AgentChip`
- `LockBadge`
- `InspectorPanel`
- `TimelineDrawer`
- `Toolbar`
- `TrustedRootSidebar`

Do not introduce a UI framework only to render static mock data. Add React, Svelte, or another framework only when interaction complexity justifies the cost.

## Interaction Rules

Primary interactions:

- Select worktree: focus card, highlight ancestry path, update inspector and timeline.
- Deploy agent: attach a provider session to selected worktree.
- Open terminal/editor: operate in the selected worktree directory.
- Create worktree: from branch, commit, PR, or task prompt.
- Review approval: approve or reject risky permission escalation.
- Inspect dirty state: open status and diff details for the selected worktree.

Drag-and-drop may be supported, but every drag action must have a menu or keyboard-accessible fallback.

## Figma-To-Code Rules

When implementing from Figma:

- Preserve the product model: cards are worktrees, connectors are Git ancestry, agents are chips/details attached to worktrees.
- Never implement a branch-folder tree that implies one worktree contains many branches.
- Treat generated Figma output as visual structure, not final code style.
- Translate Figma styling into existing CSS token names where possible.
- Do not import random icon packages from generated Figma output.
- Use assets from the Figma payload when provided; otherwise prefer simple inline SVG or text glyph placeholders.
- Store intentional dashboard assets under `desktop/public/` or another explicit design asset directory.

Validation:

```sh
bun run desktop:build
bun run check
```

## Accessibility

- Interactive cards, toolbar actions, agent chips, and lock controls must have accessible names.
- Keyboard focus must be visible and should match the selected-card visual language.
- The right inspector must provide a textual equivalent for the selected worktree card.
- Status and lock states must not rely on color alone; include labels.
- Timeline events should be readable in chronological order by assistive technology.

## Internationalization

AgentHub must support English and Traditional Chinese from the start.

Supported locales:

- `en-US`
- `zh-TW`

Rules:

- Use a Chinese-first mixed-locale font stack for product UI so English terms embedded in Traditional Chinese copy do not visually jump out.
- Use the same sans family for English and Traditional Chinese UI surfaces unless a future brand review explicitly approves a separate display face.
- Keep UI labels short enough for worktree cards, agent chips, toolbar buttons, and status rows.
- Do not translate provider names such as `Codex`, `Gemini`, `Claude`, and `OpenAI`.
- Do not translate Git primitives such as `worktree`, `branch`, `HEAD`, `SHA`, and remote refs when translation would reduce clarity.
- In large Traditional Chinese display titles, prefer a natural Chinese term such as `工作樹` and keep `Git worktree` in nearby supporting copy. This avoids visually inconsistent CJK/Latin mixing at hero scale.
- Translate state meaning, not words mechanically. Example: `Approval required` should be `需要核准`, not a literal passive construction.
- Status and lock labels must remain visually stable in Traditional Chinese.
- Store labels in dictionaries instead of scattering copy through render code.
- Design review must test both `en-US` and `zh-TW` in the same UI density.

Preferred translations:

```text
Git Tree -> Git 樹
Agents -> 代理人
Approvals -> 核准
Artifacts -> 產物
Design System -> 設計系統
Clean -> 乾淨
Dirty -> 有變更
Conflict -> 衝突
Unlocked -> 未鎖定
Write lock: Agent -> 寫入鎖定：代理人
Approval required -> 需要核准
Deploy Agent -> 部署代理人
Scan Git Worktrees -> 掃描 Git Worktree
```
