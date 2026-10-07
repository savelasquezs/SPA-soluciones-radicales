<script setup lang="ts">
import { Check, MapPin, RefreshCw } from 'lucide-vue-next'
import BaseButton from '@/components/base/BaseButton.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import { formatTechnicianDateTime, technicianServiceStateLabel, technicianServiceStateTone } from '@/helpers/technicianServices'
import type { TechnicianPackageCache, TechnicianServiceSummary } from '@/types/technicianServices'

defineProps<{ record: TechnicianServiceSummary; cache?: TechnicianPackageCache | null; preparing?: boolean; prepareError?: boolean; online: boolean }>()
defineEmits<{ open: []; retry: [] }>()
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
    <p class="technician-service-card__time">{{ formatTechnicianDateTime(record.inicioProgramado) }}</p>
    <p class="technician-service-card__address"><MapPin :size="16" aria-hidden="true" />{{ record.direccion }}</p>
    <footer>
      <span v-if="cache" class="technician-service-card__prepared" role="status" aria-label="Preparado en este celular"><Check :size="19" stroke-width="3" aria-hidden="true" /></span>
      <span v-else-if="preparing" class="technician-service-card__sync" role="status">Descargando…</span>
      <BaseButton v-else-if="prepareError" variant="secondary" size="compact" :disabled="!online" @click="$emit('retry')"><RefreshCw :size="16" aria-hidden="true" />Reintentar descarga</BaseButton>
      <span v-else />
      <BaseButton size="compact" @click="$emit('open')">{{ record.estado === 'EN_PROCESO' ? 'Continuar' : record.estado === 'PROGRAMADO' ? 'Ver servicio' : 'Ver' }}</BaseButton>
    </footer>
  </article>
</template>

<style scoped>
.technician-service-card { display:grid; gap:0.5rem; min-width:0; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); padding:0.8rem; box-shadow:var(--shadow-sm); }
header { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; }
h2, p, dl, dd { margin:0; }
h2 { margin-top:0.15rem; font-size:1.05rem; line-height:1.35; }
header p:not(.technician-service-card__request) { color:var(--text-secondary); }
.technician-service-card__request { color:var(--text-secondary); font-size:0.75rem; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; }
.technician-service-card__time { font-weight:650; }
.technician-service-card__address { display:flex; align-items:flex-start; gap:0.35rem; overflow:hidden; color:var(--text-secondary); font-size:0.8125rem; line-height:1.3; }
.technician-service-card__address svg { flex:none; }
.technician-service-card__prepared { display:grid; width:44px; height:44px; place-items:center; color:var(--success); }
.technician-service-card__sync { align-self:center; color:var(--text-secondary); font-size:0.8125rem; }
footer { display:flex; min-height:44px; align-items:center; justify-content:space-between; gap:0.65rem; }
</style>
