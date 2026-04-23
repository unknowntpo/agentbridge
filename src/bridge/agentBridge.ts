import { ReplyFormatter } from "./replyFormatter.js"
import type {
  CodexAdapter,
  DiscordTransport,
  InboundDiscordMessage,
  StateStore,
  ThreadBinding,
} from "../types.js"

export class AgentBridge {
  private readonly inFlightThreads = new Set<string>()
  private discordTransport: DiscordTransport

  constructor(
    private readonly stateStore: StateStore,
    private readonly codexAdapter: CodexAdapter,
    discordTransport: DiscordTransport,
    private readonly replyFormatter = new ReplyFormatter(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.discordTransport = discordTransport
  }

  setDiscordTransport(discordTransport: DiscordTransport): void {
    this.discordTransport = discordTransport
  }

  async handleMessage(message: InboundDiscordMessage): Promise<void> {
    const command = parseCommand(message.content)
    if (command) {
      await this.handleCommand(message, command)
      return
    }

    const binding = this.stateStore.getBinding(message.threadId)
    if (!binding) {
      if (!message.content.startsWith("discord ")) {
        await this.discordTransport.sendReply(
          message.threadId,
          "No active Codex session. Start one with `discord <prompt>` or `/codex new`.",
        )
        return
      }

      await this.startNewSession(message.threadId, message.content.slice("discord ".length))
      return
    }

    await this.continueSession(binding, message.content)
  }

  async handlePrompt(message: InboundDiscordMessage, prompt: string): Promise<void> {
    await this.handlePromptWithTransport(message, prompt, this.discordTransport)
  }

  async handlePromptWithTransport(
    message: InboundDiscordMessage,
    prompt: string,
    transport: DiscordTransport,
  ): Promise<void> {
    const binding = this.stateStore.getBinding(message.threadId)
    if (!binding) {
      await this.startNewSession(message.threadId, prompt, transport)
      return
    }

    await this.continueSession(binding, prompt, transport)
  }

  async handleNamedCommand(
    threadId: string,
    command: "new" | "status" | "reset" | "stop",
  ): Promise<void> {
    await this.handleNamedCommandWithTransport(threadId, command, this.discordTransport)
  }

  async handleNamedCommandWithTransport(
    threadId: string,
    command: "new" | "status" | "reset" | "stop",
    transport: DiscordTransport,
  ): Promise<void> {
    await this.handleCommand(
      {
        threadId,
        messageId: `interaction:${command}`,
        content: `/codex ${command}`,
      },
      command,
      transport,
    )
  }

  recoverBindings(): ThreadBinding[] {
    return this.stateStore.recoverBindings()
  }

  private async handleCommand(
    message: InboundDiscordMessage,
    command: Command,
    transport: DiscordTransport = this.discordTransport,
  ): Promise<void> {
    const existing = this.stateStore.getBinding(message.threadId)

    switch (command) {
      case "new":
        if (existing) {
          this.stateStore.deleteBinding(message.threadId)
        }
        await this.startNewSession(message.threadId, "", transport)
        return
      case "status":
        await transport.sendReply(
          message.threadId,
          existing
            ? `Thread binding: ${existing.threadId} -> ${existing.sessionId} (${existing.state})`
            : "No active Thread Binding for this thread.",
        )
        return
      case "reset":
        if (existing) {
          this.stateStore.deleteBinding(message.threadId)
        }
        await this.startNewSession(message.threadId, "", transport)
        return
      case "stop":
        if (existing) {
          this.stateStore.deleteBinding(message.threadId)
        }
        await transport.sendReply(
          message.threadId,
          "Stopped the current Thread Binding. Future turns require re-activation.",
        )
        return
    }
  }

  private async startNewSession(
    threadId: string,
    prompt: string,
    transport: DiscordTransport = this.discordTransport,
  ): Promise<void> {
    await this.runTurn(threadId, transport, async () => {
      const starting = createBinding(threadId, "pending", "starting", this.now())
      this.stateStore.saveBinding(starting)

      const result = await this.codexAdapter.startSession(prompt)
      const bound = {
        ...starting,
        sessionId: result.sessionId,
      }

      await this.deliverTurn(bound, result.output, transport)
    })
  }

  private async continueSession(
    binding: ThreadBinding,
    prompt: string,
    transport: DiscordTransport = this.discordTransport,
  ): Promise<void> {
    await this.runTurn(binding.threadId, transport, async () => {
      const executing = updateBinding(binding, "executing", this.now(), null)
      this.stateStore.saveBinding(executing)

      const result = await this.codexAdapter.resumeSession(binding.sessionId, prompt)
      await this.deliverTurn({ ...executing, sessionId: result.sessionId }, result.output, transport)
    })
  }

  private async deliverTurn(
    binding: ThreadBinding,
    output: string,
    transport: DiscordTransport = this.discordTransport,
  ): Promise<void> {
    const delivering = updateBinding(binding, "delivering", this.now(), null)
    this.stateStore.saveBinding(delivering)

    try {
      for (const chunk of this.replyFormatter.chunk(output || "(no output)")) {
        await transport.sendReply(binding.threadId, chunk)
      }
      this.stateStore.saveBinding(updateBinding(delivering, "bound_idle", this.now(), null))
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
      await transport.sendReply(threadId, `Codex execution failed: ${toErrorMessage(error)}`)
    } finally {
      this.inFlightThreads.delete(threadId)
    }
  }
}

type Command = "new" | "status" | "reset" | "stop"

function parseCommand(content: string): Command | null {
  switch (content.trim()) {
    case "/codex new":
      return "new"
    case "/codex status":
      return "status"
    case "/codex reset":
      return "reset"
    case "/codex stop":
      return "stop"
    default:
      return null
  }
}

function createBinding(
  threadId: string,
  sessionId: string,
  state: ThreadBinding["state"],
  now: string,
): ThreadBinding {
  return {
    threadId,
    sessionId,
    state,
    createdAt: now,
    updatedAt: now,
    lastError: null,
  }
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
