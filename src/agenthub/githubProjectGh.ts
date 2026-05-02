import { spawn } from "node:child_process"

import type { GitHubProjectWorkflowConfig } from "./githubProjectConfig.js"

export interface GitHubProjectIssueItem {
  itemId: string
  projectId?: string
  status: string
  issue: {
    repo: string
    number: number
    title: string
    state: "open" | "closed"
    labels: string[]
    url?: string
  }
}

export interface GitHubProjectStatusField {
  projectId?: string
  fieldId: string
  options: Record<string, string>
}

export interface GitHubPullRequestSummary {
  url: string
  state: "OPEN" | "CLOSED" | "MERGED" | string
  merged: boolean
}

export type GhRunner = (cwd: string, args: string[]) => Promise<string>

export interface GitHubProjectClient {
  listProjectIssueItems(config: GitHubProjectWorkflowConfig): Promise<GitHubProjectIssueItem[]>
  loadStatusField(config: GitHubProjectWorkflowConfig): Promise<GitHubProjectStatusField | null>
  updateProjectStatus(itemId: string, status: string, field: GitHubProjectStatusField): Promise<void>
  commentIssue(repo: string, number: number, body: string): Promise<void>
  findPullRequest(repo: string, branch: string): Promise<GitHubPullRequestSummary | null>
}

export function createGhProjectClient(cwd: string, runner: GhRunner = runGh): GitHubProjectClient {
  return {
    async listProjectIssueItems(config) {
      const output = await runner(cwd, [
        "project",
        "item-list",
        String(config.github.project.number),
        "--owner",
        config.github.project.owner,
        "--format",
        "json",
        "--limit",
        "100",
      ])
      const items = parseProjectIssueItems(output, config)
      return Promise.all(items.map(async (item) => ({
        ...item,
        issue: {
          ...item.issue,
          ...await loadIssueSnapshot(cwd, runner, item.issue.repo, item.issue.number),
        },
      })))
    },
    async loadStatusField(config) {
      const projectOutput = await runner(cwd, [
        "project",
        "view",
        String(config.github.project.number),
        "--owner",
        config.github.project.owner,
        "--format",
        "json",
      ])
      const output = await runner(cwd, [
        "project",
        "field-list",
        String(config.github.project.number),
        "--owner",
        config.github.project.owner,
        "--format",
        "json",
        "--limit",
        "100",
      ])
      return parseProjectStatusField(output, config.github.project.statusField, parseProjectId(projectOutput))
    },
    async updateProjectStatus(itemId, status, field) {
      const optionId = field.options[status]
      if (!optionId) {
        throw new Error(`GitHub Project status option not found: ${status}`)
      }
      const args = [
        "project",
        "item-edit",
        "--id",
        itemId,
        "--field-id",
        field.fieldId,
        "--single-select-option-id",
        optionId,
      ]
      if (field.projectId) {
        args.push("--project-id", field.projectId)
      }
      await runner(cwd, args)
    },
    async commentIssue(repo, number, body) {
      await runner(cwd, ["issue", "comment", String(number), "--repo", repo, "--body", body])
    },
    async findPullRequest(repo, branch) {
      const output = await runner(cwd, [
        "pr",
        "list",
        "--repo",
        repo,
        "--head",
        branch,
        "--state",
        "all",
        "--limit",
        "1",
        "--json",
        "url,state,mergedAt",
      ])
      return parsePullRequestList(output)
    },
  }
}

export function parseProjectIssueItems(source: string, config: GitHubProjectWorkflowConfig): GitHubProjectIssueItem[] {
  const parsed = parseJsonRecord(source, "gh project item-list output")
  const items = Array.isArray(parsed.items) ? parsed.items : []
  const result: GitHubProjectIssueItem[] = []
  for (const rawItem of items) {
    const item = asRecord(rawItem)
    const content = asRecord(item.content)
    const issue = parseIssueContent(content, config.github.repo)
    if (!issue) continue
    result.push({
      itemId: stringValue(item.id) ?? stringValue(item.itemId) ?? issue.url ?? `${issue.repo}#${issue.number}`,
      projectId: stringValue(item.projectId) ?? stringValue(parsed.projectId),
      status: extractStatus(item, config.github.project.statusField),
      issue,
    })
  }
  return result
}

export function parseProjectStatusField(source: string, statusFieldName: string, fallbackProjectId?: string): GitHubProjectStatusField | null {
  const parsed = parseJsonRecord(source, "gh project field-list output")
  const fields = Array.isArray(parsed.fields) ? parsed.fields : []
  for (const rawField of fields) {
    const field = asRecord(rawField)
    if (stringValue(field.name) !== statusFieldName) continue
    const options: Record<string, string> = {}
    const rawOptions = Array.isArray(field.options) ? field.options : []
    for (const rawOption of rawOptions) {
      const option = asRecord(rawOption)
      const name = stringValue(option.name)
      const id = stringValue(option.id)
      if (name && id) options[name] = id
    }
    const projectId = stringValue(field.projectId) ?? stringValue(parsed.projectId) ?? fallbackProjectId
    const fieldId = stringValue(field.id) ?? stringValue(field.fieldId)
    if (!projectId) {
      throw new Error(`GitHub Project field \`${statusFieldName}\` is missing projectId`)
    }
    if (!fieldId) {
      throw new Error(`GitHub Project field \`${statusFieldName}\` is missing field id`)
    }
    return { projectId, fieldId, options }
  }
  return null
}

export function parseProjectId(source: string): string | undefined {
  const parsed = parseJsonRecord(source, "gh project view output")
  return stringValue(parsed.id)
}

export function parsePullRequestList(source: string): GitHubPullRequestSummary | null {
  const parsed = JSON.parse(source || "[]") as unknown
  const items = Array.isArray(parsed) ? parsed : []
  const first = asRecord(items[0])
  const url = stringValue(first.url)
  if (!url) return null
  const state = stringValue(first.state) ?? "OPEN"
  const mergedAt = stringValue(first.mergedAt)
  return {
    url,
    state,
    merged: state === "MERGED" || Boolean(mergedAt),
  }
}

export function parseIssueView(source: string, fallback: GitHubProjectIssueItem["issue"]): Partial<GitHubProjectIssueItem["issue"]> {
  const parsed = parseJsonRecord(source, "gh issue view output")
  return {
    number: numberValue(parsed.number) ?? fallback.number,
    title: stringValue(parsed.title) ?? fallback.title,
    state: stringValue(parsed.state)?.toLowerCase() === "closed" ? "closed" : fallback.state,
    labels: parseLabels(parsed.labels),
    url: stringValue(parsed.url) ?? fallback.url,
  }
}

function parseIssueContent(content: Record<string, unknown>, defaultRepo: string): GitHubProjectIssueItem["issue"] | null {
  const type = stringValue(content.type)
  if (type && type !== "Issue") return null
  const number = numberValue(content.number)
  const title = stringValue(content.title)
  if (!number || !title) return null
  const repo = stringValue(content.repository) ?? repoFromUrl(stringValue(content.url)) ?? defaultRepo
  const labels = parseLabels(content.labels)
  const rawState = stringValue(content.state)?.toLowerCase()
  return {
    repo,
    number,
    title,
    state: rawState === "closed" ? "closed" : "open",
    labels,
    url: stringValue(content.url),
  }
}

function extractStatus(item: Record<string, unknown>, fieldName: string): string {
  const direct = stringValue(item.status)
  if (direct) return direct
  const fieldValues = Array.isArray(item.fieldValues) ? item.fieldValues : []
  for (const rawFieldValue of fieldValues) {
    const fieldValue = asRecord(rawFieldValue)
    if (stringValue(fieldValue.fieldName) === fieldName || stringValue(fieldValue.name) === fieldName) {
      return stringValue(fieldValue.value) ?? stringValue(fieldValue.text) ?? stringValue(fieldValue.optionName) ?? ""
    }
  }
  return ""
}

function parseLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((label) => typeof label === "string" ? label : stringValue(asRecord(label).name))
    .filter((label): label is string => Boolean(label))
}

async function loadIssueSnapshot(
  cwd: string,
  runner: GhRunner,
  repo: string,
  number: number,
): Promise<Partial<GitHubProjectIssueItem["issue"]>> {
  const output = await runner(cwd, [
    "issue",
    "view",
    String(number),
    "--repo",
    repo,
    "--json",
    "number,title,state,labels,url",
  ])
  return parseIssueView(output, {
    repo,
    number,
    title: `issue ${number}`,
    state: "open",
    labels: [],
  })
}

function repoFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/\d+/.exec(url)
  return match?.[1]
}

function parseJsonRecord(source: string, context: string): Record<string, unknown> {
  const parsed = JSON.parse(source || "{}") as unknown
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${context} must be a JSON object`)
  }
  return parsed as Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined
}

function runGh(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    })
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("error", reject)
    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolve(stdout.trim())
        return
      }
      reject(new Error(stderr.trim() || `gh ${args.join(" ")} failed with exit code ${exitCode}`))
    })
  })
}
