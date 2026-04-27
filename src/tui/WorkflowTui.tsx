import React, { useEffect, useState } from "react"
import { Box, render, Text, useInput, useStdin, useStdout, useWindowSize } from "ink"

import type { PermissionProfile, ProviderKind } from "../types.js"
import type { AgentMode, WorkflowAgentConfig, WorkflowProjectView, WorkflowViewModel, WorkflowWorkItemView, WorkflowWorktreeConfig } from "../agenthub/workflowConfig.js"
import { type ClipboardCopy, copyTextToClipboard } from "../local/clipboard.js"
import { buildSessionOpenCommand } from "../local/handoffCommand.js"
import {
  formatAgentProviderBadge,
  formatAgentProviderIcon,
  formatAgentProviderLabel,
  renderWorkflowView,
  WorkflowCliView,
  type WorkflowCliView as WorkflowCliViewType,
} from "./workflowTree.js"

export const WORKFLOW_TUI_CONTROLS = [
  "tab  next view",
  "1    task-tree",
  "2    dependency",
  "3    ready",
  "4    agents",
  "5    commits",
  "d    deploy codex",
  "y    copy selected agent open command",
  "q    quit",
] as const

export interface ViewportWindow {
  start: number
  end: number
  total: number
}

interface WorkflowTuiProps {
  model: WorkflowViewModel
  initialView?: WorkflowCliViewType
  subscribeModelUpdates?: (onUpdate: (model: WorkflowViewModel) => void, onError: (error: unknown) => void) => () => void
  deployAgent?: WorkflowTuiDeployHandler
  copyToClipboard?: ClipboardCopy
  onExit?: () => void
}

export interface WorkflowTuiDeployRequest {
  projectId: string
  worktreeId: string
  worktreePath: string
  branch: string
  provider: ProviderKind
  mode: AgentMode
  profile: PermissionProfile
  prompt: string
}

export interface WorkflowTuiDeployResult {
  sessionId: string
  provider: ProviderKind
  mode: AgentMode
  profile: PermissionProfile
  worktreeId: string
  worktreePath: string
  handoffCommand: string
}

export type WorkflowTuiDeployHandler = (request: WorkflowTuiDeployRequest) => Promise<WorkflowTuiDeployResult>

const VIEW_ORDER: WorkflowCliViewType[] = [
  WorkflowCliView.TaskTree,
  WorkflowCliView.Dependency,
  WorkflowCliView.Ready,
  WorkflowCliView.Agents,
  WorkflowCliView.Commits,
]
const DEPLOY_PROFILES: PermissionProfile[] = ["workspace-write", "workspace-read", "full-access"]
const DEPLOY_FORM_FIELDS = ["permission", "prompt", "deploy", "cancel"] as const
type DeployFormField = (typeof DEPLOY_FORM_FIELDS)[number]

interface DeployDraft {
  request: WorkflowTuiDeployRequest
  field: DeployFormField
}

interface CopyEffect {
  command: string
  copiedAt: number
}

const ENABLE_MOUSE_REPORTING = "\u001b[?1000h\u001b[?1002h\u001b[?1003h\u001b[?1006h\u001b[?1015h"
const DISABLE_MOUSE_REPORTING = "\u001b[?1000l\u001b[?1002l\u001b[?1003l\u001b[?1006l\u001b[?1015l"

export function WorkflowTui({
  model,
  initialView = WorkflowCliView.TaskTree,
  subscribeModelUpdates,
  deployAgent,
  copyToClipboard = copyTextToClipboard,
  onExit,
}: WorkflowTuiProps): React.ReactElement {
  const { rows } = useWindowSize()
  const { stdin, isRawModeSupported } = useStdin()
  const { stdout } = useStdout()
  const [currentModel, setCurrentModel] = useState(model)
  const [notice, setNotice] = useState<string | null>(null)
  const [projectIndex, setProjectIndex] = useState(0)
  const [itemIndex, setItemIndex] = useState(0)
  const [view, setView] = useState<WorkflowCliViewType>(initialView)
  const [handoff, setHandoff] = useState<WorkflowTuiDeployResult | null>(null)
  const [deployDraft, setDeployDraft] = useState<DeployDraft | null>(null)
  const [copyEffect, setCopyEffect] = useState<CopyEffect | null>(null)
  const project = currentModel.projects[projectIndex]!
  const items = flattenItems(project.rootItems)
  const selected = items[Math.min(itemIndex, items.length - 1)]
  const bodyRows = Math.max(6, rows - 14)
  const projectionLines = view === WorkflowCliView.TaskTree || view === WorkflowCliView.Agents
    ? []
    : renderWorkflowView(currentModel, view).split(/\r?\n/)
  const currentViewSize = getViewSize(view, items.length, project.agents.length, projectionLines.length)
  const selectedAgentCommand = view === WorkflowCliView.Agents
    ? getSelectedAgentHandoffCommand(project, itemIndex)
    : null

  useEffect(() => {
    if (!subscribeModelUpdates) return undefined
    return subscribeModelUpdates(
      (nextModel) => {
        setCurrentModel(nextModel)
        setProjectIndex(0)
        setItemIndex(0)
        setNotice("project auto-refreshed")
      },
      (error) => {
        setNotice(error instanceof Error ? error.message : "project auto-refresh failed")
      },
    )
  }, [subscribeModelUpdates])

  useEffect(() => {
    if (view !== WorkflowCliView.Agents || !selectedAgentCommand) return undefined
    if (!isRawModeSupported || !stdin.isTTY || !stdout.isTTY) return undefined

    stdout.write(ENABLE_MOUSE_REPORTING)
    const onData = (data: Buffer) => {
      if (!isMousePress(data.toString("utf8"))) return
      void copyAgentCommand(selectedAgentCommand, copyToClipboard, setNotice, setCopyEffect)
    }
    stdin.on("data", onData)
    return () => {
      stdin.off("data", onData)
      stdout.write(DISABLE_MOUSE_REPORTING)
    }
  }, [copyToClipboard, isRawModeSupported, selectedAgentCommand, stdin, stdout, view])

  useEffect(() => {
    if (!copyEffect) return undefined
    const timer = setTimeout(() => setCopyEffect(null), 1_600)
    return () => clearTimeout(timer)
  }, [copyEffect])

  useInput((input, key) => {
    if (deployDraft) {
      if (key.escape || input === "\u001b" || input === "c") {
        setDeployDraft(null)
        setNotice("deploy cancelled")
        return
      }
      if (key.upArrow) {
        setDeployDraft((current) => current ? {
          ...current,
          field: previousDeployField(current.field),
        } : current)
        return
      }
      if (key.downArrow || key.tab) {
        setDeployDraft((current) => current ? {
          ...current,
          field: nextDeployField(current.field),
        } : current)
        return
      }
      if (input === "p" || (deployDraft.field === "permission" && (key.leftArrow || key.rightArrow))) {
        setDeployDraft((current) => current ? {
          ...current,
          request: withNextPermissionProfile(current.request),
        } : current)
        return
      }
      if (input === "s" && deployDraft.field !== "prompt") {
        submitDeployDraft(deployDraft.request, deployAgent, setDeployDraft, setNotice, setHandoff)
        return
      }
      if (deployDraft.field === "prompt" && (key.backspace || key.delete)) {
        setDeployDraft((current) => current ? {
          ...current,
          request: {
            ...current.request,
            prompt: current.request.prompt.slice(0, -1),
          },
        } : current)
        return
      }
      if (key.return) {
        if (deployDraft.field === "cancel") {
          setDeployDraft(null)
          setNotice("deploy cancelled")
          return
        }
        if (deployDraft.field === "permission") {
          setDeployDraft((current) => current ? {
            ...current,
            request: withNextPermissionProfile(current.request),
          } : current)
          return
        }
        if (deployDraft.field !== "deploy") {
          setDeployDraft((current) => current ? {
            ...current,
            field: nextDeployField(current.field),
          } : current)
          return
        }
        submitDeployDraft(deployDraft.request, deployAgent, setDeployDraft, setNotice, setHandoff)
        return
      }
      if (deployDraft.field === "prompt" && input && !key.ctrl && !key.meta && !key.tab) {
        setDeployDraft((current) => current ? {
          ...current,
          request: {
            ...current.request,
            prompt: `${current.request.prompt}${input}`,
          },
        } : current)
      }
      return
    }

    if (input === "q") {
      onExit?.()
      return
    }
    if (input === "y") {
      if (!selectedAgentCommand) {
        setNotice("no selected agent handoff command to copy")
        return
      }
      void copyAgentCommand(selectedAgentCommand, copyToClipboard, setNotice, setCopyEffect)
      return
    }
    if (input === "1") switchView(WorkflowCliView.TaskTree, setView, setItemIndex)
    if (input === "2") switchView(WorkflowCliView.Dependency, setView, setItemIndex)
    if (input === "3") switchView(WorkflowCliView.Ready, setView, setItemIndex)
    if (input === "4") switchView(WorkflowCliView.Agents, setView, setItemIndex)
    if (input === "5") switchView(WorkflowCliView.Commits, setView, setItemIndex)
    if (input === "d") {
      const request = buildDeployRequest(project, selected)
      if (!request) {
        setNotice("no worktree available for deploy")
        return
      }
      if (!deployAgent) {
        setNotice("deploy is unavailable in this TUI mode")
        return
      }
      setDeployDraft({ request, field: "permission" })
      setNotice("deploy draft opened; ↑↓ choose field, ←→ switch permission, Enter confirm")
    }
    if (key.tab) {
      setView((current) => VIEW_ORDER[(VIEW_ORDER.indexOf(current) + 1) % VIEW_ORDER.length]!)
      setItemIndex(0)
    }
    if (key.upArrow) setItemIndex((current) => Math.max(0, current - 1))
    if (key.downArrow) setItemIndex((current) => Math.min(Math.max(0, currentViewSize - 1), current + 1))
    if (key.leftArrow) {
      setProjectIndex((current) => Math.max(0, current - 1))
      setItemIndex(0)
    }
    if (key.rightArrow) {
      setProjectIndex((current) => Math.min(currentModel.projects.length - 1, current + 1))
      setItemIndex(0)
    }
  })

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">AgentHub Workflow Prototype</Text>
      </Box>
      <ControlsHelp />
      {notice ? <Text color="yellow">{notice}</Text> : null}
      <ProjectHeader project={project} />
      {handoff ? <HandoffPanel handoff={handoff} /> : null}
      {deployDraft ? <DeployDraftPanel draft={deployDraft} /> : null}
      <Text color="gray">view: {view}</Text>
      {view === WorkflowCliView.TaskTree
        ? <TaskTreeView items={items} itemIndex={itemIndex} selected={selected} maxRows={bodyRows} />
        : view === WorkflowCliView.Agents
          ? <AgentsProjectionView project={project} itemIndex={itemIndex} maxRows={bodyRows} copyEffect={copyEffect} />
        : <ProjectionView lines={projectionLines} itemIndex={itemIndex} maxRows={bodyRows} />}
    </Box>
  )
}

function ControlsHelp(): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>Controls</Text>
      {WORKFLOW_TUI_CONTROLS.map((control) => (
        <Text key={control} color="gray">{control}</Text>
      ))}
      <Text color="gray">↑↓   scroll/focus current view or form field</Text>
    </Box>
  )
}

export async function runWorkflowTui(
  model: WorkflowViewModel,
  initialView: WorkflowCliViewType = WorkflowCliView.TaskTree,
  subscribeModelUpdates?: (onUpdate: (model: WorkflowViewModel) => void, onError: (error: unknown) => void) => () => void,
  deployAgent?: WorkflowTuiDeployHandler,
): Promise<void> {
  let instance: ReturnType<typeof render> | undefined
  instance = render(
    <WorkflowTui
      model={model}
      initialView={initialView}
      subscribeModelUpdates={subscribeModelUpdates}
      deployAgent={deployAgent}
      onExit={() => instance?.unmount()}
    />,
  )
  await instance.waitUntilExit()
}

function HandoffPanel({ handoff }: { handoff: WorkflowTuiDeployResult }): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1} paddingY={1} marginTop={1}>
      <Text bold color="green">Agent deployed</Text>
      <Text>session: {handoff.sessionId}</Text>
      <Text>worktree: {handoff.worktreePath}</Text>
      <Text color="yellow">open another terminal and run:</Text>
      <Text>{handoff.handoffCommand}</Text>
    </Box>
  )
}

function DeployDraftPanel({ draft }: { draft: DeployDraft }): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} paddingY={1} marginTop={1}>
      <Text bold color="yellow">Deploy agent</Text>
      <Text>{fieldMarker(draft.field, "permission")} permission: <Text color="yellow">{draft.request.profile}</Text> <Text color="gray">(←/→ or p)</Text></Text>
      <Text>  provider: <Text color="cyan">{formatAgentProviderBadge(draft.request.provider)}</Text></Text>
      <Text>workspace: <Text color="cyan">{draft.request.worktreePath}</Text></Text>
      <Text>branch: <Text color="cyan">{draft.request.branch}</Text></Text>
      <Text>{fieldMarker(draft.field, "prompt")} initial prompt:</Text>
      <Text color={draft.field === "prompt" ? "green" : "gray"}>  {draft.request.prompt}{draft.field === "prompt" ? <Text color="gray">_</Text> : null}</Text>
      <Box>
        <Text>{fieldMarker(draft.field, "deploy")} </Text>
        <Text color={draft.field === "deploy" ? "green" : "gray"}>[ Deploy ]</Text>
        <Text>  </Text>
        <Text>{fieldMarker(draft.field, "cancel")} </Text>
        <Text color={draft.field === "cancel" ? "red" : "gray"}>[ Cancel ]</Text>
      </Box>
      <Text color="gray">↑↓/Tab select · Enter activate · s deploy · Backspace edit prompt · c/Esc cancel</Text>
    </Box>
  )
}

function TaskTreeView({
  items,
  itemIndex,
  selected,
  maxRows,
}: {
  items: FlattenedWorkItem[]
  itemIndex: number
  selected: FlattenedWorkItem | undefined
  maxRows: number
}): React.ReactElement {
  const viewport = getViewportWindow(itemIndex, items.length, maxRows)
  const visibleItems = items.slice(viewport.start, viewport.end)

  return (
    <Box marginTop={1}>
      <Box flexDirection="column" width="58%" marginRight={2}>
        <ViewportHeader title="Work Items" viewport={viewport} />
        {visibleItems.map((item, visibleIndex) => {
          const index = viewport.start + visibleIndex
          return (
            <Text key={item.id} color={index === itemIndex ? "cyan" : undefined} wrap="truncate-end">
              {index === itemIndex ? ">" : " "} {item.depth > 0 ? "  ".repeat(item.depth) : ""}{formatTaskAgentMarker(item.agents)}{item.type} {item.id} {item.title} [{item.status}]
            </Text>
          )
        })}
      </Box>
      <Box flexDirection="column" width="42%">
        <Text bold>Selected</Text>
        {selected ? <SelectedItem item={selected} /> : <Text color="gray">No work item.</Text>}
      </Box>
    </Box>
  )
}

function ProjectionView({ lines, itemIndex, maxRows }: { lines: string[]; itemIndex: number; maxRows: number }): React.ReactElement {
  const viewport = getViewportWindow(itemIndex, lines.length, maxRows)
  const visibleLines = lines.slice(viewport.start, viewport.end)

  return (
    <Box flexDirection="column" marginTop={1}>
      <ViewportHeader title="Projection" viewport={viewport} />
      {visibleLines.map((line, index) => (
        <Text key={`${viewport.start + index}:${line}`} wrap="truncate-end">{line || " "}</Text>
      ))}
    </Box>
  )
}

function AgentsProjectionView({
  project,
  itemIndex,
  maxRows,
  copyEffect,
}: {
  project: WorkflowProjectView
  itemIndex: number
  maxRows: number
  copyEffect: CopyEffect | null
}): React.ReactElement {
  const visibleCardCount = Math.max(1, Math.floor(maxRows / 8))
  const viewport = getViewportWindow(itemIndex, project.agents.length, visibleCardCount)
  const visibleAgents = project.agents.slice(viewport.start, viewport.end)
  const selectedAgent = project.agents[Math.min(itemIndex, Math.max(0, project.agents.length - 1))]

  return (
    <Box flexDirection="column" marginTop={1}>
      <ViewportHeader title="Agents View" viewport={viewport} />
      {project.agents.length === 0
        ? <Text color="gray">No agents.</Text>
        : visibleAgents.map((agent, visibleIndex) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            project={project}
            copyEffect={copyEffect}
            selected={viewport.start + visibleIndex === itemIndex}
          />
        ))}
    </Box>
  )
}

function AgentCard({
  agent,
  project,
  copyEffect,
  selected,
}: {
  agent: WorkflowAgentConfig
  project: WorkflowProjectView
  copyEffect: CopyEffect | null
  selected: boolean
}): React.ReactElement {
  const worktree = project.worktrees.find((candidate) => candidate.id === agent.worktree)
  const item = agent.work_item ? project.workItems.find((candidate) => candidate.id === agent.work_item) : undefined
  const statusColor = agent.status === "running" ? "green" : "gray"
  const modeColor = agent.mode === "write" ? "yellow" : "blue"
  const providerColor = getProviderColor(agent.provider)
  const deps = item?.dependencies.length
    ? item.dependencies.map((dependency) => `${formatTaskAgentMarker(dependency.agents)}${dependency.id}(${dependency.status})`).join(", ")
    : "none"
  const command = getAgentHandoffCommand(project, agent)
  const copied = Boolean(command && copyEffect?.command === command)

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={selected ? "cyan" : statusColor} paddingX={1} paddingY={1} marginTop={1}>
      <Box>
        <Text color={selected ? "cyan" : "gray"}>{selected ? "> " : "  "}</Text>
        <Text color={statusColor}>{agent.status === "running" ? "[*]" : "[.]"} </Text>
        <Text color={providerColor}>{formatAgentProviderBadge(agent.provider)} </Text>
        <Text bold>{agent.id}</Text>
        <Text color="gray">  provider: </Text><Text color={providerColor}>{formatAgentProviderLabel(agent.provider)}</Text>
        <Text color="gray">  mode: </Text><Text color={modeColor}>{agent.mode}</Text>
        <Text color="gray">  status: </Text><Text color={statusColor}>{agent.status}</Text>
      </Box>
      <Text>branch: <Text color="cyan">{worktree?.branch ?? "unknown"}</Text></Text>
      <Text>worktree: <Text color="cyan">{worktree?.path ?? agent.worktree}</Text></Text>
      <Text>task: {item ? <Text color="yellow">{item.id} {item.title} [{item.status}]</Text> : <Text color="gray">none</Text>}</Text>
      <Text>deps: <Text color={deps === "none" ? "gray" : "red"}>{deps}</Text></Text>
      {selected
        ? <>
          <Text color="gray">open: <Text color={copied ? "green" : command ? "cyan" : "gray"} inverse={copied}>{command ?? "no managed session id"}</Text></Text>
          <Text color={copied ? "green" : "gray"}>{copied ? "copied" : "press y or click this card to copy open command"}</Text>
        </>
        : null}
    </Box>
  )
}

function getProviderColor(provider: WorkflowAgentConfig["provider"]): "blue" | "cyan" | "green" | "magenta" {
  switch (provider) {
    case "claude":
      return "magenta"
    case "codex":
      return "cyan"
    case "gemini":
      return "blue"
    case "openai":
      return "green"
  }
}

function formatTaskAgentMarker(agents: WorkflowAgentConfig[]): string {
  if (agents.length === 0) return ""
  const icons = [...new Set(agents.map((agent) => formatAgentProviderIcon(agent.provider)))]
  return `${icons.join("")} `
}

function ProjectHeader({ project }: { project: WorkflowProjectView }): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} paddingY={1}>
      <Text bold>{project.name}</Text>
      <Text color="gray">
        {project.summary.epics} epics · {project.summary.issues} issues · {project.summary.worktrees} worktrees · {project.summary.agents} agents · {project.summary.pullRequests} PRs
      </Text>
    </Box>
  )
}

function ViewportHeader({ title, viewport }: { title: string; viewport: ViewportWindow }): React.ReactElement {
  return (
    <Box justifyContent="space-between">
      <Text bold>{title}</Text>
      <Text color="gray">{formatViewport(viewport)}</Text>
    </Box>
  )
}

function SelectedItem({ item }: { item: FlattenedWorkItem }): React.ReactElement {
  const agents = item.agents.length === 0
    ? "none"
    : item.agents.map((agent) => `${agent.provider} ${agent.mode} ${agent.status}`).join(", ")
  const worktree = item.worktree ? `${item.worktree.path} (${item.worktree.branch})` : "none"
  const pullRequest = item.pullRequest ? `${item.pullRequest.id} ${item.pullRequest.status}${item.pullRequest.checks ? ` checks:${item.pullRequest.checks}` : ""}` : "none"
  const dependencies = item.dependencies.length === 0
    ? "none"
    : item.dependencies.map((dependency) => `${formatTaskAgentMarker(dependency.agents)}${dependency.id} ${dependency.status}`).join(", ")
  const dependents = item.dependents.length === 0
    ? "none"
    : item.dependents.map((dependent) => `${formatTaskAgentMarker(dependent.agents)}${dependent.id} ${dependent.status}`).join(", ")

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} paddingY={1}>
      <Text bold>{item.title}</Text>
      <Text>status: {item.status}</Text>
      <Text>worktree: {worktree}</Text>
      <Text>agents: {agents}</Text>
      <Text>pr: {pullRequest}</Text>
      <Text>deps: {dependencies}</Text>
      <Text>unblocks: {dependents}</Text>
    </Box>
  )
}

interface FlattenedWorkItem extends WorkflowWorkItemView {
  depth: number
}

function flattenItems(items: WorkflowWorkItemView[], depth = 0): FlattenedWorkItem[] {
  return items.flatMap((item) => [
    { ...item, depth },
    ...flattenItems(item.children, depth + 1),
  ])
}

export function getViewportWindow(focusIndex: number, total: number, maxRows: number): ViewportWindow {
  const safeTotal = Math.max(0, total)
  const safeMaxRows = Math.max(1, maxRows)
  if (safeTotal === 0) return { start: 0, end: 0, total: 0 }

  const clampedFocus = Math.min(Math.max(0, focusIndex), safeTotal - 1)
  const half = Math.floor(safeMaxRows / 2)
  const maxStart = Math.max(0, safeTotal - safeMaxRows)
  const start = Math.min(Math.max(0, clampedFocus - half), maxStart)
  const end = Math.min(safeTotal, start + safeMaxRows)
  return { start, end, total: safeTotal }
}

function formatViewport(viewport: ViewportWindow): string {
  if (viewport.total === 0) return "0/0"
  return `${viewport.start + 1}-${viewport.end}/${viewport.total}`
}

function getViewSize(view: WorkflowCliViewType, taskCount: number, agentCount: number, projectionLineCount: number): number {
  if (view === WorkflowCliView.TaskTree) return taskCount
  if (view === WorkflowCliView.Agents) return agentCount
  return projectionLineCount
}

function switchView(
  next: WorkflowCliViewType,
  setView: (view: WorkflowCliViewType) => void,
  setItemIndex: (value: number) => void,
): void {
  setView(next)
  setItemIndex(0)
}

function fieldMarker(current: DeployFormField, field: DeployFormField): string {
  return current === field ? ">" : " "
}

function isSessionOpenProvider(provider: WorkflowAgentConfig["provider"]): provider is ProviderKind {
  return provider === "codex" || provider === "gemini"
}

function getSelectedAgentHandoffCommand(project: WorkflowProjectView, itemIndex: number): string | null {
  const agent = project.agents[Math.min(itemIndex, Math.max(0, project.agents.length - 1))]
  if (!agent) return null
  return getAgentHandoffCommand(project, agent)
}

function getAgentHandoffCommand(project: WorkflowProjectView, agent: WorkflowAgentConfig): string | null {
  const worktree = project.worktrees.find((candidate) => candidate.id === agent.worktree)
  if (!agent.session_id || !worktree || !isSessionOpenProvider(agent.provider)) return null
  return buildSessionOpenCommand({
    sessionId: agent.session_id,
    provider: agent.provider,
    cwd: worktree.path,
  })
}

function isMousePress(input: string): boolean {
  return /\u001b\[<\d+;\d+;\d+M/.test(input) || /\u001b\[M[\s\S]{3}/.test(input)
}

async function copyAgentCommand(
  command: string,
  copyToClipboard: ClipboardCopy,
  setNotice: (value: string | null) => void,
  setCopyEffect: (value: CopyEffect | null) => void,
): Promise<void> {
  const result = await copyToClipboard(command)
  if (result.ok) {
    setCopyEffect({ command, copiedAt: Date.now() })
    setNotice("agent open command copied to clipboard")
    return
  }
  setNotice(result.message)
}

function nextDeployField(field: DeployFormField): DeployFormField {
  const index = DEPLOY_FORM_FIELDS.indexOf(field)
  return DEPLOY_FORM_FIELDS[(index + 1) % DEPLOY_FORM_FIELDS.length]!
}

function previousDeployField(field: DeployFormField): DeployFormField {
  const index = DEPLOY_FORM_FIELDS.indexOf(field)
  return DEPLOY_FORM_FIELDS[(index + DEPLOY_FORM_FIELDS.length - 1) % DEPLOY_FORM_FIELDS.length]!
}

function submitDeployDraft(
  request: WorkflowTuiDeployRequest,
  deployAgent: WorkflowTuiDeployHandler | undefined,
  setDeployDraft: (value: DeployDraft | null) => void,
  setNotice: (value: string | null) => void,
  setHandoff: (value: WorkflowTuiDeployResult | null) => void,
): void {
  if (!deployAgent) {
    setNotice("deploy is unavailable in this TUI mode")
    setDeployDraft(null)
    return
  }

  setDeployDraft(null)
  setNotice(`deploying codex on ${request.worktreeId}...`)
  void deployAgent(request)
    .then((result) => {
      setHandoff(result)
      setNotice(`deployed ${result.provider} ${result.mode} session ${result.sessionId}`)
    })
    .catch((error: unknown) => {
      setNotice(error instanceof Error ? error.message : "agent deploy failed")
    })
}

function withNextPermissionProfile(request: WorkflowTuiDeployRequest): WorkflowTuiDeployRequest {
  const currentIndex = DEPLOY_PROFILES.indexOf(request.profile)
  const profile = DEPLOY_PROFILES[(currentIndex + 1) % DEPLOY_PROFILES.length]!
  return {
    ...request,
    profile,
    mode: profile === "workspace-read" ? "read" : "write",
  }
}

function buildDeployRequest(project: WorkflowProjectView, selected: FlattenedWorkItem | undefined): WorkflowTuiDeployRequest | null {
  const worktree = selected?.worktree ?? project.worktrees[0]
  if (!worktree) return null
  return buildDeployRequestForWorktree(project, worktree, selected)
}

export function buildDeployRequestForWorktree(
  project: WorkflowProjectView,
  worktree: WorkflowWorktreeConfig,
  selected?: Pick<WorkflowWorkItemView, "id" | "title">,
): WorkflowTuiDeployRequest {
  const taskLabel = selected ? `${selected.id} ${selected.title}` : worktree.branch
  return {
    projectId: project.id,
    worktreeId: worktree.id,
    worktreePath: worktree.path,
    branch: worktree.branch,
    provider: "codex",
    mode: "write",
    profile: "workspace-write",
    prompt: `Work on ${taskLabel}`,
  }
}
