<script setup lang="ts">
defineProps<{
  value: string
}>()

function badgeClass(value: string): string {
  if (value === "clean" || value === "completed" || value === "approved" || value === "ok") return "badge-clean"
  if (value === "dirty" || value === "pending" || value === "running") return "badge-dirty"
  if (value === "blocked" || value === "rejected" || value === "unavailable") return "badge-danger"
  return "badge-muted"
}
</script>

<template>
  <span class="badge" :class="badgeClass(value)">{{ value }}</span>
</template>

