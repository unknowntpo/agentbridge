<script setup lang="ts">
import type { Provider } from "../store"

defineProps<{
  provider: Provider
}>()

function providerIcon(provider: Provider): string {
  if (provider === "Claude") return "/desktop/assets/provider-icons/anthropic.svg"
  if (provider === "Gemini") return "/desktop/assets/provider-icons/googlegemini.svg"
  return "/desktop/assets/provider-icons/openai.svg"
}
</script>

<template>
  <span class="provider-mark">
    <img :src="providerIcon(provider)" :alt="provider" />
  </span>
</template>

