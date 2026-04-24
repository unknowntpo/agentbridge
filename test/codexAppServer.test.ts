import fs from "node:fs"
import net from "node:net"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"
import { WebSocketServer } from "ws"

import { CodexAppServerAdapter } from "../src/codex/codexAppServerAdapter.js"
import { CodexAppServerSupervisor } from "../src/codex/appServerSupervisor.js"

const cleanup: Array<() => Promise<void> | void> = []

afterEach(async () => {
  while (cleanup.length > 0) {
    const item = cleanup.pop()
    await item?.()
  }
})

describe("CodexAppServerAdapter", () => {
  it("starts a thread and collects streamed agent output", async () => {
    if (!(await canListen())) {
      return
    }

    const { serverUrl, methods, requests } = await createFakeAppServer()

    const adapter = new CodexAppServerAdapter(serverUrl, "/repo/agentbridge")
    const result = await adapter.startSession("summarize this repo")

    expect(result.sessionId).toBe("thr-started")
    expect(result.output).toBe("hello from app server")
    expect(methods).toEqual([
      "initialize",
      "initialized",
      "thread/start",
      "turn/start",
    ])
    expect(requests.find((item) => item.method === "thread/start")?.params?.sandbox).toBe("workspace-write")
  })

  it("resumes an existing thread before starting a turn", async () => {
    if (!(await canListen())) {
      return
    }

    const { serverUrl, methods, requests } = await createFakeAppServer()

    const adapter = new CodexAppServerAdapter(serverUrl, "/repo/agentbridge")
    const result = await adapter.resumeSession("thr-existing", "continue")

    expect(result.sessionId).toBe("thr-existing")
    expect(result.output).toBe("hello from app server")
    expect(methods).toEqual([
      "initialize",
      "initialized",
      "thread/resume",
      "turn/start",
    ])
    expect(requests.find((item) => item.method === "thread/resume")?.params?.sandbox).toBe("workspace-write")
  })
})

describe("CodexAppServerSupervisor", () => {
  it("starts a child process that opens the configured port", async () => {
    if (!(await canListen())) {
      return
    }

    const port = await getFreePort()
    const scriptPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "agentbridge-supervisor-")), "fake-app-server.js")
    fs.writeFileSync(
      scriptPath,
      [
        "const net = require('node:net')",
        "const listenArg = process.argv[process.argv.indexOf('--listen') + 1]",
        "const url = new URL(listenArg)",
        "const server = net.createServer(() => {})",
        "server.listen(Number(url.port), url.hostname)",
        "process.on('SIGTERM', () => server.close(() => process.exit(0)))",
      ].join("\n"),
      "utf8",
    )
    cleanup.push(() => fs.rmSync(path.dirname(scriptPath), { recursive: true, force: true }))

    const supervisor = new CodexAppServerSupervisor(process.execPath, "127.0.0.1", port, [scriptPath])
    await supervisor.start()
    cleanup.push(() => supervisor.stop())

    const connected = await canConnect("127.0.0.1", port)
    expect(connected).toBe(true)
  })
})

async function createFakeAppServer(): Promise<{ serverUrl: string; methods: string[]; requests: Array<{ method: string; params?: Record<string, unknown> }> }> {
  const methods: string[] = []
  const requests: Array<{ method: string; params?: Record<string, unknown> }> = []
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 })
  cleanup.push(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  server.on("connection", (socket) => {
    socket.on("message", (payload) => {
      const parsed = JSON.parse(payload.toString()) as { id?: number; method?: string; params?: Record<string, unknown> }
      if (!parsed.method) {
        return
      }

      methods.push(parsed.method)
      requests.push({ method: parsed.method, params: parsed.params })

      if (parsed.method === "initialize") {
        socket.send(JSON.stringify({
          id: parsed.id,
          result: {
            codexHome: "/tmp/codex-home",
            platformFamily: "unix",
            platformOs: "macos",
            userAgent: "agentbridge-test",
          },
        }))
        return
      }

      if (parsed.method === "thread/start") {
        socket.send(JSON.stringify({
          id: parsed.id,
          result: {
            thread: {
              id: "thr-started",
            },
          },
        }))
        return
      }

      if (parsed.method === "thread/resume") {
        socket.send(JSON.stringify({
          id: parsed.id,
          result: {
            thread: {
              id: parsed.params?.threadId,
            },
          },
        }))
        return
      }

      if (parsed.method === "turn/start") {
        const threadId = String(parsed.params?.threadId)
        socket.send(JSON.stringify({
          id: parsed.id,
          result: {
            turn: { id: "turn-1" },
          },
        }))
        socket.send(JSON.stringify({
          method: "item/agentMessage/delta",
          params: {
            threadId,
            turnId: "turn-1",
            itemId: "item-1",
            delta: "hello from app server",
          },
        }))
        socket.send(JSON.stringify({
          method: "turn/completed",
          params: {
            threadId,
            turn: { id: "turn-1" },
          },
        }))
      }
    })
  })

  await new Promise<void>((resolve) => server.once("listening", () => resolve()))
  const address = server.address()
  if (!address || typeof address === "string") {
    throw new Error("Failed to determine fake app-server address")
  }

  return {
    serverUrl: `ws://127.0.0.1:${address.port}`,
    methods,
    requests,
  }
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer(() => {})
    server.listen(0, "127.0.0.1")
    server.once("listening", () => {
      const address = server.address()
      server.close()
      if (!address || typeof address === "string") {
        reject(new Error("No free port available"))
        return
      }
      resolve(address.port)
    })
    server.once("error", reject)
  })
}

function canListen(): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer(() => {})
    server.once("error", () => resolve(false))
    server.listen(0, "127.0.0.1", () => {
      server.close(() => resolve(true))
    })
  })
}

function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    socket.once("connect", () => {
      socket.destroy()
      resolve(true)
    })
    socket.once("error", () => resolve(false))
  })
}
