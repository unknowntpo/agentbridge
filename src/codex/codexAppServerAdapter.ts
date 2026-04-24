import WebSocket from "ws"

import type { CodexTurnResult, PermissionProfile, SessionAdapter } from "../types.js"
import { resolveProviderCapability } from "../runtime/sessionPermissions.js"

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

interface AppServerThreadStartResult {
  thread?: {
    id?: string
  }
}

interface AppServerTurnResult {
  output: string
}

export class CodexAppServerAdapter implements SessionAdapter {
  readonly provider = "codex" as const
  readonly backendKind = "app-server" as const

  constructor(
    private readonly serverUrl: string,
    private readonly cwd: string,
    private readonly permissionProfile: PermissionProfile = "workspace-write",
    private readonly approvalPolicy: "never" | "on-request" | "untrusted" | "on-failure" = "never",
  ) {}

  async startSession(prompt: string): Promise<CodexTurnResult> {
    const client = new CodexAppServerClient(this.serverUrl)
    await client.connect()

    try {
      await client.initialize()
      const started = await client.request<AppServerThreadStartResult>("thread/start", {
        cwd: this.cwd,
        sandbox: resolveProviderCapability("codex", this.permissionProfile).mappedMode,
        approvalPolicy: this.approvalPolicy,
      })
      const threadId = started.thread?.id
      if (!threadId) {
        throw new Error("App server did not return a thread id")
      }

      const turn = await client.startTurn(threadId, prompt)
      return {
        sessionId: threadId,
        output: turn.output,
        events: [],
      }
    } finally {
      client.close()
    }
  }

  async resumeSession(sessionId: string, prompt: string): Promise<CodexTurnResult> {
    const client = new CodexAppServerClient(this.serverUrl)
    await client.connect()

    try {
      await client.initialize()
      await client.request("thread/resume", {
        threadId: sessionId,
        cwd: this.cwd,
        sandbox: resolveProviderCapability("codex", this.permissionProfile).mappedMode,
        approvalPolicy: this.approvalPolicy,
      })
      const turn = await client.startTurn(sessionId, prompt)
      return {
        sessionId,
        output: turn.output,
        events: [],
      }
    } finally {
      client.close()
    }
  }
}

class CodexAppServerClient {
  private socket: WebSocket | null = null
  private nextRequestId = 1
  private readonly pending = new Map<number, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
  }>()
  private turnOutput = ""
  private turnThreadId: string | null = null
  private turnResolver: ((value: AppServerTurnResult) => void) | null = null
  private turnRejecter: ((reason?: unknown) => void) | null = null

  constructor(private readonly serverUrl: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.serverUrl)
      this.socket = socket

      socket.once("open", () => resolve())
      socket.once("error", (error) => reject(error))
      socket.on("message", (data) => {
        this.handleMessage(data.toString())
      })
      socket.on("close", () => {
        this.failPending(new Error("Codex app-server connection closed"))
      })
    })
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      clientInfo: {
        name: "agentbridge",
        title: "AgentBridge",
        version: "0.1.0",
      },
    })
    this.notify("initialized")
  }

  request<T = unknown>(method: string, params: Record<string, unknown>): Promise<T> {
    const id = this.nextRequestId
    this.nextRequestId += 1

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      })
      this.send({
        id,
        method,
        params,
      })
    })
  }

  startTurn(threadId: string, prompt: string): Promise<AppServerTurnResult> {
    this.turnOutput = ""
    this.turnThreadId = threadId

    return new Promise<AppServerTurnResult>((resolve, reject) => {
      this.turnResolver = resolve
      this.turnRejecter = reject

      this.request("turn/start", {
        threadId,
        input: [
          {
            type: "text",
            text: prompt,
          },
        ],
      }).catch((error) => {
        this.turnResolver = null
        this.turnRejecter = null
        reject(error)
      })
    })
  }

  close(): void {
    this.socket?.close()
    this.socket = null
  }

  private notify(method: string, params?: Record<string, unknown>): void {
    this.send(params ? { method, params } : { method })
  }

  private send(payload: Record<string, unknown>): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Codex app-server socket is not open")
    }

    this.socket.send(JSON.stringify(payload))
  }

  private handleMessage(raw: string): void {
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

    if (parsed.method === "item/agentMessage/delta") {
      const delta = parsed.params?.delta
      const threadId = parsed.params?.threadId
      if (typeof delta === "string" && threadId === this.turnThreadId) {
        this.turnOutput += delta
      }
      return
    }

    if (parsed.method === "turn/completed") {
      const threadId = parsed.params?.threadId
      if (threadId === this.turnThreadId) {
        const output = this.turnOutput.trim() || "(no output)"
        this.turnThreadId = null
        this.turnResolver?.({ output })
        this.turnResolver = null
        this.turnRejecter = null
      }
      return
    }

    if (parsed.method === "turn/failed" || parsed.method === "turn/error") {
      const threadId = parsed.params?.threadId
      if (threadId === this.turnThreadId) {
        const message = typeof parsed.params?.error === "object" && parsed.params?.error && "message" in parsed.params.error
          ? String((parsed.params.error as { message?: unknown }).message ?? "App-server turn failed")
          : "App-server turn failed"
        this.turnThreadId = null
        this.turnRejecter?.(new Error(message))
        this.turnResolver = null
        this.turnRejecter = null
      }
    }
  }

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error)
    }
    this.pending.clear()
    if (this.turnRejecter) {
      this.turnRejecter(error)
      this.turnResolver = null
      this.turnRejecter = null
      this.turnThreadId = null
    }
  }
}
