<script setup lang="ts">
import { Map, MonitorCheck } from 'lucide-vue-next'
import StatusBadge from '@/components/base/StatusBadge.vue'
import type { TechnicianArea } from '@/types/technicianServices'

defineProps<{ areas: TechnicianArea[] }>()
</script>

<template>
  <section class="technician-section" aria-labelledby="technician-areas-title">
    <header><div class="technician-section__icon"><Map :size="20" aria-hidden="true" /></div><div><h2 id="technician-areas-title">Recorrido por áreas</h2><p>Vista preparada para este servicio.</p></div></header>
    <p v-if="!areas.length" class="technician-empty">No hay áreas activas para recorrer.</p>
    <ol v-else>
      <li v-for="(area, index) in areas" :key="area.id">
        <span class="technician-area__number">{{ index + 1 }}</span>
        <div><h3>{{ area.nombre }}</h3><p>{{ area.criterios.length }} criterios · {{ area.dispositivos.length }} dispositivos</p></div>
        <StatusBadge v-if="area.sinAcceso" tone="warning" icon="warning">Sin acceso</StatusBadge>
        <StatusBadge v-else-if="area.criterios.every(item => item.evaluacion) && area.criterios.length" tone="success" icon="check">Evaluada</StatusBadge>
        <StatusBadge v-else tone="neutral"><MonitorCheck :size="15" aria-hidden="true" />Pendiente</StatusBadge>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.technician-section { display:grid; gap:1rem; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); padding:1rem; }
.technician-section > header { display:flex; align-items:flex-start; gap:0.75rem; }
.technician-section__icon { display:grid; width:40px; height:40px; flex:0 0 auto; place-items:center; border-radius:var(--radius); background:var(--brand-secondary-subtle); color:var(--brand-secondary); }
h2, h3, p, ol { margin:0; }
h2 { font-size:1rem; }
header p, li p { margin-top:0.2rem; color:var(--text-secondary); font-size:0.8125rem; }
ol { display:grid; gap:0.65rem; padding:0; list-style:none; }
li { display:grid; min-width:0; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:0.75rem; border:1px solid var(--border); border-radius:var(--radius); padding:0.75rem; }
h3 { overflow-wrap:anywhere; font-size:0.9375rem; }
.technician-area__number { display:grid; width:32px; height:32px; place-items:center; border-radius:50%; background:var(--hover); color:var(--text-secondary); font-size:0.8125rem; font-weight:700; }
.technician-empty { color:var(--text-secondary); }
@media (min-width:760px) { .technician-section { padding:1.25rem; } }
</style>
