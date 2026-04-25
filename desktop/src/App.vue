<script setup lang="ts">
import { invoke as tauriInvoke } from "@tauri-apps/api/core"
import { computed, onMounted, reactive, ref, watch } from "vue"

import {
  createApproval,
  createInitialState,
  deployAgent,
  lockStateForWorktree,
  normalizeProjectScan,
  resolveApproval,
  selectInitialWorktree,
  selectedSession,
  selectedWorktree,
  sendAgentMessage,
  sessionsForWorktree,
  type AgentMode,
  type AllowedProject,
  type AppState,
  type GithubState,
  type PermissionProfile,
  type ProjectScan,
  type Provider,
  type TabId,
  type WorktreeScan,
} from "./store"

interface GraphNode {
  id: string
  label: string
  x: number
  y: number
  hasRef: boolean
}

interface CommandOutcome {
  ok: boolean
  message: string
  stdout: string
  stderr: string
}

const STORAGE_KEY = "agenthub.mvp.state.v1"
const DEFAULT_MINISHOP = "/Users/unknowntpo/repo/unknowntpo/minishop"
const DEFAULT_AGENTBRIDGE = "/Users/unknowntpo/repo/unknowntpo/agentbridge/main"

const projectPath = ref(DEFAULT_MINISHOP)
const state = reactive<AppState>(restoreState())
const chatDraft = ref("")
const newWorktreeBranch = ref("feat/agenthub-demo")
const newWorktreeBase = ref("HEAD")
const loading = ref(false)

const currentWorktree = computed(() => selectedWorktree(state))
const currentSession = computed(() => selectedSession(state))
const currentWorktreeSessions = computed(() => (
  currentWorktree.value ? sessionsForWorktree(state, currentWorktree.value.id) : []
))
const pendingApprovals = computed(() => state.approvals.filter((approval) => approval.state === "pending"))
const graph = computed(() => buildGraph(state.project?.worktrees ?? []))
const graphWidth = computed(() => Math.max(1040, graph.value.commitNodes.length * 168 + 180))
const graphHeight = computed(() => Math.max(640, Math.ceil(graph.value.cards.length / 4) * 252 + 520))

watch(
  () => ({
    selectedWorktreeId: state.selectedWorktreeId,
    selectedSessionId: state.selectedSessionId,
    activeTab: state.activeTab,
    sessions: state.sessions,
    approvals: state.approvals,
    projectPath: projectPath.value,
  }),
  (snapshot) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  },
  { deep: true },
)

onMounted(async () => {
  await loadAllowedProjects()
  await scanProject(projectPath.value)
})

async function loadAllowedProjects(): Promise<void> {
  try {
    state.projects = await invokeCommand<AllowedProject[]>("allowed_projects")
    projectPath.value = state.projects.find((project) => project.id === "minishop")?.path ?? projectPath.value
  } catch {
    state.projects = [
      { id: "agentbridge", label: "agentbridge", path: DEFAULT_AGENTBRIDGE },
      { id: "minishop", label: "minishop demo", path: DEFAULT_MINISHOP },
    ]
  }
}

async function scanProject(path: string): Promise<void> {
  loading.value = true
  state.notice = null
  try {
    const scan = await invokeCommand<ProjectScan>("scan_project", { path })
    applyProject(scan)
  } catch (error) {
    state.notice = `Using browser mock state. Open the Tauri window for real Git/GitHub scanning. ${String(error)}`
    applyProject(mockProject(path))
  } finally {
    loading.value = false
  }
}

function applyProject(scan: ProjectScan): void {
  state.project = normalizeProjectScan(scan)
  state.selectedWorktreeId = state.selectedWorktreeId && state.project.worktrees.some((worktree) => worktree.id === state.selectedWorktreeId)
    ? state.selectedWorktreeId
    : selectInitialWorktree(state.project)
  if (!state.selectedSessionId || !state.sessions.some((session) => session.id === state.selectedSessionId)) {
    state.selectedSessionId = null
  }
}

function selectWorktree(id: string): void {
  state.selectedWorktreeId = id
  const session = state.sessions.find((candidate) => candidate.worktreeId === id)
  state.selectedSessionId = session?.id ?? null
}

function selectAgent(sessionId: string): void {
  state.selectedSessionId = sessionId
  state.activeTab = "chat"
}

function deploy(provider: Provider, mode: AgentMode, profile: PermissionProfile): void {
  const worktree = currentWorktree.value
  if (!worktree) return
  Object.assign(state, deployAgent(state, {
    worktreeId: worktree.id,
    provider,
    mode,
    profile,
    prompt: `${mode === "write" ? "Work on" : "Review"} ${worktree.name}`,
  }))
}

function sendChat(): void {
  const session = currentSession.value
  if (!session) return
  Object.assign(state, sendAgentMessage(state, session.id, chatDraft.value))
  chatDraft.value = ""
}

function resolve(id: string, decision: "approved" | "rejected"): void {
  Object.assign(state, resolveApproval(state, id, decision))
}

async function refreshGithub(): Promise<void> {
  const worktree = currentWorktree.value
  if (!worktree) return
  try {
    const remote = await invokeCommand<GithubState>("scan_github", { worktreePath: worktree.path })
    worktree.remote = remote
    state.notice = remote.mocked ? remote.message ?? "GitHub state is mocked." : "GitHub state refreshed."
  } catch (error) {
    state.notice = String(error)
  }
}

async function pushBranch(): Promise<void> {
  const worktree = currentWorktree.value
  if (!worktree) return
  state.approvals.push(createApproval({
    worktreeId: worktree.id,
    sessionId: currentSession.value?.id ?? null,
    actor: currentSession.value?.provider ?? "Codex",
    scope: "git-remote",
    action: "Push branch",
    command: `git push -u origin HEAD (${worktree.name})`,
  }))
  try {
    const outcome = await invokeCommand<CommandOutcome>("push_branch", { worktreePath: worktree.path })
    state.notice = outcome.stdout || outcome.stderr || outcome.message
  } catch (error) {
    state.notice = `Push blocked: ${String(error)}`
  }
}

async function openPr(): Promise<void> {
  const worktree = currentWorktree.value
  if (!worktree) return
  state.approvals.push(createApproval({
    worktreeId: worktree.id,
    sessionId: currentSession.value?.id ?? null,
    actor: currentSession.value?.provider ?? "Codex",
    scope: "git-remote",
    action: "Open pull request",
    command: `gh pr create --fill (${worktree.name})`,
  }))
  try {
    worktree.remote = await invokeCommand<GithubState>("open_pr", { worktreePath: worktree.path })
    state.notice = worktree.remote.message ?? worktree.remote.pr ?? "PR state updated."
  } catch (error) {
    state.notice = `PR blocked: ${String(error)}`
  }
}

async function createWorktree(): Promise<void> {
  if (!state.project) return
  try {
    const outcome = await invokeCommand<CommandOutcome>("create_worktree", {
      projectRoot: state.project.rootPath,
      branchName: newWorktreeBranch.value,
      baseRef: newWorktreeBase.value,
    })
    state.notice = outcome.stdout || outcome.message
    await scanProject(state.project.rootPath)
  } catch (error) {
    state.notice = `Create worktree blocked: ${String(error)}`
  }
}

function setTab(tab: TabId): void {
  state.activeTab = tab
}

function badgeClass(value: string): string {
  if (value === "clean" || value === "completed" || value === "approved" || value === "ok") return "badge-clean"
  if (value === "dirty" || value === "pending" || value === "running") return "badge-dirty"
  if (value === "blocked" || value === "rejected" || value === "unavailable") return "badge-danger"
  return "badge-muted"
}

function providerIcon(provider: Provider): string {
  if (provider === "Claude") return "/desktop/assets/provider-icons/anthropic.svg"
  if (provider === "Gemini") return "/desktop/assets/provider-icons/googlegemini.svg"
  return "/desktop/assets/provider-icons/openai.svg"
}

function worktreeLockLabel(worktree: WorktreeScan): string {
  const lock = lockStateForWorktree(state, worktree.id)
  if (lock.state === "approval-required") return "Approval required"
  if (lock.state === "write-locked") return `Write locked by ${lock.writer}`
  return "Unlocked"
}

function worktreeLockClass(worktree: WorktreeScan): string {
  const lock = lockStateForWorktree(state, worktree.id)
  if (lock.state === "approval-required") return "danger"
  if (lock.state === "write-locked") return "warning"
  return "unlocked"
}

function buildGraph(worktrees: WorktreeScan[]): {
  commitNodes: GraphNode[]
  cards: Array<{ worktree: WorktreeScan; x: number; y: number; commitId: string }>
  ancestryPaths: string[]
  attachmentPaths: string[]
} {
  const heads = [...new Map(worktrees.map((worktree) => [worktree.head, worktree])).values()]
  const commitNodes = heads.map((worktree, index) => ({
    id: worktree.head,
    label: worktree.head,
    x: 90 + index * 158,
    y: index % 3 === 2 ? 118 : 58,
    hasRef: Boolean(worktree.branch),
  }))
  const nodeByHead = new Map(commitNodes.map((node) => [node.id, node]))
  const cards = worktrees.map((worktree, index) => {
    const node = nodeByHead.get(worktree.head) ?? commitNodes[0] ?? { x: 90, y: 58, id: worktree.head }
    return {
      worktree,
      commitId: node.id,
      x: 48 + (index % 4) * 252,
      y: 230 + Math.floor(index / 4) * 252,
    }
  })
  const ancestryPaths = commitNodes.slice(1).map((node, index) => {
    const prev = commitNodes[index]!
    return `M ${prev.x + 112} ${prev.y + 22} L ${node.x} ${node.y + 22}`
  })
  const attachmentPaths = cards.map((card) => {
    const node = nodeByHead.get(card.commitId)!
    return `M ${node.x + 56} ${node.y + 44} L ${card.x + 105} ${card.y}`
  })
  return { commitNodes, cards, ancestryPaths, attachmentPaths }
}

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const hasTauriRuntime = "__TAURI_INTERNALS__" in window || "__TAURI__" in window
  if (!hasTauriRuntime) {
    throw new Error("Tauri runtime unavailable in browser preview.")
  }
  return tauriInvoke<T>(command, args)
}

function restoreState(): AppState {
  const state = createInitialState()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return state
    const parsed = JSON.parse(raw) as Partial<AppState> & { projectPath?: string }
    state.selectedWorktreeId = parsed.selectedWorktreeId ?? null
    state.selectedSessionId = parsed.selectedSessionId ?? null
    state.activeTab = parsed.activeTab ?? "chat"
    state.sessions = parsed.sessions ?? []
    state.approvals = parsed.approvals ?? []
    if (parsed.projectPath) projectPath.value = parsed.projectPath
  } catch {
    return state
  }
  return state
}

function mockProject(path: string): ProjectScan {
  const github: GithubState = {
    provider: "GitHub",
    auth: "unavailable",
    pr: null,
    prUrl: null,
    checks: "mocked",
    review: "mocked",
    message: "Running outside Tauri or GitHub auth unavailable.",
    mocked: true,
  }
  return {
    id: path.includes("minishop") ? "minishop" : "agentbridge",
    label: path.includes("minishop") ? "minishop demo" : "agentbridge",
    rootPath: path,
    anchorPath: path,
    github,
    worktrees: [
      {
        id: "mock-main",
        name: "main",
        path,
        branch: "main",
        upstream: "origin/main",
        head: "a1b2c3d",
        status: "clean",
        ahead: 0,
        behind: 0,
        remote: github,
      },
      {
        id: "mock-feature",
        name: "feat/workflow-demo",
        path: `${path}/feat-workflow-demo`,
        branch: "feat/workflow-demo",
        upstream: null,
        head: "b1c2d3e",
        status: "dirty",
        ahead: 2,
        behind: 0,
        remote: { ...github, pr: "#42" },
      },
    ],
  }
}
</script>

<template>
  <main class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">AB</span>
        <div>
          <strong>AgentHub</strong>
          <span>Local agent control</span>
        </div>
      </div>

      <button class="primary-action" type="button" @click="deploy('Codex', 'write', 'workspace-write')">
        Deploy agent
      </button>

      <section class="project-picker">
        <span>Open project</span>
        <button
          v-for="project in state.projects"
          :key="project.id"
          type="button"
          @click="projectPath = project.path; scanProject(project.path)"
        >
          {{ project.label }}
        </button>
        <input v-model="projectPath" aria-label="Project path" />
        <button type="button" @click="scanProject(projectPath)">Scan path</button>
      </section>

      <nav>
        <a class="active">Worktrees <b>{{ state.project?.worktrees.length ?? 0 }}</b></a>
        <a>Agents <b>{{ state.sessions.length }}</b></a>
        <a>Approvals <b>{{ pendingApprovals.length }}</b></a>
        <a>Artifacts</a>
        <a href="/desktop/design-system.html">Design System</a>
      </nav>

      <section class="trusted-root">
        <span>Trusted root</span>
        <code>{{ state.project?.rootPath ?? projectPath }}</code>
      </section>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div>
          <span class="eyebrow">{{ state.project?.id ?? "Project" }} dashboard</span>
          <h1>Worktree Tree</h1>
        </div>
        <div class="topbar-actions">
          <button type="button" @click="scanProject(projectPath)">{{ loading ? "Scanning..." : "Scan" }}</button>
          <input v-model="newWorktreeBranch" class="compact-input" aria-label="New worktree branch" />
          <input v-model="newWorktreeBase" class="tiny-input" aria-label="Base ref" />
          <button type="button" @click="createWorktree">New worktree</button>
          <button type="button" @click="refreshGithub">GitHub</button>
        </div>
      </header>

      <section class="canvas">
        <div class="graph-stage" :style="{ width: `${graphWidth}px`, height: `${graphHeight}px` }">
          <svg class="tree-lines" :viewBox="`0 0 ${graphWidth} ${graphHeight}`" aria-hidden="true">
            <path v-for="path in graph.ancestryPaths" :key="path" class="connector ancestry" :d="path" />
            <path v-for="path in graph.attachmentPaths" :key="path" class="connector attachment dashed" :d="path" />
          </svg>

          <div
            v-for="node in graph.commitNodes"
            :key="node.id"
            class="commit-node"
            :class="{ 'has-ref': node.hasRef }"
            :style="{ left: `${node.x}px`, top: `${node.y}px` }"
          >
            {{ node.label }}
          </div>

          <article
            v-for="card in graph.cards"
            :key="card.worktree.id"
            class="preview-worktree-card"
            :class="{ selected: card.worktree.id === state.selectedWorktreeId }"
            :style="{ left: `${card.x}px`, top: `${card.y}px` }"
            @click="selectWorktree(card.worktree.id)"
          >
            <span class="card-state-dot" aria-hidden="true"></span>
            <strong>{{ card.worktree.name }}</strong>
            <span class="worktree-ref">{{ card.worktree.upstream ?? card.worktree.branch ?? "detached HEAD" }}</span>
            <div class="card-badges">
              <span class="badge badge-muted">{{ card.worktree.remote.pr ?? "local" }}</span>
              <span class="badge badge-muted">{{ card.worktree.head }}</span>
              <span v-if="card.worktree.status !== 'clean'" class="badge badge-dirty">{{ card.worktree.status }}</span>
              <span v-if="card.worktree.remote.auth !== 'ok'" class="badge badge-danger">GitHub mocked</span>
            </div>
            <span class="sync-row">↑ {{ card.worktree.ahead }} ↓ {{ card.worktree.behind }} GitHub</span>
            <div class="agent-drawer">
              <div>
                <button
                  v-for="session in sessionsForWorktree(state, card.worktree.id)"
                  :key="session.id"
                  type="button"
                  class="agent-chip"
                  :class="session.mode"
                  @click.stop="selectAgent(session.id)"
                >
                  <span class="provider-mark">
                    <img :src="providerIcon(session.provider)" :alt="session.provider" />
                  </span>
                  {{ session.provider }} {{ session.mode }}
                </button>
                <span v-if="!sessionsForWorktree(state, card.worktree.id).length" class="badge badge-muted">No active agents</span>
              </div>
            </div>
            <span class="worktree-footer" :class="worktreeLockClass(card.worktree)">
              {{ worktreeLockLabel(card.worktree) }}
            </span>
          </article>

          <div class="canvas-legend"><span>commit ancestry</span><span>worktree attachment</span></div>
        </div>
      </section>

      <section class="bottom-timeline">
        <strong>{{ currentSession ? `${currentSession.provider} ${currentSession.mode} session` : "No session selected" }}</strong>
        <span>{{ state.notice ?? (currentSession ? currentSession.messages.at(-1)?.text : "Deploy an agent to start a worktree-scoped chat.") }}</span>
      </section>
    </section>

    <aside class="inspector">
      <template v-if="currentWorktree">
        <section class="inspector-hero">
          <span class="eyebrow">Selected worktree</span>
          <h2>{{ currentWorktree.name }}</h2>
          <p>{{ currentWorktree.path }}</p>
        </section>

        <section class="inspector-actions">
          <button type="button" @click="deploy('Codex', 'write', 'workspace-write')">Codex write</button>
          <button type="button" @click="deploy('Gemini', 'read', 'workspace-read')">Gemini read</button>
          <button type="button" @click="deploy('Claude', 'read', 'workspace-read')">Claude read</button>
          <button type="button" @click="pushBranch">Push</button>
          <button type="button" @click="openPr">Open PR</button>
        </section>

        <section class="inspector-section">
          <h3>Git truth</h3>
          <div class="fact-grid">
            <span>Status</span><span class="badge" :class="badgeClass(currentWorktree.status)">{{ currentWorktree.status }}</span>
            <span>HEAD</span><code>{{ currentWorktree.head }}</code>
            <span>Branch</span><span>{{ currentWorktree.branch ?? "detached" }}</span>
            <span>Remote</span><span>{{ currentWorktree.remote.pr ?? "local" }}</span>
            <span>Checks</span><span>{{ currentWorktree.remote.checks }}</span>
          </div>
        </section>

        <section class="inspector-section">
          <h3>Agent access</h3>
          <div class="fact-grid">
            <span>Lock</span><span>{{ worktreeLockLabel(currentWorktree) }}</span>
            <span>Sessions</span><span>{{ currentWorktreeSessions.length }}</span>
            <span>GitHub</span><span :class="badgeClass(currentWorktree.remote.auth)" class="badge">{{ currentWorktree.remote.auth }}</span>
          </div>
          <p v-if="currentWorktree.remote.message" class="small-note">{{ currentWorktree.remote.message }}</p>
        </section>

        <section class="inspector-section">
          <h3>Approvals</h3>
          <section
            v-for="approval in state.approvals.filter((item) => item.worktreeId === currentWorktree?.id)"
            :key="approval.id"
            class="approval-card"
          >
            <header>
              <strong>{{ approval.action }}</strong>
              <span class="badge" :class="badgeClass(approval.state)">{{ approval.state }}</span>
            </header>
            <div class="command-object">
              <span>scope: {{ approval.scope }}</span>
              <code :title="approval.command">{{ approval.command }}</code>
            </div>
            <footer>
              <button v-if="approval.state === 'pending'" class="approve" type="button" @click="resolve(approval.id, 'approved')">Approve</button>
              <button v-if="approval.state === 'pending'" type="button" @click="resolve(approval.id, 'rejected')">Reject</button>
              <span>{{ approval.requestedAt }}</span>
            </footer>
          </section>
          <div v-if="!state.approvals.some((item) => item.worktreeId === currentWorktree?.id)" class="empty-note">No pending approvals.</div>
        </section>

        <section class="session-panel" v-if="currentSession">
          <header>
            <strong>{{ currentSession.provider }} {{ currentSession.mode }}</strong>
            <span class="badge" :class="badgeClass(currentSession.state)">{{ currentSession.state }}</span>
          </header>
          <div class="tabs">
            <button
              v-for="tab in ['chat', 'tasks', 'runs', 'artifacts', 'skills', 'permissions']"
              :key="tab"
              type="button"
              :class="{ active: state.activeTab === tab }"
              @click="setTab(tab as TabId)"
            >
              {{ tab }}
            </button>
          </div>

          <div v-if="state.activeTab === 'chat'" class="chat-pane">
            <div v-for="message in currentSession.messages" :key="message.id" class="chat-message" :class="message.role">
              <span>{{ message.role }}</span>
              <p>{{ message.text }}</p>
            </div>
            <form class="chat-form" @submit.prevent="sendChat">
              <input v-model="chatDraft" placeholder="Ask this agent about the selected worktree..." />
              <button type="submit">Send</button>
            </form>
          </div>

          <div v-else-if="state.activeTab === 'runs'" class="stack-list">
            <section v-for="run in currentSession.runs" :key="run.id" class="run-card" :class="run.state">
              <header><strong>{{ run.title }}</strong><span class="badge" :class="badgeClass(run.state)">{{ run.state }}</span></header>
              <code>{{ run.command }}</code>
              <div class="progress"><span></span></div>
              <footer>{{ run.elapsed }}</footer>
            </section>
          </div>

          <div v-else-if="state.activeTab === 'skills'" class="skills-pane">
            <h4>Loaded</h4>
            <span v-for="skill in currentSession.skills.loaded" :key="skill" class="badge badge-clean">{{ skill }}</span>
            <h4>Suggested</h4>
            <span v-for="skill in currentSession.skills.suggested" :key="skill" class="badge badge-muted">{{ skill }}</span>
            <h4>Blocked / missing</h4>
            <span v-for="skill in currentSession.skills.blocked" :key="skill" class="badge badge-danger">{{ skill }}</span>
            <h4>Events</h4>
            <p v-for="event in currentSession.skills.events" :key="event" class="small-note">{{ event }}</p>
          </div>

          <div v-else-if="state.activeTab === 'permissions'" class="stack-list">
            <p class="small-note">Profile: {{ currentSession.profile }}</p>
            <p class="small-note">Mocked provider execution: {{ currentSession.mocked ? "yes" : "no" }}</p>
          </div>

          <div v-else-if="state.activeTab === 'artifacts'" class="stack-list">
            <div v-for="artifact in currentSession.artifacts" :key="artifact.id" class="artifact-row"><span>{{ artifact.name }}</span><em>{{ artifact.age }}</em></div>
            <div v-if="!currentSession.artifacts.length" class="empty-note">No artifacts yet.</div>
          </div>

          <div v-else class="stack-list">
            <div class="empty-note">Tasks are represented by chat turns and runs in this MVP.</div>
          </div>
        </section>
        <section v-else class="session-panel empty-session-state">
          <header>
            <strong>No agent session selected</strong>
            <span class="badge badge-muted">waiting</span>
          </header>
          <p class="small-note">Deploy or select an agent to inspect session details.</p>
        </section>
      </template>
    </aside>
  </main>
</template>
