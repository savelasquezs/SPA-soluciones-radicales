<script setup lang="ts">
import { computed } from 'vue'
import BaseDateTimePicker from '@/components/base/BaseDateTimePicker.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseMultiSelect from '@/components/base/BaseMultiSelect.vue'
import { formatServiceDate, scheduleEnd, scheduleFromDraft, toBogotaInput } from '@/helpers/adminServices'
import type { ServiceErrors, ServiceScheduleDraft, ServiceTechnician } from '@/types/adminServices'

const props=withDefaults(defineProps<{ modelValue: ServiceScheduleDraft; technicians: ServiceTechnician[]; prefix?: string; disabled?: boolean; errors?: ServiceErrors; showDates?: boolean; showTeam?: boolean; futureOnly?: boolean }>(),{ prefix:'programacion',disabled:false,errors:()=>({}),showDates:true,showTeam:true,futureOnly:false })
const emit=defineEmits<{ 'update:modelValue': [value: ServiceScheduleDraft]; blur: [field: string] }>()
const end=computed(()=>scheduleEnd(scheduleFromDraft(props.modelValue)))
const currentMin=()=>props.futureOnly ? toBogotaInput(new Date().toISOString()) : undefined
const options=computed(()=>props.technicians.filter(person=>person.id!==props.modelValue.tecnicoResponsableId).map(person=>({ id:person.id,label:person.nombreCompleto,description:person.activo ? undefined : 'Actualmente inactivo' })))
function invalidResponsible(person: ServiceTechnician): boolean {
  return !person.activo || (person.tieneCertificado && (!person.certificadoFechaVencimiento || (Boolean(props.modelValue.inicioProgramado) && person.certificadoFechaVencimiento < props.modelValue.inicioProgramado.slice(0,10))))
}
const certificateError=computed(()=>{
  const person=props.technicians.find(item=>item.id===props.modelValue.tecnicoResponsableId)
  return person && invalidResponsible(person) ? 'El responsable debe estar activo y su certificado registrado debe estar vigente para esta fecha.' : undefined
})
function change<K extends keyof ServiceScheduleDraft>(key: K, value: ServiceScheduleDraft[K]): void {
  const next={ ...props.modelValue,[key]:value }
  if(key==='tecnicoResponsableId') next.tecnicosColaboradoresIds=next.tecnicosColaboradoresIds.filter(id=>id!==value)
  emit('update:modelValue',next)
  emit('blur',`${props.prefix}.${key}`)
}
</script>
<template>
  <div class="svc-dialog-stack">
    <div v-if="showDates" class="svc-form-grid svc-form-grid--schedule">
      <BaseDateTimePicker :model-value="modelValue.inicioProgramado" mode="datetime" :name="`${prefix}-inicio`" label="Fecha y hora" required :minute-step="1" :min="currentMin()" :disabled="disabled" :error="errors[`${prefix}.inicioProgramado`]" @update:model-value="change('inicioProgramado',$event ?? '')" @blur="emit('blur',`${prefix}.inicioProgramado`)" />
      <BaseInput :model-value="modelValue.duracionMinutos" :name="`${prefix}-duracion`" label="Duración (min)" type="number" inputmode="numeric" min="1" max="10080" required :disabled="disabled" :error="errors[`${prefix}.duracionMinutos`]" @update:model-value="change('duracionMinutos',$event)" @blur="emit('blur',`${prefix}.duracionMinutos`)" />
      <small v-if="end" class="svc-muted svc-full">Fin estimado: {{ formatServiceDate(end) }} · {{ formatServiceDate(end,true) }}</small>
    </div>
    <div v-if="showTeam" class="svc-form-grid">
      <BaseSelect :model-value="modelValue.tecnicoResponsableId" :name="`${prefix}-responsable`" label="Responsable" required :disabled="disabled" :error="errors[`${prefix}.tecnicoResponsableId`] || certificateError" @update:model-value="change('tecnicoResponsableId',$event)" @blur="emit('blur',`${prefix}.tecnicoResponsableId`)">
        <option value="">Selecciona un técnico</option>
        <option v-for="person in technicians" :key="person.id" :value="person.id" :disabled="invalidResponsible(person)">{{ person.nombreCompleto }}{{ invalidResponsible(person) ? ' · No disponible' : '' }}</option>
      </BaseSelect>
      <BaseMultiSelect :model-value="modelValue.tecnicosColaboradoresIds" :options="options" :name="`${prefix}-colaboradores`" label="Colaboradores" item-label="colaborador" items-label="colaboradores" placeholder="Sin colaboradores" empty-text="No hay otros técnicos disponibles." :disabled="disabled" :error="errors[`${prefix}.tecnicosColaboradoresIds`]" @update:model-value="change('tecnicosColaboradoresIds',$event)" @blur="emit('blur',`${prefix}.tecnicosColaboradoresIds`)" />
    </div>
  </div>
</template>
