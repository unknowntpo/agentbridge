<script setup lang="ts">
import AgentChip from "./AgentChip.vue"
import Badge from "./Badge.vue"
import RefBadge from "./RefBadge.vue"
import type { commitGraphSvgPath, CommitLogRow } from "../commit-log"

defineProps<{
  rows: CommitLogRow[]
  graph: ReturnType<typeof commitGraphSvgPath>
  selectedWorktreeId: string | null
  selectedRowId?: string | null
}>()

const emit = defineEmits<{
  "select-worktree": [id: string]
  "select-agent": [id: string]
  "select-row": [row: CommitLogRow]
}>()

function selectRow(row: CommitLogRow): void {
  emit("select-row", row)
  if (row.worktreeId) emit("select-worktree", row.worktreeId)
}
</script>

<template>
  <section class="commit-log-panel" data-testid="commit-log-panel">
    <header class="commit-log-titlebar">
      <div>
        <span class="eyebrow">Git graph</span>
        <h2>Commit log</h2>
      </div>
      <div class="commit-log-legend" aria-label="Graph lanes">
        <span class="main">main</span>
        <span class="feature">feat</span>
        <span class="docs">docs</span>
        <span class="experiment">exp</span>
      </div>
    </header>

    <div class="commit-log-table">
      <div class="commit-log-header-row">
        <span>Graph</span>
        <span>Commit</span>
        <span>Worktree</span>
        <span>Agent</span>
        <span>Status</span>
      </div>
      <div class="commit-log-rows">
        <svg
          class="commit-log-svg"
          :viewBox="graph.viewBox"
          preserveAspectRatio="xMinYMin meet"
          aria-hidden="true"
        >
          <path class="line main" :d="graph.main" />
          <path class="line feature" :d="graph.feature" />
          <path class="line docs" :d="graph.docs" />
          <path class="line experiment" :d="graph.experiment" />
          <g v-for="point in graph.points" :key="point.id" :class="['node', point.lane, point.kind]">
            <circle v-if="point.kind === 'merge'" class="halo" :cx="point.x" :cy="point.y" r="9" />
            <circle v-if="point.kind === 'head'" class="halo" :cx="point.x" :cy="point.y" r="13" />
            <circle class="core" :cx="point.x" :cy="point.y" :r="point.kind === 'merge' ? 3.5 : point.kind === 'head' ? 6.5 : 4.5" />
          </g>
        </svg>

        <button
          v-for="row in rows"
          :key="row.id"
          type="button"
          class="commit-log-row"
          :class="{ active: selectedRowId ? row.id === selectedRowId : row.worktreeId === selectedWorktreeId, dirty: row.status === 'dirty' }"
          @click="selectRow(row)"
        >
          <span class="graph-spacer" aria-hidden="true"></span>
          <span class="commit-message-cell">
            <span class="commit-title-line">
              <strong>{{ row.message }}</strong>
              <RefBadge
                v-for="ref in row.refs"
                :key="`${row.id}-${ref.label}`"
                :ref-badge="ref"
              />
            </span>
            <code>{{ row.sha }} · {{ row.detail }}</code>
          </span>
          <span class="commit-worktree-cell">{{ row.worktreeName }}</span>
          <span class="commit-agent-cell">
            <template v-if="row.agents.length">
              <button
                v-for="session in row.agents"
                :key="session.id"
                type="button"
                class="agent-chip-button"
                @click.stop="emit('select-agent', session.id)"
              >
                <AgentChip :provider="session.provider" :mode="session.mode" />
              </button>
            </template>
            <span v-else class="muted-dash">—</span>
          </span>
          <Badge :value="row.status" />
        </button>
      </div>
    </div>
  </section>
</template>
