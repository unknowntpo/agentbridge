import "./styles.css"

type Provider = "Codex" | "Gemini" | "Claude" | "OpenAI"
type WorktreeStatus = "clean" | "dirty" | "conflict"
type LockState = "unlocked" | "locked-by-agent" | "locked-by-you" | "approval-required"

interface AgentChip {
  provider: Provider
  mode: "read" | "write"
  state: "running" | "waiting" | "done"
}

interface WorktreeNode {
  id: string
  parentId: string | null
  name: string
  branch: string
  upstream: string | null
  path: string
  status: WorktreeStatus
  head: string
  forkPoint: string
  ahead: number
  behind: number
  lastActive: string
  lock: LockState
  lockOwner?: string
  agents: AgentChip[]
  position: { x: number; y: number }
}

const worktrees: WorktreeNode[] = [
  {
    id: "main",
    parentId: null,
    name: "main",
    branch: "main",
    upstream: "origin/main",
    path: "/Users/you/repo/agentbridge/main",
    status: "clean",
    head: "a1b2c3d",
    forkPoint: "root",
    ahead: 0,
    behind: 0,
    lastActive: "2h ago",
    lock: "unlocked",
    agents: [],
    position: { x: 80, y: 180 },
  },
  {
    id: "worktree-graph",
    parentId: "main",
    name: "feat/worktree-graph",
    branch: "feat/worktree-graph",
    upstream: "origin/feat/worktree-graph",
    path: "/Users/you/repo/agentbridge/worktree-graph",
    status: "clean",
    head: "d4e5f6a",
    forkPoint: "a1b2c3d",
    ahead: 5,
    behind: 1,
    lastActive: "18m ago",
    lock: "locked-by-agent",
    lockOwner: "Codex: design-system-pass",
    agents: [
      { provider: "Codex", mode: "write", state: "running" },
      { provider: "Claude", mode: "read", state: "waiting" },
      { provider: "OpenAI", mode: "read", state: "done" },
    ],
    position: { x: 430, y: 90 },
  },
  {
    id: "permissions",
    parentId: "main",
    name: "docs/permissions",
    branch: "docs/permissions",
    upstream: "origin/docs/permissions",
    path: "/Users/you/repo/agentbridge/docs-permissions",
    status: "dirty",
    head: "e7f8a9b",
    forkPoint: "a1b2c3d",
    ahead: 2,
    behind: 0,
    lastActive: "1h ago",
    lock: "unlocked",
    agents: [{ provider: "Gemini", mode: "read", state: "waiting" }],
    position: { x: 430, y: 370 },
  },
  {
    id: "cache",
    parentId: "worktree-graph",
    name: "wt/experiment-cache",
    branch: "(detached)",
    upstream: null,
    path: "/Users/you/repo/agentbridge/wt-experiment-cache",
    status: "dirty",
    head: "b1c2d3e",
    forkPoint: "d4e5f6a",
    ahead: 0,
    behind: 0,
    lastActive: "9m ago",
    lock: "approval-required",
    lockOwner: "OpenAI wants full-access",
    agents: [{ provider: "OpenAI", mode: "write", state: "waiting" }],
    position: { x: 800, y: 80 },
  },
  {
    id: "perf",
    parentId: "worktree-graph",
    name: "wt/perf-proto",
    branch: "(detached)",
    upstream: null,
    path: "/Users/you/repo/agentbridge/wt-perf-proto",
    status: "clean",
    head: "c0ffee1",
    forkPoint: "d4e5f6a",
    ahead: 0,
    behind: 0,
    lastActive: "3h ago",
    lock: "unlocked",
    agents: [],
    position: { x: 800, y: 360 },
  },
]

const selectedId = "worktree-graph"
const selected = worktrees.find((worktree) => worktree.id === selectedId) ?? worktrees[0]

function renderStatus(status: WorktreeStatus): string {
  return `<span class="status status-${status}">${status}</span>`
}

function renderLock(worktree: WorktreeNode): string {
  const label = {
    unlocked: "Unlocked",
    "locked-by-agent": "Write lock: Agent",
    "locked-by-you": "Write lock: You",
    "approval-required": "Approval required",
  }[worktree.lock]

  return `<div class="lock lock-${worktree.lock}">
    <span class="lock-icon">${worktree.lock === "unlocked" ? "◇" : "◆"}</span>
    <span>${label}</span>
  </div>`
}

function renderAgent(agent: AgentChip): string {
  return `<span class="agent agent-${agent.state}" title="${agent.provider} ${agent.mode} ${agent.state}">
    <span class="agent-dot"></span>${agent.provider}<span class="agent-mode">${agent.mode}</span>
  </span>`
}

function renderCard(worktree: WorktreeNode): string {
  const selectedClass = worktree.id === selectedId ? "worktree-card selected" : "worktree-card"
  const upstream = worktree.upstream
    ? `<span class="upstream">${worktree.upstream}</span>`
    : `<span class="upstream detached">detached HEAD</span>`
  const agents = worktree.agents.length > 0
    ? worktree.agents.map(renderAgent).join("")
    : `<span class="empty-agents">No active agents</span>`

  return `<article class="${selectedClass}" style="left:${worktree.position.x}px;top:${worktree.position.y}px">
    <header class="card-header">
      <span class="git-icon">⑂</span>
      <div>
        <h3>${worktree.name}</h3>
        ${upstream}
      </div>
      <button class="ghost-button" aria-label="More actions">•••</button>
    </header>
    <div class="card-meta">
      ${renderStatus(worktree.status)}
      <code>${worktree.head}</code>
      <span>${worktree.lastActive}</span>
    </div>
    <div class="ahead-behind">
      <span>↑ ${worktree.ahead}</span>
      <span>↓ ${worktree.behind}</span>
      <span>fork ${worktree.forkPoint}</span>
    </div>
    <div class="agent-row">${agents}</div>
    ${renderLock(worktree)}
  </article>`
}

function renderConnectors(): string {
  const byId = new Map(worktrees.map((worktree) => [worktree.id, worktree]))
  const segments = worktrees
    .filter((worktree) => worktree.parentId)
    .map((worktree) => {
      const parent = byId.get(worktree.parentId ?? "")
      if (!parent) {
        return ""
      }

      const startX = parent.position.x + 300
      const startY = parent.position.y + 84
      const endX = worktree.position.x
      const endY = worktree.position.y + 84
      const midX = startX + (endX - startX) / 2
      const selectedPath = parent.id === selectedId || worktree.id === selectedId ? "connector selected-path" : "connector"

      return `<path class="${selectedPath}" d="M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}" />`
    })
    .join("")

  return `<svg class="tree-lines" viewBox="0 0 1160 720" aria-hidden="true">${segments}</svg>`
}

function renderInspector(worktree: WorktreeNode): string {
  const agents = worktree.agents.map((agent) => `
    <li>
      <strong>${agent.provider}</strong>
      <span>${agent.mode} mode</span>
      <em>${agent.state}</em>
    </li>
  `).join("")

  return `<aside class="inspector">
    <div class="panel-title">
      <span>Selected Worktree</span>
      <strong>${worktree.name}</strong>
    </div>
    <dl class="detail-list">
      <div><dt>Path</dt><dd>${worktree.path}</dd></div>
      <div><dt>Branch</dt><dd>${worktree.branch}</dd></div>
      <div><dt>Fork point</dt><dd>${worktree.forkPoint}</dd></div>
      <div><dt>HEAD</dt><dd>${worktree.head}</dd></div>
      <div><dt>Lock owner</dt><dd>${worktree.lockOwner ?? "none"}</dd></div>
    </dl>
    <section>
      <h4>Deployed agents</h4>
      <ul class="agent-list">${agents}</ul>
    </section>
    <section>
      <h4>Recent runs</h4>
      <div class="run-card success">design tokens generated <span>42s</span></div>
      <div class="run-card">vite mock preview <span>1m</span></div>
      <div class="run-card waiting">approval: full-access denied <span>5m</span></div>
    </section>
  </aside>`
}

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <main class="shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">AB</span>
        <div>
          <strong>AgentHub</strong>
          <span>Worktree control plane</span>
        </div>
      </div>
      <button class="primary-action">+ Deploy Agent</button>
      <nav>
        <a class="active">Git Tree</a>
        <a>Agents</a>
        <a>Approvals <b>1</b></a>
        <a>Artifacts</a>
        <a href="/desktop/design-system.html">Design System</a>
      </nav>
      <section class="trusted-root">
        <span>Trusted root</span>
        <code>~/repo/unknowntpo/agentbridge</code>
      </section>
    </aside>
    <section class="workspace">
      <header class="toolbar">
        <div>
          <p>Local dashboard mock</p>
          <h1>Worktree Tree</h1>
        </div>
        <div class="toolbar-actions">
          <button>Scan Git Worktrees</button>
          <button>New Worktree</button>
          <button>Open Terminal</button>
          <button class="danger-soft">Approvals</button>
        </div>
      </header>
      <section class="canvas">
        ${renderConnectors()}
        ${worktrees.map(renderCard).join("")}
        <div class="drop-card">+ New Worktree<br /><span>Drop branch, commit, or task here</span></div>
        <div class="minimap">
          <span></span><span></span><span></span><span></span><span></span>
        </div>
      </section>
      <section class="timeline">
        <div>
          <strong>Codex · design-system-pass</strong>
          <span>Write-mode session on feat/worktree-graph</span>
        </div>
        <ol>
          <li><b>Message</b> Define token scale for worktree cards</li>
          <li><b>Run</b> desktop:build completed</li>
          <li><b>Artifact</b> agenthub-worktree-tree-ui.png</li>
        </ol>
      </section>
    </section>
    ${renderInspector(selected)}
  </main>
`
