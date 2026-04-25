export type Provider = "Codex" | "Claude" | "Gemini"
export type AgentMode = "write" | "read"
export type AgentState = "running" | "blocked" | "idle"
export type PermissionProfile = "workspace-read" | "workspace-write" | "full-access"
export type TabId = "chat" | "tasks" | "runs" | "artifacts" | "skills" | "permissions"
export type ProjectLoadingState = "idle" | "local-scanning" | "remote-refreshing"

export interface AllowedProject {
  id: string
  label: string
  path: string
}

export interface GithubState {
  provider: "GitHub"
  auth: "ok" | "unavailable" | string
  pr: string | null
  prUrl: string | null
  checks: string
  review: string
  message: string | null
  mocked: boolean
}

export interface WorktreeScan {
  id: string
  name: string
  path: string
  branch: string | null
  upstream: string | null
  head: string
  status: "clean" | "dirty" | "conflict" | string
  ahead: number
  behind: number
  remote: GithubState
  remoteLoading?: boolean
}

export interface ProjectScan {
  id: string
  label: string
  rootPath: string
  anchorPath: string
  github: GithubState
  worktrees: WorktreeScan[]
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant" | "system"
  text: string
  at: string
}

export interface SkillState {
  loaded: string[]
  suggested: string[]
  blocked: string[]
  events: string[]
}

export interface RunRecord {
  id: string
  title: string
  command: string
  state: "running" | "completed" | "failed"
  elapsed: string
}

export interface ArtifactRecord {
  id: string
  name: string
  age: string
}

export interface ApprovalRequest {
  id: string
  worktreeId: string
  sessionId: string | null
  actor: Provider
  scope: "network" | "workspace-write" | "filesystem" | "git-remote"
  action: string
  command: string
  requestedAt: string
  state: "pending" | "approved" | "rejected"
}

export interface AgentSession {
  id: string
  worktreeId: string
  provider: Provider
  mode: AgentMode
  profile: PermissionProfile
  state: AgentState
  prompt: string
  workingDirectory: string
  mocked: boolean
  messages: ChatMessage[]
  runs: RunRecord[]
  artifacts: ArtifactRecord[]
  skills: SkillState
}

export interface AppState {
  projects: AllowedProject[]
  project: ProjectScan | null
  selectedWorktreeId: string | null
  selectedSessionId: string | null
  activeTab: TabId
  sessions: AgentSession[]
  approvals: ApprovalRequest[]
  notice: string | null
  projectLoading: ProjectLoadingState
  agentDrawerOpen: boolean
  agentDraft: AgentDraft | null
}

export interface AgentDraft {
  worktreeId: string
  provider: Provider
  mode: AgentMode
  profile: PermissionProfile
  workingDirectory: string
  prompt: string
}

export function createInitialState(): AppState {
  return {
    projects: [],
    project: null,
    selectedWorktreeId: null,
    selectedSessionId: null,
    activeTab: "chat",
    sessions: [],
    approvals: [],
    notice: null,
    projectLoading: "idle",
    agentDrawerOpen: false,
    agentDraft: null,
  }
}

export function normalizeProjectScan(scan: ProjectScan): ProjectScan {
  return {
    ...scan,
    worktrees: [...scan.worktrees].sort((left, right) => {
      if (left.name === "main") return -1
      if (right.name === "main") return 1
      return left.name.localeCompare(right.name)
    }),
  }
}

export function selectInitialWorktree(scan: ProjectScan): string | null {
  return scan.worktrees.find((worktree) => worktree.name === "main")?.id ?? scan.worktrees[0]?.id ?? null
}

export function sessionsForWorktree(state: AppState, worktreeId: string): AgentSession[] {
  return state.sessions.filter((session) => session.worktreeId === worktreeId)
}

export function selectedWorktree(state: AppState): WorktreeScan | null {
  return state.project?.worktrees.find((worktree) => worktree.id === state.selectedWorktreeId) ?? null
}

export function selectedSession(state: AppState): AgentSession | null {
  return state.sessions.find((session) => session.id === state.selectedSessionId) ?? null
}

export function deployAgent(
  state: AppState,
  options: {
    worktreeId: string
    provider: Provider
    mode: AgentMode
    profile: PermissionProfile
    workingDirectory: string
    prompt: string
    mocked?: boolean
  },
): AppState {
  const existingWriter = state.sessions.find((session) => (
    session.worktreeId === options.worktreeId &&
    session.mode === "write" &&
    session.state !== "blocked"
  ))
  if (options.mode === "write" && existingWriter) {
    const approval = createApproval({
      worktreeId: options.worktreeId,
      sessionId: existingWriter.id,
      actor: options.provider,
      scope: "workspace-write",
      action: "Acquire write lock",
      command: `deploy ${options.provider} write agent`,
    })
    return {
      ...state,
      approvals: [...state.approvals, approval],
      notice: `${existingWriter.provider} already owns the write lock. Approval required.`,
    }
  }

  const session: AgentSession = {
    id: createId("session"),
    worktreeId: options.worktreeId,
    provider: options.provider,
    mode: options.mode,
    profile: options.profile,
    state: "running",
    prompt: options.prompt,
    workingDirectory: options.workingDirectory,
    mocked: options.mocked ?? true,
    messages: [
      message("system", `${options.provider} ${options.mode} session started on this worktree.`),
      message("user", options.prompt || "Start working on this worktree."),
      message("assistant", mockAgentReply(options.provider, options.mode, options.profile)),
    ],
    runs: [
      {
        id: createId("run"),
        title: "Session bootstrap",
        command: `${options.provider.toLowerCase()} session start`,
        state: "completed",
        elapsed: "now",
      },
    ],
    artifacts: [],
    skills: skillsForProvider(options.provider),
  }

  return {
    ...state,
    selectedSessionId: session.id,
    activeTab: "chat",
    sessions: [...state.sessions, session],
    notice: session.mocked ? `${options.provider} session is mocked until provider launch is wired.` : null,
  }
}

export function createAgentDraft(worktree: WorktreeScan): AgentDraft {
  return {
    worktreeId: worktree.id,
    provider: "Codex",
    mode: "write",
    profile: "workspace-write",
    workingDirectory: worktree.path,
    prompt: `Work on ${worktree.name}`,
  }
}

export function updateAgentDraft(state: AppState, patch: Partial<AgentDraft>): AppState {
  if (!state.agentDraft) return state
  const next = { ...state.agentDraft, ...patch }
  if (next.mode === "read" && next.profile !== "workspace-read") {
    next.profile = "workspace-read"
  }
  if (next.mode === "write" && next.profile === "workspace-read") {
    next.profile = "workspace-write"
  }
  return { ...state, agentDraft: next }
}

export function openAgentDrawer(state: AppState, worktree: WorktreeScan): AppState {
  return {
    ...state,
    agentDrawerOpen: true,
    agentDraft: createAgentDraft(worktree),
  }
}

export function closeAgentDrawer(state: AppState): AppState {
  return {
    ...state,
    agentDrawerOpen: false,
  }
}

export function deployAgentFromDraft(state: AppState): AppState {
  const draft = state.agentDraft
  if (!draft) return state
  const next = deployAgent(state, {
    worktreeId: draft.worktreeId,
    provider: draft.provider,
    mode: draft.mode,
    profile: draft.profile,
    workingDirectory: draft.workingDirectory,
    prompt: draft.prompt,
  })
  return {
    ...next,
    agentDrawerOpen: false,
  }
}

export function withProjectLoading(state: AppState, projectLoading: ProjectLoadingState): AppState {
  return { ...state, projectLoading }
}

export function withRemoteLoading(scan: ProjectScan, loading: boolean): ProjectScan {
  return {
    ...scan,
    worktrees: scan.worktrees.map((worktree) => ({
      ...worktree,
      remoteLoading: loading,
    })),
  }
}

export function sendAgentMessage(state: AppState, sessionId: string, text: string): AppState {
  const trimmed = text.trim()
  if (!trimmed) return state

  return {
    ...state,
    sessions: state.sessions.map((session) => {
      if (session.id !== sessionId) return session
      const needsApproval = /\b(push|pr|merge|network|install|full access|full-access)\b/i.test(trimmed)
      const run: RunRecord = {
        id: createId("run"),
        title: needsApproval ? "Approval requested" : "Command run",
        command: needsApproval ? "permission gate" : "mock agent turn",
        state: needsApproval ? "running" : "completed",
        elapsed: "now",
      }
      return {
        ...session,
        state: needsApproval ? "blocked" : "running",
        messages: [
          ...session.messages,
          message("user", trimmed),
          message("assistant", needsApproval
            ? "This needs approval before I continue."
            : "I updated the task state and would run the next local check in a real provider session."),
        ],
        runs: [run, ...session.runs],
        skills: {
          ...session.skills,
          events: [`${new Date().toLocaleTimeString()} processed chat turn`, ...session.skills.events],
        },
      }
    }),
    approvals: /\b(push|pr|merge|network|install|full access|full-access)\b/i.test(trimmed)
      ? [...state.approvals, createApproval({
        worktreeId: state.sessions.find((session) => session.id === sessionId)?.worktreeId ?? "",
        sessionId,
        actor: state.sessions.find((session) => session.id === sessionId)?.provider ?? "Codex",
        scope: "git-remote",
        action: "Continue requested operation",
        command: trimmed,
      })]
      : state.approvals,
  }
}

export function resolveApproval(state: AppState, approvalId: string, decision: "approved" | "rejected"): AppState {
  const approval = state.approvals.find((candidate) => candidate.id === approvalId)
  return {
    ...state,
    approvals: state.approvals.map((candidate) => (
      candidate.id === approvalId ? { ...candidate, state: decision } : candidate
    )),
    sessions: state.sessions.map((session) => {
      if (!approval || session.id !== approval.sessionId) return session
      return {
        ...session,
        state: decision === "approved" ? "running" : "blocked",
        messages: [
          ...session.messages,
          message("system", `Approval ${decision}: ${approval.action}.`),
        ],
      }
    }),
    notice: `Approval ${decision}.`,
  }
}

export function lockStateForWorktree(state: AppState, worktreeId: string): {
  state: "unlocked" | "write-locked" | "approval-required"
  writer: Provider | null
} {
  if (state.approvals.some((approval) => approval.worktreeId === worktreeId && approval.state === "pending")) {
    return { state: "approval-required", writer: null }
  }
  const writer = state.sessions.find((session) => session.worktreeId === worktreeId && session.mode === "write")
  return writer ? { state: "write-locked", writer: writer.provider } : { state: "unlocked", writer: null }
}

export function createApproval(options: {
  worktreeId: string
  sessionId: string | null
  actor: Provider
  scope: ApprovalRequest["scope"]
  action: string
  command: string
}): ApprovalRequest {
  return {
    id: createId("approval"),
    worktreeId: options.worktreeId,
    sessionId: options.sessionId,
    actor: options.actor,
    scope: options.scope,
    action: options.action,
    command: options.command,
    requestedAt: "now",
    state: "pending",
  }
}

export function skillsForProvider(provider: Provider): SkillState {
  if (provider === "Codex") {
    return {
      loaded: ["git-worktree-sop", "design-system-adapter"],
      suggested: ["github:yeet", "isolated-demo-tests"],
      blocked: ["spectra-discuss not installed in this session"],
      events: ["Loaded worktree and design feedback-loop skills"],
    }
  }
  if (provider === "Gemini") {
    return {
      loaded: ["repo-reader", "code-review"],
      suggested: ["github-summary"],
      blocked: ["write mode unavailable in this mock"],
      events: ["Attached read-only capability set"],
    }
  }
  return {
    loaded: ["analysis", "refactor-notes"],
    suggested: ["test-plan"],
    blocked: ["Claude provider launch not wired yet"],
    events: ["Attached read-only capability set"],
  }
}

export function mockAgentReply(provider: Provider, mode: AgentMode, profile: PermissionProfile): string {
  return `${provider} is attached in ${mode} mode with ${profile}. Real provider execution is mocked if the CLI cannot be launched.`
}

function message(role: ChatMessage["role"], text: string): ChatMessage {
  return {
    id: createId("msg"),
    role,
    text,
    at: new Date().toLocaleTimeString(),
  }
}

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}
