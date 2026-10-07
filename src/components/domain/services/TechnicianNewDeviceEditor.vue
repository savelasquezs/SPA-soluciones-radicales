<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import type { TechnicianDeviceCreationInput, TechnicianDeviceCreationMutation, TechnicianDeviceTypeSnapshot } from '@/types/technicianServices'

const props = defineProps<{
  deviceTypes: TechnicianDeviceTypeSnapshot[]
  conflict?: TechnicianDeviceCreationMutation | null
  saving: boolean
}>()
const emit = defineEmits<{
  save: [input: TechnicianDeviceCreationInput]
  cancel: []
  discard: []
}>()

const numero = ref('')
const tipoCodigo = ref('')
const ubicacion = ref('')
const errors = ref<Partial<Record<keyof TechnicianDeviceCreationInput, string>>>({})
const selectedType = computed(() => props.deviceTypes.find(type => type.codigo === tipoCodigo.value) ?? null)

watch(() => props.conflict, reset, { immediate: true })

function reset(): void {
  numero.value = props.conflict?.numero ?? ''
  tipoCodigo.value = props.conflict?.tipoCodigo ?? props.deviceTypes[0]?.codigo ?? ''
  ubicacion.value = props.conflict?.ubicacion ?? ''
  errors.value = {}
}

function submit(): void {
  const input = { numero: numero.value.trim(), tipoCodigo: tipoCodigo.value, ubicacion: ubicacion.value.trim() }
  errors.value = {
    ...(!input.numero ? { numero: 'Escribe el número del dispositivo.' } : {}),
    ...(!input.tipoCodigo || !selectedType.value ? { tipoCodigo: 'Selecciona un tipo válido.' } : {}),
    ...(!input.ubicacion ? { ubicacion: 'Describe dónde queda instalado.' } : {}),
  }
  if (Object.keys(errors.value).length) return
  emit('save', input)
}
</script>

<template>
  <form class="new-device" @submit.prevent="submit">
    <div>
      <h3>{{ conflict ? 'Corregir alta del dispositivo' : 'Nuevo dispositivo' }}</h3>
      <p>Quedará activo y disponible en esta Área para los próximos servicios.</p>
    </div>
    <BaseInput v-model="numero" name="new-device-number" label="Número" required maxlength="100" :disabled="saving" :error="errors.numero" />
    <BaseSelect v-model="tipoCodigo" name="new-device-type" label="Tipo" required :disabled="saving" :error="errors.tipoCodigo">
      <option value="" disabled>Selecciona un tipo</option>
      <option v-for="type in deviceTypes" :key="type.codigo" :value="type.codigo">{{ type.nombre }}</option>
    </BaseSelect>
    <p v-if="selectedType" class="new-device__context">{{ selectedType.clasificacion === 'RASTREROS' ? 'Rastreros' : 'Voladores' }} · {{ selectedType.plagas.length }} plagas aplicables</p>
    <BaseInput v-model="ubicacion" name="new-device-location" label="Ubicación" required maxlength="500" :disabled="saving" :error="errors.ubicacion" />
    <p v-if="conflict?.error" class="new-device__error" role="alert">{{ conflict.error }}</p>
    <div class="new-device__actions">
      <BaseButton type="submit" :loading="saving">{{ conflict ? 'Guardar corrección' : 'Agregar dispositivo' }}</BaseButton>
      <BaseButton variant="secondary" :disabled="saving" @click="emit('cancel')">Cancelar</BaseButton>
      <BaseButton v-if="conflict" variant="ghost" :disabled="saving" @click="emit('discard')">Descartar alta</BaseButton>
    </div>
  </form>
</template>

<style scoped>
.new-device { display:grid; gap:0.8rem; border:1px solid var(--border-strong); border-radius:var(--radius); background:var(--surface-raised); padding:0.85rem; }
.new-device h3, .new-device p { margin:0; }
.new-device h3 { font-size:0.95rem; }
.new-device > div:first-child p, .new-device__context { color:var(--text-secondary); font-size:0.8125rem; }
.new-device__error { border-radius:var(--radius); background:var(--warning-subtle); padding:0.65rem; color:var(--warning); font-size:0.8125rem; }
.new-device__actions { display:flex; flex-wrap:wrap; gap:0.55rem; }
@media (max-width:520px) { .new-device__actions { display:grid; grid-template-columns:1fr; } }
</style>
