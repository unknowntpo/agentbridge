import fs from "node:fs/promises"

export type IssueBindingProvider = "github"
export type IssueBindingState = "open" | "closed"

export interface IssueBinding {
  id: string
  provider: IssueBindingProvider
  repo: string
  number: number
  title: string
  state: IssueBindingState
  labels: string[]
  assignee?: string
  branch?: string
}

export interface IssueBindingsFile {
  issues: IssueBinding[]
}

export async function loadIssueBindings(filePath: string): Promise<IssueBinding[]> {
  const source = await fs.readFile(filePath, "utf8")
  const parsed = JSON.parse(source) as unknown
  return parseIssueBindingsFile(parsed, filePath).issues
}

export async function updateIssueBindingBranch(filePath: string, issueId: string, branch: string): Promise<void> {
  const source = await fs.readFile(filePath, "utf8")
  const parsed = JSON.parse(source) as unknown
  const file = parseIssueBindingsFile(parsed, filePath)
  const issue = file.issues.find((candidate) => candidate.id === issueId)
  if (!issue) {
    throw new Error(`Issue binding not found: ${issueId}`)
  }
  issue.branch = branch
  await fs.writeFile(filePath, `${JSON.stringify(file, null, 2)}\n`)
}

export function parseIssueBindingsFile(value: unknown, context = "issue bindings file"): IssueBindingsFile {
  const record = requireRecord(value, context)
  if (!Array.isArray(record.issues)) {
    throw new Error(`${context}.issues must be an array`)
  }

  return {
    issues: record.issues.map((issue, index) => parseIssueBinding(issue, `${context}.issues[${index}]`)),
  }
}

function parseIssueBinding(value: unknown, context: string): IssueBinding {
  const record = requireRecord(value, context)
  const provider = requireEnum(record.provider, ["github"], `${context}.provider`)
  const state = requireEnum(record.state, ["open", "closed"], `${context}.state`)
  return {
    id: requireString(record.id, `${context}.id`),
    provider,
    repo: requireString(record.repo, `${context}.repo`),
    number: requireNumber(record.number, `${context}.number`),
    title: requireString(record.title, `${context}.title`),
    state,
    labels: parseStringArray(record.labels, `${context}.labels`),
    assignee: optionalString(record.assignee, `${context}.assignee`),
    branch: optionalString(record.branch, `${context}.branch`),
  }
}

function requireRecord(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be an object`)
  }
  return value as Record<string, unknown>
}

function requireString(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string`)
  }
  return value
}

function optionalString(value: unknown, context: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string when provided`)
  }
  return value
}

function requireNumber(value: unknown, context: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${context} must be a positive integer`)
  }
  return value
}

function requireEnum<T extends string>(value: unknown, allowed: readonly T[], context: string): T {
  if (typeof value === "string" && allowed.includes(value as T)) {
    return value as T
  }
  throw new Error(`${context} must be one of: ${allowed.join(", ")}`)
}

function parseStringArray(value: unknown, context: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array`)
  }
  return value.map((item, index) => requireString(item, `${context}[${index}]`))
}
