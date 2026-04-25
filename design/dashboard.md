# AgentHub Dashboard Image Prompt

This file records the reusable image-generation prompt for the AgentHub dashboard pivot concept.

## OpenAI Image Consistency Notes

Source docs:

- OpenAI Image generation guide: https://developers.openai.com/api/docs/guides/image-generation
- OpenAI image generation tool guide: https://developers.openai.com/api/docs/guides/tools-image-generation

Practical rules for consistent dashboard mockups:

- Prefer multi-turn image editing when iterating on the same concept. The OpenAI Responses API supports continuing from `previous_response_id` or an image ID, which keeps prior visual context available.
- When using image references, use high input fidelity where supported. Current docs note that newer GPT Image models preserve image inputs with high fidelity in reference/edit workflows.
- Save the generated image, image ID, original prompt, and any revised prompt. The image generation tool can return a `revised_prompt`; that text should be captured because it affects reproducibility.
- Keep output settings stable across iterations: aspect ratio, size, quality, format, and background.
- Do not expect exact determinism from prompt alone. OpenAI docs explicitly note that image models can still struggle with perfect consistency across repeated generations, especially for recurring brand elements and precise layout.
- For UI mockups, avoid asking the model to invent exact copy-heavy screens. Specify layout, hierarchy, visual language, density, and representative text, then treat the result as concept art, not implementation truth.

## Current Reference Image

Local copied image:

```text
screenshots/agenthub-git-log-pivot-concept.png
```

Generated image source directory:

```text
/Users/unknowntpo/.codex/generated_images/019dbea9-7801-75e2-8c14-81f73bc59b6b/
```

## Product Truth Constraints

These constraints must be preserved in future prompts:

- AgentHub is a local desktop dashboard for managing agents across Git worktrees.
- A worktree is one checkout directory with one current `HEAD`.
- A worktree does not contain multiple branches.
- Branch is metadata on a worktree, not a parent folder containing worktrees.
- The primary visual should combine Git log / commit graph density with AgentHub worktree and agent state.
- The UI should feel like a serious developer tool, closer to IntelliJ Git Log / JetBrains tooling density than a marketing dashboard.
- Project switching belongs in the top project selector.
- Left panel should list worktrees for the current project only.
- Middle panel should show commit graph and commit log.
- Right panel should inspect the selected commit, selected worktree, or selected agent session.

## Base Prompt

```text
Create a polished desktop app UI concept mockup for "AgentHub", inspired by IntelliJ IDEA Git Log tool window, but not copying the brand.

Use AgentHub's soft Japanese calm design system:
- warm ivory background
- subtle dotted grid
- muted teal / Sora primary
- warm sand secondary
- soft persimmon and muted Kurenai warning/danger accents
- beige borders
- rounded 20-28px panels
- calm shadows
- compact UI-first typography
- monospaced commit labels and paths
- no purple
- no dark mode
- no generic AI gradient branding

Canvas:
- macOS desktop app window
- top project selector centered in the toolbar
- current project: "agentbridge"
- top selector shows project name and trusted root, with a dropdown affordance for switching projects

Left rail:
- narrow vertical icon rail for Worktrees, Agents, Approvals, Artifacts, Settings
- selected icon uses muted teal background

Left main panel:
- titled "Worktrees"
- search input: "Search worktrees"
- list only worktrees for the selected project
- each row is a worktree, not a branch folder
- show worktree name, current branch metadata, short HEAD SHA, clean/dirty/conflict badge, agent count
- example rows:
  - main
    branch: main
    HEAD: a1b2c3d
    state: clean
  - wt/agent-drawer
    branch: feat/agent-drawer
    HEAD: d4e5f6a
    state: clean
    agents: Codex write
  - wt/approval-flow
    branch: feat/approval-flow
    HEAD: 9ac1b2e
    state: dirty
    agents: Gemini read
  - wt/bulk-edit
    branch: feat/bulk-edit
    HEAD: 4f1d2c8
    state: clean
  - wt/docs-permissions
    branch: docs/permissions-refactor
    HEAD: e7fa89b
    state: clean

Important Git truth:
- Do not draw branch prefix folders such as "feat/" or "docs/" containing multiple worktrees.
- Do not imply one worktree maps to many branches.
- Branch names are metadata text on each worktree row.

Middle main panel:
- Git log table with a left commit graph lane
- colored ancestry lines and round commit nodes
- columns: Graph, Message, Worktree, Agent, Author, Time, Status
- selected commit row highlighted with soft teal
- representative commit messages:
  - Add Agent Create drawer
  - Split local scan from GitHub enrichment
  - Fix sidebar overflow
  - Document Git truth for worktree UI
  - Add AgentHub dummy workflow project
  - Make AgentHub scan nonblocking
- show branch/HEAD badges inline on relevant rows

Right inspector panel:
- title: "Selected Commit"
- show selected commit SHA, message, touched files, linked worktree, active agents, approval status
- show buttons:
  - Deploy agent
  - Open session
  - Create PR
- include an approval card using muted Kurenai only for risky action state

Bottom panel:
- compact command/run timeline strip
- examples:
  - bun run check: passed
  - cargo check: passed
  - GitHub refresh: running

Rendering requirements:
- high fidelity product UI mockup
- screenshot-like composition
- 16:9 landscape
- crisp panel structure
- readable enough for layout and hierarchy, but exact text does not need to be perfectly legible
- product design board quality
```

## Iteration Prompt For Correcting The Current Image

Use this when editing the current screenshot instead of regenerating from scratch:

```text
Edit the existing AgentHub dashboard concept image.

Keep the same warm ivory, muted teal, warm sand, rounded-panel design system.
Keep the top project selector and Git log inspired structure.

Correct the left Worktrees panel:
- Remove branch-folder grouping like "feat", "docs", or "exp".
- Replace it with a flat list of worktree rows for the current project.
- Each row should represent one checkout directory.
- Each row should show branch as metadata, e.g. "branch: feat/agent-drawer".
- Do not imply one worktree contains multiple branches.

Keep the middle Git commit graph/log and right inspector layout.
Make the project switcher clearer in the top toolbar:
- current project name "agentbridge"
- dropdown affordance
- small trusted root path subtitle
```

## Suggested API Strategy

For consistent iterations:

1. Generate the first concept with the Base Prompt.
2. Save the output image and the image generation call metadata.
3. For corrections, use the current image as an input reference and use the Iteration Prompt.
4. Prefer Responses API multi-turn editing with `previous_response_id` or image ID.
5. Keep size/aspect/quality stable between runs.

