<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AreaForm from '@/components/domain/clients/AreaForm.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/base/BaseDialog.vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { useTechnicianServicesStore } from '@/stores/technicianServices'
import type { AreaInput } from '@/types/domain'
import type { TechnicianSiteAreaCreationMutation } from '@/types/technicianServices'

const props = defineProps<{ open: boolean; serviceId: string }>()
const emit = defineEmits<{ close: []; created: [serviceAreaId: string] }>()
const services = useTechnicianServicesStore()
const notifications = useNotificationsStore()
const saving = ref(false)
const discardOpen = ref(false)
const error = ref('')
const form = ref<AreaInput>({ nombre: '', esExterna: false, activo: true })
const conflict = computed(() => services.currentMutations.find(
  (item): item is TechnicianSiteAreaCreationMutation =>
    item.kind === 'AREA_CREATE' && item.status === 'CONFLICT',
) ?? null)

function loadForm(): void {
  error.value = ''
  form.value = conflict.value
    ? { nombre: conflict.value.nombre, esExterna: conflict.value.esExterna, activo: true }
    : { nombre: '', esExterna: false, activo: true }
}
watch(() => props.open, open => { if (open) loadForm() }, { immediate: true })
watch(conflict, value => { if (props.open && value) loadForm() })

async function save(): Promise<void> {
  if (saving.value) return
  saving.value = true
  error.value = ''
  try {
    const areaId = conflict.value?.serviceAreaId
    const result = areaId
      ? { serviceAreaId: areaId, status: await services.retrySiteAreaCreationConflict(
        props.serviceId, areaId, form.value.nombre) }
      : await services.applySiteAreaCreation(props.serviceId,
        { nombre: form.value.nombre, esExterna: form.value.esExterna })
    const pending = services.currentMutations.find(item =>
      item.kind === 'AREA_CREATE' && item.serviceAreaId === result.serviceAreaId)
    if (pending?.status === 'CONFLICT') {
      error.value = pending.error || 'No fue posible registrar el Área. Revisa el nombre o descarta el alta.'
      return
    }
    notifications.show(pending
      ? 'Área guardada en este celular. Quedará registrada en la Sede al sincronizar.'
      : 'Área registrada en la Sede y lista para recorrer.', pending ? 'info' : 'success')
    emit('created', result.serviceAreaId)
    emit('close')
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'No fue posible registrar el Área.'
  } finally {
    saving.value = false
  }
}

async function discard(): Promise<void> {
  if (!conflict.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    await services.discardSiteAreaCreationConflict(props.serviceId, conflict.value.serviceAreaId)
    discardOpen.value = false
    notifications.show('Alta local descartada. La Sede no se modificó.', 'info')
    emit('close')
  } catch (failure) {
    discardOpen.value = false
    error.value = failure instanceof Error ? failure.message : 'No fue posible descartar el Área.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog :model-value="open" :title="conflict ? 'Corregir Área pendiente' : 'Nueva Área de la Sede'"
    size="compact" :description="conflict
      ? 'No se pudo sincronizar. Puedes corregir el nombre o descartar esta alta local.'
      : 'El Área quedará disponible en esta Sede para las próximas visitas.'"
    @update:model-value="!$event && emit('close')">
    <AreaForm v-model="form" mode="create" form-id="technician-site-area-form"
      id-prefix="technician-site-area" :type-disabled="Boolean(conflict)" @submit="save" />
    <StatusPanel v-if="error || conflict?.error" compact title="Revisa el registro"
      :message="error || conflict?.error || ''" tone="warning" />
    <template #footer>
      <BaseButton variant="secondary" :disabled="saving" @click="emit('close')">Cancelar</BaseButton>
      <BaseButton v-if="conflict" variant="danger" :disabled="saving" @click="discardOpen=true">Descartar alta</BaseButton>
      <BaseButton type="submit" form="technician-site-area-form" :loading="saving">
        {{ conflict ? 'Reintentar alta' : 'Crear Área' }}
      </BaseButton>
    </template>
  </BaseDialog>
  <ConfirmDialog :open="discardOpen" title="Descartar Área pendiente"
    message="Se eliminará el Área de este celular y también las evaluaciones y evidencias locales relacionadas que aún no se hayan sincronizado. ¿Continuar?"
    confirm-label="Descartar Área" danger :loading="saving"
    @cancel="discardOpen=false" @confirm="discard" />
</template>
