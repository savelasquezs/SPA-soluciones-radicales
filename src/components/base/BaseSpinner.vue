<script setup lang="ts">
withDefaults(defineProps<{ label?: string; size?: 'small' | 'medium' }>(), { label: 'Cargando', size: 'medium' })
</script>

<template>
  <span class="spinner" :class="`spinner--${size}`" role="status">
    <span aria-hidden="true"></span>
    <span class="sr-only">{{ label }}</span>
  </span>
</template>

<style scoped>
.spinner,
.spinner > span:first-child {
  display: inline-block;
}

.spinner > span:first-child {
  width: 1.25rem;
  height: 1.25rem;
  border: 2px solid currentcolor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 700ms linear infinite;
}

.spinner--small > span:first-child {
  width: 1rem;
  height: 1rem;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
