import type { SessionAdapter, StateStore, ThreadBinding } from "../types.js"
import type { SessionContract } from "../bridge/agentBridge.js"

import { ReplyFormatter } from "../bridge/replyFormatter.js"
import { buildThreadName } from "../discord/discordGatewayAdapter.js"

export interface LocalSessionPublisher {
  publishThread(parentChannelId: string, threadName: string, messages: string[]): Promise<{
    id: string
    label: string
  }>
}

export interface LocalSessionNewResult {
  prompt: string
  cwd: string
  provider: ThreadBinding["provider"]
  managedSessionId: string
  discordThreadId: string
  discordThreadLabel: string
  workspaceId: string | null
  workspaceLabel: string
  workspacePath: string
  permissionProfile: ThreadBinding["permissionProfile"]
}

export async function createManagedLocalSession(options: {
  cwd: string
  prompt: string
  parentChannelId: string
  mentionUserId?: string | null
  contract: SessionContract
  adapter: SessionAdapter
  publisher: LocalSessionPublisher
  stateStore: Pick<StateStore, "saveBinding">
  messageLimit?: number
  now?: () => string
}): Promise<LocalSessionNewResult> {
  const now = options.now ?? (() => new Date().toISOString())
  const result = await options.adapter.startSession(options.prompt)
  const formatter = new ReplyFormatter(options.messageLimit)
  const thread = await options.publisher.publishThread(
    options.parentChannelId,
    buildThreadName(options.prompt),
    [
      formatQuotedNewPrompt(options.prompt, options.mentionUserId ?? null),
      ...formatter.chunk(result.output || "(no output)"),
    ],
  )

  const timestamp = now()
  const binding: ThreadBinding = {
    threadId: thread.id,
    sessionId: result.sessionId,
    provider: options.adapter.provider,
    backend: options.adapter.backendKind,
    workspaceId: options.contract.workspaceId,
    workspaceLabel: options.contract.workspaceLabel,
    workspacePath: options.contract.workspacePath,
    permissionProfile: options.contract.permissionProfile,
    state: "bound_idle",
    createdAt: timestamp,
    updatedAt: timestamp,
    lastError: null,
    lastReadMessageId: null,
  }
  options.stateStore.saveBinding(binding)

  return {
    prompt: options.prompt,
    cwd: options.cwd,
    provider: options.adapter.provider,
    managedSessionId: result.sessionId,
    discordThreadId: thread.id,
    discordThreadLabel: thread.label,
    workspaceId: options.contract.workspaceId,
    workspaceLabel: options.contract.workspaceLabel,
    workspacePath: options.contract.workspacePath,
    permissionProfile: options.contract.permissionProfile,
  }
}

export function formatQuotedNewPrompt(prompt: string, mentionUserId: string | null): string {
  const quoted = `> ${prompt}`
  return mentionUserId ? `<@${mentionUserId}>\n\n${quoted}` : quoted
}
