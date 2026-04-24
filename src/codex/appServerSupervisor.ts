import net from "node:net"
import { spawn, type ChildProcessByStdio } from "node:child_process"
import type { Readable } from "node:stream"

export class CodexAppServerSupervisor {
  private child: ChildProcessByStdio<null, Readable, Readable> | null = null

  constructor(
    private readonly command: string,
    private readonly host: string,
    private readonly port: number,
    private readonly commandArgs: string[] = [],
  ) {}

  get serverUrl(): string {
    return `ws://${this.host}:${this.port}`
  }

  async start(): Promise<void> {
    if (await isPortOpen(this.host, this.port)) {
      return
    }

    const child = spawn(this.command, [...this.commandArgs, "app-server", "--listen", this.serverUrl], {
      stdio: ["ignore", "pipe", "pipe"],
    })
    this.child = child

    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk)
    })
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk)
    })

    child.on("exit", (code, signal) => {
      console.warn(`Codex app-server exited code=${code ?? "null"} signal=${signal ?? "null"}`)
      this.child = null
    })

    const ready = await waitForPort(this.host, this.port, 10_000)
    if (!ready) {
      throw new Error(`Timed out waiting for Codex app-server on ${this.serverUrl}`)
    }
  }

  async stop(): Promise<void> {
    if (!this.child) {
      return
    }

    this.child.kill("SIGTERM")
    this.child = null
  }
}

function isPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    socket.once("connect", () => {
      socket.destroy()
      resolve(true)
    })
    socket.once("error", () => {
      resolve(false)
    })
  })
}

async function waitForPort(host: string, port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isPortOpen(host, port)) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return false
}
