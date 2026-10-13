<script setup lang="ts">
import './services.css'
defineProps<{ title: string; caption?: string }>()
</script>
<template>
  <div class="page svc-page">
    <header class="svc-page-header">
      <div><h1>{{ title }}</h1><p v-if="caption" class="svc-muted">{{ caption }}</p></div>
      <div class="svc-actions"><slot name="actions" /></div>
    </header>
    <slot />
  </div>
</template>
