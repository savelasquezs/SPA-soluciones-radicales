<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import BaseFileUpload from '@/components/base/BaseFileUpload.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import { parseEmails, validateSiteInput, type SiteFormErrors } from '@/helpers/clients'
import type { SiteInput } from '@/types/domain'

const props = defineProps<{ mode: 'create' | 'edit'; clientName?: string; saving?: boolean }>()
const model = defineModel<SiteInput>({ required: true })
const emit = defineEmits<{ submit: []; invalid: []; 'file-selected': [kind: 'plan', file: File | null]; 'view-plan': [] }>()
const touched = reactive<Partial<Record<keyof SiteFormErrors, boolean>>>({})
const submitted = ref(false)
const planFile = ref<File | null>(null)
const errors = computed(() => validateSiteInput(model.value))
const emailsText = computed({
  get: () => model.value.correos.join('\n'),
  set: (value: string) => update('correos', parseEmails(value)),
})

function update<K extends keyof SiteInput>(key: K, value: SiteInput[K]): void {
  model.value = { ...model.value, [key]: value }
}

function error(field: keyof SiteFormErrors): string | undefined {
  return touched[field] || submitted.value ? errors.value[field] : undefined
}

function submit(): void {
  submitted.value = true
  if (Object.keys(errors.value).length) emit('invalid')
  else emit('submit')
}

function selected(kind: 'plan', file: File | null): void {
  planFile.value = file
  emit('file-selected', kind, file)
}

function removePlan(): void {
  planFile.value = null
  update('planoStoragePath', null)
  emit('file-selected', 'plan', null)
}
</script>

<template>
  <form id="site-form" class="site-form" novalidate :inert="props.saving || undefined" :aria-busy="Boolean(props.saving)" @submit.prevent="submit">
    <section>
      <header><h3>Datos de la Sede</h3><p>Información operativa y contacto principal.</p></header>
      <div class="site-form__grid">
        <BaseInput :model-value="modelValue.nombre" name="site-name" label="Nombre" required :error="error('nombre')" @update:model-value="update('nombre', $event)" @blur="touched.nombre = true" />
        <BaseInput :model-value="modelValue.direccion" name="site-address" label="Dirección" required autocomplete="street-address" :error="error('direccion')" @update:model-value="update('direccion', $event)" @blur="touched.direccion = true" />
        <BaseInput :model-value="modelValue.contactoPrincipalNombre" name="site-contact" label="Contacto principal" required autocomplete="name" :error="error('contactoPrincipalNombre')" @update:model-value="update('contactoPrincipalNombre', $event)" @blur="touched.contactoPrincipalNombre = true" />
        <BaseInput :model-value="modelValue.contactoPrincipalCelular" name="site-phone" label="Celular" required autocomplete="tel" :error="error('contactoPrincipalCelular')" @update:model-value="update('contactoPrincipalCelular', $event)" @blur="touched.contactoPrincipalCelular = true" />
        <BaseInput :model-value="modelValue.contactoPrincipalCorreo ?? ''" name="site-email" label="Correo" type="email" autocomplete="email" :error="error('contactoPrincipalCorreo')" @update:model-value="update('contactoPrincipalCorreo', $event || null)" @blur="touched.contactoPrincipalCorreo = true" />
        <BaseTextarea v-model="emailsText" name="site-emails" label="Correos adicionales" :rows="3" />
        <BaseCheckbox :model-value="modelValue.heredaCorreosCliente" name="site-inherit-emails" label="Incluir correos generales del cliente" @update:model-value="update('heredaCorreosCliente', $event)" />
      </div>
    </section>

    <section>
      <header><h3>Configuración operativa</h3></header>
      <p class="certificate-reference">Certificado de establecimiento: configuración de {{ clientName ?? 'Cliente' }}.</p>
      <div class="site-form__grid">
        <BaseInput :model-value="String(modelValue.valorServicio)" name="site-value" label="Valor en COP" type="number" min="0" step="1" required :error="error('valorServicio')" @update:model-value="update('valorServicio', Number($event))" @blur="touched.valorServicio = true" />
        <BaseInput :model-value="String(modelValue.periodicidadMeses)" name="site-periodicity" label="Periodicidad en meses" type="number" min="1" step="1" required :error="error('periodicidadMeses')" @update:model-value="update('periodicidadMeses', Number($event))" @blur="touched.periodicidadMeses = true" />
        <BaseInput :model-value="String(modelValue.duracionServicioMinutos)" name="site-duration" label="Duración en minutos" type="number" min="1" step="1" required :error="error('duracionServicioMinutos')" @update:model-value="update('duracionServicioMinutos', Number($event))" @blur="touched.duracionServicioMinutos = true" />
        <BaseCheckbox :model-value="modelValue.manejaRefuerzo" name="site-reinforcement" label="Maneja visita de refuerzo" @update:model-value="update('manejaRefuerzo', $event)" />
        <BaseCheckbox :model-value="modelValue.manejaVehiculos" name="site-vehicles" label="Maneja vehículos" @update:model-value="update('manejaVehiculos', $event)" />
      </div>
    </section>

    <section>
      <header><h3>Plano</h3><p>Archivo privado de la Sede.</p></header>
      <div v-if="modelValue.planoStoragePath" class="current-plan">
        <p class="current-file">Plano actual: {{ modelValue.planoStoragePath.split('/').slice(-1)[0] }}</p>
        <span><BaseButton type="button" variant="ghost" @click="emit('view-plan')">Ver plano</BaseButton><BaseButton type="button" variant="danger" @click="removePlan">Quitar</BaseButton></span>
      </div>
      <BaseFileUpload :model-value="planFile" name="site-plan" label="Seleccionar plano" :hint="modelValue.planoStoragePath ? 'Déjalo vacío para conservar el plano actual.' : undefined" @update:model-value="selected('plan', $event)" />
    </section>

    <section v-if="modelValue.manejaVehiculos">
      <header><h3>Certificado vehicular</h3></header>
      <div class="site-form__grid">
        <BaseCheckbox :model-value="modelValue.generaCertificadoVehiculo" name="site-vehicle-certificate" label="Genera certificado para vehículos" @update:model-value="update('generaCertificadoVehiculo', $event)" />
        <template v-if="modelValue.generaCertificadoVehiculo">
          <BaseInput :model-value="modelValue.vigenciaCertificadoVehiculoMeses?.toString() ?? ''" name="site-vehicle-months" label="Vigencia en meses" type="number" min="1" step="1" required :error="error('vigenciaCertificadoVehiculoMeses')" @update:model-value="update('vigenciaCertificadoVehiculoMeses', $event ? Number($event) : null)" @blur="touched.vigenciaCertificadoVehiculoMeses = true" />
        </template>
      </div>
    </section>
  </form>
</template>

<style scoped>
.site-form, .site-form section { display: grid; gap: 1rem; }
.site-form section + section { border-top: 1px solid var(--border); padding-top: 1.25rem; }
.site-form header h3, .site-form header p { margin: 0; }
.site-form header h3 { font-size: 0.95rem; }
.site-form header p, .current-file { color: var(--text-secondary); font-size: 0.82rem; overflow-wrap: anywhere; }
.certificate-reference { margin: 0; color: var(--text-secondary); font-size: 0.88rem; }
.current-plan, .current-plan span { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; }.current-plan p { margin: 0; }
.site-form__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
@media (max-width: 680px) { .site-form__grid { grid-template-columns: 1fr; } }
</style>
