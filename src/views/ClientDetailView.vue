<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Mail, Map, MessageCircle, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-vue-next'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/base/BaseDialog.vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'
import EmptyState from '@/components/base/EmptyState.vue'
import ErrorState from '@/components/base/ErrorState.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import ClientForm from '@/components/domain/clients/ClientForm.vue'
import SiteForm from '@/components/domain/clients/SiteForm.vue'
import { formatPhone } from '@/helpers/clients'
import { ApiClientError } from '@/services/apiService'
import { getClient, getSite, listClientHistory, listFormOptions } from '@/services/clientsService'
import { deleteMasterFile, getMasterFileUrl, uploadMasterFile } from '@/services/filesService'
import { useClientsStore } from '@/stores/clients'
import { useNotificationsStore } from '@/stores/notifications'
import type { ClientInput, ClientRecord, FormOption, ServiceHistoryItem, SiteInput, SiteRecord } from '@/types/domain'

const route = useRoute()
const router = useRouter()
const store = useClientsStore()
const notifications = useNotificationsStore()
const clientId = computed(() => String(route.params.id))
const client = computed(() => store.clientsById[clientId.value] ?? null)
const sites = computed(() => store.sitesForClient(clientId.value))
const loading = ref(true)
const loadError = ref<string | null>(null)
const tab = ref<'sites' | 'history'>('sites')
const history = ref<ServiceHistoryItem[]>([])
const historyPage = ref(1)
const historyTotal = ref(0)
const historyLoading = ref(false)
const forms = ref<FormOption[]>([])
const clientFormOpen = ref(false)
const siteFormOpen = ref(false)
const siteFormMode = ref<'create' | 'edit'>('create')
const editingSiteId = ref<string | null>(null)
const saving = ref(false)
const deleteSiteTarget = ref<SiteRecord | null>(null)
const dependencySiteTarget = ref<SiteRecord | null>(null)
const deleteClientTarget = ref(false)
const dependencyClientTarget = ref(false)
const clientForm = ref<ClientInput>(blankClient())
const siteForm = ref<SiteInput>(blankSite())
const clientTemplateFile = ref<File | null>(null)
const sitePlanFile = ref<File | null>(null)
const siteVehicleTemplateFile = ref<File | null>(null)

onMounted(load)

async function load(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    const loaded = await store.ensureClient(clientId.value)
    if (loaded.tipoCliente === 'NEGOCIO') {
      await Promise.all([store.loadSites(loaded.id), loadForms()])
    } else {
      tab.value = 'history'
      await loadHistory()
    }
  } catch (error) {
    loadError.value = message(error, 'No fue posible cargar el Cliente')
  } finally {
    loading.value = false
  }
}

async function loadForms(): Promise<void> {
  if (!forms.value.length) forms.value = await listFormOptions()
}

async function changeTab(next: 'sites' | 'history'): Promise<void> {
  tab.value = next
  if (next === 'history' && !history.value.length) await loadHistory()
}

async function loadHistory(page = 1): Promise<void> {
  historyLoading.value = true
  try {
    const result = await listClientHistory(clientId.value, page)
    history.value = result.items
    historyPage.value = result.page
    historyTotal.value = result.total
  } catch (error) {
    notifications.show(message(error, 'No fue posible cargar el historial'), 'error')
  } finally {
    historyLoading.value = false
  }
}

function openClientEdit(): void {
  if (!client.value) return
  clientForm.value = toClientInput(client.value)
  clientTemplateFile.value = null
  clientFormOpen.value = true
}

function openSiteCreate(): void {
  siteFormMode.value = 'create'
  editingSiteId.value = null
  siteForm.value = blankSite()
  sitePlanFile.value = null
  siteVehicleTemplateFile.value = null
  siteFormOpen.value = true
}

function openSiteEdit(site: SiteRecord): void {
  siteFormMode.value = 'edit'
  editingSiteId.value = site.id
  siteForm.value = toSiteInput(site)
  sitePlanFile.value = null
  siteVehicleTemplateFile.value = null
  siteFormOpen.value = true
}

async function saveClient(): Promise<void> {
  const current = client.value
  if (!current || saving.value) return
  saving.value = true
  let uploadedPath: string | null = null
  try {
    let input = { ...clientForm.value }
    if (input.tipoCliente === 'NEGOCIO' && clientTemplateFile.value) {
      uploadedPath = await uploadMasterFile('CLIENT_ESTABLISHMENT_TEMPLATE', clientTemplateFile.value)
      input = { ...input, plantillaCertificadoStoragePath: uploadedPath }
    }
    const saved = await store.updateClient(current.id, input)
    clientFormOpen.value = false
    clientTemplateFile.value = null
    if (current.plantillaCertificadoStoragePath && current.plantillaCertificadoStoragePath !== saved.plantillaCertificadoStoragePath) {
      void deleteMasterFile(current.plantillaCertificadoStoragePath).catch(() =>
        notifications.show('El Cliente se guardó, pero no fue posible limpiar la plantilla anterior.', 'warning'))
    }
    notifications.show('Cliente actualizado correctamente.', 'success')
  } catch (error) {
    if (uploadedPath) await deleteMasterFile(uploadedPath).catch(() => undefined)
    if (error instanceof ApiClientError && error.code === 'VERSION_CONFLICT') store.upsertClient(await getClient(current.id))
    notifications.show(message(error, 'No fue posible actualizar el Cliente'), 'error')
  } finally {
    saving.value = false
  }
}

async function saveSite(): Promise<void> {
  if (saving.value) return
  saving.value = true
  const previous = editingSiteId.value ? store.sitesById[editingSiteId.value] ?? null : null
  const uploadedPaths: string[] = []
  try {
    let input = { ...siteForm.value }
    if (sitePlanFile.value) {
      const path = await uploadMasterFile('SITE_PLAN', sitePlanFile.value)
      uploadedPaths.push(path)
      input = { ...input, planoStoragePath: path }
    }
    if (input.generaCertificadoVehiculo && siteVehicleTemplateFile.value) {
      const path = await uploadMasterFile('SITE_VEHICLE_TEMPLATE', siteVehicleTemplateFile.value)
      uploadedPaths.push(path)
      input = { ...input, plantillaCertificadoVehiculoStoragePath: path }
    }
    const saved = siteFormMode.value === 'create'
      ? await store.createSite(clientId.value, input)
      : await store.updateSite(editingSiteId.value!, input)
    siteFormOpen.value = false
    sitePlanFile.value = null
    siteVehicleTemplateFile.value = null
    for (const oldPath of [previous?.planoStoragePath, previous?.plantillaCertificadoVehiculoStoragePath]) {
      if (oldPath && oldPath !== saved.planoStoragePath && oldPath !== saved.plantillaCertificadoVehiculoStoragePath) {
        void deleteMasterFile(oldPath).catch(() =>
          notifications.show('La Sede se guardó, pero no fue posible limpiar un archivo anterior.', 'warning'))
      }
    }
    notifications.show(siteFormMode.value === 'create' ? 'Sede creada correctamente.' : 'Sede actualizada correctamente.', 'success')
  } catch (error) {
    await Promise.all(uploadedPaths.map((path) => deleteMasterFile(path).catch(() => undefined)))
    if (error instanceof ApiClientError && error.code === 'VERSION_CONFLICT' && editingSiteId.value) {
      store.upsertSite(await getSite(editingSiteId.value))
    }
    notifications.show(message(error, 'No fue posible guardar la Sede'), 'error')
  } finally {
    saving.value = false
  }
}

async function removeSite(): Promise<void> {
  const site = deleteSiteTarget.value
  if (!site) return
  saving.value = true
  try {
    await store.removeSite(site)
    deleteSiteTarget.value = null
    notifications.show('Sede eliminada correctamente.', 'success')
  } catch (error) {
    deleteSiteTarget.value = null
    if (error instanceof ApiClientError && error.code === 'DEPENDENCIES') dependencySiteTarget.value = site
    else notifications.show(message(error, 'No fue posible eliminar la Sede'), 'error')
  } finally {
    saving.value = false
  }
}

async function setSiteActive(site: SiteRecord, active: boolean): Promise<void> {
  saving.value = true
  try {
    await store.updateSite(site.id, { ...toSiteInput(site), activo: active })
    dependencySiteTarget.value = null
    notifications.show(active ? 'Sede reactivada.' : 'Sede desactivada sin borrar su historial.', 'success')
  } catch (error) {
    notifications.show(message(error, 'No fue posible actualizar la Sede'), 'error')
  } finally {
    saving.value = false
  }
}

async function removeClient(): Promise<void> {
  const current = client.value
  if (!current || saving.value) return
  saving.value = true
  try {
    await store.removeClient(current.id, current.version)
    deleteClientTarget.value = false
    notifications.show('Cliente eliminado correctamente.', 'success')
    await router.push('/clientes')
  } catch (error) {
    deleteClientTarget.value = false
    if (error instanceof ApiClientError && error.code === 'DEPENDENCIES') dependencyClientTarget.value = true
    else notifications.show(message(error, 'No fue posible eliminar el Cliente'), 'error')
  } finally {
    saving.value = false
  }
}

async function setClientActive(active: boolean): Promise<void> {
  const current = client.value
  if (!current || saving.value) return
  saving.value = true
  try {
    await store.updateClient(current.id, { ...toClientInput(current), activo: active })
    dependencyClientTarget.value = false
    notifications.show(active ? 'Cliente reactivado correctamente.' : 'Cliente desactivado sin borrar su historial.', 'success')
  } catch (error) {
    notifications.show(message(error, 'No fue posible actualizar el Cliente'), 'error')
  } finally {
    saving.value = false
  }
}

function selectSiteFile(kind: 'plan' | 'vehicle-template', file: File | null): void {
  if (kind === 'plan') sitePlanFile.value = file
  else siteVehicleTemplateFile.value = file
}

async function openPrivateFile(storagePath: string): Promise<void> {
  const popup = window.open('', '_blank')
  try {
    const url = await getMasterFileUrl(storagePath)
    if (popup) popup.location.href = url
    else window.location.href = url
  } catch (error) {
    popup?.close()
    notifications.show(message(error, 'No fue posible abrir el archivo privado'), 'error')
  }
}

function openPlan(storagePath: string | null): void {
  if (storagePath) void openPrivateFile(storagePath)
}

function blankClient(): ClientInput {
  return { tipoCliente: 'NEGOCIO', nombre: '', nit: null, correos: [], activo: true, vigenciaCertificadoMeses: 12, plantillaCertificadoStoragePath: null, residenciaDireccion: null, residenciaCelular: null }
}

function blankSite(): SiteInput {
  return { nombre: '', direccion: '', correos: [], heredaCorreosCliente: true, contactoPrincipalNombre: '', contactoPrincipalCorreo: null, contactoPrincipalCelular: '', valorServicio: 0, periodicidadMeses: 1, manejaRefuerzo: false, formulariosAplicablesIds: [], planoStoragePath: null, manejaVehiculos: false, generaCertificadoVehiculo: false, vigenciaCertificadoVehiculoMeses: null, plantillaCertificadoVehiculoStoragePath: null, duracionServicioMinutos: 120, activo: true }
}

function toClientInput(record: ClientRecord): ClientInput {
  return { tipoCliente: record.tipoCliente, nombre: record.nombre, nit: record.nit, correos: [...record.correos], activo: record.activo, vigenciaCertificadoMeses: record.vigenciaCertificadoMeses, plantillaCertificadoStoragePath: record.plantillaCertificadoStoragePath, residenciaDireccion: record.residenciaDireccion, residenciaCelular: record.residenciaCelular, version: record.version }
}

function toSiteInput(site: SiteRecord): SiteInput {
  return { nombre: site.nombre, direccion: site.direccion, correos: [...site.correos], heredaCorreosCliente: site.heredaCorreosCliente, contactoPrincipalNombre: site.contactoPrincipalNombre, contactoPrincipalCorreo: site.contactoPrincipalCorreo, contactoPrincipalCelular: site.contactoPrincipalCelular, valorServicio: site.valorServicio, periodicidadMeses: site.periodicidadMeses, manejaRefuerzo: site.manejaRefuerzo, formulariosAplicablesIds: [...site.formulariosAplicablesIds], planoStoragePath: site.planoStoragePath, manejaVehiculos: site.manejaVehiculos, generaCertificadoVehiculo: site.generaCertificadoVehiculo, vigenciaCertificadoVehiculoMeses: site.vigenciaCertificadoVehiculoMeses, plantillaCertificadoVehiculoStoragePath: site.plantillaCertificadoVehiculoStoragePath, duracionServicioMinutos: site.duracionServicioMinutos, activo: site.activo, version: site.version }
}

function message(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback }
function formatMoney(value: number): string { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value) }
function formatDate(value: string): string { return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(value)) }
</script>

<template>
  <LoadingSkeleton v-if="loading" label="Cargando Cliente" :lines="6" />
  <ErrorState v-else-if="loadError" title="No pudimos cargar el Cliente" :message="loadError"><BaseButton variant="secondary" @click="load">Reintentar</BaseButton></ErrorState>
  <div v-else-if="client" class="client-detail">
    <header class="detail-header">
      <div><button class="back" @click="router.push('/clientes')">← Clientes</button><h1>{{ client.nombre }}</h1><span><StatusBadge tone="info">{{ client.tipoCliente === 'NEGOCIO' ? 'Negocio' : 'Casa' }}</StatusBadge><StatusBadge :tone="client.activo ? 'success' : 'neutral'">{{ client.activo ? 'Activo' : 'Inactivo' }}</StatusBadge></span></div>
      <div class="header-actions"><a v-if="client.tipoCliente === 'RESIDENCIAL' && client.residenciaCelular" class="action-link" :href="`https://wa.me/${client.residenciaCelular.replace('+', '')}`" target="_blank" rel="noreferrer"><MessageCircle :size="17" />WhatsApp</a><BaseButton variant="secondary" @click="openClientEdit"><Pencil :size="17" />Editar cliente</BaseButton><BaseButton v-if="client.tipoCliente === 'NEGOCIO' && client.activo" @click="openSiteCreate"><Plus :size="17" />Agregar Sede</BaseButton><BaseButton v-if="client.activo" variant="danger" @click="deleteClientTarget = true"><Trash2 :size="17" />Eliminar / Desactivar</BaseButton><BaseButton v-else variant="secondary" @click="setClientActive(true)"><RotateCcw :size="17" />Reactivar</BaseButton></div>
    </header>

    <section class="summary-card">
      <template v-if="client.tipoCliente === 'NEGOCIO'"><div><span>NIT</span><strong>{{ client.nit }}</strong></div><div><span>Sedes</span><strong>{{ client.sedesCount }}</strong></div><div><span>Vigencia certificado</span><strong>{{ client.vigenciaCertificadoMeses }} meses</strong></div><div><span>Plantilla</span><strong>{{ client.plantillaCertificadoStoragePath?.split('/').slice(-1)[0] }}</strong></div></template>
      <template v-else><div><span>Celular</span><strong>{{ formatPhone(client.residenciaCelular) }}</strong></div><div><span>Dirección</span><strong>{{ client.residenciaDireccion }}</strong></div></template>
    </section>

    <div v-if="client.tipoCliente === 'NEGOCIO'" class="tabs" role="tablist"><button :aria-selected="tab === 'sites'" @click="changeTab('sites')">Sedes</button><button :aria-selected="tab === 'history'" @click="changeTab('history')">Historial de servicios</button></div>

    <section v-if="client.tipoCliente === 'NEGOCIO' && tab === 'sites'" class="sites-grid">
      <EmptyState v-if="sites.length === 0" title="Este Cliente aún no tiene Sedes" message="Agrega la primera Sede para configurar su operación."><BaseButton @click="openSiteCreate">Agregar Sede</BaseButton></EmptyState>
      <article v-for="site in sites" :key="site.id" class="site-card">
        <header><button @click="router.push(`/clientes/${client.id}/sedes/${site.id}`)">{{ site.nombre }}</button><StatusBadge :tone="site.activo ? 'success' : 'neutral'">{{ site.activo ? 'Activa' : 'Inactiva' }}</StatusBadge></header>
        <p>{{ site.direccion }}</p><dl><div><dt>Contacto</dt><dd>{{ site.contactoPrincipalNombre }} · {{ formatPhone(site.contactoPrincipalCelular) }}</dd></div><div><dt>Próximo servicio</dt><dd>{{ site.proximoServicio ? formatDate(site.proximoServicio) : 'Sin programar' }}</dd></div><div><dt>Áreas</dt><dd>{{ site.areasCount }}</dd></div><div><dt>Formularios</dt><dd>{{ site.formulariosCount }}</dd></div></dl>
        <div class="site-actions"><a v-if="site.contactoPrincipalCelular" :href="`https://wa.me/${site.contactoPrincipalCelular.replace('+', '')}`" target="_blank" rel="noreferrer" aria-label="Abrir WhatsApp"><MessageCircle :size="18" /></a><a v-if="site.contactoPrincipalCorreo" :href="`mailto:${site.contactoPrincipalCorreo}`" aria-label="Enviar correo"><Mail :size="18" /></a><BaseButton v-if="site.planoStoragePath" variant="ghost" @click="openPlan(site.planoStoragePath)"><Map :size="17" />Ver plano</BaseButton><BaseButton variant="secondary" @click="openSiteEdit(site)"><Pencil :size="17" />Editar</BaseButton><BaseButton v-if="site.activo" variant="ghost" @click="deleteSiteTarget = site"><Trash2 :size="17" />Eliminar</BaseButton><BaseButton v-else variant="ghost" @click="setSiteActive(site, true)"><RotateCcw :size="17" />Reactivar</BaseButton></div>
      </article>
    </section>

    <section v-else class="history-card">
      <LoadingSkeleton v-if="historyLoading" label="Cargando historial" :lines="5" />
      <EmptyState v-else-if="history.length === 0" title="Sin historial de servicios" message="Los Servicios aparecerán aquí cuando se programen." />
      <div v-else class="history-scroll"><table><thead><tr><th>Servicio</th><th>Fecha</th><th>Tipo</th><th>Técnico</th><th>Estado</th><th>Valor</th></tr></thead><tbody><tr v-for="item in history" :key="item.id"><td><button class="service-link" @click="router.push(`/servicios/${item.id}`)">{{ item.solicitud }}</button></td><td>{{ formatDate(item.fecha) }}</td><td>{{ item.tipo }}</td><td>{{ item.tecnico }}</td><td>{{ item.estado }}</td><td>{{ formatMoney(item.valor) }}</td></tr></tbody></table></div>
      <div v-if="historyTotal > 20" class="pagination"><BaseButton variant="secondary" :disabled="historyPage === 1" @click="loadHistory(historyPage - 1)">Anterior</BaseButton><span>Página {{ historyPage }}</span><BaseButton variant="secondary" :disabled="historyPage * 20 >= historyTotal" @click="loadHistory(historyPage + 1)">Siguiente</BaseButton></div>
    </section>

    <BaseDialog :model-value="clientFormOpen" title="Editar cliente" @update:model-value="clientFormOpen = $event"><ClientForm v-model="clientForm" mode="edit" @submit="saveClient" @invalid="notifications.show('Revisa los campos marcados.', 'error')" @file-selected="clientTemplateFile = $event" @view-template="clientForm.plantillaCertificadoStoragePath && openPrivateFile(clientForm.plantillaCertificadoStoragePath)" /><template #footer><BaseButton variant="secondary" @click="clientFormOpen = false">Cancelar</BaseButton><BaseButton type="submit" form="client-form" :loading="saving">Guardar cambios</BaseButton></template></BaseDialog>
    <BaseDialog :model-value="siteFormOpen" :title="siteFormMode === 'create' ? 'Crear Sede' : 'Editar Sede'" @update:model-value="siteFormOpen = $event"><SiteForm v-model="siteForm" :mode="siteFormMode" :form-options="forms" :client-name="client.nombre" @submit="saveSite" @invalid="notifications.show('Revisa los campos marcados.', 'error')" @file-selected="selectSiteFile" @view-plan="openPlan(siteForm.planoStoragePath)" @view-vehicle-template="siteForm.plantillaCertificadoVehiculoStoragePath && openPrivateFile(siteForm.plantillaCertificadoVehiculoStoragePath)" /><template #footer><BaseButton variant="secondary" @click="siteFormOpen = false">Cancelar</BaseButton><BaseButton type="submit" form="site-form" :loading="saving">{{ siteFormMode === 'create' ? 'Crear Sede' : 'Guardar cambios' }}</BaseButton></template></BaseDialog>
    <ConfirmDialog :open="deleteClientTarget" title="Eliminar cliente" :message="`Se eliminará ${client.nombre} si no tiene historial ni dependencias.`" confirm-label="Eliminar" danger :loading="saving" @cancel="deleteClientTarget = false" @confirm="removeClient" />
    <ConfirmDialog :open="dependencyClientTarget" title="Desactivar cliente" message="El Cliente tiene historial o dependencias. Se conservará toda la información y pasará a Inactivos." confirm-label="Desactivar" danger :loading="saving" @cancel="dependencyClientTarget = false" @confirm="setClientActive(false)" />
    <ConfirmDialog :open="Boolean(deleteSiteTarget)" title="Eliminar Sede" :message="`Se eliminará ${deleteSiteTarget?.nombre ?? 'la Sede'} si no tiene dependencias.`" confirm-label="Eliminar" danger :loading="saving" @cancel="deleteSiteTarget = null" @confirm="removeSite" />
    <ConfirmDialog :open="Boolean(dependencySiteTarget)" title="Desactivar Sede" message="La Sede tiene historial o dependencias. Se conservará la información y quedará inactiva." confirm-label="Desactivar" danger :loading="saving" @cancel="dependencySiteTarget = null" @confirm="dependencySiteTarget && setSiteActive(dependencySiteTarget, false)" />
  </div>
</template>

<style scoped>
.client-detail { display: grid; gap: 1.25rem; }
.detail-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; }
.detail-header h1 { margin: 0.25rem 0; }.detail-header > div > span, .header-actions, .site-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.back { border: 0; background: transparent; padding: 0; color: var(--accent); }.action-link, .site-actions a { display: inline-flex; min-height: 44px; align-items: center; gap: 0.4rem; color: var(--accent); text-decoration: none; }
.summary-card { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1rem; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); padding: 1rem; }.summary-card div { display: grid; gap: 0.2rem; }.summary-card span, .site-card p, dt { color: var(--text-secondary); }.summary-card strong { overflow-wrap: anywhere; }
.tabs { display: flex; border-bottom: 1px solid var(--border); }.tabs button { min-height: 44px; border: 0; border-bottom: 2px solid transparent; background: transparent; padding: 0.65rem 1rem; color: var(--text-secondary); }.tabs button[aria-selected='true'] { border-color: var(--accent); color: var(--accent); }
.sites-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }.site-card, .history-card { border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); padding: 1rem; }.site-card header { display: flex; justify-content: space-between; gap: 0.75rem; }.site-card header button, .service-link { border: 0; background: transparent; padding: 0; color: var(--accent); font-weight: 600; }.site-card dl { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }.site-card dl div { min-width: 0; }.site-card dt, .site-card dd { margin: 0; }.site-card dd { overflow-wrap: anywhere; }
.history-scroll { overflow-x: auto; }.pagination { display: flex; align-items: center; justify-content: flex-end; gap: 0.75rem; margin-top: 1rem; }
@media (max-width: 760px) { .detail-header { align-items: stretch; flex-direction: column; }.summary-card, .sites-grid { grid-template-columns: 1fr; }.site-card dl { grid-template-columns: 1fr; } }
</style>
