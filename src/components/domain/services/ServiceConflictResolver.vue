<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseDialog from '@/components/base/BaseDialog.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import { formatServiceDate } from '@/helpers/adminServices'
import { buildConflictResolution, type ConflictChoices } from '@/helpers/serviceConflictResolution'
import type { ScheduleConflict, ScheduleResolution, ServiceSchedule, ServiceTechnician } from '@/types/adminServices'

const props=withDefaults(defineProps<{
  open:boolean; conflicts:ScheduleConflict[]; technicians:ServiceTechnician[]
  schedules:ServiceSchedule[]; saving:boolean
  currentClientName?:string; currentServiceIsNew?:boolean
}>(),{currentClientName:'',currentServiceIsNew:false})
const emit=defineEmits<{ accept:[value:ScheduleResolution]; cancel:[] }>()
const choices=ref<ConflictChoices>({})
watch(()=>props.conflicts,()=>{choices.value={}},{deep:false})
const preview=computed(()=>buildConflictResolution(props.conflicts,props.schedules,choices.value,props.technicians))
const canSave=computed(()=>!props.saving && preview.value.rows.length>0 && preview.value.pending===0)
const name=(id:string)=>props.technicians.find(person=>person.id===id)?.nombreCompleto ?? 'Técnico asignado'
const clientName=(value:string)=>value || 'Cliente del servicio'
const currentDescription=(index:number)=>index===1 ? 'Refuerzo que estás programando' :
  props.currentServiceIsNew ? 'Servicio que estás creando' : 'Servicio que estás modificando'
const currentName=computed(()=>clientName(props.currentClientName))
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
  <BaseDialog :model-value="open" title="Conflicto de horarios"
    description="Un técnico está asignado a dos servicios en el mismo horario. Elige en cuál reemplazarlo."
    class="svc-action-dialog" :close-on-escape="!saving" @update:model-value="!$event && emit('cancel')">
    <div class="svc-dialog-stack">
      <section v-for="row in preview.rows" :key="row.key" class="svc-conflict">
        <p class="svc-conflict__detail">
          <strong>{{ name(row.conflictingTechnicianId) }}</strong> ya tiene un servicio el
          {{ formatServiceDate(row.conflict.inicioProgramado) }} a las {{ formatServiceDate(row.conflict.inicioProgramado,true) }}.
        </p>
        <fieldset class="svc-conflict__choices" :disabled="saving">
          <legend>¿En cuál servicio deseas cambiar el técnico?</legend>
          <label class="svc-conflict__choice" :class="{ 'svc-conflict__choice--selected': row.selected.side==='current' }">
            <input type="radio" :name="'conflict-side-'+row.key" value="current"
              :checked="row.selected.side==='current'" @change="setSide(row.key,'current')" />
            <span class="svc-conflict__choice-text">
              <strong>{{ currentName }}</strong>
              <small>{{ currentDescription(row.conflict.proposedIndex) }}</small>
            </span>
          </label>
          <label v-if="!row.conflict.internal" class="svc-conflict__choice"
            :class="{ 'svc-conflict__choice--selected': row.selected.side==='existing' }">
            <input type="radio" :name="'conflict-side-'+row.key" value="existing"
              :checked="row.selected.side==='existing'" :disabled="row.conflict.existingEditable===false"
              @change="setSide(row.key,'existing')" />
            <span class="svc-conflict__choice-text">
              <strong>{{ clientName(row.conflict.clienteNombre) }}</strong>
              <small>Servicio ya agendado · {{ row.conflict.solicitud }}</small>
              <small v-if="row.conflict.existingEditable===false">En ejecución · no se puede modificar</small>
            </span>
          </label>
          <p v-else class="svc-muted svc-small">El otro servicio pertenece a esta misma programación.</p>
        </fieldset>
        <BaseSelect :model-value="row.selected.technicianId" :name="'conflict-replacement-'+row.key"
          :label="'Nuevo técnico para '+(row.selected.side==='current' ? currentName : clientName(row.conflict.clienteNombre))"
          required :disabled="saving" @update:model-value="setTechnician(row.key,$event)">
          <option value="">Seleccionar técnico disponible</option>
          <option v-for="person in row.options" :key="person.id" :value="person.id">{{ person.nombreCompleto }}</option>
        </BaseSelect>
        <p v-if="!row.options.length" class="svc-inline-error" role="alert">
          No hay técnicos disponibles para este servicio. Cambia el horario o la asignación.
        </p>
      </section>
      <p v-if="preview.pending" class="svc-muted svc-small">Selecciona un técnico disponible para resolver todos los cruces.</p>
    </div>
    <template #footer>
      <div class="svc-dialog-actions">
        <BaseButton variant="secondary" size="compact" :disabled="saving" @click="emit('cancel')">Cancelar</BaseButton>
        <BaseButton size="compact" :loading="saving" :disabled="!canSave" @click="save">Confirmar cambio</BaseButton>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped>
.svc-conflict { display:grid;gap:1rem; }
.svc-conflict + .svc-conflict { border-top:1px solid var(--border);padding-top:1.25rem; }
.svc-conflict__detail { margin:0;line-height:1.5; }
.svc-conflict__choices { border:0;margin:0;padding:0;display:grid;gap:0.5rem;min-width:0; }
.svc-conflict__choices legend { margin-bottom:0.75rem;font-weight:600; }
.svc-conflict__choice {
  display:flex;align-items:flex-start;gap:0.75rem;padding:0.875rem;border:1px solid var(--border);
  border-radius:var(--radius);cursor:pointer;
}
.svc-conflict__choice--selected { border-color:var(--text-secondary);background:var(--surface-secondary, var(--surface)); }
.svc-conflict__choice:has(input:focus-visible) { outline:2px solid var(--text-secondary);outline-offset:2px; }
.svc-conflict__choice:has(input:disabled) { opacity:0.6;cursor:not-allowed; }
.svc-conflict__choice input { margin-top:0.25rem;flex-shrink:0; }
.svc-conflict__choice-text { display:grid;gap:0.125rem;min-width:0; }
.svc-conflict__choice-text strong { overflow-wrap:anywhere; }
.svc-conflict__choice-text small { color:var(--text-secondary); }
</style>
