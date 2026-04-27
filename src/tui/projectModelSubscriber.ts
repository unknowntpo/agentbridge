import fs from "node:fs"
import path from "node:path"

import type { WorkflowViewModel } from "../agenthub/workflowConfig.js"

export type ProjectModelLoader = (projectPath: string) => Promise<WorkflowViewModel>

export type ProjectModelSubscriber = (
  onUpdate: (model: WorkflowViewModel) => void,
  onError: (error: unknown) => void,
) => () => void

export interface ProjectModelSubscriberOptions {
  debounceMs?: number
  pollIntervalMs?: number
}

export function createProjectModelSubscriber(
  projectPath: string,
  loadProjectModel: ProjectModelLoader,
  options: ProjectModelSubscriberOptions = {},
): ProjectModelSubscriber {
  return (onUpdate, onError) => {
    const watchRoot = path.resolve(projectPath)
    const debounceMs = options.debounceMs ?? 250
    const pollIntervalMs = options.pollIntervalMs ?? 2_000
    let closed = false
    let debounceTimer: ReturnType<typeof setTimeout> | undefined
    let lastSnapshot = snapshotProjectTree(watchRoot)

    const scheduleReload = () => {
      if (closed) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        void loadProjectModel(watchRoot)
          .then((model) => {
            if (!closed) onUpdate(model)
          })
          .catch((error: unknown) => {
            if (!closed) onError(error)
          })
      }, debounceMs)
    }

    let watcher: fs.FSWatcher | undefined
    try {
      watcher = fs.watch(watchRoot, { recursive: true }, (_event, filename) => {
        if (filename && shouldIgnoreWatchPath(filename.toString())) return
        scheduleReload()
      })
    } catch (error) {
      onError(error)
    }

    const pollTimer = setInterval(() => {
      if (closed) return
      const nextSnapshot = snapshotProjectTree(watchRoot)
      if (nextSnapshot === lastSnapshot) return
      lastSnapshot = nextSnapshot
      scheduleReload()
    }, pollIntervalMs)

    return () => {
      closed = true
      if (debounceTimer) clearTimeout(debounceTimer)
      clearInterval(pollTimer)
      watcher?.close()
    }
  }
}

export function shouldIgnoreWatchPath(filename: string): boolean {
  return (
    filename.includes("node_modules/") ||
    filename.includes("dist/") ||
    filename.includes("test-results/") ||
    filename.endsWith(".tmp")
  )
}

function snapshotProjectTree(root: string): string {
  const entries: string[] = []
  collectSnapshotEntries(root, "", entries)
  return entries.sort().join("\n")
}

function collectSnapshotEntries(root: string, relativeDir: string, entries: string[]): void {
  const dir = path.join(root, relativeDir)
  let dirents: fs.Dirent[]
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const dirent of dirents) {
    const relativePath = path.join(relativeDir, dirent.name)
    if (shouldIgnoreWatchPath(relativePath)) continue
    const absolutePath = path.join(root, relativePath)
    let stat: fs.Stats
    try {
      stat = fs.statSync(absolutePath)
    } catch {
      continue
    }
    entries.push(`${relativePath}:${stat.mtimeMs}:${stat.size}:${dirent.isDirectory() ? "d" : "f"}`)
    if (dirent.isDirectory()) {
      collectSnapshotEntries(root, relativePath, entries)
    }
  }
}
