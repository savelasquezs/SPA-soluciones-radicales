<script setup lang="ts">
import { MapPin, PackageCheck } from 'lucide-vue-next'
import BaseButton from '@/components/base/BaseButton.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import { formatTechnicianDateTime, technicianServiceStateLabel, technicianServiceStateTone } from '@/helpers/technicianServices'
import type { TechnicianPackageCache, TechnicianServiceSummary } from '@/types/technicianServices'

defineProps<{ record: TechnicianServiceSummary; cache?: TechnicianPackageCache | null; preparing?: boolean; online: boolean }>()
defineEmits<{ open: []; prepare: [] }>()
</script>

<template>
  <article class="technician-service-card">
    <header>
      <div>
        <p class="technician-service-card__request">{{ record.solicitud }}</p>
        <h2>{{ record.clienteNombre }}</h2>
        <p>{{ record.sedeNombre }}</p>
      </div>
      <StatusBadge :tone="technicianServiceStateTone(record.estado)">{{ technicianServiceStateLabel(record.estado) }}</StatusBadge>
    </header>
    <dl>
      <div><dt>Programación</dt><dd>{{ formatTechnicianDateTime(record.inicioProgramado) }}</dd></div>
      <div><dt><MapPin :size="16" aria-hidden="true" />Dirección</dt><dd>{{ record.direccion }}</dd></div>
    </dl>
    <p v-if="cache" class="technician-service-card__prepared"><PackageCheck :size="17" aria-hidden="true" />Preparado en este celular · {{ formatTechnicianDateTime(cache.savedAt) }}</p>
    <footer>
      <BaseButton variant="secondary" @click="$emit('open')">Abrir servicio</BaseButton>
      <BaseButton v-if="!cache && record.estado !== 'FINALIZADO'" :loading="preparing" :disabled="!online" @click="$emit('prepare')">Preparar</BaseButton>
    </footer>
  </article>
</template>

<style scoped>
.technician-service-card { display:grid; gap:1rem; min-width:0; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); padding:1rem; box-shadow:var(--shadow-sm); }
header { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; }
h2, p, dl, dd { margin:0; }
h2 { margin-top:0.15rem; font-size:1.05rem; line-height:1.35; }
header p:not(.technician-service-card__request) { color:var(--text-secondary); }
.technician-service-card__request { color:var(--text-secondary); font-size:0.75rem; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; }
dl { display:grid; gap:0.75rem; }
dl > div { display:grid; gap:0.15rem; }
dt { display:flex; align-items:center; gap:0.35rem; color:var(--text-secondary); font-size:0.75rem; font-weight:600; }
dd { overflow-wrap:anywhere; font-size:0.9375rem; }
.technician-service-card__prepared { display:flex; align-items:center; gap:0.45rem; border-radius:var(--radius); background:var(--success-subtle); padding:0.65rem 0.75rem; color:var(--success); font-size:0.8125rem; font-weight:600; }
footer { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0.65rem; }
footer > :only-child { grid-column:1 / -1; }
@media (min-width:720px) { .technician-service-card { padding:1.25rem; } }
</style>
