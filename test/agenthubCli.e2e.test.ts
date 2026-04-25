import { execFile, execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import WebSocket, { WebSocketServer } from "ws"

import { describe, expect, it } from "bun:test"

const execFileAsync = promisify(execFile)
const loopbackIt = canListenOnLoopback() ? it : it.skip

describe("AgentHub CLI e2e", () => {
  it("creates and scans a project through CLI JSON contracts", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-cli-"))
    const source = path.join(root, "source")
    const plainDir = path.join(root, "demo")
    createSourceRepo(source)

    const create = runAgentbridge(["project", "create", plainDir, "--repo", source, "--branch", "main", "--json"])
    const canonicalPlainDir = fs.realpathSync(plainDir)
    expect(create.ok).toBe(true)

    const env = {
      ...process.env,
      AGENTHUB_PROJECTS_JSON: JSON.stringify([{ id: "demo", label: "demo", path: plainDir }]),
    }
    const list = runAgentbridge(["project", "list", "--json"], env)
    expect(list).toEqual([{ id: "demo", label: "demo", path: canonicalPlainDir }])

    const scan = runAgentbridge(["project", "scan", "--path", plainDir, "--json"], env)
    expect(scan.anchorPath).toBe(path.join(canonicalPlainDir, "main"))
    expect(scan.worktrees).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "main", branch: "main", status: "clean" }),
    ]))

    const worktree = runAgentbridge([
      "worktree",
      "create",
      "feature-a",
      "--project",
      plainDir,
      "--branch",
      "codex/feature-a",
      "--base",
      "main",
      "--json",
    ], env)
    expect(worktree.ok).toBe(true)

    const after = runAgentbridge(["worktree", "list", "--project", plainDir, "--json"], env)
    expect(after.map((entry: { name: string }) => entry.name).sort()).toEqual(["feature-a", "main"])
  })

  loopbackIt("deploys a Codex agent through the CLI JSON contract", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-cli-deploy-"))
    const server = await startFakeCodexAppServer("agenthub cli deploy ok")
    try {
      const session = await runAgentbridgeAsync([
        "agent",
        "deploy",
        "--worktree-id",
        "wt-main",
        "--worktree-path",
        root,
        "--provider",
        "codex",
        "--mode",
        "write",
        "--profile",
        "workspace-write",
        "--prompt",
        "hello",
        "--json",
      ], {
        ...process.env,
        DISCORD_TOKEN: "test-token",
        AGENTBRIDGE_TRUSTED_WORKSPACES: `repo:${root}`,
        AGENTBRIDGE_CODEX_APP_SERVER_HOST: "127.0.0.1",
        AGENTBRIDGE_CODEX_APP_SERVER_PORT: String(server.port),
      })

      expect(session).toMatchObject({
        id: "thr-cli",
        worktreeId: "wt-main",
        provider: "Codex",
        mode: "write",
        mocked: false,
      })
      expect(session.messages.at(-1)?.text).toBe("agenthub cli deploy ok")
    } finally {
      await server.close()
    }
  })
})

function runAgentbridge(args: string[], env: NodeJS.ProcessEnv = process.env): any {
  const stdout = execFileSync("bun", ["src/cli.ts", ...args], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: { ...env, GIT_CONFIG_GLOBAL: "/dev/null" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  return JSON.parse(stdout)
}

async function runAgentbridgeAsync(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<any> {
  const { stdout } = await execFileAsync("bun", ["src/cli.ts", ...args], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: { ...env, GIT_CONFIG_GLOBAL: "/dev/null" },
    encoding: "utf8",
    timeout: 20_000,
  })
  return JSON.parse(stdout)
}

function createSourceRepo(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  git(dir, ["init", "--initial-branch=main"])
  fs.writeFileSync(path.join(dir, "README.md"), "# demo\n")
  git(dir, ["add", "README.md"])
  git(dir, ["-c", "user.name=AgentHub Test", "-c", "user.email=agenthub@example.test", "commit", "-m", "init"])
}

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, {
    cwd,
    stdio: "pipe",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
  })
}

function canListenOnLoopback(): boolean {
  try {
    const server = Bun.listen({
      hostname: "127.0.0.1",
      port: 0,
      socket: {
        data() {},
      },
    })
    server.stop()
    return true
  } catch {
    return false
  }
}

function startFakeCodexAppServer(output: string): Promise<{ port: number; close: () => Promise<void> }> {
  return getFreePort().then((port) => new Promise((resolve, reject) => {
    const server = new WebSocketServer({ host: "127.0.0.1", port })
    const sockets = new Set<WebSocket>()
    server.on("connection", (socket) => {
      sockets.add(socket)
      socket.once("close", () => sockets.delete(socket))
      socket.on("message", (data) => {
        const message = JSON.parse(data.toString()) as { id?: number; method?: string }
        if (typeof message.id === "undefined") return

        if (message.method === "thread/start") {
          socket.send(JSON.stringify({ id: message.id, result: { thread: { id: "thr-cli" } } }))
          return
        }

        if (message.method === "turn/start") {
          socket.send(JSON.stringify({ id: message.id, result: {} }))
          socket.send(JSON.stringify({
            method: "item/agentMessage/delta",
            params: { threadId: "thr-cli", delta: output },
          }))
          socket.send(JSON.stringify({ method: "turn/completed", params: { threadId: "thr-cli" } }))
          return
        }

        socket.send(JSON.stringify({ id: message.id, result: {} }))
      })
    })
    server.once("error", reject)
    server.once("listening", () => {
      const address = server.address()
      if (!address || typeof address === "string") {
        reject(new Error("fake app-server did not bind a TCP port"))
        return
      }
      resolve({
        port,
        close: () => new Promise((closeResolve, closeReject) => {
          for (const socket of sockets) socket.close()
          server.close((error) => error ? closeReject(error) : closeResolve())
        }),
      })
    })
  }))
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = Bun.listen({
      hostname: "127.0.0.1",
      port: 0,
      socket: {
        data() {},
      },
    })
    const port = server.port
    server.stop()
    if (port) {
      resolve(port)
      return
    }
    reject(new Error("No free port available"))
  })
}
