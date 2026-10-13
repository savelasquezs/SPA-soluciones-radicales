<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseDialog from '@/components/base/BaseDialog.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import { formatServiceDate } from '@/helpers/adminServices'
import { buildConflictResolution, type ConflictChoices } from '@/helpers/serviceConflictResolution'
import type { ScheduleConflict, ScheduleResolution, ServiceSchedule, ServiceTechnician } from '@/types/adminServices'

const props=defineProps<{
  open:boolean; conflicts:ScheduleConflict[]; technicians:ServiceTechnician[]
  schedules:ServiceSchedule[]; saving:boolean
}>()
const emit=defineEmits<{ accept:[value:ScheduleResolution]; cancel:[] }>()
const choices=ref<ConflictChoices>({})
watch(()=>props.conflicts,()=>{choices.value={}},{deep:false})
const preview=computed(()=>buildConflictResolution(props.conflicts,props.schedules,choices.value,props.technicians))
const canSave=computed(()=>!props.saving && preview.value.rows.length>0 && preview.value.pending===0)
const name=(id:string)=>props.technicians.find(person=>person.id===id)?.nombreCompleto ?? 'Técnico asignado'
function setSide(key:string,value:string):void {
  choices.value={...choices.value,[key]:{side:value==='existing' ? 'existing' : 'current',technicianId:''}}
}
function setTechnician(key:string,value:string):void {
  choices.value={...choices.value,[key]:{side:choices.value[key]?.side ?? 'current',technicianId:value}}
}
function save():void {
  if(canSave.value)emit('accept',preview.value.resolution)
}
</script>
<template>
  <BaseDialog :model-value="open" title="Resolver cruce de horarios"
    description="Cada servicio debe quedar cubierto por técnicos distintos. Elige un reemplazo disponible antes de guardar."
    class="svc-action-dialog" :close-on-escape="!saving" @update:model-value="!$event && emit('cancel')">
    <div class="svc-dialog-stack">
      <section v-for="row in preview.rows" :key="row.key" class="svc-card">
        <h3>{{ row.conflict.solicitud }}{{ row.conflict.clienteNombre ? ' · '+row.conflict.clienteNombre : '' }}</h3>
        <p class="svc-muted svc-small">{{ formatServiceDate(row.conflict.inicioProgramado) }} · {{ formatServiceDate(row.conflict.inicioProgramado,true) }}</p>
        <p>El técnico <strong>{{ name(row.conflictingTechnicianId) }}</strong> aparece en ambos servicios.</p>
        <div class="svc-form-grid">
          <BaseSelect :model-value="row.selected.side" :name="'conflict-action-'+row.key" label="Resolver cambiando"
            :disabled="saving || row.conflict.internal || row.conflict.existingEditable===false"
            @update:model-value="setSide(row.key,$event)">
            <option value="current">Equipo del servicio que estoy guardando</option>
            <option v-if="!row.conflict.internal && row.conflict.existingEditable!==false" value="existing">Equipo de {{ row.conflict.solicitud }}</option>
          </BaseSelect>
          <BaseSelect :model-value="row.selected.technicianId" :name="'conflict-replacement-'+row.key"
            label="Técnico reemplazante" required :disabled="saving"
            @update:model-value="setTechnician(row.key,$event)">
            <option value="">Seleccionar técnico disponible</option>
            <option v-for="person in row.options" :key="person.id" :value="person.id">{{ person.nombreCompleto }}</option>
          </BaseSelect>
        </div>
        <p v-if="!row.options.length" class="svc-inline-error" role="alert">No hay otro técnico disponible en este horario. Cambia la fecha o el equipo del servicio.</p>
      </section>
      <p v-if="preview.pending" class="svc-muted svc-small">Debes resolver todos los cruces para continuar.</p>
    </div>
    <template #footer>
      <div class="svc-dialog-actions">
        <BaseButton variant="secondary" size="compact" :disabled="saving" @click="emit('cancel')">Cancelar</BaseButton>
        <BaseButton size="compact" :loading="saving" :disabled="!canSave" @click="save">Guardar asignaciones</BaseButton>
      </div>
    </template>
  </BaseDialog>
</template>
