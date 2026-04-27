import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { PassThrough, Writable } from "node:stream"

import { describe, expect, it } from "bun:test"
import { render } from "ink"
import React from "react"

import type { WorkflowViewModel } from "../src/agenthub/workflowConfig.js"
import { buildDeployRequestForWorktree, getViewportWindow, WORKFLOW_TUI_CONTROLS, WorkflowTui } from "../src/tui/WorkflowTui.js"
import { buildSessionOpenCommand } from "../src/local/handoffCommand.js"
import { SQLiteStateStore } from "../src/state/sqliteStateStore.js"
import { createProjectModelSubscriber, shouldIgnoreWatchPath } from "../src/tui/projectModelSubscriber.js"
import { parseWorkflowCliView } from "../src/tui/workflowTree.js"

describe("AgentHub TUI CLI", () => {
  it("keeps TUI view-switching controls visible as a product contract", () => {
    expect([...WORKFLOW_TUI_CONTROLS]).toEqual([
      "tab  next view",
      "1    task-tree",
      "2    dependency",
      "3    ready",
      "4    agents",
      "5    commits",
      "d    deploy codex",
      "y    copy selected agent open command",
      "q    quit",
    ])
  })

  it("keeps focused rows inside a bounded viewport for long TUI views", () => {
    expect(getViewportWindow(0, 80, 6)).toEqual({ start: 0, end: 6, total: 80 })
    expect(getViewportWindow(20, 80, 6)).toEqual({ start: 17, end: 23, total: 80 })
    expect(getViewportWindow(79, 80, 6)).toEqual({ start: 74, end: 80, total: 80 })
    expect(getViewportWindow(0, 0, 6)).toEqual({ start: 0, end: 0, total: 0 })
  })

  it("does not expose the removed lifecycle view as a workflow projection", () => {
    expect(() => parseWorkflowCliView("lifecycle")).toThrow("workflow view must be one of: task-tree, dependency, ready, agents, commits")
  })

  it("updates the interactive TUI model through the auto-sync subscriber path", async () => {
    const stdout = new CaptureStream()
    const stderr = new CaptureStream()
    let pushUpdate: ((model: WorkflowViewModel) => void) | undefined
    let unsubscribed = false

    const instance = render(
      React.createElement(WorkflowTui, {
        model: minimalModel("Before Sync", 0),
        subscribeModelUpdates: (onUpdate) => {
          pushUpdate = onUpdate
          return () => {
            unsubscribed = true
          }
        },
      }),
      {
        stdout: stdout as unknown as NodeJS.WriteStream,
        stderr: stderr as unknown as NodeJS.WriteStream,
        stdin: new FakeTtyInput() as unknown as NodeJS.ReadStream,
        debug: true,
        interactive: false,
        patchConsole: false,
      },
    )

    await instance.waitUntilRenderFlush()
    expect(stdout.output).toContain("Before Sync")
    expect(pushUpdate).toBeDefined()

    pushUpdate?.(minimalModel("After Sync", 1))
    await new Promise((resolve) => setTimeout(resolve, 50))
    await instance.waitUntilRenderFlush()
    instance.unmount()
    await instance.waitUntilExit()

    expect(stdout.output).toContain("project auto-refreshed")
    expect(stdout.output).toContain("After Sync")
    expect(unsubscribed).toBe(true)
  })

  it("reloads the project model when auto-sync observes a project file change", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-watch-"))
    const watchedFile = path.join(root, "change.txt")
    fs.writeFileSync(watchedFile, "initial\n")
    let loads = 0
    let unsubscribe: (() => void) | undefined

    try {
      const subscriber = createProjectModelSubscriber(root, async (projectPath) => {
        loads += 1
        expect(projectPath).toBe(path.resolve(root))
        return minimalModel("Watched Sync", loads)
      }, { debounceMs: 20, pollIntervalMs: 50 })
      const update = new Promise<WorkflowViewModel>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("fs.watch did not trigger project reload")), 3_000)
        unsubscribe = subscriber(
          (model) => {
            clearTimeout(timeout)
            resolve(model)
          },
          (error) => {
            clearTimeout(timeout)
            reject(error)
          },
        )
      })

      await new Promise((resolve) => setTimeout(resolve, 50))
      fs.writeFileSync(watchedFile, "changed\n")

      const model = await update
      expect(model.projects[0]?.name).toBe("Watched Sync")
      expect(loads).toBe(1)
    } finally {
      unsubscribe?.()
    }
  })

  it("keeps noisy generated paths out of project auto-sync", () => {
    expect(shouldIgnoreWatchPath("node_modules/pkg/index.js")).toBe(true)
    expect(shouldIgnoreWatchPath("dist/cli.js")).toBe(true)
    expect(shouldIgnoreWatchPath("test-results/screenshot.png")).toBe(true)
    expect(shouldIgnoreWatchPath("src/cli.ts")).toBe(false)
  })

  it("builds a selected-worktree deploy request with a handoff-safe prompt", () => {
    const model = minimalModel("Deploy Demo", 1)
    const project = model.projects[0]!
    const worktree = project.worktrees[0]!
    const request = buildDeployRequestForWorktree(project, worktree, {
      id: "gh-121",
      title: "Add checkout retry metrics",
    })

    expect(request).toEqual({
      projectId: "demo",
      worktreeId: "wt-0",
      worktreePath: "/tmp/demo/wt-0",
      branch: "agent/test-0",
      provider: "codex",
      mode: "write",
      profile: "workspace-write",
      prompt: "Work on gh-121 Add checkout retry metrics",
    })
  })

  it("quotes handoff command arguments that are not shell-safe", () => {
    const command = buildSessionOpenCommand({
      sessionId: "session with spaces",
      provider: "codex",
      cwd: "/tmp/demo/o'hara worktree",
    })

    expect(command).toBe("agentbridge session open --session-id 'session with spaces' --provider codex --cwd '/tmp/demo/o'\\''hara worktree'")
  })

  it("renders a handoff command after deploying from the TUI", async () => {
    const stdout = new CaptureStream()
    const stderr = new CaptureStream()
    const stdin = new FakeTtyInput()
    const deployCalls: unknown[] = []
    const instance = render(
      React.createElement(WorkflowTui, {
        model: minimalModel("Deploy Demo", 1),
        deployAgent: async (request) => {
          deployCalls.push(request)
          return {
            sessionId: "thr-tui",
            provider: "codex",
            mode: "write",
            profile: "workspace-write",
            worktreeId: request.worktreeId,
            worktreePath: request.worktreePath,
            handoffCommand: buildSessionOpenCommand({
              sessionId: "thr-tui",
              provider: "codex",
              cwd: request.worktreePath,
            }),
          }
        },
      }),
      {
        stdout: stdout as unknown as NodeJS.WriteStream,
        stderr: stderr as unknown as NodeJS.WriteStream,
        stdin: stdin as unknown as NodeJS.ReadStream,
        debug: true,
        interactive: true,
        patchConsole: false,
      },
    )

    await instance.waitUntilRenderFlush()
    stdin.write("d")
    await new Promise((resolve) => setTimeout(resolve, 80))
    await instance.waitUntilRenderFlush()
    expect(deployCalls).toHaveLength(0)
    expect(stdout.output).toContain("Deploy agent")
    expect(stdout.output).toContain("> provider: ◎ Codex")
    expect(stdout.output).toContain("permission: workspace-write")
    expect(stdout.output).toContain("initial prompt:")

    stdin.write("s")
    await new Promise((resolve) => setTimeout(resolve, 80))
    await instance.waitUntilRenderFlush()
    instance.unmount()
    await instance.waitUntilExit()

    expect(deployCalls).toHaveLength(1)
    expect(stdout.output).toContain("Agent deployed")
    expect(stdout.output).toContain("agentbridge session open --session-id thr-tui --provider codex --cwd /tmp/demo/wt-0")
  })

  it("navigates the deploy draft with Tab, Shift+Tab, and Enter row selection", async () => {
    const stdout = new CaptureStream()
    const stderr = new CaptureStream()
    const stdin = new FakeTtyInput()
    const deployCalls: unknown[] = []
    const instance = render(
      React.createElement(WorkflowTui, {
        model: minimalModel("Deploy Demo", 1),
        deployAgent: async (request) => {
          deployCalls.push(request)
          return {
            sessionId: "thr-gemini",
            provider: request.provider,
            mode: request.mode,
            profile: request.profile,
            worktreeId: request.worktreeId,
            worktreePath: request.worktreePath,
            handoffCommand: buildSessionOpenCommand({
              sessionId: "thr-gemini",
              provider: request.provider,
              cwd: request.worktreePath,
            }),
          }
        },
      }),
      {
        stdout: stdout as unknown as NodeJS.WriteStream,
        stderr: stderr as unknown as NodeJS.WriteStream,
        stdin: stdin as unknown as NodeJS.ReadStream,
        debug: true,
        interactive: true,
        patchConsole: false,
      },
    )

    await instance.waitUntilRenderFlush()
    stdin.write("d")
    await new Promise((resolve) => setTimeout(resolve, 80))
    await instance.waitUntilRenderFlush()
    expect(stdout.output).toContain("> provider: ◎ Codex")

    stdin.write("\u001b[C")
    await new Promise((resolve) => setTimeout(resolve, 80))
    await instance.waitUntilRenderFlush()
    expect(stdout.output).toContain("> provider: ✦ Gemini")

    stdin.write("\r")
    await new Promise((resolve) => setTimeout(resolve, 80))
    await instance.waitUntilRenderFlush()
    expect(stdout.output).toContain("> permission: workspace-write")

    stdin.write("\t")
    await new Promise((resolve) => setTimeout(resolve, 80))
    await instance.waitUntilRenderFlush()
    expect(stdout.output).toContain("> initial prompt:")

    stdin.write("\u001b[Z")
    await new Promise((resolve) => setTimeout(resolve, 80))
    await instance.waitUntilRenderFlush()
    expect(stdout.output).toContain("> permission: workspace-write")

    stdin.write("\r")
    await new Promise((resolve) => setTimeout(resolve, 80))
    await instance.waitUntilRenderFlush()
    expect(stdout.output).toContain("> initial prompt:")

    stdin.write("\t")
    await new Promise((resolve) => setTimeout(resolve, 80))
    await instance.waitUntilRenderFlush()
    expect(stdout.output).toContain("> [ Deploy ]")

    stdin.write("\r")
    await new Promise((resolve) => setTimeout(resolve, 80))
    await instance.waitUntilRenderFlush()
    instance.unmount()
    await instance.waitUntilExit()

    expect(deployCalls).toHaveLength(1)
    expect(deployCalls[0]).toMatchObject({
      provider: "gemini",
      profile: "workspace-write",
      mode: "write",
    })
    expect(stdout.output).toContain("agentbridge session open --session-id thr-gemini --provider gemini --cwd /tmp/demo/wt-0")
  })

  it("renders a selected agent handoff command in the agents view", async () => {
    const stdout = new CaptureStream()
    const stderr = new CaptureStream()
    const instance = render(
      React.createElement(WorkflowTui, {
        model: modelWithManagedAgent(),
        initialView: "agents",
      }),
      {
        stdout: stdout as unknown as NodeJS.WriteStream,
        stderr: stderr as unknown as NodeJS.WriteStream,
        stdin: new FakeTtyInput() as unknown as NodeJS.ReadStream,
        debug: true,
        interactive: false,
        patchConsole: false,
      },
    )

    await instance.waitUntilRenderFlush()
    instance.unmount()
    await instance.waitUntilExit()

    expect(stdout.output).toContain("> [.] ◎ Codex codex-thr-managed")
    expect(stdout.output).toContain("open:")
    expect(stdout.output).toContain("agentbridge session open --session-id thr-managed --provider codex --cwd /tmp/demo/wt-0")
  })

  it("copies the selected agent handoff command from the agents view", async () => {
    const stdout = new CaptureStream()
    const stderr = new CaptureStream()
    const stdin = new FakeTtyInput()
    const copied: string[] = []
    const instance = render(
      React.createElement(WorkflowTui, {
        model: modelWithManagedAgent(),
        initialView: "agents",
        copyToClipboard: async (text) => {
          copied.push(text)
          return { ok: true, message: "copied" }
        },
      }),
      {
        stdout: stdout as unknown as NodeJS.WriteStream,
        stderr: stderr as unknown as NodeJS.WriteStream,
        stdin: stdin as unknown as NodeJS.ReadStream,
        debug: true,
        interactive: true,
        patchConsole: false,
      },
    )

    await instance.waitUntilRenderFlush()
    stdin.write("y")
    await new Promise((resolve) => setTimeout(resolve, 80))
    await instance.waitUntilRenderFlush()
    instance.unmount()
    await instance.waitUntilExit()

    expect(copied).toEqual([
      "agentbridge session open --session-id thr-managed --provider codex --cwd /tmp/demo/wt-0",
    ])
    expect(stdout.output).toContain("agent open command copied to clipboard")
    expect(stdout.output).toContain("copied")
  })

  it("copies the selected agent handoff command when a terminal mouse press is received", async () => {
    const stdout = new FakeTtyOutput()
    const stderr = new CaptureStream()
    const stdin = new FakeTtyInput()
    const copied: string[] = []
    const instance = render(
      React.createElement(WorkflowTui, {
        model: modelWithManagedAgent(),
        initialView: "agents",
        copyToClipboard: async (text) => {
          copied.push(text)
          return { ok: true, message: "copied" }
        },
      }),
      {
        stdout: stdout as unknown as NodeJS.WriteStream,
        stderr: stderr as unknown as NodeJS.WriteStream,
        stdin: stdin as unknown as NodeJS.ReadStream,
        debug: true,
        interactive: true,
        patchConsole: false,
      },
    )

    await instance.waitUntilRenderFlush()
    expect(stdout.output).toContain("\u001b[?1006h")

    stdin.write("\u001b[<0;10;10M")
    await new Promise((resolve) => setTimeout(resolve, 80))
    await instance.waitUntilRenderFlush()
    instance.unmount()
    await instance.waitUntilExit()

    expect(copied).toEqual([
      "agentbridge session open --session-id thr-managed --provider codex --cwd /tmp/demo/wt-0",
    ])
    expect(stdout.output).toContain("agent open command copied to clipboard")
    expect(stdout.output).toContain("copied")
  })

  it("prints a deterministic workflow tree without starting an interactive terminal", () => {
    const stdout = execFileSync("bun", [
      "src/cli.ts",
      "tui",
      "--file",
      path.resolve(import.meta.dirname, "../examples/agenthub.workflow.yml"),
      "--print",
    ], {
      cwd: path.resolve(import.meta.dirname, ".."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })

    expect(stdout).toContain("MiniShop Demo")
    expect(stdout).toContain("issue gh-130 Extract benchmark result dashboard [review]")
    expect(stdout).toContain("◎✦ issue gh-121 Add checkout retry metrics [in_progress]")
    expect(stdout).toContain("agents: claude read idle")
    expect(stdout).toContain("pr: pr-45 review_requested checks:passing")
    expect(stdout).toContain("deps: ◎✦ gh-121(in_progress), gh-120(todo)")
  })

  it("prints a selected TUI view in non-interactive mode", () => {
    const stdout = execFileSync("bun", [
      "src/cli.ts",
      "tui",
      "--file",
      path.resolve(import.meta.dirname, "../examples/agenthub.workflow.yml"),
      "--view",
      "agents",
      "--print",
    ], {
      cwd: path.resolve(import.meta.dirname, ".."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })

    expect(stdout).toContain("Agents View")
    expect(stdout).toContain("[*] ◎ Codex codex-gh-121")
    expect(stdout).toContain("provider: Codex   mode: write   status: running")
    expect(stdout).not.toContain("summary: 2 epics")
  })

  it("prints a dependency workflow view", () => {
    const stdout = runWorkflowView("dependency")

    expect(stdout).toContain("Dependency View")
    expect(stdout).toContain("gh-120 [todo] Fix checkout timeout")
    expect(stdout).toContain("├─> ◎✦ gh-121 [in_progress] Add checkout retry metrics")
    expect(stdout).toContain("└─> ✳ gh-130 [review] Extract benchmark result dashboard")
    expect(stdout).toContain("◎✦ gh-121 [in_progress] Add checkout retry metrics")
    expect(stdout).toContain("└─> ✳ gh-130 [review] Extract benchmark result dashboard")
  })

  it("prints a ready queue view", () => {
    const stdout = runWorkflowView("ready")

    expect(stdout).toContain("Ready View")
    expect(stdout).toContain("Ready")
    expect(stdout).toContain("gh-120 Fix checkout timeout [todo]")
    expect(stdout).toContain("Blocked")
    expect(stdout).toContain("gh-130 Extract benchmark result dashboard [review]")
    expect(stdout).toContain("blocked by: ◎✦ gh-121(in_progress), gh-120(todo)")
  })

  it("prints an agents view", () => {
    const stdout = runWorkflowView("agents")

    expect(stdout).toContain("Agents View")
    expect(stdout).toContain("[*] ◎ Codex codex-gh-121")
    expect(stdout).toContain("provider: Codex   mode: write   status: running")
    expect(stdout).toContain("branch: agent/gh-121-checkout-retry")
    expect(stdout).toContain("worktree: wt/checkout-retry")
    expect(stdout).toContain("task: gh-121 Add checkout retry metrics [in_progress]")
    expect(stdout).toContain("deps: gh-120(todo)")
    expect(stdout).toContain("[.] ✳ Claude Code claude-gh-130")
    expect(stdout).toContain("provider: Claude Code   mode: read   status: idle")
  })

  it("prints a real project commit view without a workflow YAML file", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-tui-real-"))
    const plainDir = path.join(root, "demo")
    const source = path.join(root, "source")
    createSourceRepo(source)

    execFileSync("bun", [
      "src/cli.ts",
      "project",
      "create",
      plainDir,
      "--repo",
      source,
      "--branch",
      "main",
    ], {
      cwd: path.resolve(import.meta.dirname, ".."),
      stdio: "pipe",
      env: {
        ...process.env,
        AGENTHUB_PROJECTS_JSON: JSON.stringify([{ id: "demo", label: "Demo Project", path: plainDir }]),
      },
    })

    const stdout = execFileSync("bun", [
      "src/cli.ts",
      "tui",
      "--project",
      plainDir,
      "--view",
      "commits",
      "--print",
    ], {
      cwd: path.resolve(import.meta.dirname, ".."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        AGENTHUB_PROJECTS_JSON: JSON.stringify([{ id: "demo", label: "Demo Project", path: plainDir }]),
      },
    })

    expect(stdout).toContain("Demo Project (demo)")
    expect(stdout).toContain("Commit View")
    expect(stdout).toContain("Initial commit")
    expect(stdout).toContain("worktrees: main clean +0/-0")
  })

  it("prints managed agents for a real project by joining persisted bindings to worktrees", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-tui-agent-projection-"))
    const plainDir = path.join(root, "demo")
    const source = path.join(root, "source")
    const sqlitePath = path.join(root, "state.db")
    createSourceRepo(source)

    execFileSync("bun", [
      "src/cli.ts",
      "project",
      "create",
      plainDir,
      "--repo",
      source,
      "--branch",
      "main",
    ], {
      cwd: path.resolve(import.meta.dirname, ".."),
      stdio: "pipe",
      env: {
        ...process.env,
        AGENTHUB_PROJECTS_JSON: JSON.stringify([{ id: "demo", label: "Demo Project", path: plainDir }]),
      },
    })

    const stateStore = new SQLiteStateStore(sqlitePath)
    stateStore.initialize()
    try {
      const now = "2026-04-27T00:00:00.000Z"
      stateStore.saveBinding({
        threadId: "agenthub:thr-print-agent",
        sessionId: "thr-print-agent",
        provider: "codex",
        backend: "app-server",
        workspaceId: null,
        workspaceLabel: "main",
        workspacePath: path.join(plainDir, "main"),
        permissionProfile: "workspace-write",
        state: "bound_idle",
        createdAt: now,
        updatedAt: now,
        lastError: null,
        lastReadMessageId: null,
      })
    } finally {
      stateStore.close()
    }

    const stdout = execFileSync("bun", [
      "src/cli.ts",
      "tui",
      "--project",
      plainDir,
      "--view",
      "agents",
      "--print",
    ], {
      cwd: path.resolve(import.meta.dirname, ".."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        AGENTHUB_PROJECTS_JSON: JSON.stringify([{ id: "demo", label: "Demo Project", path: plainDir }]),
        AGENTBRIDGE_SQLITE_PATH: sqlitePath,
      },
    })

    expect(stdout).toContain("Demo Project (demo)")
    expect(stdout).toContain("Agents View")
    expect(stdout).toContain("[.] ◎ Codex codex-thr-print-agent")
    expect(stdout).toContain("provider: Codex   mode: write   status: idle")
    expect(stdout).toContain(`worktree: ${fs.realpathSync(path.join(plainDir, "main"))}`)
  })

})

function runWorkflowView(view: string): string {
  return execFileSync("bun", [
    "src/cli.ts",
    "workflow",
    "--file",
    path.resolve(import.meta.dirname, "../examples/agenthub.workflow.yml"),
    "--view",
    view,
  ], {
    cwd: path.resolve(import.meta.dirname, ".."),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
}

class CaptureStream extends Writable {
  readonly columns = 120
  readonly rows = 40
  readonly isTTY: boolean = false
  readonly chunks: string[] = []

  get output(): string {
    return this.chunks.join("")
  }

  _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.chunks.push(chunk.toString())
    callback()
  }
}

class FakeTtyOutput extends CaptureStream {
  override readonly isTTY = true
}

class FakeTtyInput extends PassThrough {
  readonly isTTY = true
  isRaw = false

  setRawMode(enabled: boolean): this {
    this.isRaw = enabled
    return this
  }

  ref(): this {
    return this
  }

  unref(): this {
    return this
  }
}

function minimalModel(projectName: string, worktreeCount: number): WorkflowViewModel {
  return {
    projects: [{
      id: "demo",
      name: projectName,
      root: "/tmp/demo",
      workItems: [],
      rootItems: [],
      worktrees: Array.from({ length: worktreeCount }, (_, index) => ({
        id: `wt-${index}`,
        name: `wt-${index}`,
        path: `/tmp/demo/wt-${index}`,
        branch: `agent/test-${index}`,
      })),
      agents: [],
      pullRequests: [],
      commits: [],
      summary: {
        epics: 0,
        issues: 0,
        worktrees: worktreeCount,
        agents: 0,
        pullRequests: 0,
        commits: 0,
      },
    }],
  }
}

function modelWithManagedAgent(): WorkflowViewModel {
  return {
    projects: [{
      id: "demo",
      name: "Agent Demo",
      root: "/tmp/demo",
      workItems: [{
        id: "commit-abc",
        type: "ticket",
        title: "Managed task",
        status: "done",
        children: [],
        dependencies: [],
        dependents: [],
        agents: [{
          id: "codex-thr-managed",
          provider: "codex",
          mode: "write",
          status: "idle",
          session_id: "thr-managed",
          worktree: "wt-0",
          work_item: "commit-abc",
        }],
        worktree: {
          id: "wt-0",
          name: "wt-0",
          path: "/tmp/demo/wt-0",
          branch: "agent/test-0",
          work_item: "commit-abc",
        },
        pullRequest: null,
      }],
      rootItems: [],
      worktrees: [{
        id: "wt-0",
        name: "wt-0",
        path: "/tmp/demo/wt-0",
        branch: "agent/test-0",
        work_item: "commit-abc",
      }],
      agents: [{
        id: "codex-thr-managed",
        provider: "codex",
        mode: "write",
        status: "idle",
        session_id: "thr-managed",
        worktree: "wt-0",
        work_item: "commit-abc",
      }],
      pullRequests: [],
      commits: [],
      summary: {
        epics: 0,
        issues: 1,
        worktrees: 1,
        agents: 1,
        pullRequests: 0,
        commits: 0,
      },
    }],
  }
}

function createSourceRepo(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  git(dir, ["init", "--initial-branch=main"])
  fs.writeFileSync(path.join(dir, "README.md"), "# demo\n")
  git(dir, ["add", "README.md"])
  git(dir, ["-c", "user.name=AgentHub Test", "-c", "user.email=agenthub@example.test", "commit", "-m", "Initial commit"])
}

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, {
    cwd,
    stdio: "pipe",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
  })
}
