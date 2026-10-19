<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'

const session = useAuthStore()
</script>

<template>
  <div class="page dashboard-page">
      <header class="page-header admin-page-header">
        <div class="admin-page-heading">
          <h1>Hola, {{ session.profile?.nombreCompleto.split(' ')[0] }}</h1>
          <p>— Tu operación MIP</p>
        </div>
        <span class="badge">{{ session.profile?.rolActivo }}</span>
      </header>

      <section class="quick-grid">
        <RouterLink to="/servicios" class="card quick-card">
          <span>01</span>
          <h2>Servicios</h2>
          <p>Programa y consulta la agenda operativa.</p>
        </RouterLink>
        <RouterLink v-if="session.isAdmin" to="/usuarios" class="card quick-card">
          <span>02</span>
          <h2>Usuarios</h2>
          <p>Administra accesos y roles internos.</p>
        </RouterLink>
        <RouterLink v-if="session.isAdmin" to="/integraciones" class="card quick-card">
          <span>03</span>
          <h2>Integraciones</h2>
          <p>Verifica Gmail y Calendar de la cuenta empresarial.</p>
        </RouterLink>
      </section>
  </div>
</template>

<style scoped>
.dashboard-page { gap: 0.75rem; }
.quick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 0.75rem;
}

.quick-card {
  display: grid;
  min-height: 8.25rem;
  align-content: end;
  gap: 0.35rem;
  padding: 0.875rem;
  color: var(--text);
  text-decoration: none;
  transition: 150ms ease;
}

.quick-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
}

.quick-card span {
  margin-bottom: auto;
  color: var(--accent);
  font-weight: 850;
}

.quick-card p {
  margin: 0;
  color: var(--text-secondary);
}
</style>
