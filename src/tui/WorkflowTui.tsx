import React, { useState } from "react"
import { Box, render, Text, useInput } from "ink"

import type { WorkflowProjectView, WorkflowViewModel, WorkflowWorkItemView } from "../agenthub/workflowConfig.js"
import { renderWorkflowView, WorkflowCliView, type WorkflowCliView as WorkflowCliViewType } from "./workflowTree.js"

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
        <Text color="gray">  q quit · tab view · 1 tree · 2 deps · 3 ready · 4 agents · ↑↓ focus</Text>
      </Box>
      <ProjectHeader project={project} />
      <Text color="gray">view: {view}</Text>
      {view === WorkflowCliView.TaskTree
        ? <TaskTreeView items={items} itemIndex={itemIndex} selected={selected} />
        : <ProjectionView model={model} view={view} />}
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
