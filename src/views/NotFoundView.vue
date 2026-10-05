<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
</script>

<template>
  <main class="not-found">
    <section class="card">
      <p class="code">404</p>
      <h1>Esta página no existe</h1>
      <p class="muted">Revisa la dirección o vuelve al inicio.</p>
      <RouterLink to="/" custom v-slot="{ navigate }">
        <BaseButton @click="navigate">Volver al inicio</BaseButton>
      </RouterLink>
    </section>
  </main>
</template>

<style scoped>
.not-found {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 1rem;
  text-align: center;
}

.not-found .card {
  display: grid;
  gap: 1rem;
}

.code {
  margin: 0;
  color: var(--accent);
  font-size: 3rem;
  font-weight: 900;
}

h1,
p {
  margin: 0;
}
</style>
