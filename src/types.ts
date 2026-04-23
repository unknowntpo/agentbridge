export type ThreadBindingState =
  | "starting"
  | "bound_idle"
  | "executing"
  | "delivering"
  | "failed"
  | "stopped"

export interface ThreadBinding {
  threadId: string
  sessionId: string
  state: ThreadBindingState
  createdAt: string
  updatedAt: string
  lastError: string | null
  lastReadMessageId: string | null
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

export interface CodexAdapter {
  startSession(prompt: string): Promise<CodexTurnResult>
  resumeSession(sessionId: string, prompt: string): Promise<CodexTurnResult>
}

export interface StateStore {
  initialize(): void
  close(): void
  getBinding(threadId: string): ThreadBinding | null
  listBindings(): ThreadBinding[]
  saveBinding(binding: ThreadBinding): void
  deleteBinding(threadId: string): void
  recoverBindings(): ThreadBinding[]
}

export interface CommandResult {
  kind: "new" | "chat"
  prompt: string
}
