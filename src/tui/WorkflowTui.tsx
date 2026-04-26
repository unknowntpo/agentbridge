import React, { useState } from "react"
import { Box, render, Text, useInput } from "ink"

import type { WorkflowAgentConfig, WorkflowProjectView, WorkflowViewModel, WorkflowWorkItemView } from "../agenthub/workflowConfig.js"
import { renderWorkflowView, WorkflowCliView, type WorkflowCliView as WorkflowCliViewType } from "./workflowTree.js"

export const WORKFLOW_TUI_CONTROLS = [
  "tab  next view",
  "1    task-tree",
  "2    dependency",
  "3    ready",
  "4    agents",
  "q    quit",
] as const

interface WorkflowTuiProps {
  model: WorkflowViewModel
  initialView?: WorkflowCliViewType
  onExit?: () => void
}

const VIEW_ORDER: WorkflowCliViewType[] = [
  WorkflowCliView.TaskTree,
  WorkflowCliView.Dependency,
  WorkflowCliView.Ready,
  WorkflowCliView.Agents,
]

export function WorkflowTui({ model, initialView = WorkflowCliView.TaskTree, onExit }: WorkflowTuiProps): React.ReactElement {
  const [projectIndex, setProjectIndex] = useState(0)
  const [itemIndex, setItemIndex] = useState(0)
  const [view, setView] = useState<WorkflowCliViewType>(initialView)
  const project = model.projects[projectIndex]!
  const items = flattenItems(project.rootItems)
  const selected = items[Math.min(itemIndex, items.length - 1)]

  useInput((input, key) => {
    if (input === "q") {
      onExit?.()
      return
    }
    if (input === "1") setView(WorkflowCliView.TaskTree)
    if (input === "2") setView(WorkflowCliView.Dependency)
    if (input === "3") setView(WorkflowCliView.Ready)
    if (input === "4") setView(WorkflowCliView.Agents)
    if (key.tab) {
      setView((current) => VIEW_ORDER[(VIEW_ORDER.indexOf(current) + 1) % VIEW_ORDER.length]!)
    }
    if (key.upArrow) setItemIndex((current) => Math.max(0, current - 1))
    if (key.downArrow) setItemIndex((current) => Math.min(items.length - 1, current + 1))
    if (key.leftArrow) {
      setProjectIndex((current) => Math.max(0, current - 1))
      setItemIndex(0)
    }
    if (key.rightArrow) {
      setProjectIndex((current) => Math.min(model.projects.length - 1, current + 1))
      setItemIndex(0)
    }
  })

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">AgentHub Workflow Prototype</Text>
      </Box>
      <ControlsHelp />
      <ProjectHeader project={project} />
      <Text color="gray">view: {view}</Text>
      {view === WorkflowCliView.TaskTree
        ? <TaskTreeView items={items} itemIndex={itemIndex} selected={selected} />
        : view === WorkflowCliView.Agents
          ? <AgentsProjectionView project={project} />
        : <ProjectionView model={model} view={view} />}
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
      <Text color="gray">↑↓   focus task in task-tree</Text>
    </Box>
  )
}

export async function runWorkflowTui(model: WorkflowViewModel, initialView: WorkflowCliViewType = WorkflowCliView.TaskTree): Promise<void> {
  let instance: ReturnType<typeof render> | undefined
  instance = render(<WorkflowTui model={model} initialView={initialView} onExit={() => instance?.unmount()} />)
  await instance.waitUntilExit()
}

function TaskTreeView({ items, itemIndex, selected }: { items: FlattenedWorkItem[]; itemIndex: number; selected: FlattenedWorkItem | undefined }): React.ReactElement {
  return (
    <Box marginTop={1}>
      <Box flexDirection="column" width="58%" marginRight={2}>
        <Text bold>Work Items</Text>
        {items.map((item, index) => (
          <Text key={item.id} color={index === itemIndex ? "cyan" : undefined}>
            {index === itemIndex ? ">" : " "} {item.depth > 0 ? "  ".repeat(item.depth) : ""}{item.type} {item.id} {item.title} [{item.status}]
          </Text>
        ))}
      </Box>
      <Box flexDirection="column" width="42%">
        <Text bold>Selected</Text>
        {selected ? <SelectedItem item={selected} /> : <Text color="gray">No work item.</Text>}
      </Box>
    </Box>
  )
}

function ProjectionView({ model, view }: { model: WorkflowViewModel; view: WorkflowCliViewType }): React.ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>{renderWorkflowView(model, view)}</Text>
    </Box>
  )
}

function AgentsProjectionView({ project }: { project: WorkflowProjectView }): React.ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Agents View</Text>
      {project.agents.length === 0
        ? <Text color="gray">No agents.</Text>
        : project.agents.map((agent) => <AgentCard key={agent.id} agent={agent} project={project} />)}
    </Box>
  )
}

function AgentCard({ agent, project }: { agent: WorkflowAgentConfig; project: WorkflowProjectView }): React.ReactElement {
  const worktree = project.worktrees.find((candidate) => candidate.id === agent.worktree)
  const item = agent.work_item ? project.workItems.find((candidate) => candidate.id === agent.work_item) : undefined
  const statusColor = agent.status === "running" ? "green" : "gray"
  const modeColor = agent.mode === "write" ? "yellow" : "blue"
  const deps = item?.dependencies.length
    ? item.dependencies.map((dependency) => `${dependency.id}(${dependency.status})`).join(", ")
    : "none"

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={statusColor} paddingX={1} paddingY={1} marginTop={1}>
      <Box>
        <Text color={statusColor}>{agent.status === "running" ? "[*]" : "[.]"} </Text>
        <Text bold>{agent.id}</Text>
        <Text color="gray">  provider: </Text><Text color="cyan">{agent.provider}</Text>
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
