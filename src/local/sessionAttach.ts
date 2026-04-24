import type { SessionAdapter, ThreadBinding, StateStore } from "../types.js"

import { ReplyFormatter } from "../bridge/replyFormatter.js"
import { buildThreadName } from "../discord/discordGatewayAdapter.js"
import { buildSessionSummary, type CodexSessionSnapshot } from "../codex/sessionSummary.js"

export interface LocalAttachPublisher {
  publishThread(parentChannelId: string, threadName: string, messages: string[]): Promise<{
    id: string
    label: string
  }>
}

export interface LocalAttachResult {
  localSessionId: string
  managedSessionId: string
  discordThreadId: string
  discordThreadLabel: string
}

export async function attachLocalSession(options: {
  snapshot: CodexSessionSnapshot
  parentChannelId: string
  mentionUserId?: string | null
  adapter: SessionAdapter
  publisher: LocalAttachPublisher
  stateStore: Pick<StateStore, "saveBinding">
  messageLimit?: number
  now?: () => string
}): Promise<LocalAttachResult> {
  const now = options.now ?? (() => new Date().toISOString())
  const summary = buildSessionSummary(options.snapshot)
  const attachPrompt = buildAttachPrompt(summary)
  const result = await options.adapter.startSession(attachPrompt)

  const visiblePrompt = formatQuotedAttachPrompt(options.snapshot, options.mentionUserId ?? null)
  const body = `${visiblePrompt}\n\n${result.output || "(no output)"}`
  const formatter = new ReplyFormatter(options.messageLimit)
  const thread = await options.publisher.publishThread(
    options.parentChannelId,
    buildThreadName(`attached ${options.snapshot.threadName}`),
    formatter.chunk(body),
  )

  const timestamp = now()
  const binding: ThreadBinding = {
    threadId: thread.id,
    sessionId: result.sessionId,
    provider: options.adapter.provider,
    backend: options.adapter.backendKind,
    workspaceId: null,
    workspaceLabel: options.snapshot.cwd,
    workspacePath: options.snapshot.cwd,
    permissionProfile: "workspace-write",
    state: "bound_idle",
    createdAt: timestamp,
    updatedAt: timestamp,
    lastError: null,
    lastReadMessageId: null,
  }
  options.stateStore.saveBinding(binding)

  return {
    localSessionId: options.snapshot.sessionId,
    managedSessionId: result.sessionId,
    discordThreadId: thread.id,
    discordThreadLabel: thread.label,
  }
}

export function buildAttachPrompt(summary: string): string {
  return [
    "Bootstrap this AgentBridge-managed Codex thread from the following summary of an unmanaged local Codex session.",
    "Use it as context for future follow-up from Discord.",
    "",
    summary,
    "",
    "Reply with a concise acknowledgement that the thread is attached and ready for follow-up.",
  ].join("\n")
}

export function formatQuotedAttachPrompt(
  snapshot: { threadName: string; updatedAt: string },
  mentionUserId: string | null,
): string {
  const lines = [
    `Attached local Codex session: ${snapshot.threadName}`,
    `Updated: ${snapshot.updatedAt || "unknown"}`,
    "Imported visible chat summary into AgentBridge-managed Codex thread.",
  ]
  const quoted = lines.map((line) => `> ${line}`).join("\n")
  return mentionUserId ? `<@${mentionUserId}>\n\n${quoted}` : quoted
}
