import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"

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
