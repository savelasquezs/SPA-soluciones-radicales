<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import BaseFileUpload from '@/components/base/BaseFileUpload.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import { parseEmails, validateClientInput, type ClientFormErrors } from '@/helpers/clients'
import type { ClientInput } from '@/types/domain'

defineProps<{ mode: 'create' | 'edit'; saving?: boolean }>()
const model = defineModel<ClientInput>({ required: true })
const emit = defineEmits<{ submit: []; invalid: []; 'file-selected': [file: File] }>()
const touched = reactive<Partial<Record<keyof ClientFormErrors, boolean>>>({})
const submitted = ref(false)
const templateFile = ref<File | null>(null)
const errors = computed(() => validateClientInput(model.value))
const emailsText = computed({
  get: () => model.value.correos.join('\n'),
  set: (value: string) => update('correos', parseEmails(value)),
})

function update<K extends keyof ClientInput>(key: K, value: ClientInput[K]): void {
  model.value = { ...model.value, [key]: value }
}

function touch(field: keyof ClientFormErrors): void {
  touched[field] = true
}

function error(field: keyof ClientFormErrors): string | undefined {
  return touched[field] || submitted.value ? errors.value[field] : undefined
}

function submit(): void {
  submitted.value = true
  if (Object.keys(errors.value).length) {
    emit('invalid')
    return
  }
  emit('submit')
}

function selectTemplate(file: File | null): void {
  templateFile.value = file
  if (file) emit('file-selected', file)
}
</script>

<template>
  <form id="client-form" class="client-form" novalidate @submit.prevent="submit">
    <BaseSelect
      :model-value="modelValue.tipoCliente"
      name="client-type"
      label="Tipo de cliente"
      required
      :disabled="mode === 'edit'"
      @update:model-value="update('tipoCliente', $event as ClientInput['tipoCliente'])"
    >
      <option value="NEGOCIO">Negocio</option>
      <option value="RESIDENCIAL">Casa</option>
    </BaseSelect>

    <BaseInput
      :model-value="modelValue.nombre"
      name="client-name"
      :label="modelValue.tipoCliente === 'NEGOCIO' ? 'Nombre / razón social' : 'Nombre'"
      required
      autocomplete="name"
      :error="error('nombre')"
      @update:model-value="update('nombre', $event)"
      @blur="touch('nombre')"
    />

    <template v-if="modelValue.tipoCliente === 'NEGOCIO'">
      <BaseInput :model-value="modelValue.nit ?? ''" name="client-nit" label="NIT" required :error="error('nit')" @update:model-value="update('nit', $event)" @blur="touch('nit')" />
      <BaseTextarea v-model="emailsText" name="client-emails" label="Correos generales" hint="Uno por línea o separados por coma." :rows="3" :error="error('correos')" @blur="touch('correos')" />
      <section class="client-form__section">
        <header><h3>Certificado de establecimiento</h3><p>Esta configuración aplica a todas las Sedes del cliente.</p></header>
        <BaseInput
          :model-value="modelValue.vigenciaCertificadoMeses?.toString() ?? ''"
          name="client-certificate-months"
          label="Vigencia en meses"
          type="number"
          min="1"
          step="1"
          required
          :error="error('vigenciaCertificadoMeses')"
          @update:model-value="update('vigenciaCertificadoMeses', $event ? Number($event) : null)"
          @blur="touch('vigenciaCertificadoMeses')"
        />
        <p v-if="modelValue.plantillaCertificadoStoragePath" class="current-file">Plantilla actual: {{ modelValue.plantillaCertificadoStoragePath.split('/').slice(-1)[0] }}</p>
        <BaseFileUpload
          :model-value="templateFile"
          name="client-certificate-template"
          label="Seleccionar plantilla"
          accept=".doc,.docx,.pdf"
          :required="!modelValue.plantillaCertificadoStoragePath"
          :error="error('plantillaCertificadoStoragePath')"
          :hint="modelValue.plantillaCertificadoStoragePath ? 'Déjalo vacío para conservar la plantilla actual.' : undefined"
          @update:model-value="selectTemplate"
          @blur="touch('plantillaCertificadoStoragePath')"
        />
      </section>
    </template>

    <template v-else>
      <BaseInput :model-value="modelValue.residenciaCelular ?? ''" name="client-phone" label="Celular" required autocomplete="tel" :error="error('residenciaCelular')" @update:model-value="update('residenciaCelular', $event)" @blur="touch('residenciaCelular')" />
      <BaseInput :model-value="modelValue.residenciaDireccion ?? ''" name="client-address" label="Dirección" required autocomplete="street-address" :error="error('residenciaDireccion')" @update:model-value="update('residenciaDireccion', $event)" @blur="touch('residenciaDireccion')" />
    </template>
  </form>
</template>

<style scoped>
.client-form { display: grid; gap: 1rem; }
.client-form__section { display: grid; gap: 1rem; border-top: 1px solid var(--border); padding-top: 1.25rem; }
.client-form__section header h3, .client-form__section header p { margin: 0; }
.client-form__section header h3 { font-size: 0.95rem; }
.client-form__section header p, .current-file { margin-top: 0.25rem; color: var(--text-secondary); font-size: 0.82rem; overflow-wrap: anywhere; }
</style>
