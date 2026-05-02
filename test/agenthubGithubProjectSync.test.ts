import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "bun:test"

import { parseGitHubProjectWorkflowConfig } from "../src/agenthub/githubProjectConfig.js"
import type { GitHubProjectClient, GitHubProjectIssueItem, GitHubProjectStatusField } from "../src/agenthub/githubProjectGh.js"
import { parseProjectStatusField } from "../src/agenthub/githubProjectGh.js"
import { issueBranch, issueSlug, syncGitHubProjectWorkflow } from "../src/agenthub/githubProjectSync.js"
import { appendIssueBinding, loadIssueBindings } from "../src/agenthub/issueBindings.js"
import type { AgentHubProjectService } from "../src/agenthub/projectService.js"
import type { AgentDeployRequest, AgentDeployResult } from "../src/agenthub/agentDeploy.js"
import type { StateStore, ThreadBinding } from "../src/types.js"

describe("GitHub Project agent workflow sync", () => {
  it("parses the repo-local GitHub Project workflow config with safe MVP defaults", () => {
    const config = parseGitHubProjectWorkflowConfig({
      github: {
        owner: "unknowntpo",
        repo: "tw-example",
        project: {
          owner: "unknowntpo",
          number: 1,
        },
        labels: {},
      },
    })

    expect(config.github.project.statusField).toBe("Status")
    expect(config.github.project.deployStatus).toBe("In Progress")
    expect(config.github.project.reviewStatus).toBe("Review")
    expect(config.github.project.doneStatus).toBe("Done")
    expect(config.github.labels.deploy).toBe("agentbridge")
    expect(config.agent.defaultProvider).toBe("codex")
    expect(config.agent.defaultPermission).toBe("workspace-write")
    expect(config.sync.pollIntervalSeconds).toBe(30)
  })

  it("uses deterministic issue slug and branch names", () => {
    expect(issueSlug(12, "Refactor checkout timeout!")).toBe("12-refactor-checkout-timeout")
    expect(issueBranch(12, "Refactor checkout timeout!")).toBe("agent/12-refactor-checkout-timeout")
    expect(issueSlug(9, "中文 issue")).toBe("9-issue")
  })

  it("deploys Codex once for In Progress issues with the deploy label and comments a handoff command", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-gh-sync-"))
    const issuesFile = path.join(root, ".agenthub", "issues.json")
    const client = new FakeGitHubProjectClient([projectIssue({
      status: "In Progress",
      labels: ["agentbridge"],
    })])
    const projectService = new FakeProjectService()
    const stateStore = new FakeStateStore()
    const deployCalls: AgentDeployRequest[] = []

    const result = await syncGitHubProjectWorkflow({
      projectRoot: root,
      issuesFile,
      config: testConfig(),
      client,
      projectService: projectService as unknown as AgentHubProjectService,
      stateStore,
      deployAgent: async (request) => {
        deployCalls.push(request)
        return deployResult(request, "session-1")
      },
      now: () => "2026-05-02T00:00:00.000Z",
    })

    expect(result.deployed).toHaveLength(1)
    expect(projectService.createCalls).toEqual([{
      projectPath: root,
      slug: "42-refactor-checkout-timeout",
      branch: "agent/42-refactor-checkout-timeout",
      base: "HEAD",
    }])
    expect(deployCalls).toEqual([expect.objectContaining({
      provider: "codex",
      profile: "workspace-write",
      worktreeId: "42-refactor-checkout-timeout",
      worktreePath: path.join(root, "42-refactor-checkout-timeout"),
    })])
    expect(client.comments).toHaveLength(1)
    expect(client.comments[0]?.body).toContain("AgentBridge deployed Codex")
    expect(client.comments[0]?.body).toContain("agentbridge session open --session-id session-1 --provider codex")
    expect(stateStore.bindings).toHaveLength(1)

    const bindings = await loadIssueBindings(issuesFile)
    expect(bindings[0]).toEqual(expect.objectContaining({
      id: "github:unknowntpo/tw-example#42",
      branch: "agent/42-refactor-checkout-timeout",
      sessionId: "session-1",
      handoffCommentedAt: "2026-05-02T00:00:00.000Z",
    }))

    const second = await syncGitHubProjectWorkflow({
      projectRoot: root,
      issuesFile,
      config: testConfig(),
      client,
      projectService: projectService as unknown as AgentHubProjectService,
      stateStore,
      deployAgent: async (request) => {
        deployCalls.push(request)
        return deployResult(request, "session-2")
      },
      now: () => "2026-05-02T00:01:00.000Z",
    })

    expect(second.deployed).toHaveLength(0)
    expect(second.skipped).toEqual(expect.arrayContaining([
      { issueId: "github:unknowntpo/tw-example#42", reason: "already deployed" },
    ]))
    expect(deployCalls).toHaveLength(1)
    expect(client.comments).toHaveLength(1)
  })

  it("does not deploy issues that only moved to In Progress without the explicit label", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-gh-no-label-"))
    const client = new FakeGitHubProjectClient([projectIssue({ status: "In Progress", labels: [] })])
    const projectService = new FakeProjectService()
    const deployCalls: AgentDeployRequest[] = []

    const result = await syncGitHubProjectWorkflow({
      projectRoot: root,
      issuesFile: path.join(root, ".agenthub", "issues.json"),
      config: testConfig(),
      client,
      projectService: projectService as unknown as AgentHubProjectService,
      stateStore: new FakeStateStore(),
      deployAgent: async (request) => {
        deployCalls.push(request)
        return deployResult(request, "session-never")
      },
    })

    expect(result.deployed).toHaveLength(0)
    expect(deployCalls).toHaveLength(0)
    expect(projectService.createCalls).toHaveLength(0)
    expect(client.comments).toHaveLength(0)
  })

  it("moves project status to Review when a PR exists for the issue branch", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-gh-pr-"))
    const issuesFile = path.join(root, ".agenthub", "issues.json")
    await appendIssueBinding(issuesFile, {
      id: "github:unknowntpo/tw-example#42",
      provider: "github",
      repo: "unknowntpo/tw-example",
      number: 42,
      title: "Refactor checkout timeout",
      state: "open",
      labels: ["agentbridge"],
      branch: "agent/42-refactor-checkout-timeout",
      sessionId: "session-1",
    })
    const client = new FakeGitHubProjectClient([projectIssue({
      status: "In Progress",
      labels: ["agentbridge"],
    })])
    client.pullRequest = {
      url: "https://github.com/unknowntpo/tw-example/pull/5",
      state: "OPEN",
      merged: false,
    }

    const result = await syncGitHubProjectWorkflow({
      projectRoot: root,
      issuesFile,
      config: testConfig(),
      client,
      projectService: new FakeProjectService() as unknown as AgentHubProjectService,
      stateStore: new FakeStateStore(),
      deployAgent: async (request) => deployResult(request, "unused"),
    })

    expect(result.updated).toEqual([{
      issueId: "github:unknowntpo/tw-example#42",
      status: "Review",
      reason: "review milestone",
    }])
    expect(client.statusUpdates).toEqual([{
      itemId: "PVTI_42",
      status: "Review",
    }])
  })

  it("persists branch and worktree before creating the worktree for retry safety", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-gh-partial-"))
    const issuesFile = path.join(root, ".agenthub", "issues.json")
    const projectService = new FakeProjectService()
    projectService.failCreate = true

    await expect(syncGitHubProjectWorkflow({
      projectRoot: root,
      issuesFile,
      config: testConfig(),
      client: new FakeGitHubProjectClient([projectIssue({
        status: "In Progress",
        labels: ["agentbridge"],
      })]),
      projectService: projectService as unknown as AgentHubProjectService,
      stateStore: new FakeStateStore(),
      deployAgent: async (request) => deployResult(request, "unused"),
    })).rejects.toThrow("create failed")

    const binding = (await loadIssueBindings(issuesFile))[0]
    expect(binding).toEqual(expect.objectContaining({
      branch: "agent/42-refactor-checkout-timeout",
      worktreePath: path.join(root, "42-refactor-checkout-timeout"),
      sessionId: undefined,
    }))
  })

  it("uses existing SQLite bindings as deploy idempotency guard", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-gh-sqlite-"))
    const stateStore = new FakeStateStore()
    stateStore.bindings.push(threadBinding({
      workspacePath: path.join(root, "42-refactor-checkout-timeout"),
      sessionId: "existing-session",
    }))
    const deployCalls: AgentDeployRequest[] = []

    const result = await syncGitHubProjectWorkflow({
      projectRoot: root,
      issuesFile: path.join(root, ".agenthub", "issues.json"),
      config: testConfig(),
      client: new FakeGitHubProjectClient([projectIssue({
        status: "In Progress",
        labels: ["agentbridge"],
      })]),
      projectService: new FakeProjectService() as unknown as AgentHubProjectService,
      stateStore,
      deployAgent: async (request) => {
        deployCalls.push(request)
        return deployResult(request, "duplicate")
      },
    })

    expect(result.deployed).toHaveLength(0)
    expect(result.skipped).toEqual(expect.arrayContaining([
      { issueId: "github:unknowntpo/tw-example#42", reason: "already deployed" },
    ]))
    expect(deployCalls).toHaveLength(0)
  })

  it("does not deploy after moving an existing PR branch to Review", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-gh-review-skip-"))
    const issuesFile = path.join(root, ".agenthub", "issues.json")
    await appendIssueBinding(issuesFile, {
      id: "github:unknowntpo/tw-example#42",
      provider: "github",
      repo: "unknowntpo/tw-example",
      number: 42,
      title: "Refactor checkout timeout",
      state: "open",
      labels: ["agentbridge"],
      branch: "agent/42-refactor-checkout-timeout",
      worktreePath: path.join(root, "42-refactor-checkout-timeout"),
    })
    const client = new FakeGitHubProjectClient([projectIssue({
      status: "In Progress",
      labels: ["agentbridge"],
    })])
    client.pullRequest = {
      url: "https://github.com/unknowntpo/tw-example/pull/5",
      state: "OPEN",
      merged: false,
    }
    const deployCalls: AgentDeployRequest[] = []

    const result = await syncGitHubProjectWorkflow({
      projectRoot: root,
      issuesFile,
      config: testConfig(),
      client,
      projectService: new FakeProjectService() as unknown as AgentHubProjectService,
      stateStore: new FakeStateStore(),
      deployAgent: async (request) => {
        deployCalls.push(request)
        return deployResult(request, "should-not-run")
      },
    })

    expect(result.updated).toHaveLength(1)
    expect(result.deployed).toHaveLength(0)
    expect(result.skipped).toEqual(expect.arrayContaining([
      { issueId: "github:unknowntpo/tw-example#42", reason: "moved to Review" },
    ]))
    expect(deployCalls).toHaveLength(0)
  })

  it("stores PR metadata even when the item is already in Review", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-gh-review-meta-"))
    const issuesFile = path.join(root, ".agenthub", "issues.json")
    await appendIssueBinding(issuesFile, {
      id: "github:unknowntpo/tw-example#42",
      provider: "github",
      repo: "unknowntpo/tw-example",
      number: 42,
      title: "Refactor checkout timeout",
      state: "open",
      labels: ["agentbridge"],
      branch: "agent/42-refactor-checkout-timeout",
      sessionId: "session-1",
    })
    const client = new FakeGitHubProjectClient([projectIssue({
      status: "Review",
      labels: ["agentbridge"],
    })])
    client.pullRequest = {
      url: "https://github.com/unknowntpo/tw-example/pull/5",
      state: "OPEN",
      merged: false,
    }

    await syncGitHubProjectWorkflow({
      projectRoot: root,
      issuesFile,
      config: testConfig(),
      client,
      projectService: new FakeProjectService() as unknown as AgentHubProjectService,
      stateStore: new FakeStateStore(),
      deployAgent: async (request) => deployResult(request, "unused"),
    })

    const binding = (await loadIssueBindings(issuesFile))[0]
    expect(binding).toEqual(expect.objectContaining({
      projectStatus: "Review",
      prUrl: "https://github.com/unknowntpo/tw-example/pull/5",
      prState: "OPEN",
    }))
    expect(client.statusUpdates).toHaveLength(0)
  })

  it("fails fast when gh project status field output lacks required ids", () => {
    expect(() => parseProjectStatusField(JSON.stringify({
      fields: [{
        name: "Status",
        options: [{ id: "opt-review", name: "Review" }],
      }],
    }), "Status")).toThrow("missing projectId")

    expect(() => parseProjectStatusField(JSON.stringify({
      projectId: "PVT_project",
      fields: [{
        name: "Status",
        options: [{ id: "opt-review", name: "Review" }],
      }],
    }), "Status")).toThrow("missing field id")
  })
})

function testConfig() {
  return parseGitHubProjectWorkflowConfig({
    github: {
      owner: "unknowntpo",
      repo: "tw-example",
      project: {
        owner: "unknowntpo",
        number: 1,
        statusField: "Status",
        deployStatus: "In Progress",
        reviewStatus: "Review",
        doneStatus: "Done",
      },
      labels: { deploy: "agentbridge" },
    },
    agent: {
      defaultProvider: "codex",
      defaultPermission: "workspace-write",
    },
  })
}

function projectIssue(options: { status: string; labels: string[] }): GitHubProjectIssueItem {
  return {
    itemId: "PVTI_42",
    projectId: "PVT_project",
    status: options.status,
    issue: {
      repo: "unknowntpo/tw-example",
      number: 42,
      title: "Refactor checkout timeout",
      state: "open",
      labels: options.labels,
      url: "https://github.com/unknowntpo/tw-example/issues/42",
    },
  }
}

function deployResult(request: AgentDeployRequest, sessionId: string): AgentDeployResult {
  return {
    id: sessionId,
    worktreeId: request.worktreeId,
    provider: "Codex",
    mode: "write",
    profile: request.profile,
    state: "running",
    prompt: request.prompt,
    workingDirectory: request.worktreePath,
    mocked: false,
    messages: [],
    runs: [],
    artifacts: [],
    skills: {
      loaded: [],
      suggested: [],
      blocked: [],
      events: [],
    },
  }
}

class FakeGitHubProjectClient implements GitHubProjectClient {
  comments: Array<{ repo: string; number: number; body: string }> = []
  statusUpdates: Array<{ itemId: string; status: string }> = []
  pullRequest: Awaited<ReturnType<GitHubProjectClient["findPullRequest"]>> = null
  readonly statusField: GitHubProjectStatusField = {
    projectId: "PVT_project",
    fieldId: "PVTSSF_status",
    options: {
      "In Progress": "opt-progress",
      Review: "opt-review",
      Done: "opt-done",
    },
  }

  constructor(private readonly items: GitHubProjectIssueItem[]) {}

  async listProjectIssueItems(): Promise<GitHubProjectIssueItem[]> {
    return this.items
  }

  async loadStatusField(): Promise<GitHubProjectStatusField> {
    return this.statusField
  }

  async updateProjectStatus(itemId: string, status: string): Promise<void> {
    this.statusUpdates.push({ itemId, status })
  }

  async commentIssue(repo: string, number: number, body: string): Promise<void> {
    this.comments.push({ repo, number, body })
  }

  async findPullRequest(): Promise<Awaited<ReturnType<GitHubProjectClient["findPullRequest"]>>> {
    return this.pullRequest
  }
}

class FakeProjectService {
  createCalls: Array<{ projectPath: string; slug: string; branch: string; base?: string }> = []
  failCreate = false

  async createWorktree(request: { projectPath: string; slug: string; branch: string; base?: string }) {
    this.createCalls.push(request)
    if (this.failCreate) {
      throw new Error("create failed")
    }
    return { ok: true, message: "created", stdout: "", stderr: "" }
  }
}

class FakeStateStore implements Pick<StateStore, "listBindings" | "saveBinding"> {
  bindings: ThreadBinding[] = []

  listBindings(): ThreadBinding[] {
    return this.bindings
  }

  saveBinding(binding: ThreadBinding): void {
    this.bindings.push(binding)
  }
}

function threadBinding(options: { workspacePath: string; sessionId: string }): ThreadBinding {
  return {
    threadId: `agenthub:${options.sessionId}`,
    sessionId: options.sessionId,
    provider: "codex",
    backend: "app-server",
    workspaceId: null,
    workspaceLabel: "42-refactor-checkout-timeout",
    workspacePath: options.workspacePath,
    permissionProfile: "workspace-write",
    state: "bound_idle",
    createdAt: "2026-05-02T00:00:00.000Z",
    updatedAt: "2026-05-02T00:00:00.000Z",
    lastError: null,
    lastReadMessageId: null,
  }
}
