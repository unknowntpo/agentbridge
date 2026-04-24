import { ReplyFormatter } from "./replyFormatter.js"
import type {
  DiscordTransport,
  InboundDiscordMessage,
  PermissionProfile,
  ProviderKind,
  StateStore,
  ThreadTranscriptMessage,
  ThreadBinding,
} from "../types.js"

export interface SessionContract {
  workspaceId: string | null
  workspaceLabel: string
  workspacePath: string
  permissionProfile: PermissionProfile
}

interface SessionAdapterLike {
  readonly backendKind: ThreadBinding["backend"]
  startSession(prompt: string): Promise<{ sessionId: string; output: string }>
  resumeSession(sessionId: string, prompt: string): Promise<{ sessionId: string; output: string }>
}

export class AgentBridge {
  private readonly inFlightThreads = new Set<string>()
  private discordTransport: DiscordTransport

  constructor(
    private readonly stateStore: StateStore,
    private readonly adapterFactory: (provider: ProviderKind, contract: SessionContract) => SessionAdapterLike,
    discordTransport: DiscordTransport,
    private readonly replyFormatter = new ReplyFormatter(),
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly defaultContract: SessionContract = {
      workspaceId: null,
      workspaceLabel: process.cwd(),
      workspacePath: process.cwd(),
      permissionProfile: "workspace-write",
    },
  ) {
    this.discordTransport = discordTransport
  }

  setDiscordTransport(discordTransport: DiscordTransport): void {
    this.discordTransport = discordTransport
  }

  async handleMessage(message: InboundDiscordMessage): Promise<void> {
    const command = parseCommand(message.content)
    if (!command) {
      return
    }

    if (command.kind === "new") {
      const existing = this.stateStore.getBinding(message.threadId)
      if (existing) {
        return
      }
      await this.startNewSession(
        message.threadId,
        "codex",
        command.prompt,
        this.discordTransport,
        formatVisiblePrompt(command.prompt),
        this.defaultContract,
      )
      return
    }

    await this.handleChatPromptWithTransport(message, "codex", command.prompt, this.discordTransport)
  }

  async handleChatPromptWithTransport(
    message: InboundDiscordMessage,
    provider: ProviderKind,
    prompt: string,
    transport: DiscordTransport,
  ): Promise<void> {
    const binding = this.stateStore.getBinding(message.threadId)
    if (!binding) {
      await transport.sendReply(
        message.threadId,
        `No active ${displayProvider(provider)} session for this thread. Use \`/${provider} new <prompt>\` from a parent channel first.`,
      )
      return
    }

    if (binding.provider !== provider) {
      await transport.sendReply(
        message.threadId,
        `This thread is bound to ${displayProvider(binding.provider)}. Mention the bot in this thread instead.`,
      )
      return
    }

    const adapter = this.adapterFactory(binding.provider, bindingToContract(binding))
    if (binding.backend !== adapter.backendKind) {
      await transport.sendReply(
        message.threadId,
        `This thread is bound to a legacy ${displayProvider(binding.provider)} backend. Start a new \`/${binding.provider} new <prompt>\` thread to migrate it.`,
      )
      return
    }

    await this.continueSession(
      binding,
      buildContinuationPrompt(
        (await transport.listVisibleThreadMessages(message.threadId, binding.lastReadMessageId))
          .filter((candidate) => candidate.id !== message.messageId),
        prompt,
      ),
      transport,
      formatVisiblePrompt(prompt, message.authorId),
    )
  }

  async handleBoundThreadPromptWithTransport(
    message: InboundDiscordMessage,
    prompt: string,
    transport: DiscordTransport,
  ): Promise<void> {
    const binding = this.stateStore.getBinding(message.threadId)
    if (!binding) {
      await transport.sendReply(
        message.threadId,
        "No active session for this thread. Use `/codex new <prompt>` or `/gemini new <prompt>` from a parent channel first.",
      )
      return
    }

    const adapter = this.adapterFactory(binding.provider, bindingToContract(binding))
    if (binding.backend !== adapter.backendKind) {
      await transport.sendReply(
        message.threadId,
        `This thread is bound to a legacy ${displayProvider(binding.provider)} backend. Start a new \`/${binding.provider} new <prompt>\` thread to migrate it.`,
      )
      return
    }

    await this.continueSession(
      binding,
      buildContinuationPrompt(
        (await transport.listVisibleThreadMessages(message.threadId, binding.lastReadMessageId))
          .filter((candidate) => candidate.id !== message.messageId),
        prompt,
      ),
      transport,
      formatVisiblePrompt(prompt, message.authorId),
    )
  }

  async startFreshPromptWithTransport(
    message: InboundDiscordMessage,
    provider: ProviderKind,
    prompt: string,
    transport: DiscordTransport,
    contract: SessionContract = this.defaultContract,
  ): Promise<void> {
    const existing = this.stateStore.getBinding(message.threadId)
    if (existing) {
      this.stateStore.deleteBinding(message.threadId)
    }

    await this.startNewSession(
      message.threadId,
      provider,
      prompt,
      transport,
      formatVisiblePrompt(prompt),
      contract,
    )
  }

  recoverBindings(): ThreadBinding[] {
    return this.stateStore.recoverBindings()
  }

  private async startNewSession(
    threadId: string,
    provider: ProviderKind,
    prompt: string,
    transport: DiscordTransport = this.discordTransport,
    visiblePrompt?: string,
    contract: SessionContract = this.defaultContract,
  ): Promise<void> {
    await this.runTurn(threadId, transport, async () => {
      const adapter = this.adapterFactory(provider, contract)
      const starting = createBinding(threadId, "pending", provider, adapter.backendKind, "starting", this.now(), contract)
      this.stateStore.saveBinding(starting)

      const result = await adapter.startSession(prompt)
      const bound = {
        ...starting,
        sessionId: result.sessionId,
      }

      await this.deliverTurn(bound, result.output, transport, visiblePrompt)
    })
  }

  private async continueSession(
    binding: ThreadBinding,
    prompt: string,
    transport: DiscordTransport = this.discordTransport,
    visiblePrompt?: string,
  ): Promise<void> {
    await this.runTurn(binding.threadId, transport, async () => {
      const adapter = this.adapterFactory(binding.provider, bindingToContract(binding))
      const executing = updateBinding(binding, "executing", this.now(), null)
      this.stateStore.saveBinding(executing)

      const result = await adapter.resumeSession(binding.sessionId, prompt)
      await this.deliverTurn({ ...executing, sessionId: result.sessionId }, result.output, transport, visiblePrompt)
    })
  }

  private async deliverTurn(
    binding: ThreadBinding,
    output: string,
    transport: DiscordTransport = this.discordTransport,
    visiblePrompt?: string,
  ): Promise<void> {
    const delivering = updateBinding(binding, "delivering", this.now(), null)
    this.stateStore.saveBinding(delivering)

    try {
      const renderedOutput = output || "(no output)"
      const messageBody = visiblePrompt ? `${visiblePrompt}\n\n${renderedOutput}` : renderedOutput

      for (const chunk of this.replyFormatter.chunk(messageBody)) {
        await transport.sendReply(binding.threadId, chunk)
      }
      this.stateStore.saveBinding(
        updateBinding(
          {
            ...delivering,
            lastReadMessageId: await transport.getLatestVisibleThreadMessageId(binding.threadId),
          },
          "bound_idle",
          this.now(),
          null,
        ),
      )
    } catch (error) {
      const message = toErrorMessage(error)
      this.stateStore.saveBinding(updateBinding(delivering, "failed", this.now(), message))

      try {
        await transport.sendReply(
          binding.threadId,
          `Delivery failure: ${message}`,
        )
      } catch {
        // Keep the failed state even if the fallback message also fails.
      }
    }
  }

  private async runTurn(
    threadId: string,
    transport: DiscordTransport,
    action: () => Promise<void>,
  ): Promise<void> {
    if (this.inFlightThreads.has(threadId)) {
      await transport.sendReply(
        threadId,
        "This Thread Binding is busy with another user turn. Try again after it completes.",
      )
      return
    }

    this.inFlightThreads.add(threadId)
    try {
      await action()
    } catch (error) {
      const existing = this.stateStore.getBinding(threadId)
      if (existing) {
        this.stateStore.saveBinding(updateBinding(existing, "failed", this.now(), toErrorMessage(error)))
      }
      try {
        await transport.sendReply(threadId, `Execution failed: ${toErrorMessage(error)}`)
      } catch {
        // Preserve the failed state even when the error message cannot be delivered.
      }
    } finally {
      this.inFlightThreads.delete(threadId)
    }
  }
}

function parseCommand(content: string): { kind: "new" | "chat"; prompt: string } | null {
  const trimmed = content.trim()

  if (trimmed.startsWith("/codex new ")) {
    const prompt = trimmed.slice("/codex new ".length).trim()
    return prompt.length > 0 ? { kind: "new", prompt } : null
  }

  if (trimmed.startsWith("/codex chat ")) {
    const prompt = trimmed.slice("/codex chat ".length).trim()
    return prompt.length > 0 ? { kind: "chat", prompt } : null
  }

  return null
}

function createBinding(
  threadId: string,
  sessionId: string,
  provider: ThreadBinding["provider"],
  backend: ThreadBinding["backend"],
  state: ThreadBinding["state"],
  now: string,
  contract: SessionContract,
): ThreadBinding {
  return {
    threadId,
    sessionId,
    provider,
    backend,
    workspaceId: contract.workspaceId,
    workspaceLabel: contract.workspaceLabel,
    workspacePath: contract.workspacePath,
    permissionProfile: contract.permissionProfile,
    state,
    createdAt: now,
    updatedAt: now,
    lastError: null,
    lastReadMessageId: null,
  }
}

function displayProvider(provider: ProviderKind): string {
  return provider === "gemini" ? "Gemini" : "Codex"
}

function updateBinding(
  binding: ThreadBinding,
  state: ThreadBinding["state"],
  now: string,
  lastError: string | null,
): ThreadBinding {
  return {
    ...binding,
    state,
    updatedAt: now,
    lastError,
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function formatVisiblePrompt(prompt: string, authorId?: string): string {
  const quotedPrompt = prompt
    .trim()
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n")

  if (authorId) {
    return `<@${authorId}>\n\n${quotedPrompt}`
  }

  return quotedPrompt
}

function buildContinuationPrompt(messages: ThreadTranscriptMessage[], prompt: string): string {
  if (messages.length === 0) {
    return prompt
  }

  const transcript = messages
    .map((message) => `[${message.isBot ? "bot" : "user"} ${message.authorName}] ${message.content}`)
    .join("\n")

  return [
    "Visible thread messages since the last synced point:",
    transcript,
    "",
    `Current thread prompt: ${prompt}`,
  ].join("\n")
}

function bindingToContract(binding: ThreadBinding): SessionContract {
  return {
    workspaceId: binding.workspaceId,
    workspaceLabel: binding.workspaceLabel,
    workspacePath: binding.workspacePath,
    permissionProfile: binding.permissionProfile,
  }
}
