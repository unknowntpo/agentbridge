<script setup lang="ts">
import { computed, ref } from "vue"

import CommitLogPanel from "../components/CommitLogPanel.vue"
import { buildCommitLogRows, commitGraphSvgPath } from "../commit-log"
import type { AgentSession, GithubState, WorktreeScan } from "../store"

const selectedWorktreeId = ref("agent-drawer")
const selectedSessionId = ref<string | null>(null)

const github: GithubState = {
  provider: "GitHub",
  auth: "ok",
  pr: "#42",
  prUrl: null,
  checks: "ok",
  review: "ok",
  message: null,
  mocked: false,
}

const worktrees: WorktreeScan[] = [
  worktree("main", "main", "7a8b9c0", "clean"),
  worktree("agent-drawer", "feat/agent-drawer", "d4e5f6a", "clean"),
  worktree("docs-permissions", "docs/permissions", "e7fa89b", "clean"),
  worktree("experiment-cache", "exp/cache", "b1c2d3e", "dirty"),
]

const sessions: AgentSession[] = [
  session("agent-drawer", "Codex", "write"),
  session("agent-drawer", "Gemini", "read"),
  session("docs-permissions", "Claude", "read"),
  session("docs-permissions", "Gemini", "read"),
  session("experiment-cache", "Codex", "write"),
]

const rows = computed(() => buildCommitLogRows(worktrees, sessions))
const graph = computed(() => commitGraphSvgPath(rows.value.length))

function worktree(name: string, branch: string, head: string, status: string): WorktreeScan {
  return {
    id: name,
    name,
    path: `/Users/unknowntpo/repo/unknowntpo/agentbridge/${name}`,
    branch,
    upstream: `origin/${branch}`,
    head,
    status,
    ahead: name === "main" ? 0 : 2,
    behind: 0,
    remote: github,
  }
}

function session(worktreeId: string, provider: AgentSession["provider"], mode: AgentSession["mode"]): AgentSession {
  return {
    id: `demo-${worktreeId}-${provider}-${mode}`,
    worktreeId,
    provider,
    mode,
    profile: mode === "read" ? "workspace-read" : "workspace-write",
    state: mode === "write" ? "running" : "idle",
    prompt: `Demo ${provider} ${mode} agent`,
    workingDirectory: `/Users/unknowntpo/repo/unknowntpo/agentbridge/${worktreeId}`,
    mocked: true,
    messages: [],
    runs: [],
    artifacts: [],
    skills: { loaded: [], suggested: [], blocked: [], events: [] },
  }
}
</script>

<template>
  <main class="design-system-route">
    <header class="design-system-hero">
      <a href="/" class="back-link">Back to dashboard</a>
      <span class="eyebrow">AgentHub Design System</span>
      <h1>Vue-backed component preview</h1>
      <p>
        This page renders the same Vue components as the dashboard. Demo data changes here,
        component implementation does not.
      </p>
    </header>

    <section class="design-system-section">
      <div class="section-heading">
        <span class="eyebrow">Organism</span>
        <h2>CommitLogPanel</h2>
        <p>Shared implementation used by dashboard and design system preview.</p>
      </div>
      <CommitLogPanel
        :rows="rows"
        :graph="graph"
        :selected-worktree-id="selectedWorktreeId"
        @select-worktree="selectedWorktreeId = $event"
        @select-agent="selectedSessionId = $event"
      />
      <p class="small-note">Selected session: {{ selectedSessionId ?? "none" }}</p>
    </section>
  </main>
</template>

