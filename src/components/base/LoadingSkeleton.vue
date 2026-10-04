<script setup lang="ts">
withDefaults(defineProps<{ label?: string; lines?: number }>(), {
  label: 'Cargando contenido',
  lines: 4,
})
</script>

<template>
  <section class="skeleton card" aria-busy="true" role="status">
    <span class="skeleton__label">{{ label }}</span>
    <span v-for="line in lines" :key="line" class="skeleton__line" :class="`skeleton__line--${line}`"></span>
  </section>
</template>

<style scoped>
.skeleton {
  display: grid;
  gap: 0.75rem;
  overflow: hidden;
}

.skeleton__label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.skeleton__line {
  display: block;
  width: 100%;
  height: 1rem;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--surface-hover), var(--border), var(--surface-hover));
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}

.skeleton__line--1 {
  width: 38%;
  height: 1.5rem;
}

.skeleton__line--3 {
  width: 82%;
}

.skeleton__line--4 {
  width: 64%;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton__line {
    animation: none;
  }
}
</style>
