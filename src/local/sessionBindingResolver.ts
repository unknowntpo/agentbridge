import type { ThreadBinding } from "../types.js"

interface ManagedBindingSelector {
  latest?: boolean
  sessionId?: string
  discordThreadId?: string
  provider?: ThreadBinding["provider"]
}

export function resolveManagedBinding(bindings: ThreadBinding[], options: ManagedBindingSelector): ThreadBinding {
  const managedBindings = bindings.filter((binding) => {
    if (!options.provider) {
      return true
    }
    return binding.provider === options.provider
  })

  if (options.discordThreadId) {
    const binding = managedBindings.find((candidate) => candidate.threadId === options.discordThreadId)
    if (!binding) {
      throw new Error(`No managed binding found for Discord thread ${options.discordThreadId}`)
    }
    return binding
  }

  if (options.sessionId) {
    const binding = managedBindings.find((candidate) => candidate.sessionId === options.sessionId)
    if (!binding) {
      throw new Error(`No managed binding found for managed session ${options.sessionId}`)
    }
    return binding
  }

  if (options.latest) {
    const binding = [...managedBindings]
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .at(0)
    if (!binding) {
      throw new Error("No managed bindings found. Start one with `agentbridge session new --prompt \"<text>\"` first.")
    }
    return binding
  }

  throw new Error("`agentbridge session open` requires one of `--latest`, `--session-id <id>`, or `--discord-thread-id <id>`.")
}
