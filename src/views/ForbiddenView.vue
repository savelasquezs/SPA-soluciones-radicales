<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import AppShell from '@/components/layout/AppShell.vue'
</script>

<template>
  <AppShell>
    <section class="forbidden card">
      <p class="code">403</p>
      <h1>No tienes permiso para esta sección</h1>
      <p class="muted">El rol activo no permite administrar este recurso.</p>
      <RouterLink to="/" custom v-slot="{ navigate }">
        <BaseButton @click="navigate">Volver al inicio</BaseButton>
      </RouterLink>
    </section>
  </AppShell>
</template>

<style scoped>
.forbidden {
  display: grid;
  min-height: 20rem;
  place-items: center;
  align-content: center;
  gap: 1rem;
  text-align: center;
}

.code,
h1,
p {
  margin: 0;
}

.code {
  color: var(--danger);
  font-size: 3rem;
  font-weight: 900;
}
</style>
