<script setup lang="ts">
import { Boxes, FileCheck2, Plug } from 'lucide-vue-next'
import SettingsEntry from '@/components/layout/SettingsEntry.vue'
</script>
<template>
  <section class="settings-page">
    <h1>Configuración</h1>
    <div class="settings-groups">
      <section aria-labelledby="settings-operation"><h2 id="settings-operation">Operación</h2><div class="settings-list"><SettingsEntry to="/configuracion/catalogos" title="Catálogos MIP" description="Productos, trampas y plagas"><template #icon><Boxes :size="22" /></template></SettingsEntry></div></section>
      <section aria-labelledby="settings-documents"><h2 id="settings-documents">Documentos</h2><div class="settings-list"><SettingsEntry to="/configuracion/certificados" title="Certificados" description="Plantillas, generación y envío"><template #icon><FileCheck2 :size="22" /></template></SettingsEntry></div></section>
      <section aria-labelledby="settings-integrations"><h2 id="settings-integrations">Integraciones</h2><div class="settings-list"><SettingsEntry to="/integraciones" title="Integraciones" description="Google, Calendar y conexiones"><template #icon><Plug :size="22" /></template></SettingsEntry></div></section>
    </div>
  </section>
</template>
<style scoped>
.settings-page { display: grid; gap: var(--space-12); min-width: 0; }
.settings-page h1 { margin: 0; font-size: 1.5rem; line-height: 2rem; font-weight: 500; }
.settings-groups { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-16); align-items: start; }
.settings-groups section { display: grid; gap: var(--space-8); min-width: 0; }
.settings-groups h2 { margin: 0; font-size: .75rem; font-weight: 500; text-transform: uppercase; color: var(--text-secondary); }
.settings-list { overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-panel); }
@media (max-width: 1180px) { .settings-groups { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 760px) { .settings-groups { grid-template-columns: 1fr; } }
</style>
