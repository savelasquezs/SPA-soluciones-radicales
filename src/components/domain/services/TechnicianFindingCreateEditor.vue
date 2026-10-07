<script setup lang="ts">
import { ref } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import TechnicianEvidencePicker from '@/components/domain/services/TechnicianEvidencePicker.vue'
import type { TechnicianFindingCreateInput } from '@/types/technicianServices'

defineProps<{ saving: boolean }>()
const emit = defineEmits<{ save: [input: TechnicianFindingCreateInput, files: File[]]; cancel: [] }>()
const descripcion = ref('')
const recomendacionAccion = ref('')
const responsableNombre = ref('')
const responsableCorreo = ref('')
const evidences = ref<File[]>([])
const errors = ref<Partial<Record<keyof TechnicianFindingCreateInput, string>>>({})

function submit(): void {
  const input = {
    descripcion: descripcion.value.trim(),
    recomendacionAccion: recomendacionAccion.value.trim(),
    responsableNombre: responsableNombre.value.trim(),
    responsableCorreo: responsableCorreo.value.trim().toLowerCase(),
  }
  errors.value = {
    ...(!input.descripcion ? { descripcion: 'Describe el Hallazgo.' } : {}),
    ...(!input.recomendacionAccion ? { recomendacionAccion: 'Indica la recomendación o acción correctiva.' } : {}),
    ...(!input.responsableNombre ? { responsableNombre: 'Indica quién es responsable del seguimiento.' } : {}),
    ...(input.responsableCorreo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(input.responsableCorreo) ? { responsableCorreo: 'Escribe un correo válido.' } : {}),
  }
  if (Object.keys(errors.value).length) return
  emit('save', input, evidences.value)
}
</script>

<template>
  <form class="finding-create" @submit.prevent="submit">
    <div><h3>Nuevo Hallazgo</h3><p>Quedará disponible para seguimiento en servicios posteriores de esta Sede.</p></div>
    <BaseTextarea v-model="descripcion" name="finding-description" label="Descripción" required :rows="3" maxlength="2000" :disabled="saving" :error="errors.descripcion" />
    <BaseTextarea v-model="recomendacionAccion" name="finding-action" label="Recomendación o acción correctiva" required :rows="3" maxlength="2000" :disabled="saving" :error="errors.recomendacionAccion" />
    <div class="finding-create__responsible">
      <BaseInput v-model="responsableNombre" name="finding-responsible-name" label="Responsable" required maxlength="200" :disabled="saving" :error="errors.responsableNombre" />
      <BaseInput v-model="responsableCorreo" name="finding-responsible-email" label="Correo del responsable" type="email" maxlength="320" autocomplete="email" :disabled="saving" :error="errors.responsableCorreo" />
    </div>
    <TechnicianEvidencePicker v-model="evidences" name="finding-opening-evidence" label="Evidencias de apertura" :disabled="saving" />
    <div class="finding-create__actions">
      <BaseButton type="submit" :loading="saving">Registrar Hallazgo</BaseButton>
      <BaseButton variant="secondary" :disabled="saving" @click="emit('cancel')">Cancelar</BaseButton>
    </div>
  </form>
</template>

<style scoped>
.finding-create { display:grid; gap:0.85rem; border:1px solid var(--border-strong); border-radius:var(--radius); background:var(--surface-raised); padding:0.85rem; }
.finding-create h3, .finding-create p { margin:0; }
.finding-create h3 { font-size:0.95rem; }
.finding-create > div:first-child p { margin-top:0.2rem; color:var(--text-secondary); font-size:0.8125rem; }
.finding-create__responsible { display:grid; gap:0.75rem; }
.finding-create__actions { display:flex; flex-wrap:wrap; gap:0.55rem; }
@media (min-width:760px) { .finding-create__responsible { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width:520px) { .finding-create__actions { grid-template-columns:1fr; } }
</style>
