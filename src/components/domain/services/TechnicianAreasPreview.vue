<script setup lang="ts">
import { ListOrdered, Map, MonitorCheck } from 'lucide-vue-next'
import BaseButton from '@/components/base/BaseButton.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import { technicianAreaResolved } from '@/helpers/technicianServices'
import type { TechnicianArea } from '@/types/technicianServices'

withDefaults(defineProps<{ areas: TechnicianArea[]; canEdit?: boolean; pendingSync?: number }>(), { canEdit: false, pendingSync: 0 })
const emit = defineEmits<{ open: [areaId: string]; order: [] }>()
</script>

<template>
  <section class="technician-section" aria-labelledby="technician-areas-title">
    <header><div class="technician-section__icon"><Map :size="20" aria-hidden="true" /></div><div><h2 id="technician-areas-title">Recorrido por áreas</h2><p>Abre cualquier Área y continúa en el orden aplicado.</p></div></header>
    <div v-if="areas.length" class="technician-section__actions">
      <span v-if="pendingSync" role="status">{{ pendingSync }} cambio{{ pendingSync === 1 ? '' : 's' }} por sincronizar</span>
      <BaseButton v-if="canEdit" variant="secondary" size="compact" @click="emit('order')"><ListOrdered :size="17" aria-hidden="true" />Ordenar recorrido</BaseButton>
    </div>
    <p v-if="!areas.length" class="technician-empty">No hay áreas activas para recorrer.</p>
    <ol v-else>
      <li v-for="(area, index) in areas" :key="area.id">
        <button type="button" :aria-label="`Abrir Área ${area.nombre}`" @click="emit('open', area.id)">
          <span class="technician-area__number">{{ index + 1 }}</span>
          <span class="technician-area__summary"><strong>{{ area.nombre }}</strong><small>{{ area.criterios.length }} criterios · {{ area.dispositivos.length }} puestos</small></span>
          <StatusBadge v-if="area.sinAcceso" tone="warning" icon="warning">{{ technicianAreaResolved(area) ? 'Excepción resuelta' : 'Excepción pendiente' }}</StatusBadge>
          <StatusBadge v-else-if="technicianAreaResolved(area)" tone="success" icon="check">Resuelta</StatusBadge>
          <StatusBadge v-else tone="neutral"><MonitorCheck :size="15" aria-hidden="true" />Pendiente</StatusBadge>
        </button>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.technician-section { display:grid; gap:1rem; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); padding:1rem; }
.technician-section > header { display:flex; align-items:flex-start; gap:0.75rem; }
.technician-section__actions { display:flex; align-items:center; justify-content:space-between; gap:0.75rem; }
.technician-section__actions > span { color:var(--warning); font-size:0.8125rem; font-weight:600; }
.technician-section__icon { display:grid; width:40px; height:40px; flex:0 0 auto; place-items:center; border-radius:var(--radius); background:var(--brand-secondary-subtle); color:var(--brand-secondary); }
h2, p, ol { margin:0; }
h2 { font-size:1rem; }
header p { margin-top:0.2rem; color:var(--text-secondary); font-size:0.8125rem; }
ol { display:grid; gap:0.65rem; padding:0; list-style:none; }
li { min-width:0; }
li > button { display:grid; min-height:58px; width:100%; min-width:0; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:0.75rem; border:1px solid var(--border); border-radius:var(--radius); background:var(--surface); padding:0.75rem; color:var(--text); text-align:left; cursor:pointer; }
li > button:hover, li > button:focus-visible { border-color:var(--border-strong); background:var(--hover); }
.technician-area__summary { display:grid; min-width:0; gap:0.2rem; }
.technician-area__summary strong { overflow-wrap:anywhere; font-size:0.9375rem; }
.technician-area__summary small { color:var(--text-secondary); font-size:0.8125rem; }
.technician-area__number { display:grid; width:32px; height:32px; place-items:center; border-radius:50%; background:var(--hover); color:var(--text-secondary); font-size:0.8125rem; font-weight:700; }
.technician-empty { color:var(--text-secondary); }
@media (min-width:760px) { .technician-section { padding:1.25rem; } }
@media (max-width:520px) { .technician-section__actions { align-items:stretch; flex-direction:column; } .technician-section__actions :deep(.base-button) { width:100%; } }
</style>
