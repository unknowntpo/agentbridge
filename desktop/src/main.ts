import "./styles.css"

type Provider = "Codex" | "Claude" | "Gemini"
type GitStatus = "clean" | "dirty" | "conflict"
type LockState = "unlocked" | "write-locked" | "approval-required"
type AgentState = "running" | "blocked" | "idle"

interface AgentSession {
  provider: Provider
  mode: "write" | "read"
  state: AgentState
}

interface ApprovalRequest {
  actor: Provider
  scope: "network" | "workspace-write" | "filesystem"
  action: string
  command: string
  requestedAt: string
}

interface RunRecord {
  title: string
  command: string
  state: "running" | "completed" | "failed"
  elapsed: string
}

interface Artifact {
  name: string
  age: string
}

interface WorktreeNode {
  id: string
  parentId: string | null
  name: string
  branch: string
  upstream: string | null
  path: string
  head: string
  status: GitStatus
  ahead: number
  behind: number
  remote: {
    provider: "GitHub"
    pr?: string
    checks: "passing" | "pending" | "failing" | "none"
    review: "approved" | "required" | "changes-requested" | "none"
  }
  lock: {
    state: LockState
    writer?: Provider
  }
  agents: AgentSession[]
  approvals: ApprovalRequest[]
  runs: RunRecord[]
  artifacts: Artifact[]
  position: { x: number; y: number }
}

const worktrees: WorktreeNode[] = [
  {
    id: "main",
    parentId: null,
    name: "main",
    branch: "main",
    upstream: "origin/main",
    path: "~/repo/unknowntpo/agentbridge/main",
    head: "a1b2c3d",
    status: "clean",
    ahead: 0,
    behind: 0,
    remote: { provider: "GitHub", checks: "passing", review: "approved" },
    lock: { state: "unlocked" },
    agents: [],
    approvals: [],
    runs: [{ title: "Command run", command: "bun run check", state: "completed", elapsed: "2m" }],
    artifacts: [],
    position: { x: 70, y: 210 },
  },
  {
    id: "worktree-tree",
    parentId: "main",
    name: "feat/worktree-tree",
    branch: "feat/worktree-tree",
    upstream: "origin/feat/worktree-tree",
    path: "~/repo/unknowntpo/agentbridge/worktree-tree",
    head: "d4e5f6a",
    status: "clean",
    ahead: 5,
    behind: 1,
    remote: { provider: "GitHub", pr: "#42", checks: "pending", review: "required" },
    lock: { state: "write-locked", writer: "Codex" },
    agents: [
      { provider: "Codex", mode: "write", state: "running" },
      { provider: "Gemini", mode: "read", state: "idle" },
      { provider: "Claude", mode: "read", state: "idle" },
    ],
    approvals: [
      {
        actor: "Codex",
        scope: "network",
        action: "Run command",
        command: "bun install --frozen-lockfile --registry https://registry.npmjs.org",
        requestedAt: "2m ago",
      },
    ],
    runs: [{ title: "Command run", command: "bun run check", state: "running", elapsed: "12s" }],
    artifacts: [
      { name: "agenthub-design-system-components-expanded.png", age: "now" },
      { name: "run.log", age: "1m" },
    ],
    position: { x: 420, y: 120 },
  },
  {
    id: "permissions",
    parentId: "main",
    name: "docs/permissions",
    branch: "docs/permissions",
    upstream: "origin/docs/permissions",
    path: "~/repo/unknowntpo/agentbridge/docs-permissions",
    head: "e7f8a9b",
    status: "dirty",
    ahead: 2,
    behind: 0,
    remote: { provider: "GitHub", pr: "#39", checks: "failing", review: "changes-requested" },
    lock: { state: "unlocked" },
    agents: [{ provider: "Gemini", mode: "read", state: "idle" }],
    approvals: [],
    runs: [],
    artifacts: [],
    position: { x: 420, y: 390 },
  },
  {
    id: "experiment-cache",
    parentId: "worktree-tree",
    name: "wt/experiment-cache",
    branch: "(detached)",
    upstream: null,
    path: "~/repo/unknowntpo/agentbridge/wt-experiment-cache",
    head: "b1c2d3e",
    status: "dirty",
    ahead: 0,
    behind: 0,
    remote: { provider: "GitHub", checks: "none", review: "none" },
    lock: { state: "approval-required", writer: "Codex" },
    agents: [{ provider: "Codex", mode: "write", state: "blocked" }],
    approvals: [
      {
        actor: "Codex",
        scope: "workspace-write",
        action: "Edit files",
        command: "apply patch to desktop/src/main.ts",
        requestedAt: "9m ago",
      },
    ],
    runs: [],
    artifacts: [],
    position: { x: 780, y: 110 },
  },
  {
    id: "perf-proto",
    parentId: "worktree-tree",
    name: "wt/perf-proto",
    branch: "(detached)",
    upstream: null,
    path: "~/repo/unknowntpo/agentbridge/wt-perf-proto",
    head: "c0ffee1",
    status: "clean",
    ahead: 0,
    behind: 0,
    remote: { provider: "GitHub", checks: "none", review: "none" },
    lock: { state: "unlocked" },
    agents: [],
    approvals: [],
    runs: [],
    artifacts: [],
    position: { x: 780, y: 380 },
  },
]

const selectedId = "worktree-tree"
const selected = worktrees.find((worktree) => worktree.id === selectedId) ?? worktrees[0]

const providerIcon = {
  Codex: "openai.svg",
  Claude: "anthropic.svg",
  Gemini: "googlegemini.svg",
} satisfies Record<Provider, string>

function providerMark(provider: Provider): string {
  return `<span class="provider-mark provider-${provider.toLowerCase()}">
    <img src="/desktop/assets/provider-icons/${providerIcon[provider]}" alt="${provider}" />
  </span>`
}

function statusBadge(status: GitStatus): string {
  return `<span class="badge badge-${status}">${status}</span>`
}

function remoteBadge(worktree: WorktreeNode): string {
  if (worktree.remote.pr) {
    return `<span class="badge badge-remote">${worktree.remote.pr}</span>`
  }
  return `<span class="badge badge-muted">local</span>`
}

function renderAgentChip(agent: AgentSession): string {
  return `<span class="agent-chip ${agent.mode}">
    ${providerMark(agent.provider)}
    <span>${agent.provider} ${agent.mode}</span>
  </span>`
}

function renderLock(worktree: WorktreeNode): string {
  if (worktree.lock.state === "unlocked") {
    return `<div class="lock-row unlocked">Unlocked</div>`
  }
  if (worktree.lock.state === "approval-required") {
    return `<div class="lock-row danger">Approval required</div>`
  }
  return `<div class="lock-row warning">Write locked by ${worktree.lock.writer}</div>`
}

function renderCard(worktree: WorktreeNode): string {
  const agents = worktree.agents.length
    ? worktree.agents.map(renderAgentChip).join("")
    : `<span class="no-agent">No active agents</span>`
  const selectedClass = worktree.id === selectedId ? " selected" : ""

  return `<article class="worktree-card${selectedClass}" style="left:${worktree.position.x}px;top:${worktree.position.y}px">
    <header>
      <div>
        <strong>${worktree.name}</strong>
        <span>${worktree.upstream ?? "detached HEAD"}</span>
      </div>
      <button aria-label="Worktree actions">•••</button>
    </header>
    <div class="card-badges">
      ${statusBadge(worktree.status)}
      ${remoteBadge(worktree)}
      <code>${worktree.head}</code>
    </div>
    <div class="sync-row">
      <span>↑ ${worktree.ahead}</span>
      <span>↓ ${worktree.behind}</span>
      <span>${worktree.remote.provider}</span>
    </div>
    <div class="agent-row">${agents}</div>
    ${renderLock(worktree)}
  </article>`
}

function renderConnectors(): string {
  const byId = new Map(worktrees.map((worktree) => [worktree.id, worktree]))
  const paths = worktrees
    .filter((worktree) => worktree.parentId)
    .map((worktree) => {
      const parent = byId.get(worktree.parentId ?? "")
      if (!parent) return ""
      const startX = parent.position.x + 286
      const startY = parent.position.y + 92
      const endX = worktree.position.x
      const endY = worktree.position.y + 92
      const midX = startX + (endX - startX) / 2
      const active = parent.id === selectedId || worktree.id === selectedId ? " active" : ""
      return `<path class="connector${active}" d="M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}" />`
    })
    .join("")

  return `<svg class="tree-lines" viewBox="0 0 1120 680" aria-hidden="true">${paths}</svg>`
}

function renderApproval(approval: ApprovalRequest): string {
  return `<section class="approval-card">
    <header>
      <strong>Approval required</strong>
      <span class="badge badge-danger">scope: ${approval.scope}</span>
    </header>
    <div class="command-object">
      <span>${approval.action}</span>
      <code title="${approval.command}">${approval.command}</code>
    </div>
    <footer>
      <button class="approve">Approve</button>
      <button>Reject</button>
      <span>${approval.requestedAt}</span>
    </footer>
  </section>`
}

function renderRun(run: RunRecord): string {
  return `<section class="run-card ${run.state}">
    <header>
      <strong>${run.title}</strong>
      <span class="badge badge-${run.state === "failed" ? "danger" : "clean"}">${run.state}</span>
    </header>
    <code title="${run.command}">${run.command}</code>
    <div class="progress"><span></span></div>
    <footer>${run.elapsed}</footer>
  </section>`
}

function renderInspector(worktree: WorktreeNode): string {
  const readers = worktree.agents.filter((agent) => agent.mode === "read")
  const writer = worktree.agents.find((agent) => agent.mode === "write")

  return `<aside class="inspector">
    <section class="inspector-hero">
      <span class="eyebrow">Selected worktree</span>
      <h2>${worktree.name}</h2>
      <p>${worktree.path}</p>
    </section>

    <section class="inspector-section">
      <h3>Git truth</h3>
      <div class="fact-grid">
        <span>Status</span>${statusBadge(worktree.status)}
        <span>HEAD</span><code>${worktree.head}</code>
        <span>Remote</span><span>${worktree.remote.pr ?? "local"}</span>
        <span>Checks</span><span>${worktree.remote.checks}</span>
      </div>
    </section>

    <section class="inspector-section">
      <h3>Agent access</h3>
      <div class="fact-grid">
        <span>Writer</span><span>${writer ? `${writer.provider} ${writer.state}` : "none"}</span>
        <span>Readers</span><span>${readers.map((agent) => agent.provider).join(", ") || "none"}</span>
        <span>Lock</span><span>${worktree.lock.state}</span>
      </div>
    </section>

    <section class="inspector-section">
      <h3>Approvals</h3>
      ${worktree.approvals.length ? worktree.approvals.map(renderApproval).join("") : `<div class="empty-note">No pending approvals.</div>`}
    </section>

    <section class="inspector-section">
      <h3>Runs</h3>
      ${worktree.runs.length ? worktree.runs.map(renderRun).join("") : `<div class="empty-note">No recent runs.</div>`}
    </section>

    <section class="inspector-section">
      <h3>Artifacts</h3>
      ${worktree.artifacts.length ? worktree.artifacts.map((artifact) => `<div class="artifact-row"><span>${artifact.name}</span><em>${artifact.age}</em></div>`).join("") : `<div class="empty-note">No artifacts yet.</div>`}
    </section>
  </aside>`
}

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <main class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">AB</span>
        <div>
          <strong>AgentHub</strong>
          <span>Local agent control</span>
        </div>
      </div>
      <button class="primary-action">Deploy agent</button>
      <nav>
        <a class="active">Worktrees</a>
        <a>Agents</a>
        <a>Approvals <b>2</b></a>
        <a>Artifacts</a>
        <a href="/desktop/design-system.html">Design System</a>
      </nav>
      <section class="trusted-root">
        <span>Trusted root</span>
        <code>~/repo/unknowntpo/agentbridge</code>
      </section>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div>
          <span class="eyebrow">Mock dashboard</span>
          <h1>Worktree Tree</h1>
        </div>
        <div class="topbar-actions">
          <button>Scan</button>
          <button>New worktree</button>
          <button>Open project</button>
        </div>
      </header>

      <section class="canvas">
        ${renderConnectors()}
        ${worktrees.map(renderCard).join("")}
        <div class="drop-card">+ New Worktree<span>Drop a branch, task, or commit here</span></div>
      </section>

      <section class="bottom-timeline">
        <strong>Active session</strong>
        <span>Codex write session is running on feat/worktree-tree. Gemini and Claude are attached read-only.</span>
      </section>
    </section>

    ${renderInspector(selected)}
  </main>
`
