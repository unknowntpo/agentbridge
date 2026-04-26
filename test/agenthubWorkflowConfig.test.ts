import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "bun:test"

import { deriveWorkflowViewModel, loadWorkflowFile, parseWorkflowConfig } from "../src/agenthub/workflowConfig.js"
import { renderWorkflowTree } from "../src/tui/workflowTree.js"

describe("AgentHub workflow config", () => {
  it("derives issue, worktree, agent, and pull request relationships from YAML", async () => {
    const model = await loadWorkflowFile(path.resolve(import.meta.dirname, "../examples/agenthub.workflow.yml"))
    const project = model.projects[0]

    expect(project.id).toBe("minishop")
    expect(project.summary).toEqual({
      epics: 2,
      issues: 3,
      worktrees: 3,
      agents: 3,
      pullRequests: 2,
    })

    const checkoutRetry = project.workItems.find((item) => item.id === "gh-121")
    expect(checkoutRetry).toMatchObject({
      type: "issue",
      title: "Add checkout retry metrics",
      worktree: expect.objectContaining({ id: "wt-gh-121", branch: "agent/gh-121-checkout-retry" }),
      pullRequest: expect.objectContaining({ id: "pr-44", checks: "pending" }),
    })
    expect(checkoutRetry?.agents.map((agent) => `${agent.provider}:${agent.mode}:${agent.status}`)).toEqual([
      "codex:write:running",
      "gemini:read:idle",
    ])
  })

  it("renders a stable terminal tree for review", async () => {
    const model = await loadWorkflowFile(path.resolve(import.meta.dirname, "../examples/agenthub.workflow.yml"))
    const output = renderWorkflowTree(model)

    expect(output).toContain("MiniShop Demo")
    expect(output).toContain("├─ epic epic-checkout Checkout reliability [in_progress]")
    expect(output).toContain("│  └─ issue gh-121 Add checkout retry metrics [in_progress]")
    expect(output).toContain("│     ├─ worktree: wt/checkout-retry (agent/gh-121-checkout-retry)")
    expect(output).toContain("│     ├─ agents: codex write running, gemini read idle")
    expect(output).toContain("│     └─ pr: pr-44 open checks:pending")
    expect(output).not.toContain("└─ pr: none\n│  ├─ issue")
  })

  it("rejects invalid references before rendering", () => {
    expect(() => deriveWorkflowViewModel(parseWorkflowConfig(`
version: 1
projects:
  - id: demo
    name: Demo
    work_items:
      - id: issue-1
        type: issue
        title: Missing worktree
        status: todo
    agents:
      - id: codex-missing
        provider: codex
        mode: write
        status: running
        worktree: wt-missing
        work_item: issue-1
`))).toThrow("unknown worktree `wt-missing`")
  })

  it("loads from a file path and reports invalid YAML shape", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-workflow-"))
    const file = path.join(root, "agenthub.yml")
    fs.writeFileSync(file, "version: 1\nprojects: []\n")

    await expect(loadWorkflowFile(file)).rejects.toThrow("at least one project")
  })
})
