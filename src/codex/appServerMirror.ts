import WebSocket from "ws"

import { ReplyFormatter } from "../bridge/replyFormatter.js"
import type { DiscordTransport, StateStore, ThreadBinding } from "../types.js"

interface JsonRpcResponseEnvelope {
  id?: number | string
  result?: unknown
  error?: {
    code?: number
    message?: string
  }
  method?: string
  params?: Record<string, unknown>
}

export class AppServerMirrorCoordinator {
  private readonly watchers = new Map<string, AppServerThreadWatcher>()

  constructor(
    private readonly serverUrl: string,
    private readonly stateStore: StateStore,
    private readonly transport: DiscordTransport,
    private readonly formatter = new ReplyFormatter(),
  ) {}

  syncBindings(bindings: ThreadBinding[]): void {
    const managed = bindings.filter((binding) => binding.backend === "app-server")
    const activeThreadIds = new Set(managed.map((binding) => binding.threadId))

    for (const binding of managed) {
      const existing = this.watchers.get(binding.threadId)
      if (existing && existing.sessionId === binding.sessionId) {
        continue
      }

      existing?.stop()
      const watcher = new AppServerThreadWatcher(
        this.serverUrl,
        binding,
        this.stateStore,
        this.transport,
        this.formatter,
      )
      this.watchers.set(binding.threadId, watcher)
      watcher.start()
    }

    for (const [threadId, watcher] of this.watchers) {
      if (activeThreadIds.has(threadId)) {
        continue
      }

      watcher.stop()
      this.watchers.delete(threadId)
    }
  }

  async stop(): Promise<void> {
    for (const watcher of this.watchers.values()) {
      watcher.stop()
    }
    this.watchers.clear()
  }
}

class AppServerThreadWatcher {
  private socket: WebSocket | null = null
  private nextRequestId = 1
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private readonly pending = new Map<number, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
  }>()
  private activeTurnId: string | null = null
  private activeTurnOutput = ""

  constructor(
    private readonly serverUrl: string,
    readonly binding: ThreadBinding,
    private readonly stateStore: StateStore,
    private readonly transport: DiscordTransport,
    private readonly formatter: ReplyFormatter,
  ) {}

  get sessionId(): string {
    return this.binding.sessionId
  }

  start(): void {
    void this.connect()
  }

  stop(): void {
    this.stopped = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.failPending(new Error("App-server mirror watcher stopped"))
    this.socket?.close()
    this.socket = null
  }

  private async connect(): Promise<void> {
    if (this.stopped) {
      return
    }

    try {
      await this.openSocket()
      await this.initialize()
      await this.request("thread/resume", {
        threadId: this.binding.sessionId,
      })
    } catch (error) {
      this.scheduleReconnect(error instanceof Error ? error : new Error(String(error)))
    }
  }

  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.serverUrl)
      this.socket = socket

      socket.once("open", () => resolve())
      socket.once("error", (error) => reject(error))
      socket.on("message", (data) => {
        void this.handleMessage(data.toString())
      })
      socket.on("close", () => {
        this.failPending(new Error("Codex app-server mirror connection closed"))
        if (!this.stopped) {
          this.scheduleReconnect(new Error("Codex app-server mirror connection closed"))
        }
      })
    })
  }

  private async initialize(): Promise<void> {
    await this.request("initialize", {
      clientInfo: {
        name: "agentbridge-mirror",
        title: "AgentBridge Mirror",
        version: "0.1.0",
      },
      capabilities: {
        optOutNotificationMethods: [
          "thread/started",
        ],
      },
    })
    this.notify("initialized")
  }

  private request<T = unknown>(method: string, params: Record<string, unknown>): Promise<T> {
    const id = this.nextRequestId
    this.nextRequestId += 1

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      })
      this.send({ id, method, params })
    })
  }

  private notify(method: string): void {
    this.send({ method })
  }

  private send(payload: Record<string, unknown>): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Codex app-server mirror socket is not open")
    }

    this.socket.send(JSON.stringify(payload))
  }

  private async handleMessage(raw: string): Promise<void> {
    const parsed = JSON.parse(raw) as JsonRpcResponseEnvelope

    if (typeof parsed.id !== "undefined") {
      const id = typeof parsed.id === "number" ? parsed.id : Number(parsed.id)
      const pending = this.pending.get(id)
      if (pending) {
        this.pending.delete(id)
        if (parsed.error) {
          pending.reject(new Error(parsed.error.message ?? `JSON-RPC error ${parsed.error.code ?? "unknown"}`))
        } else {
          pending.resolve(parsed.result)
        }
      }
      return
    }

    if (!parsed.method) {
      return
    }

    if (parsed.method === "turn/started") {
      const threadId = parsed.params?.threadId
      if (threadId === this.binding.sessionId) {
        this.activeTurnId = extractTurnId(parsed.params)
        this.activeTurnOutput = ""
      }
      return
    }

    if (parsed.method === "item/agentMessage/delta") {
      const threadId = parsed.params?.threadId
      if (threadId === this.binding.sessionId) {
        this.activeTurnId = extractTurnId(parsed.params) ?? this.activeTurnId
        if (typeof parsed.params?.delta === "string") {
          this.activeTurnOutput += parsed.params.delta
        }
      }
      return
    }

    if (parsed.method === "turn/completed") {
      const threadId = parsed.params?.threadId
      if (threadId !== this.binding.sessionId) {
        return
      }

      const turnId = extractTurnId(parsed.params)
      if (this.activeTurnId && turnId && turnId !== this.activeTurnId) {
        return
      }

      const binding = this.stateStore.getBinding(this.binding.threadId)
      const output = this.activeTurnOutput.trim()
      this.activeTurnId = null
      this.activeTurnOutput = ""

      if (!binding || binding.state !== "bound_idle" || !output) {
        return
      }

      for (const chunk of this.formatter.chunk(output)) {
        await this.transport.sendReply(binding.threadId, chunk)
      }
    }
  }

  private scheduleReconnect(_error: Error): void {
    if (this.stopped || this.reconnectTimer) {
      return
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect()
    }, 1000)
  }

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error)
    }
    this.pending.clear()
  }
}

function extractTurnId(params?: Record<string, unknown>): string | null {
  if (!params) {
    return null
  }

  if (typeof params.turnId === "string") {
    return params.turnId
  }

  const turn = params.turn
  if (turn && typeof turn === "object" && "id" in turn && typeof turn.id === "string") {
    return turn.id
  }

  return null
}
