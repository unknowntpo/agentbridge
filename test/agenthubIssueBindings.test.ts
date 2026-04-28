import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "bun:test"

import { appendIssueBinding, loadIssueBindings } from "../src/agenthub/issueBindings.js"
import { parseGitHubIssueUrl } from "../src/agenthub/githubIssues.js"

describe("AgentHub issue bindings", () => {
  it("appends a newly created GitHub issue binding into a missing default file", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-issue-append-"))
    const filePath = path.join(root, ".agenthub", "issues.json")

    await appendIssueBinding(filePath, {
      id: "github:unknowntpo/tw-example#99",
      provider: "github",
      repo: "unknowntpo/tw-example",
      number: 99,
      title: "New issue from TUI",
      state: "open",
      labels: ["agentbridge"],
      assignee: "@me",
    })

    expect(await loadIssueBindings(filePath)).toEqual([{
      id: "github:unknowntpo/tw-example#99",
      provider: "github",
      repo: "unknowntpo/tw-example",
      number: 99,
      title: "New issue from TUI",
      state: "open",
      labels: ["agentbridge"],
      assignee: "@me",
      branch: undefined,
    }])
  })

  it("parses GitHub issue URLs returned by gh issue create", () => {
    expect(parseGitHubIssueUrl("https://github.com/unknowntpo/tw-example/issues/42")).toEqual({
      repo: "unknowntpo/tw-example",
      number: 42,
    })
  })

  it("creates a GitHub issue through gh and binds it through the CLI contract", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-issue-cli-"))
    const plainDir = path.join(root, "demo")
    const source = path.join(root, "source")
    const binDir = path.join(root, "bin")
    createSourceRepo(source)
    fs.mkdirSync(binDir)
    const ghPath = path.join(binDir, "gh")
    fs.writeFileSync(ghPath, "#!/bin/sh\nprintf '%s\\n' 'https://github.com/unknowntpo/tw-example/issues/77'\n")
    fs.chmodSync(ghPath, 0o755)

    const env = {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
      AGENTHUB_PROJECTS_JSON: JSON.stringify([{ id: "demo", label: "Demo Project", path: plainDir }]),
    }

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
      env,
    })

    const stdout = execFileSync("bun", [
      "src/cli.ts",
      "issue",
      "create",
      "--project",
      plainDir,
      "--title",
      "Issue from CLI",
      "--body",
      "Created by fake gh",
    ], {
      cwd: path.resolve(import.meta.dirname, ".."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env,
    })

    expect(stdout).toContain("created unknowntpo/tw-example#77: Issue from CLI")
    expect(stdout).toContain("https://github.com/unknowntpo/tw-example/issues/77")
    expect(fs.readFileSync(path.join(plainDir, ".agenthub", "issues.json"), "utf8")).toContain("github:unknowntpo/tw-example#77")
  })
})

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
