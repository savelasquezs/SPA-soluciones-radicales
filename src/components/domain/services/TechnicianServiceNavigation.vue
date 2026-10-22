<script setup lang="ts">
import { ClipboardCheck, FileText, Map, Truck } from 'lucide-vue-next'
import type { RouteLocationRaw } from 'vue-router'

const props = defineProps<{
  serviceId: string
  active: 'service' | 'areas' | 'vehicles' | 'review'
  vehiclesEnabled: boolean
  firstAreaId?: string
}>()

function destination(section: 'service' | 'areas' | 'vehicles' | 'review'): RouteLocationRaw {
  const params = { id: props.serviceId }
  if (section === 'service') return { name: 'technician-service-work', params, query: { overview: '1' } }
  if (section === 'areas') return props.firstAreaId
    ? { name: 'technician-service-area', params: { ...params, areaId: props.firstAreaId } }
    : { name: 'technician-service-work', params, query: { overview: '1' } }
  if (section === 'vehicles') return { name: 'technician-service-vehicles', params }
  return { name: 'technician-service-review', params }
}

const sections = [
  { id: 'service', title: 'Servicio', icon: FileText },
  { id: 'areas', title: 'Áreas', icon: Map },
  { id: 'vehicles', title: 'Vehículos', icon: Truck },
  { id: 'review', title: 'Cierre', icon: ClipboardCheck },
] as const
</script>

<template>
  <nav class="tech-stages" aria-label="Secciones del servicio"
    :style="{ gridTemplateColumns: `repeat(${vehiclesEnabled ? 4 : 3}, minmax(0, 1fr))` }">
    <RouterLink v-for="item in sections.filter(item => item.id !== 'vehicles' || vehiclesEnabled)"
      :key="item.id" :to="destination(item.id)" class="tech-stages__item"
      :class="{ 'tech-stages__item--active': active === item.id }"
      :aria-current="active === item.id ? 'page' : undefined">
      <component :is="item.icon" :size="17" aria-hidden="true" />
      <span>{{ item.title }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.tech-stages { display:grid; gap:.2rem; background:var(--surface); padding:.25rem; border:1px solid var(--border);
  border-radius:var(--radius); min-width:0; }
.tech-stages__item { display:flex; align-items:center; justify-content:center; gap:.35rem; min-width:0; min-height:44px;
  color:var(--text-secondary); border-radius:var(--radius-sm); text-decoration:none; font-size:.78rem; font-weight:600; }
.tech-stages__item:hover, .tech-stages__item:focus-visible { color:var(--text); background:var(--hover); }
.tech-stages__item:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }
.tech-stages__item--active { color:var(--accent); background:var(--accent-subtle); }
@media(max-width:390px) { .tech-stages__item { flex-direction:column; gap:.08rem; font-size:.67rem; } }
</style>
