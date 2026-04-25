import net from "node:net"
import { afterEach, describe, expect, it } from "bun:test"

import { CodexAppServerAdapter } from "../src/codex/codexAppServerAdapter.js"
import { CodexAppServerSupervisor } from "../src/codex/appServerSupervisor.js"

const runRealCodex = process.env.AGENTBRIDGE_RUN_REAL_CODEX_E2E === "1"
const runExistingServer = process.env.AGENTBRIDGE_RUN_EXISTING_CODEX_APP_SERVER_E2E === "1"
const cleanup: Array<() => Promise<void> | void> = []

afterEach(async () => {
  while (cleanup.length > 0) {
    await cleanup.pop()?.()
  }
})

const describeRealCodex = runRealCodex ? describe : describe.skip
const describeRealCodexSkipped = runRealCodex ? describe.skip : describe
const describeExistingServer = runExistingServer ? describe : describe.skip
const describeExistingServerSkipped = runExistingServer ? describe.skip : describe

describeRealCodex("real Codex app-server e2e", () => {
  it("starts codex app-server and completes one AgentBridge turn", async () => {
    const port = await getFreePort()
    const supervisor = new CodexAppServerSupervisor(
      process.env.AGENTBRIDGE_CODEX_COMMAND ?? "codex",
      "127.0.0.1",
      port,
      splitArgs(process.env.AGENTBRIDGE_CODEX_ARGS ?? ""),
    )
    cleanup.push(() => supervisor.stop())

    await supervisor.start()

    const adapter = new CodexAppServerAdapter(
      supervisor.serverUrl,
      process.cwd(),
      "workspace-read",
      "never",
    )
    const marker = "agentbridge-codex-e2e-ok"
    const result = await adapter.startSession(`Reply with exactly this marker and no extra prose: ${marker}`)

    expect(result.sessionId).toMatch(/\S+/)
    expect(result.output.toLowerCase()).toContain(marker)
  })
})

describeRealCodexSkipped("real Codex app-server e2e", () => {
  it("is skipped unless AGENTBRIDGE_RUN_REAL_CODEX_E2E=1", () => {
    expect(runRealCodex).toBe(false)
  })
})

describeExistingServer("existing Codex app-server e2e", () => {
  it("completes one turn through an already-running daemon app-server", async () => {
    const host = process.env.AGENTBRIDGE_CODEX_APP_SERVER_HOST ?? "127.0.0.1"
    const port = process.env.AGENTBRIDGE_CODEX_APP_SERVER_PORT ?? "4591"
    const adapter = new CodexAppServerAdapter(
      `ws://${host}:${port}`,
      process.cwd(),
      "workspace-read",
      "never",
    )
    const marker = "agentbridge-daemon-codex-e2e-ok"
    const result = await adapter.startSession(`Reply with exactly this marker and no extra prose: ${marker}`)

    expect(result.sessionId).toMatch(/\S+/)
    expect(result.output.toLowerCase()).toContain(marker)
  })
})

describeExistingServerSkipped("existing Codex app-server e2e", () => {
  it("is skipped unless AGENTBRIDGE_RUN_EXISTING_CODEX_APP_SERVER_E2E=1", () => {
    expect(runExistingServer).toBe(false)
  })
})

function splitArgs(value: string): string[] {
  return value
    .split(" ")
    .map((item) => item.trim())
    .filter(Boolean)
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
