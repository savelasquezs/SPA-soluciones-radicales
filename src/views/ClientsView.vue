<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Pencil, RotateCcw, Trash2 } from 'lucide-vue-next'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/base/BaseDialog.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'
import EmptyState from '@/components/base/EmptyState.vue'
import ErrorState from '@/components/base/ErrorState.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import ResponsiveTable from '@/components/base/ResponsiveTable.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import ClientForm from '@/components/domain/clients/ClientForm.vue'
import { ApiClientError } from '@/services/apiService'
import { getClient } from '@/services/clientsService'
import { useClientsStore } from '@/stores/clients'
import { useNotificationsStore } from '@/stores/notifications'
import type { ClientInput, ClientRecord, ClientType } from '@/types/domain'
import { formatPhone } from '@/helpers/clients'

type Tab = 'active' | 'inactive'

const store = useClientsStore()
const notifications = useNotificationsStore()
const router = useRouter()
const tab = ref<Tab>('active')
const loading = reactive({ active: true, inactive: false })
const loadError = reactive<{ active: string | null; inactive: string | null }>({ active: null, inactive: null })
const search = ref('')
const typeFilter = ref<'ALL' | ClientType>('ALL')
const formOpen = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const editingId = ref<string | null>(null)
const saving = ref(false)
const deleteTarget = ref<ClientRecord | null>(null)
const dependencyTarget = ref<ClientRecord | null>(null)

const blankClient = (): ClientInput => ({
  tipoCliente: 'NEGOCIO',
  nombre: '',
  nit: null,
  correos: [],
  activo: true,
  vigenciaCertificadoMeses: 12,
  plantillaCertificadoStoragePath: null,
  residenciaDireccion: null,
  residenciaCelular: null,
})
const form = ref<ClientInput>(blankClient())
const currentClients = computed(() => tab.value === 'active' ? store.activeClients : store.inactiveClients)
const filteredClients = computed(() => {
  const term = search.value.trim().toLocaleLowerCase('es-CO')
  return currentClients.value.filter((client) => {
    if (typeFilter.value !== 'ALL' && client.tipoCliente !== typeFilter.value) return false
    if (!term) return true
    return [client.nombre, client.nit ?? '', client.residenciaCelular ?? '']
      .some((value) => value.toLocaleLowerCase('es-CO').includes(term.replace(/[\s-]/g, ''))
        || value.toLocaleLowerCase('es-CO').includes(term))
  })
})

onMounted(() => loadTab('active'))

async function loadTab(target: Tab, force = false): Promise<void> {
  tab.value = target
  loading[target] = true
  loadError[target] = null
  try {
    await store.loadClients(target === 'active', force)
  } catch (error) {
    loadError[target] = message(error, 'No fue posible cargar los clientes')
  } finally {
    loading[target] = false
  }
}

function openCreate(): void {
  formMode.value = 'create'
  editingId.value = null
  form.value = blankClient()
  formOpen.value = true
}

function openEdit(client: ClientRecord): void {
  formMode.value = 'edit'
  editingId.value = client.id
  form.value = toInput(client)
  formOpen.value = true
}

async function save(): Promise<void> {
  if (saving.value) return
  saving.value = true
  try {
    const saved = formMode.value === 'create'
      ? await store.createClient(form.value)
      : await store.updateClient(editingId.value!, form.value)
    formOpen.value = false
    notifications.show(formMode.value === 'create' ? 'Cliente creado correctamente.' : 'Cliente actualizado correctamente.', 'success')
    if (formMode.value === 'create' && saved.tipoCliente === 'RESIDENCIAL') tab.value = 'active'
  } catch (error) {
    if (error instanceof ApiClientError && error.code === 'VERSION_CONFLICT' && editingId.value) {
      store.upsertClient(await getClient(editingId.value))
    }
    notifications.show(message(error, 'No fue posible guardar el Cliente'), 'error')
  } finally {
    saving.value = false
  }
}

async function removeClient(): Promise<void> {
  const client = deleteTarget.value
  if (!client || saving.value) return
  saving.value = true
  try {
    await store.removeClient(client.id, client.version)
    deleteTarget.value = null
    notifications.show('Cliente eliminado correctamente.', 'success')
  } catch (error) {
    deleteTarget.value = null
    if (error instanceof ApiClientError && error.code === 'DEPENDENCIES') dependencyTarget.value = client
    else notifications.show(message(error, 'No fue posible eliminar el Cliente'), 'error')
  } finally {
    saving.value = false
  }
}

async function setActive(client: ClientRecord, active: boolean): Promise<void> {
  saving.value = true
  try {
    await store.updateClient(client.id, { ...toInput(client), activo: active })
    dependencyTarget.value = null
    notifications.show(active ? 'Cliente reactivado correctamente.' : 'Cliente desactivado sin borrar su historial.', 'success')
  } catch (error) {
    notifications.show(message(error, `No fue posible ${active ? 'reactivar' : 'desactivar'} el Cliente`), 'error')
  } finally {
    saving.value = false
  }
}

function toInput(client: ClientRecord): ClientInput {
  return {
    tipoCliente: client.tipoCliente,
    nombre: client.nombre,
    nit: client.nit,
    correos: [...client.correos],
    activo: client.activo,
    vigenciaCertificadoMeses: client.vigenciaCertificadoMeses,
    plantillaCertificadoStoragePath: client.plantillaCertificadoStoragePath,
    residenciaDireccion: client.residenciaDireccion,
    residenciaCelular: client.residenciaCelular,
    version: client.version,
  }
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
</script>

<template>
  <div class="clients-page">
    <header class="clients-header">
      <div><h1>Clientes</h1><p>Negocios y casas atendidos por Soluciones Radicales.</p></div>
      <BaseButton @click="openCreate">Nuevo cliente</BaseButton>
    </header>

    <div class="tabs" role="tablist" aria-label="Estado de Clientes">
      <button role="tab" :aria-selected="tab === 'active'" @click="loadTab('active')">Activos</button>
      <button role="tab" :aria-selected="tab === 'inactive'" @click="loadTab('inactive')">Inactivos</button>
    </div>

    <div class="filters">
      <BaseInput v-model="search" name="client-search" label="Buscar cliente" type="search" placeholder="Nombre, NIT o celular" />
      <BaseSelect v-model="typeFilter" name="client-type-filter" label="Tipo">
        <option value="ALL">Todos</option><option value="NEGOCIO">Negocio</option><option value="RESIDENCIAL">Casa</option>
      </BaseSelect>
    </div>

    <LoadingSkeleton v-if="loading[tab]" label="Cargando clientes" :lines="5" />
    <ErrorState v-else-if="loadError[tab]" title="No pudimos cargar los clientes" :message="loadError[tab] ?? ''">
      <BaseButton variant="secondary" @click="loadTab(tab, true)">Reintentar</BaseButton>
    </ErrorState>
    <EmptyState v-else-if="filteredClients.length === 0" title="No hay clientes para mostrar" message="Ajusta los filtros o crea un nuevo Cliente." />
    <ResponsiveTable v-else>
      <template #table>
        <table class="clients-table">
          <thead><tr><th>Cliente</th><th>Tipo</th><th>Identificación / celular</th><th>Sedes</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            <tr v-for="client in filteredClients" :key="client.id">
              <td><button class="client-link" @click="router.push(`/clientes/${client.id}`)">{{ client.nombre }}</button></td>
              <td><StatusBadge tone="info">{{ client.tipoCliente === 'NEGOCIO' ? 'Negocio' : 'Casa' }}</StatusBadge></td>
              <td>{{ client.tipoCliente === 'NEGOCIO' ? client.nit : formatPhone(client.residenciaCelular) }}</td>
              <td>{{ client.tipoCliente === 'NEGOCIO' ? client.sedesCount : '—' }}</td>
              <td><StatusBadge :tone="client.activo ? 'success' : 'neutral'" :icon="client.activo ? 'check' : 'x'">{{ client.activo ? 'Activo' : 'Inactivo' }}</StatusBadge></td>
              <td><span class="actions"><BaseIconButton :label="`Editar ${client.nombre}`" @click="openEdit(client)"><Pencil :size="18" /></BaseIconButton><BaseIconButton v-if="client.activo" :label="`Eliminar o desactivar ${client.nombre}`" @click="deleteTarget = client"><Trash2 :size="18" /></BaseIconButton><BaseIconButton v-else :label="`Reactivar ${client.nombre}`" @click="setActive(client, true)"><RotateCcw :size="18" /></BaseIconButton></span></td>
            </tr>
          </tbody>
        </table>
      </template>
      <template #cards>
        <article v-for="client in filteredClients" :key="client.id" class="client-card">
          <button class="client-link" @click="router.push(`/clientes/${client.id}`)">{{ client.nombre }}</button>
          <span><StatusBadge tone="info">{{ client.tipoCliente === 'NEGOCIO' ? 'Negocio' : 'Casa' }}</StatusBadge><StatusBadge :tone="client.activo ? 'success' : 'neutral'">{{ client.activo ? 'Activo' : 'Inactivo' }}</StatusBadge></span>
          <p>{{ client.tipoCliente === 'NEGOCIO' ? client.nit : formatPhone(client.residenciaCelular) }}</p>
          <div class="card-actions"><BaseButton variant="secondary" @click="openEdit(client)">Editar</BaseButton><BaseButton v-if="client.activo" variant="danger" @click="deleteTarget = client">Eliminar / desactivar</BaseButton><BaseButton v-else variant="secondary" @click="setActive(client, true)">Reactivar</BaseButton></div>
        </article>
      </template>
    </ResponsiveTable>

    <BaseDialog :model-value="formOpen" :title="formMode === 'create' ? 'Nuevo cliente' : 'Editar cliente'" @update:model-value="formOpen = $event">
      <ClientForm v-model="form" :mode="formMode" :saving="saving" @submit="save" @invalid="notifications.show('Revisa los campos marcados antes de guardar.', 'error')" @file-selected="notifications.show('La carga de plantillas requiere el backend autorizado de R2.', 'warning')" />
      <template #footer><BaseButton variant="secondary" :disabled="saving" @click="formOpen = false">Cancelar</BaseButton><BaseButton type="submit" form="client-form" :loading="saving">{{ formMode === 'create' ? 'Crear cliente' : 'Guardar cambios' }}</BaseButton></template>
    </BaseDialog>

    <ConfirmDialog :open="Boolean(deleteTarget)" title="Eliminar cliente" :message="`Se eliminará ${deleteTarget?.nombre ?? 'el Cliente'} si no tiene historial ni dependencias.`" confirm-label="Eliminar" danger :loading="saving" @cancel="deleteTarget = null" @confirm="removeClient" />
    <ConfirmDialog :open="Boolean(dependencyTarget)" title="Desactivar cliente" :message="`${dependencyTarget?.nombre ?? 'El Cliente'} tiene historial o dependencias. Se conservará toda la información y pasará a Inactivos.`" confirm-label="Desactivar" danger :loading="saving" @cancel="dependencyTarget = null" @confirm="dependencyTarget && setActive(dependencyTarget, false)" />
  </div>
</template>

<style scoped>
.clients-page { display: grid; gap: 1.25rem; }
.clients-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; }
.clients-header h1, .clients-header p { margin: 0; }
.clients-header p { color: var(--text-secondary); }
.tabs { display: flex; gap: 0.25rem; border-bottom: 1px solid var(--border); }
.tabs button { min-height: 44px; border: 0; border-bottom: 2px solid transparent; background: transparent; padding: 0.65rem 1rem; color: var(--text-secondary); }
.tabs button[aria-selected='true'] { border-color: var(--accent); color: var(--accent); }
.filters { display: grid; grid-template-columns: minmax(0, 1fr) minmax(10rem, 14rem); gap: 1rem; }
.clients-table { border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); border-spacing: 0; border-collapse: separate; overflow: hidden; }
.client-link { border: 0; background: transparent; padding: 0; color: var(--accent); font-weight: 600; text-align: left; cursor: pointer; }
.actions, .client-card > span, .card-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.client-card { display: grid; gap: 0.75rem; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); padding: 1rem; }
.client-card p { margin: 0; color: var(--text-secondary); }
@media (max-width: 680px) { .clients-header { align-items: stretch; flex-direction: column; } .filters { grid-template-columns: 1fr; } }
</style>
