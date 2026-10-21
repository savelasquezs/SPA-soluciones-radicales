<script setup lang="ts">
import { computed } from 'vue'
import { Check, ChevronRight, RefreshCw } from 'lucide-vue-next'
import BaseButton from '@/components/base/BaseButton.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import { technicianServiceStateLabel, technicianServiceStateTone } from '@/helpers/technicianServices'
import type { TechnicianPackageCache, TechnicianServiceSummary } from '@/types/technicianServices'

const props=withDefaults(defineProps<{
  record: TechnicianServiceSummary
  cache?: TechnicianPackageCache | null
  preparing?: boolean
  prepareError?: boolean
  online: boolean
  contactOnly?: boolean
}>(),{contactOnly:false})
const emit=defineEmits<{ open: []; retry: [] }>()
const when=computed(()=>props.record.estado==='FINALIZADO'
  ? props.record.finReal ?? props.record.inicioProgramado : props.record.inicioProgramado)
const formatted=computed(()=>new Intl.DateTimeFormat('es-CO',{
  day:'2-digit',month:'short',hour:'numeric',minute:'2-digit',hour12:true,timeZone:'America/Bogota',
}).format(new Date(when.value)))
const actionLabel=computed(()=>props.contactOnly ? 'Ver cliente'
  : props.record.estado==='EN_PROCESO' ? 'Continuar'
    : props.record.estado==='PROGRAMADO' ? 'Ver servicio' : 'Ver')
</script>

<template>
  <article class="technician-service-card">
    <button type="button" class="technician-service-card__open" 
      :aria-label="actionLabel" :title="record.clienteNombre+' · '+record.sedeNombre"
      @click="emit('open')">
      <div class="technician-service-card__meta">
        <span class="technician-service-card__request">{{ record.solicitud }}</span>
        <time :datetime="when">{{ formatted }}</time>
        <StatusBadge :tone="technicianServiceStateTone(record.estado)">{{ technicianServiceStateLabel(record.estado) }}</StatusBadge>
      </div>
      <div class="technician-service-card__detail">
        <div class="technician-service-card__identity">
          <h2>{{ record.clienteNombre }}</h2>
          <p>{{ record.sedeNombre }}<span v-if="record.tipoServicio==='REFUERZO'"> · Refuerzo</span></p>
        </div>
        <span class="technician-service-card__right">
          <Check v-if="cache" :size="18" stroke-width="3" aria-label="Preparado en este celular" role="img" class="technician-service-card__prepared" />
          <span v-else-if="preparing" class="technician-service-card__sync">Descargando…</span>
          <ChevronRight :size="19" aria-hidden="true" />
        </span>
      </div>
    </button>
    <div v-if="prepareError && !cache" class="technician-service-card__retry">
      <BaseButton variant="secondary" size="compact" :disabled="!online" @click="$emit('retry')">
        <RefreshCw :size="15" aria-hidden="true" /> Reintentar descarga
      </BaseButton>
    </div>
  </article>
</template>

<style scoped>
.technician-service-card{min-width:0;border:1px solid var(--border);border-radius:var(--radius-lg);
  background:var(--surface);overflow:hidden}
.technician-service-card__open{width:100%;min-height:86px;padding:.47rem .67rem;display:grid;gap:.32rem;
  background:transparent;border:0;color:var(--text);font:inherit;text-align:left;cursor:pointer}
.technician-service-card__open:hover{background:var(--hover)}
.technician-service-card__open:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.technician-service-card__meta{display:flex;align-items:center;gap:.45rem;min-width:0}
.technician-service-card__request{font-size:.69rem;color:var(--text-secondary);font-weight:650;
  letter-spacing:.012em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:1}
.technician-service-card__meta time{font-size:.7rem;color:var(--text-secondary);white-space:nowrap;margin-right:auto}
.technician-service-card__meta :deep(.status-badge){min-height:23px;font-size:.67rem;padding:.14rem .35rem}
.technician-service-card__detail{display:flex;align-items:center;justify-content:space-between;gap:.5rem;min-width:0}
.technician-service-card__identity{min-width:0;flex:1}
.technician-service-card__identity h2{margin:0;font-size:.91rem;font-weight:650;line-height:1.3;
  overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.technician-service-card__identity p{margin:.09rem 0 0;font-size:.73rem;color:var(--text-secondary);
  overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.technician-service-card__right{display:flex;align-items:center;gap:.3rem;color:var(--text-muted);flex:none}
.technician-service-card__prepared{color:var(--success)}
.technician-service-card__sync{font-size:.67rem;color:var(--text-secondary)}
.technician-service-card__retry{padding:0 .65rem .45rem;display:flex;justify-content:flex-end}
@media(max-width:375px){
  .technician-service-card__open{padding:.45rem .5rem}
  .technician-service-card__meta{gap:.28rem}
  .technician-service-card__request{font-size:.65rem}
  .technician-service-card__meta time{font-size:.65rem}
  .technician-service-card__meta :deep(.status-badge){font-size:.62rem}
}
</style>
