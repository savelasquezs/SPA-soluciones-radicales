<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Archive, Pencil, Plus, RotateCcw } from 'lucide-vue-next'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/base/BaseDialog.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'
import EmptyState from '@/components/base/EmptyState.vue'
import ErrorState from '@/components/base/ErrorState.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import ResponsiveTable from '@/components/base/ResponsiveTable.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import AreaTemplateForm from '@/components/domain/clients/AreaTemplateForm.vue'
import { ApiClientError } from '@/services/apiService'
import { createAreaTemplate, listAreaTemplates, updateAreaTemplate } from '@/services/areaTemplatesService'
import { useClientsStore } from '@/stores/clients'
import { useNotificationsStore } from '@/stores/notifications'
import type { AreaTemplateInput, AreaTemplateRecord } from '@/types/domain'

const store = useClientsStore()
const notifications = useNotificationsStore()
const templates = ref<AreaTemplateRecord[]>([])
const loading = ref(true)
const loadingError = ref('')
const saving = ref(false)
const search = ref('')
const active = ref(true)
const editorOpen = ref(false)
const editorKey = ref(0)
const editing = ref<AreaTemplateRecord | null>(null)
const draft = ref<AreaTemplateInput>(blank())
const actionTarget = ref<AreaTemplateRecord | null>(null)
const clients = computed(() => [...store.activeClients, ...store.inactiveClients]
  .filter(client => client.tipoCliente === 'NEGOCIO')
  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
const visible = computed(() => templates.value
  .filter(item => item.activo === active.value)
  .filter(item => [item.nombre, item.clientName ?? ''].join(' ').toLocaleLowerCase('es-CO')
    .includes(search.value.trim().toLocaleLowerCase('es-CO'))))
const title = computed(() => editing.value ? 'Editar plantilla' : 'Nueva plantilla')

onMounted(load)

function blank(): AreaTemplateInput {
  return { nombre: '', alcance: 'GLOBAL', clientId: null, areas: [{ nombre: '', esExterna: false }], activo: true }
}
function toInput(record: AreaTemplateRecord): AreaTemplateInput {
  return { nombre: record.nombre, alcance: record.alcance, clientId: record.clientId,
    areas: record.areas.map(area => ({ ...area })), activo: record.activo, version: record.version }
}
async function load(): Promise<void> {
  loading.value = true
  loadingError.value = ''
  try {
    const [data] = await Promise.all([listAreaTemplates(), store.loadClients(true), store.loadClients(false)])
    templates.value = data
  } catch (error) {
    loadingError.value = error instanceof Error ? error.message : 'No fue posible cargar las plantillas.'
  } finally { loading.value = false }
}
function upsert(record: AreaTemplateRecord): void {
  templates.value = [...templates.value.filter(row => row.id !== record.id), record]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}
function openEditor(record: AreaTemplateRecord | null = null): void {
  editorKey.value += 1
  editing.value = record
  draft.value = record ? toInput(record) : blank()
  editorOpen.value = true
}
async function save(): Promise<void> {
  if (saving.value) return
  saving.value = true
  try {
    const record = editing.value
      ? await updateAreaTemplate(editing.value.id, draft.value)
      : await createAreaTemplate(draft.value)
    upsert(record)
    editorOpen.value = false
    notifications.show(editing.value ? 'Plantilla actualizada.' : 'Plantilla creada.', 'success')
  } catch (error) {
    if (error instanceof ApiClientError && error.code === 'VERSION_CONFLICT') {
      void listAreaTemplates().then(data => { templates.value = data }).catch(() => undefined)
    }
    notifications.show(error instanceof Error ? error.message : 'No fue posible guardar la plantilla.', 'error')
  } finally { saving.value = false }
}
async function toggle(): Promise<void> {
  const record = actionTarget.value
  if (!record || saving.value) return
  saving.value = true
  try {
    upsert(await updateAreaTemplate(record.id, { ...toInput(record), activo: !record.activo }))
    notifications.show(record.activo ? 'Plantilla desactivada.' : 'Plantilla reactivada.', 'success')
    actionTarget.value = null
  } catch (error) {
    notifications.show(error instanceof Error ? error.message : 'No fue posible cambiar el estado.', 'error')
    if (error instanceof ApiClientError && error.code === 'VERSION_CONFLICT') {
      void listAreaTemplates().then(data => { templates.value = data }).catch(() => undefined)
    }
  } finally { saving.value = false }
}
</script>

<template>
  <section class="area-templates">
    <header class="area-templates__header">
      <div><h1>Plantillas de áreas</h1><p>Conjuntos reutilizables para crear áreas en sedes de negocio.</p></div>
      <BaseButton size="compact" @click="openEditor()"><Plus :size="16" />Nueva plantilla</BaseButton>
    </header>
    <div class="area-templates__filters">
      <div class="area-templates__tabs" role="group" aria-label="Estado de plantillas">
        <button type="button" :aria-pressed="active" @click="active = true">Activas</button>
        <button type="button" :aria-pressed="!active" @click="active = false">Inactivas</button>
      </div>
      <div class="area-templates__search"><BaseInput v-model="search" name="search-area-templates" label="Buscar" placeholder="Plantilla o cliente" /></div>
    </div>
    <LoadingSkeleton v-if="loading" label="Cargando plantillas" :lines="5" />
    <ErrorState v-else-if="loadingError" title="No pudimos cargar las plantillas" :message="loadingError"><BaseButton size="compact" @click="load">Reintentar</BaseButton></ErrorState>
    <EmptyState v-else-if="!visible.length" title="Sin plantillas" message="No hay plantillas para estos filtros. Puedes crear una nueva." />
    <ResponsiveTable v-else>
      <template #table>
        <div class="area-templates__table-wrap">
          <table class="area-templates__table">
            <thead><tr><th>Plantilla</th><th>Alcance</th><th>Áreas</th><th>Estado</th><th class="area-templates__actions">Acciones</th></tr></thead>
            <tbody>
              <tr v-for="record in visible" :key="record.id">
                <td><button class="area-templates__name" @click="openEditor(record)">{{ record.nombre }}</button></td>
                <td>{{ record.alcance === 'GLOBAL' ? 'Global' : record.clientName ?? 'Cliente privado' }}</td>
                <td>{{ record.areas.length }} · {{ record.areas.filter(area => area.esExterna).length }} exteriores</td>
                <td><StatusBadge :tone="record.activo ? 'success' : 'neutral'">{{ record.activo ? 'Activa' : 'Inactiva' }}</StatusBadge></td>
                <td class="area-templates__actions">
                  <BaseIconButton :label="'Editar ' + record.nombre" size="small" @click="openEditor(record)"><Pencil :size="16" /></BaseIconButton>
                  <BaseIconButton :label="(record.activo ? 'Desactivar ' : 'Reactivar ') + record.nombre" size="small"
                    @click="actionTarget = record">
                    <Archive v-if="record.activo" :size="16" /><RotateCcw v-else :size="16" />
                  </BaseIconButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <template #cards>
        <article v-for="record in visible" :key="record.id" class="area-templates__card">
          <div><button class="area-templates__name" @click="openEditor(record)">{{ record.nombre }}</button><StatusBadge :tone="record.activo ? 'success' : 'neutral'">{{ record.activo ? 'Activa' : 'Inactiva' }}</StatusBadge></div>
          <small>{{ record.alcance === 'GLOBAL' ? 'Global' : record.clientName ?? 'Privada' }} · {{ record.areas.length }} áreas</small>
          <div class="area-templates__card-actions">
            <BaseButton size="compact" variant="secondary" @click="openEditor(record)">Editar</BaseButton>
            <BaseButton size="compact" variant="ghost" @click="actionTarget = record">{{ record.activo ? 'Desactivar' : 'Reactivar' }}</BaseButton>
          </div>
        </article>
      </template>
    </ResponsiveTable>

    <BaseDialog :model-value="editorOpen" :title="title" :close-on-escape="!saving" @update:model-value="!saving && (editorOpen = $event)">
      <AreaTemplateForm :key="editorKey" v-model="draft" :clients="clients" :saving="saving"
        @submit="save" @invalid="notifications.show('Revisa los nombres, el cliente y las áreas.', 'error')" />
      <template #footer>
        <BaseButton variant="secondary" :disabled="saving" @click="editorOpen = false">Cancelar</BaseButton>
        <BaseButton type="submit" form="area-template-form" :loading="saving">{{ editing ? 'Guardar cambios' : 'Crear plantilla' }}</BaseButton>
      </template>
    </BaseDialog>
    <ConfirmDialog :open="Boolean(actionTarget)" :title="actionTarget?.activo ? 'Desactivar plantilla' : 'Reactivar plantilla'"
      :message="actionTarget?.activo ? 'La plantilla dejará de estar disponible para nuevas sedes. Las áreas existentes no cambian.' : 'La plantilla volverá a estar disponible para su selección.'"
      :confirm-label="actionTarget?.activo ? 'Desactivar' : 'Reactivar'" :loading="saving"
      @cancel="actionTarget = null" @confirm="toggle" />
  </section>
</template>

<style scoped>
.area-templates { display:grid; gap:0.75rem; min-width:0; }
.area-templates__header, .area-templates__filters { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.65rem; }
.area-templates__header h1 { font-size:1.5rem; margin:0; }
.area-templates__header p { font-size:0.83rem; color:var(--text-secondary); margin:0.2rem 0 0; }
.area-templates__filters { border-bottom:1px solid var(--border); padding-bottom:0.45rem; }
.area-templates__tabs { display:flex; gap:0.2rem; }
.area-templates__tabs button { border:0; border-bottom:2px solid transparent; background:transparent; padding:0.45rem 0.7rem; color:var(--text-secondary); cursor:pointer; }
.area-templates__tabs button[aria-pressed='true'] { border-color:var(--accent); color:var(--text); }
.area-templates__search { width:min(17rem,100%); }
.area-templates__search :deep(input) { min-height:36px; padding:0.45rem 0.6rem; }
.area-templates__table-wrap { max-height:min(68vh,42rem); overflow:auto; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); }
.area-templates__table { width:100%; border-collapse:collapse; text-align:left; }
.area-templates__table th, .area-templates__table td { padding:0.52rem 0.7rem; border-bottom:1px solid var(--border); font-size:0.86rem; }
.area-templates__table th { position:sticky; top:0; background:var(--surface); font-size:0.75rem; color:var(--text-secondary); }
.area-templates__table .area-templates__actions { text-align:right; white-space:nowrap; }
.area-templates__name { border:0; padding:0; background:transparent; color:var(--text); font-weight:600; text-align:left; cursor:pointer; }
.area-templates__name:hover, .area-templates__name:focus-visible { text-decoration:underline; text-underline-offset:3px; }
.area-templates__card { display:grid; gap:0.45rem; padding:0.75rem; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); }
.area-templates__card > div:first-child { display:flex; justify-content:space-between; gap:0.5rem; }
.area-templates__card small { color:var(--text-secondary); }
.area-templates__card-actions { display:flex; flex-wrap:wrap; gap:0.35rem; }
@media (max-width:760px) { .area-templates__header h1 { font-size:1.3rem; } .area-templates__search { flex:1; } }
</style>
