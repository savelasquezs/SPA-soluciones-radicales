<script setup lang="ts">
import { FileCheck2, ChevronRight } from 'lucide-vue-next'
</script>
<template>
  <section class="settings-page">
    <h1>Configuración</h1>
    <RouterLink to="/configuracion/certificados" class="settings-entry"><FileCheck2 :size="22" aria-hidden="true" /><span><strong>Certificados</strong><small>Plantillas Word, generación manual y envío de PDF.</small></span><ChevronRight :size="18" aria-hidden="true" /></RouterLink>
  </section>
</template>
<style scoped>
h1 { font-size: 1.5rem; margin: 0 0 1.5rem; font-weight: 600; }
.settings-entry { display: flex; align-items: center; gap: 1rem; max-width: 40rem; padding: 1.25rem; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); color: var(--text); text-decoration: none; }
.settings-entry:hover { background: var(--hover); }
.settings-entry span { flex: 1; display: grid; gap: .25rem; }
small { color: var(--text-secondary); }
</style>
