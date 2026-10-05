<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Pencil, RotateCcw, Trash2, X } from 'lucide-vue-next'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/base/BaseDialog.vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'
import EmptyState from '@/components/base/EmptyState.vue'
import ErrorState from '@/components/base/ErrorState.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import AreaForm from '@/components/domain/clients/AreaForm.vue'
import SiteForm from '@/components/domain/clients/SiteForm.vue'
import { formatPhone } from '@/helpers/clients'
import { ApiClientError } from '@/services/apiService'
import { getSite, listFormOptions, listSiteHistory } from '@/services/clientsService'
import { deleteMasterFile, getMasterFileUrl, uploadMasterFile } from '@/services/filesService'
import { useClientsStore } from '@/stores/clients'
import { useNotificationsStore } from '@/stores/notifications'
import type { AreaInput, AreaRecord, FormOption, ServiceHistoryItem, SiteInput, SiteRecord } from '@/types/domain'

type Tab = 'summary' | 'areas' | 'devices' | 'findings' | 'history' | 'settings'

const route = useRoute()
const router = useRouter()
const store = useClientsStore()
const notifications = useNotificationsStore()
const siteId = computed(() => String(route.params.siteId))
const site = computed(() => store.sitesById[siteId.value] ?? null)
const client = computed(() => site.value ? store.clientsById[site.value.clientId] ?? null : null)
const areas = computed(() => store.areasForSite(siteId.value))
const loading = ref(true)
const loadError = ref<string | null>(null)
const tab = ref<Tab>('summary')
const forms = ref<FormOption[]>([])
const siteFormOpen = ref(false)
const siteForm = ref<SiteInput>(blankSite())
const newArea = ref<AreaInput>(blankArea())
const editingArea = ref<AreaRecord | null>(null)
const editAreaForm = ref<AreaInput>(blankArea())
const selectedArea = ref<AreaRecord | null>(null)
const deleteAreaTarget = ref<AreaRecord | null>(null)
const dependencyAreaTarget = ref<AreaRecord | null>(null)
const saving = ref(false)
const areasLoading = ref(false)
const history = ref<ServiceHistoryItem[]>([])
const historyPage = ref(1)
const historyTotal = ref(0)
const historyLoading = ref(false)
const sitePlanFile = ref<File | null>(null)
const siteVehicleTemplateFile = ref<File | null>(null)

onMounted(load)

async function load(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    const loadedSite = await store.ensureSite(siteId.value)
    await Promise.all([store.ensureClient(loadedSite.clientId), loadForms()])
  } catch (error) {
    loadError.value = message(error, 'No fue posible cargar la Sede')
  } finally {
    loading.value = false
  }
}

async function loadForms(): Promise<void> { forms.value = await listFormOptions() }

async function changeTab(next: Tab): Promise<void> {
  tab.value = next
  if (next === 'areas' && !store.areasBySiteId[siteId.value]) await loadAreas()
  if (next === 'history' && !history.value.length) await loadHistory()
}

async function loadAreas(force = false): Promise<void> {
  areasLoading.value = true
  try { await store.loadAreas(siteId.value, force) }
  catch (error) { notifications.show(message(error, 'No fue posible cargar las Áreas'), 'error') }
  finally { areasLoading.value = false }
}

async function loadHistory(page = 1): Promise<void> {
  historyLoading.value = true
  try {
    const result = await listSiteHistory(siteId.value, page)
    history.value = result.items
    historyPage.value = result.page
    historyTotal.value = result.total
  } catch (error) { notifications.show(message(error, 'No fue posible cargar el historial'), 'error') }
  finally { historyLoading.value = false }
}

function openSiteEdit(): void {
  if (!site.value) return
  siteForm.value = toSiteInput(site.value)
  sitePlanFile.value = null
  siteVehicleTemplateFile.value = null
  siteFormOpen.value = true
}

async function saveSite(): Promise<void> {
  const current = site.value
  if (!current || saving.value) return
  saving.value = true
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
    const saved = await store.updateSite(current.id, input)
    siteFormOpen.value = false
    sitePlanFile.value = null
    siteVehicleTemplateFile.value = null
    for (const oldPath of [current.planoStoragePath, current.plantillaCertificadoVehiculoStoragePath]) {
      if (oldPath && oldPath !== saved.planoStoragePath && oldPath !== saved.plantillaCertificadoVehiculoStoragePath) {
        void deleteMasterFile(oldPath).catch(() =>
          notifications.show('La Sede se guardó, pero no fue posible limpiar un archivo anterior.', 'warning'))
      }
    }
    notifications.show('Configuración de la Sede actualizada.', 'success')
  } catch (error) {
    await Promise.all(uploadedPaths.map((path) => deleteMasterFile(path).catch(() => undefined)))
    if (error instanceof ApiClientError && error.code === 'VERSION_CONFLICT') store.upsertSite(await getSite(current.id))
    notifications.show(message(error, 'No fue posible actualizar la Sede'), 'error')
  } finally { saving.value = false }
}

async function createArea(): Promise<void> {
  if (saving.value) return
  saving.value = true
  try {
    await store.createArea(siteId.value, newArea.value)
    newArea.value = blankArea()
    notifications.show('Área creada correctamente.', 'success')
  } catch (error) { notifications.show(message(error, 'No fue posible crear el Área'), 'error') }
  finally { saving.value = false }
}

function openAreaEdit(area: AreaRecord): void {
  editingArea.value = area
  editAreaForm.value = { nombre: area.nombre, esExterna: area.esExterna, activo: area.activo, version: area.version }
  selectedArea.value = null
}

async function updateArea(): Promise<void> {
  if (!editingArea.value || saving.value) return
  saving.value = true
  try {
    const updated = await store.updateArea(editingArea.value.id, editAreaForm.value)
    if (selectedArea.value?.id === updated.id) selectedArea.value = updated
    editingArea.value = null
    notifications.show('Área actualizada correctamente.', 'success')
  } catch (error) {
    if (error instanceof ApiClientError && error.code === 'VERSION_CONFLICT') await loadAreas(true)
    notifications.show(message(error, 'No fue posible actualizar el Área'), 'error')
  }
  finally { saving.value = false }
}

async function removeArea(): Promise<void> {
  const area = deleteAreaTarget.value
  if (!area) return
  saving.value = true
  try {
    await store.removeArea(area)
    if (selectedArea.value?.id === area.id) selectedArea.value = null
    deleteAreaTarget.value = null
    notifications.show('Área eliminada correctamente.', 'success')
  } catch (error) {
    deleteAreaTarget.value = null
    if (error instanceof ApiClientError && error.code === 'DEPENDENCIES') dependencyAreaTarget.value = area
    else notifications.show(message(error, 'No fue posible eliminar el Área'), 'error')
  } finally { saving.value = false }
}

async function setAreaActive(area: AreaRecord, active: boolean): Promise<void> {
  saving.value = true
  try {
    const updated = await store.updateArea(area.id, { nombre: area.nombre, esExterna: area.esExterna, activo: active, version: area.version })
    if (selectedArea.value?.id === area.id) selectedArea.value = updated
    dependencyAreaTarget.value = null
    notifications.show(active ? 'Área reactivada.' : 'Área desactivada sin borrar su historial.', 'success')
  } catch (error) { notifications.show(message(error, 'No fue posible actualizar el Área'), 'error') }
  finally { saving.value = false }
}

function selectSiteFile(kind: 'plan' | 'vehicle-template', file: File | null): void { if (kind === 'plan') sitePlanFile.value = file; else siteVehicleTemplateFile.value = file }
async function openPrivateFile(storagePath: string): Promise<void> { const popup = window.open('', '_blank'); try { const url = await getMasterFileUrl(storagePath); if (popup) popup.location.href = url; else window.location.href = url } catch (error) { popup?.close(); notifications.show(message(error, 'No fue posible abrir el archivo privado'), 'error') } }
function blankArea(): AreaInput { return { nombre: '', esExterna: false, activo: true } }
function blankSite(): SiteInput { return { nombre: '', direccion: '', correos: [], heredaCorreosCliente: true, contactoPrincipalNombre: '', contactoPrincipalCorreo: null, contactoPrincipalCelular: '', valorServicio: 0, periodicidadMeses: 1, manejaRefuerzo: false, formulariosAplicablesIds: [], planoStoragePath: null, manejaVehiculos: false, generaCertificadoVehiculo: false, vigenciaCertificadoVehiculoMeses: null, plantillaCertificadoVehiculoStoragePath: null, duracionServicioMinutos: 120, activo: true } }
function toSiteInput(record: SiteRecord): SiteInput { return { nombre: record.nombre, direccion: record.direccion, correos: [...record.correos], heredaCorreosCliente: record.heredaCorreosCliente, contactoPrincipalNombre: record.contactoPrincipalNombre, contactoPrincipalCorreo: record.contactoPrincipalCorreo, contactoPrincipalCelular: record.contactoPrincipalCelular, valorServicio: record.valorServicio, periodicidadMeses: record.periodicidadMeses, manejaRefuerzo: record.manejaRefuerzo, formulariosAplicablesIds: [...record.formulariosAplicablesIds], planoStoragePath: record.planoStoragePath, manejaVehiculos: record.manejaVehiculos, generaCertificadoVehiculo: record.generaCertificadoVehiculo, vigenciaCertificadoVehiculoMeses: record.vigenciaCertificadoVehiculoMeses, plantillaCertificadoVehiculoStoragePath: record.plantillaCertificadoVehiculoStoragePath, duracionServicioMinutos: record.duracionServicioMinutos, activo: record.activo, version: record.version } }
function message(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback }
function formatMoney(value: number): string { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value) }
function formatDate(value: string): string { return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(value)) }
</script>

<template>
  <LoadingSkeleton v-if="loading" label="Cargando Sede" :lines="6" />
  <ErrorState v-else-if="loadError" title="No pudimos cargar la Sede" :message="loadError"><BaseButton variant="secondary" @click="load">Reintentar</BaseButton></ErrorState>
  <div v-else-if="site && client" class="site-detail">
    <header class="detail-header"><div><button class="back" @click="router.push(`/clientes/${client.id}`)">← {{ client.nombre }}</button><h1>{{ site.nombre }}</h1><StatusBadge :tone="site.activo ? 'success' : 'neutral'">{{ site.activo ? 'Activa' : 'Inactiva' }}</StatusBadge></div><BaseButton variant="secondary" @click="openSiteEdit"><Pencil :size="17" />Editar Sede</BaseButton></header>
    <nav class="tabs" aria-label="Detalle de Sede"><button v-for="item in ([['summary','Resumen'],['areas','Áreas'],['devices','Dispositivos'],['findings','Hallazgos'],['history','Historial de servicios'],['settings','Configuración']] as const)" :key="item[0]" :aria-current="tab === item[0] ? 'page' : undefined" @click="changeTab(item[0])">{{ item[1] }}</button></nav>

    <section v-if="tab === 'summary'" class="summary-grid"><article><h2>Contacto principal</h2><p>{{ site.contactoPrincipalNombre }}</p><p>{{ formatPhone(site.contactoPrincipalCelular) }}</p><p>{{ site.contactoPrincipalCorreo ?? 'Sin correo' }}</p></article><article><h2>Operación</h2><p>{{ formatMoney(site.valorServicio) }} por Servicio</p><p>Cada {{ site.periodicidadMeses }} mes{{ site.periodicidadMeses === 1 ? '' : 'es' }}</p><p>{{ site.duracionServicioMinutos }} minutos</p></article><article><h2>Configuración</h2><p>{{ site.formulariosCount }} formularios</p><p>{{ site.areasCount }} Áreas</p><p>{{ site.manejaVehiculos ? 'Maneja vehículos' : 'Sin vehículos' }}</p></article><article><h2>Plano</h2><p>{{ site.planoStoragePath?.split('/').slice(-1)[0] ?? 'Sin plano' }}</p><BaseButton v-if="site.planoStoragePath" variant="secondary" @click="site.planoStoragePath && openPrivateFile(site.planoStoragePath)">Ver plano</BaseButton></article></section>

    <section v-else-if="tab === 'areas'" class="areas-layout">
      <aside class="area-create"><h2>Agregar Área</h2><AreaForm v-model="newArea" mode="create" form-id="area-create-form" id-prefix="new-area" @submit="createArea" @invalid="notifications.show('Ingresa el nombre del Área.', 'error')" /><BaseButton type="submit" form="area-create-form" :loading="saving">Agregar Área</BaseButton></aside>
      <div class="areas-panel"><LoadingSkeleton v-if="areasLoading" label="Cargando Áreas" :lines="5" /><EmptyState v-else-if="areas.length === 0" title="No hay Áreas" message="Agrega la primera Área de esta Sede." /><div v-else class="areas-table-scroll"><table><thead><tr><th>Área</th><th>Ubicación</th><th>Dispositivos</th><th>Último servicio</th><th>Estado</th><th>Acciones</th></tr></thead><tbody><tr v-for="area in areas" :key="area.id"><td><button class="area-link" @click="selectedArea = area">{{ area.nombre }}</button></td><td>{{ area.esExterna ? 'Exterior / perímetro' : 'Interior' }}</td><td>{{ area.dispositivosCount }}</td><td>{{ area.ultimoServicio ? formatDate(area.ultimoServicio) : '—' }}</td><td><StatusBadge :tone="area.activo ? 'success' : 'neutral'">{{ area.activo ? 'Activa' : 'Inactiva' }}</StatusBadge></td><td><span class="row-actions"><button :aria-label="`Editar ${area.nombre}`" @click="openAreaEdit(area)"><Pencil :size="17" /></button><button v-if="area.activo" :aria-label="`Eliminar ${area.nombre}`" @click="deleteAreaTarget = area"><Trash2 :size="17" /></button><button v-else :aria-label="`Reactivar ${area.nombre}`" @click="setAreaActive(area, true)"><RotateCcw :size="17" /></button></span></td></tr></tbody></table></div></div>
      <aside v-if="selectedArea" class="area-drawer" aria-label="Detalle del Área"><button class="drawer-close" aria-label="Cerrar detalle" @click="selectedArea = null"><X :size="20" /></button><h2>{{ selectedArea.nombre }}</h2><StatusBadge :tone="selectedArea.activo ? 'success' : 'neutral'">{{ selectedArea.activo ? 'Activa' : 'Inactiva' }}</StatusBadge><dl><dt>Ubicación</dt><dd>{{ selectedArea.esExterna ? 'Exterior / perímetro' : 'Interior' }}</dd><dt>Dispositivos</dt><dd>{{ selectedArea.dispositivosCount }}</dd><dt>Último servicio</dt><dd>{{ selectedArea.ultimoServicio ? formatDate(selectedArea.ultimoServicio) : 'Sin registro' }}</dd></dl><BaseButton variant="secondary" @click="openAreaEdit(selectedArea)">Editar Área</BaseButton></aside>
    </section>

    <section v-else-if="tab === 'history'" class="history-card"><LoadingSkeleton v-if="historyLoading" label="Cargando historial" :lines="5" /><EmptyState v-else-if="history.length === 0" title="Sin historial" message="Los Servicios de esta Sede aparecerán aquí." /><div v-else class="history-scroll"><table><thead><tr><th>Servicio</th><th>Fecha</th><th>Tipo</th><th>Técnico</th><th>Estado</th><th>Valor</th></tr></thead><tbody><tr v-for="item in history" :key="item.id"><td><button class="service-link" @click="router.push(`/servicios/${item.id}`)">{{ item.solicitud }}</button></td><td>{{ formatDate(item.fecha) }}</td><td>{{ item.tipo }}</td><td>{{ item.tecnico }}</td><td>{{ item.estado }}</td><td>{{ formatMoney(item.valor) }}</td></tr></tbody></table></div><div v-if="historyTotal > 20" class="pagination"><BaseButton variant="secondary" :disabled="historyPage === 1" @click="loadHistory(historyPage - 1)">Anterior</BaseButton><span>Página {{ historyPage }}</span><BaseButton variant="secondary" :disabled="historyPage * 20 >= historyTotal" @click="loadHistory(historyPage + 1)">Siguiente</BaseButton></div></section>
    <section v-else-if="tab === 'settings'" class="settings-card"><h2>Configuración de la Sede</h2><p>Modifica contacto, operación, formularios, vehículos y plano desde el formulario compartido.</p><BaseButton @click="openSiteEdit">Editar configuración</BaseButton></section>
    <StatusPanel v-else :title="tab === 'devices' ? 'Dispositivos' : 'Hallazgos'" message="La navegación queda reservada para su issue funcional; este goal no adelanta su implementación." />

    <BaseDialog :model-value="siteFormOpen" title="Editar Sede" @update:model-value="siteFormOpen = $event"><SiteForm v-model="siteForm" mode="edit" :form-options="forms" :client-name="client.nombre" @submit="saveSite" @invalid="notifications.show('Revisa los campos marcados.', 'error')" @file-selected="selectSiteFile" @view-plan="siteForm.planoStoragePath && openPrivateFile(siteForm.planoStoragePath)" @view-vehicle-template="siteForm.plantillaCertificadoVehiculoStoragePath && openPrivateFile(siteForm.plantillaCertificadoVehiculoStoragePath)" /><template #footer><BaseButton variant="secondary" @click="siteFormOpen = false">Cancelar</BaseButton><BaseButton type="submit" form="site-form" :loading="saving">Guardar cambios</BaseButton></template></BaseDialog>
    <BaseDialog :model-value="Boolean(editingArea)" title="Editar Área" @update:model-value="!$event && (editingArea = null)"><AreaForm v-model="editAreaForm" mode="edit" form-id="area-edit-form" id-prefix="edit-area" @submit="updateArea" @invalid="notifications.show('Ingresa el nombre del Área.', 'error')" /><template #footer><BaseButton variant="secondary" @click="editingArea = null">Cancelar</BaseButton><BaseButton type="submit" form="area-edit-form" :loading="saving">Guardar cambios</BaseButton></template></BaseDialog>
    <ConfirmDialog :open="Boolean(deleteAreaTarget)" title="Eliminar Área" :message="`Se eliminará ${deleteAreaTarget?.nombre ?? 'el Área'} si no tiene historial ni dependencias.`" confirm-label="Eliminar" danger :loading="saving" @cancel="deleteAreaTarget = null" @confirm="removeArea" />
    <ConfirmDialog :open="Boolean(dependencyAreaTarget)" title="Desactivar Área" message="El Área tiene historial o dependencias. Se conservará y quedará inactiva." confirm-label="Desactivar" danger :loading="saving" @cancel="dependencyAreaTarget = null" @confirm="dependencyAreaTarget && setAreaActive(dependencyAreaTarget, false)" />
  </div>
</template>

<style scoped>
.site-detail { display: grid; gap: 1.25rem; }.detail-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; }.detail-header h1 { margin: 0.25rem 0; }.back, .area-link { border: 0; background: transparent; padding: 0; color: var(--accent); font-weight: 600; }
.tabs { display: flex; overflow-x: auto; border-bottom: 1px solid var(--border); }.tabs button { min-width: max-content; min-height: 44px; border: 0; border-bottom: 2px solid transparent; background: transparent; padding: 0.65rem 0.85rem; color: var(--text-secondary); }.tabs button[aria-current='page'] { border-color: var(--accent); color: var(--accent); }
.summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }.summary-grid article, .area-create, .areas-panel, .history-card, .settings-card { border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); padding: 1rem; }.summary-grid h2, .summary-grid p, .area-create h2, .settings-card h2 { margin: 0; }.summary-grid article { display: grid; gap: 0.5rem; }
.areas-layout { position: relative; display: grid; grid-template-columns: minmax(15rem, 0.34fr) minmax(0, 1fr); align-items: start; gap: 1rem; }.area-create { display: grid; gap: 1rem; }.areas-panel { min-width: 0; padding: 0; overflow: hidden; }.areas-table-scroll { height: min(58vh, 34rem); overflow: auto; }.areas-table-scroll thead { position: sticky; z-index: 2; top: 0; background: var(--sidebar); }.row-actions { display: flex; gap: 0.25rem; }.row-actions button, .drawer-close { display: grid; min-width: 44px; min-height: 44px; place-items: center; border: 0; background: transparent; color: var(--text-secondary); }
.area-drawer { position: fixed; z-index: 45; top: 64px; right: 0; bottom: 0; width: min(26rem, 100vw); overflow-y: auto; border-left: 1px solid var(--border); background: var(--surface-raised); padding: 1.25rem; box-shadow: var(--shadow-lg); }.drawer-close { margin-left: auto; }.area-drawer dl { display: grid; grid-template-columns: auto 1fr; gap: 0.5rem 1rem; }.area-drawer dt { color: var(--text-secondary); }.area-drawer dd { margin: 0; }
.history-scroll { overflow-x: auto; }.pagination { display: flex; align-items: center; justify-content: flex-end; gap: 0.75rem; margin-top: 1rem; }
.service-link { border: 0; background: transparent; padding: 0; color: var(--accent); font-weight: 600; }
@media (max-width: 800px) { .detail-header { align-items: stretch; flex-direction: column; }.summary-grid, .areas-layout { grid-template-columns: 1fr; }.areas-table-scroll { height: auto; max-height: none; overflow-x: auto; }.areas-panel { overflow-x: auto; } }
</style>
