<script setup lang="ts">
import ProviderMark from "./ProviderMark.vue"
import type { AgentMode, Provider } from "../store"

defineProps<{
  provider: Provider
  mode: AgentMode
}>()
</script>

<template>
  <span class="agent-chip" :class="mode">
    <ProviderMark :provider="provider" />
    {{ provider }} {{ mode }}
  </span>
</template>

