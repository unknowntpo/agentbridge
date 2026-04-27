import React, { useEffect, useState } from "react"
import { Box, render, Text, useInput, useWindowSize } from "ink"

import type { WorkflowAgentConfig, WorkflowProjectView, WorkflowViewModel, WorkflowWorkItemView } from "../agenthub/workflowConfig.js"
import {
  formatAgentProviderBadge,
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
  "6    lifecycle",
  "r    refresh project",
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
  reloadModel?: () => Promise<WorkflowViewModel>
  subscribeModelUpdates?: (onUpdate: (model: WorkflowViewModel) => void, onError: (error: unknown) => void) => () => void
  onExit?: () => void
}

const VIEW_ORDER: WorkflowCliViewType[] = [
  WorkflowCliView.TaskTree,
  WorkflowCliView.Dependency,
  WorkflowCliView.Ready,
  WorkflowCliView.Agents,
  WorkflowCliView.Commits,
  WorkflowCliView.Lifecycle,
]

export function WorkflowTui({
  model,
  initialView = WorkflowCliView.TaskTree,
  reloadModel,
  subscribeModelUpdates,
  onExit,
}: WorkflowTuiProps): React.ReactElement {
  const { rows } = useWindowSize()
  const [currentModel, setCurrentModel] = useState(model)
  const [notice, setNotice] = useState<string | null>(null)
  const [projectIndex, setProjectIndex] = useState(0)
  const [itemIndex, setItemIndex] = useState(0)
  const [view, setView] = useState<WorkflowCliViewType>(initialView)
  const project = currentModel.projects[projectIndex]!
  const items = flattenItems(project.rootItems)
  const selected = items[Math.min(itemIndex, items.length - 1)]
  const bodyRows = Math.max(6, rows - 14)
  const projectionLines = view === WorkflowCliView.TaskTree || view === WorkflowCliView.Agents
    ? []
    : renderWorkflowView(currentModel, view).split(/\r?\n/)
  const currentViewSize = getViewSize(view, items.length, project.agents.length, projectionLines.length)

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

  useInput((input, key) => {
    if (input === "q") {
      onExit?.()
      return
    }
    if (input === "1") switchView(WorkflowCliView.TaskTree, setView, setItemIndex)
    if (input === "2") switchView(WorkflowCliView.Dependency, setView, setItemIndex)
    if (input === "3") switchView(WorkflowCliView.Ready, setView, setItemIndex)
    if (input === "4") switchView(WorkflowCliView.Agents, setView, setItemIndex)
    if (input === "5") switchView(WorkflowCliView.Commits, setView, setItemIndex)
    if (input === "6") switchView(WorkflowCliView.Lifecycle, setView, setItemIndex)
    if (input === "r" && reloadModel) {
      setNotice("refreshing project...")
      void reloadModel()
        .then((nextModel) => {
          setCurrentModel(nextModel)
          setProjectIndex(0)
          setItemIndex(0)
          setNotice("project refreshed")
        })
        .catch((error: unknown) => {
          setNotice(error instanceof Error ? error.message : "project refresh failed")
        })
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
      <Text color="gray">view: {view}</Text>
      {view === WorkflowCliView.TaskTree
        ? <TaskTreeView items={items} itemIndex={itemIndex} selected={selected} maxRows={bodyRows} />
        : view === WorkflowCliView.Agents
          ? <AgentsProjectionView project={project} itemIndex={itemIndex} maxRows={bodyRows} />
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
      <Text color="gray">↑↓   scroll/focus current view</Text>
    </Box>
  )
}

export async function runWorkflowTui(
  model: WorkflowViewModel,
  initialView: WorkflowCliViewType = WorkflowCliView.TaskTree,
  reloadModel?: () => Promise<WorkflowViewModel>,
  subscribeModelUpdates?: (onUpdate: (model: WorkflowViewModel) => void, onError: (error: unknown) => void) => () => void,
): Promise<void> {
  let instance: ReturnType<typeof render> | undefined
  instance = render(
    <WorkflowTui
      model={model}
      initialView={initialView}
      reloadModel={reloadModel}
      subscribeModelUpdates={subscribeModelUpdates}
      onExit={() => instance?.unmount()}
    />,
  )
  await instance.waitUntilExit()
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
              {index === itemIndex ? ">" : " "} {item.depth > 0 ? "  ".repeat(item.depth) : ""}{item.type} {item.id} {item.title} [{item.status}]
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

function AgentsProjectionView({ project, itemIndex, maxRows }: { project: WorkflowProjectView; itemIndex: number; maxRows: number }): React.ReactElement {
  const visibleCardCount = Math.max(1, Math.floor(maxRows / 7))
  const viewport = getViewportWindow(itemIndex, project.agents.length, visibleCardCount)
  const visibleAgents = project.agents.slice(viewport.start, viewport.end)

  return (
    <Box flexDirection="column" marginTop={1}>
      <ViewportHeader title="Agents View" viewport={viewport} />
      {project.agents.length === 0
        ? <Text color="gray">No agents.</Text>
        : visibleAgents.map((agent) => <AgentCard key={agent.id} agent={agent} project={project} />)}
    </Box>
  )
}

function AgentCard({ agent, project }: { agent: WorkflowAgentConfig; project: WorkflowProjectView }): React.ReactElement {
  const worktree = project.worktrees.find((candidate) => candidate.id === agent.worktree)
  const item = agent.work_item ? project.workItems.find((candidate) => candidate.id === agent.work_item) : undefined
  const statusColor = agent.status === "running" ? "green" : "gray"
  const modeColor = agent.mode === "write" ? "yellow" : "blue"
  const providerColor = getProviderColor(agent.provider)
  const deps = item?.dependencies.length
    ? item.dependencies.map((dependency) => `${dependency.id}(${dependency.status})`).join(", ")
    : "none"

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={statusColor} paddingX={1} paddingY={1} marginTop={1}>
      <Box>
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
    : item.dependencies.map((dependency) => `${dependency.id} ${dependency.status}`).join(", ")
  const dependents = item.dependents.length === 0
    ? "none"
    : item.dependents.map((dependent) => `${dependent.id} ${dependent.status}`).join(", ")

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
