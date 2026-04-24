export type ThreadBindingState =
  | "starting"
  | "bound_idle"
  | "executing"
  | "delivering"
  | "failed"
  | "stopped"

export type ProviderKind = "codex" | "gemini"
export type SessionBackendKind = "exec" | "app-server" | "cli"
export type PermissionProfile = "workspace-read" | "workspace-write" | "full-access"

export interface TrustedWorkspace {
  id: string
  label: string
  path: string
}

export interface ResolvedWorkspace {
  id: string | null
  label: string
  path: string
  trusted: boolean
}

export interface ThreadBinding {
  threadId: string
  sessionId: string
  provider: ProviderKind
  backend: SessionBackendKind
  workspaceId: string | null
  workspaceLabel: string
  workspacePath: string
  permissionProfile: PermissionProfile
  state: ThreadBindingState
  createdAt: string
  updatedAt: string
  lastError: string | null
  lastReadMessageId: string | null
}

export interface PendingApproval {
  requestId: string
  ref: string
  source: "discord"
  provider: ProviderKind
  requesterUserId: string
  requesterDisplayName: string
  prompt: string
  parentChannelId: string
  workspaceId: string | null
  workspaceLabel: string
  workspacePath: string
  permissionProfile: PermissionProfile
  createdAt: string
}

export interface InboundDiscordMessage {
  threadId: string
  messageId: string
  content: string
  authorId?: string
}

export interface CodexTurnResult {
  sessionId: string
  output: string
  events: unknown[]
}

export interface DiscordTransport {
  sendReply(threadId: string, content: string): Promise<void>
  listVisibleThreadMessages(threadId: string, afterMessageId?: string | null): Promise<ThreadTranscriptMessage[]>
  getLatestVisibleThreadMessageId(threadId: string): Promise<string | null>
}

export interface ThreadTranscriptMessage {
  id: string
  authorId: string
  authorName: string
  isBot: boolean
  content: string
}

export interface BridgeRuntime {
  start(): Promise<void>
  stop(): Promise<void>
}

export interface SessionAdapter {
  readonly provider: ProviderKind
  readonly backendKind: SessionBackendKind
  startSession(prompt: string): Promise<CodexTurnResult>
  resumeSession(sessionId: string, prompt: string): Promise<CodexTurnResult>
}

export interface SessionProvider {
  readonly kind: ProviderKind
  readonly backendKind: SessionBackendKind
  createAdapter(cwd: string): SessionAdapter
  openSession(sessionId: string, cwd: string): Promise<number>
}

export interface StateStore {
  initialize(): void
  close(): void
  getBinding(threadId: string): ThreadBinding | null
  listBindings(): ThreadBinding[]
  saveBinding(binding: ThreadBinding): void
  deleteBinding(threadId: string): void
  getPendingApproval(requestId: string): PendingApproval | null
  listPendingApprovals(): PendingApproval[]
  savePendingApproval(approval: PendingApproval): void
  deletePendingApproval(requestId: string): void
  recoverBindings(): ThreadBinding[]
}

export interface CommandResult {
  kind: "new" | "chat"
  prompt: string
}
