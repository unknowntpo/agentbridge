<script setup lang="ts">
import type { CommitRefBadge } from "../commit-log"

defineProps<{
  refBadge: CommitRefBadge
}>()
</script>

<template>
  <span class="commit-ref-badge" :class="refBadge.tone">
    {{ refBadge.label }}
  </span>
</template>

