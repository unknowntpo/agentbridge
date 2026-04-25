<script setup lang="ts">
import { invoke as tauriInvoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { computed, onMounted, reactive, ref, watch } from "vue"

import { buildCommitLogRows, commitGraphSvgPath } from "./commit-log"
import {
  addAgentSession,
  createApproval,
  createInitialState,
  closeAgentDrawer,
  deployAgentFromDraft,
  lockStateForWorktree,
  normalizeProjectScan,
  openAgentDrawer,
  resolveApproval,
  selectInitialWorktree,
  selectedSession,
  selectedWorktree,
  sendAgentMessage,
  sessionsForWorktree,
  updateAgentDraft,
  withRemoteLoading,
  type AgentSession,
  type AllowedProject,
  type AppState,
  type GithubState,
  type ProjectScan,
  type Provider,
  type TabId,
} from "./store"

interface CommandOutcome {
  ok: boolean
  message: string
  stdout: string
  stderr: string
}

interface ProjectChangedEvent {
  path: string
  reason: string
}

const STORAGE_KEY = "agenthub.mvp.state.v1"
const DEFAULT_MINISHOP = "/Users/unknowntpo/repo/unknowntpo/minishop"
const DEFAULT_AGENTBRIDGE = "/Users/unknowntpo/repo/unknowntpo/agentbridge/main"

const projectPath = ref(DEFAULT_MINISHOP)
const state = reactive<AppState>(restoreState())
const chatDraft = ref("")
const newWorktreeBranch = ref("feat/agenthub-demo")
const newWorktreeBase = ref("HEAD")
const loadingProjectId = ref<string | null>(null)
const agentDeploying = ref(false)
const watchingProjectPath = ref<string | null>(null)

const currentWorktree = computed(() => selectedWorktree(state))
const currentSession = computed(() => selectedSession(state))
const currentWorktreeSessions = computed(() => (
  currentWorktree.value ? sessionsForWorktree(state, currentWorktree.value.id) : []
))
const pendingApprovals = computed(() => state.approvals.filter((approval) => approval.state === "pending"))
const visibleSessions = computed(() => state.sessions.length ? state.sessions : demoSessionsForProject(state.project?.worktrees ?? []))
const commitRows = computed(() => buildCommitLogRows(state.project?.worktrees ?? [], visibleSessions.value))
const commitGraph = computed(() => commitGraphSvgPath(commitRows.value.length))

watch(
  () => ({
    selectedWorktreeId: state.selectedWorktreeId,
    selectedSessionId: state.selectedSessionId,
    activeTab: state.activeTab,
    sessions: state.sessions,
    approvals: state.approvals,
    projectPath: projectPath.value,
    agentDrawerOpen: state.agentDrawerOpen,
    agentDraft: state.agentDraft,
  }),
  (snapshot) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  },
  { deep: true },
)

onMounted(async () => {
  await listen<ProjectChangedEvent>("project_changed", async (event) => {
    if (!state.project || event.payload.path !== state.project.rootPath) return
    state.notice = `Project changed (${event.payload.reason}). Reloading local worktrees.`
    await scanProjectLocalOnly(event.payload.path)
  })
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
  state.projectLoading = "local-scanning"
  loadingProjectId.value = state.projects.find((project) => project.path === path)?.id ?? path
  state.notice = null
  try {
    const localScan = await invokeCommand<ProjectScan>("scan_project_local", { path })
    applyProject(withRemoteLoading(localScan, true))
    await startProjectWatch(localScan.rootPath)
    state.projectLoading = "remote-refreshing"
    state.notice = "Local worktrees loaded. Refreshing GitHub state in background."
    void refreshProjectRemote(path)
  } catch (error) {
    state.notice = `Using browser mock state. Open the Tauri window for real Git/GitHub scanning. ${String(error)}`
    applyProject(mockProject(path))
    state.projectLoading = "idle"
    loadingProjectId.value = null
  }
}

async function scanProjectLocalOnly(path: string): Promise<void> {
  state.projectLoading = "local-scanning"
  try {
    const localScan = await invokeCommand<ProjectScan>("scan_project_local", { path })
    applyProject(withRemoteLoading(localScan, false))
    state.notice = "Local Git state updated."
  } catch (error) {
    state.notice = `Local refresh blocked: ${String(error)}`
  } finally {
    state.projectLoading = "idle"
  }
}

async function startProjectWatch(path: string): Promise<void> {
  if (watchingProjectPath.value === path) return
  watchingProjectPath.value = path
  try {
    await invokeCommand<void>("start_project_watch", { path })
  } catch (error) {
    state.notice = `Live watch unavailable: ${String(error)}`
  }
}

async function refreshProjectRemote(path: string): Promise<void> {
  try {
    const enriched = await invokeCommand<ProjectScan>("scan_project", { path })
    applyProject(withRemoteLoading(enriched, false))
    state.notice = "GitHub state refreshed."
  } catch (error) {
    if (state.project) {
      state.project = withRemoteLoading(state.project, false)
    }
    state.notice = `Remote refresh blocked: ${String(error)}`
  } finally {
    state.projectLoading = "idle"
    loadingProjectId.value = null
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

function openDeployDrawer(): void {
  const worktree = currentWorktree.value
  if (!worktree) return
  Object.assign(state, openAgentDrawer(state, worktree))
}

function closeDeployDrawer(): void {
  Object.assign(state, closeAgentDrawer(state))
}

function updateDraft(patch: Parameters<typeof updateAgentDraft>[1]): void {
  Object.assign(state, updateAgentDraft(state, patch))
}

async function createAgentFromDrawer(): Promise<void> {
  const draft = state.agentDraft
  if (!draft || agentDeploying.value) return

  agentDeploying.value = true
  state.notice = "Starting agent through AgentBridge..."
  try {
    const session = await invokeCommand<AgentSession>("deploy_agent", {
      worktreeId: draft.worktreeId,
      worktreePath: draft.workingDirectory,
      provider: draft.provider.toLowerCase(),
      mode: draft.mode,
      profile: draft.profile,
      prompt: draft.prompt,
    })
    Object.assign(state, addAgentSession(state, session))
  } catch (error) {
    const next = deployAgentFromDraft(state)
    Object.assign(state, {
      ...next,
      notice: `Real agent deploy blocked; using local mock session. ${String(error)}`,
    })
  } finally {
    agentDeploying.value = false
  }
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
    worktree.remoteLoading = false
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

function demoSessionsForProject(worktrees: WorktreeScan[]): AgentSession[] {
  const feature = worktrees.find((worktree) => /agent|drawer|feature|workflow/i.test(`${worktree.name} ${worktree.branch ?? ""}`)) ?? worktrees[1]
  const docs = worktrees.find((worktree) => /docs|permission/i.test(`${worktree.name} ${worktree.branch ?? ""}`)) ?? worktrees[2]
  const experiment = worktrees.find((worktree) => /exp|cache|experiment/i.test(`${worktree.name} ${worktree.branch ?? ""}`)) ?? worktrees[3]
  return [
    feature && demoSession(feature.id, "Codex", "write", "running"),
    feature && demoSession(feature.id, "Gemini", "read", "idle"),
    docs && demoSession(docs.id, "Claude", "read", "idle"),
    docs && demoSession(docs.id, "Gemini", "read", "idle"),
    experiment && demoSession(experiment.id, "Codex", "write", "blocked"),
  ].filter(Boolean) as AgentSession[]
}

function demoSession(worktreeId: string, provider: Provider, mode: "write" | "read", agentState: "running" | "blocked" | "idle"): AgentSession {
  return {
    id: `demo-${worktreeId}-${provider}-${mode}`,
    worktreeId,
    provider,
    mode,
    profile: mode === "read" ? "workspace-read" : "workspace-write",
    state: agentState,
    prompt: `Demo ${provider} ${mode} agent`,
    workingDirectory: "",
    mocked: true,
    messages: [],
    runs: [],
    artifacts: [],
    skills: {
      loaded: ["frontend-feedback-loop"],
      suggested: ["git-worktree-sop"],
      blocked: [],
      events: ["Demo session for preview layout."],
    },
  }
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
        name: "agent-drawer",
        path: `${path}/wt/agent-drawer`,
        branch: "feat/agent-drawer",
        upstream: null,
        head: "d4e5f6a",
        status: "clean",
        ahead: 5,
        behind: 0,
        remote: { ...github, pr: "#42" },
      },
      {
        id: "mock-docs",
        name: "docs-permissions",
        path: `${path}/wt/docs-permissions`,
        branch: "docs/permissions",
        upstream: null,
        head: "e7fa89b",
        status: "clean",
        ahead: 2,
        behind: 0,
        remote: { ...github, pr: "#39" },
      },
      {
        id: "mock-exp",
        name: "experiment-cache",
        path: `${path}/wt/experiment-cache`,
        branch: "exp/cache",
        upstream: null,
        head: "b1c2d3e",
        status: "dirty",
        ahead: 0,
        behind: 0,
        remote: { ...github, pr: null },
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

      <button class="primary-action" type="button" @click="openDeployDrawer">
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
          <span class="project-button-label">{{ project.label }}</span>
          <span v-if="loadingProjectId === project.id" class="inline-spinner" aria-hidden="true"></span>
        </button>
        <input v-model="projectPath" aria-label="Project path" />
        <button type="button" @click="scanProject(projectPath)">
          <span>Scan path</span>
          <span v-if="loadingProjectId === projectPath" class="inline-spinner" aria-hidden="true"></span>
        </button>
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
          <h1>Commit Workflow</h1>
        </div>
        <div class="topbar-actions">
          <span v-if="state.projectLoading !== 'idle'" class="loading-pill">
            <span class="inline-spinner" aria-hidden="true"></span>
            {{ state.projectLoading === "local-scanning" ? "Loading local Git" : "Refreshing GitHub" }}
          </span>
          <button type="button" :disabled="state.projectLoading === 'local-scanning'" @click="scanProject(projectPath)">
            {{ state.projectLoading === "local-scanning" ? "Scanning..." : "Scan" }}
          </button>
          <input v-model="newWorktreeBranch" class="compact-input" aria-label="New worktree branch" />
          <input v-model="newWorktreeBase" class="tiny-input" aria-label="Base ref" />
          <button type="button" @click="createWorktree">New worktree</button>
          <button type="button" @click="refreshGithub">GitHub</button>
        </div>
      </header>

      <section class="canvas">
        <div class="workflow-preview">
          <aside class="worktree-list-panel">
            <header>
              <div>
                <span class="eyebrow">Local worktrees</span>
                <strong>{{ state.project?.worktrees.length ?? 0 }} checked out</strong>
              </div>
              <button type="button" @click="createWorktree">+</button>
            </header>
            <button
              v-for="worktree in state.project?.worktrees ?? []"
              :key="worktree.id"
              type="button"
              class="worktree-list-row"
              :class="{ active: worktree.id === state.selectedWorktreeId }"
              @click="selectWorktree(worktree.id)"
            >
              <span>
                <strong>{{ worktree.name }}</strong>
                <code>{{ worktree.branch ?? "detached HEAD" }}</code>
              </span>
              <span class="badge" :class="badgeClass(worktree.status)">{{ worktree.status }}</span>
            </button>
          </aside>

          <section class="commit-log-panel" data-testid="commit-log-panel">
            <header class="commit-log-titlebar">
              <div>
                <span class="eyebrow">Git graph</span>
                <h2>Commit log</h2>
              </div>
              <div class="commit-log-legend" aria-label="Graph lanes">
                <span class="main">main</span>
                <span class="feature">feat</span>
                <span class="docs">docs</span>
                <span class="experiment">exp</span>
              </div>
            </header>

            <div class="commit-log-table">
              <div class="commit-log-header-row">
                <span>Graph</span>
                <span>Commit</span>
                <span>Worktree</span>
                <span>Agent</span>
                <span>Status</span>
              </div>
              <div class="commit-log-rows">
                <svg
                  class="commit-log-svg"
                  :viewBox="commitGraph.viewBox"
                  preserveAspectRatio="xMinYMin meet"
                  aria-hidden="true"
                >
                  <path class="line main" :d="commitGraph.main" />
                  <path class="line feature" :d="commitGraph.feature" />
                  <path class="line docs" :d="commitGraph.docs" />
                  <path class="line experiment" :d="commitGraph.experiment" />
                  <g v-for="point in commitGraph.points" :key="point.id" :class="['node', point.lane, point.kind]">
                    <circle v-if="point.kind === 'merge'" class="halo" :cx="point.x" :cy="point.y" r="9" />
                    <circle v-if="point.kind === 'head'" class="halo" :cx="point.x" :cy="point.y" r="13" />
                    <circle class="core" :cx="point.x" :cy="point.y" :r="point.kind === 'merge' ? 3.5 : point.kind === 'head' ? 6.5 : 4.5" />
                  </g>
                </svg>

                <button
                  v-for="row in commitRows"
                  :key="row.id"
                  type="button"
                  class="commit-log-row"
                  :class="{ active: row.worktreeId === state.selectedWorktreeId, dirty: row.status === 'dirty' }"
                  @click="row.worktreeId && selectWorktree(row.worktreeId)"
                >
                  <span class="graph-spacer" aria-hidden="true"></span>
                  <span class="commit-message-cell">
                    <span class="commit-title-line">
                      <strong>{{ row.message }}</strong>
                      <span
                        v-for="ref in row.refs"
                        :key="`${row.id}-${ref.label}`"
                        class="commit-ref-badge"
                        :class="ref.tone"
                      >
                        {{ ref.label }}
                      </span>
                    </span>
                    <code>{{ row.sha }} · {{ row.detail }}</code>
                  </span>
                  <span class="commit-worktree-cell">{{ row.worktreeName }}</span>
                  <span class="commit-agent-cell">
                    <template v-if="row.agents.length">
                      <button
                        v-for="session in row.agents"
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
                    </template>
                    <span v-else class="muted-dash">—</span>
                  </span>
                  <span class="badge" :class="badgeClass(row.status)">{{ row.status }}</span>
                </button>
              </div>
            </div>
          </section>
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
          <button type="button" @click="openDeployDrawer">Deploy agent</button>
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
            <span>Checks</span><span>{{ currentWorktree.remoteLoading ? "loading..." : currentWorktree.remote.checks }}</span>
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

    <aside v-if="state.agentDrawerOpen && state.agentDraft" class="agent-drawer-panel" aria-label="Create agent drawer">
      <header>
        <div>
          <span class="eyebrow">Create agent</span>
          <h2>{{ currentWorktree?.name ?? "No worktree" }}</h2>
        </div>
        <button type="button" @click="closeDeployDrawer">Close</button>
      </header>

      <section class="drawer-section">
        <span class="section-label">Provider</span>
        <div class="segmented-row">
          <button
            v-for="provider in ['Codex', 'Gemini', 'Claude']"
            :key="provider"
            type="button"
            :class="{ active: state.agentDraft.provider === provider }"
            @click="updateDraft({ provider: provider as Provider })"
          >
            {{ provider }}
          </button>
        </div>
      </section>

      <section class="drawer-section">
        <span class="section-label">Permission</span>
        <div class="segmented-row stacked">
          <button
            type="button"
            :class="{ active: state.agentDraft.profile === 'workspace-read' }"
            @click="updateDraft({ mode: 'read', profile: 'workspace-read' })"
          >
            Read-only
          </button>
          <button
            type="button"
            :class="{ active: state.agentDraft.profile === 'workspace-write' }"
            @click="updateDraft({ mode: 'write', profile: 'workspace-write' })"
          >
            Workspace write
          </button>
          <button
            type="button"
            :class="{ active: state.agentDraft.profile === 'full-access' }"
            @click="updateDraft({ mode: 'write', profile: 'full-access' })"
          >
            Full access
          </button>
        </div>
      </section>

      <section class="drawer-section">
        <label>
          <span class="section-label">Working directory</span>
          <input
            :value="state.agentDraft.workingDirectory"
            @input="updateDraft({ workingDirectory: ($event.target as HTMLInputElement).value })"
          />
        </label>
        <p class="small-note">Default is selected worktree path. Keep it inside the trusted project root.</p>
      </section>

      <section class="drawer-section">
        <label>
          <span class="section-label">Task prompt</span>
          <textarea
            :value="state.agentDraft.prompt"
            @input="updateDraft({ prompt: ($event.target as HTMLTextAreaElement).value })"
          />
        </label>
      </section>

      <footer>
        <button type="button" @click="closeDeployDrawer">Cancel</button>
        <button class="primary-action" type="button" :disabled="agentDeploying" @click="createAgentFromDrawer">
          {{ agentDeploying ? "Starting..." : "Create agent" }}
        </button>
      </footer>
    </aside>
  </main>
</template>
