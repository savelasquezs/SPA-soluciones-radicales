<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-vue-next'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/base/BaseDialog.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'
import EmptyState from '@/components/base/EmptyState.vue'
import ErrorState from '@/components/base/ErrorState.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import ResponsiveTable from '@/components/base/ResponsiveTable.vue'
import ContextualServiceHistory from '@/components/domain/services/ContextualServiceHistory.vue'
import SiteMonitoringPanel from '@/components/domain/clients/SiteMonitoringPanel.vue'
import SiteFindingsPanel from '@/components/domain/clients/SiteFindingsPanel.vue'
import WhatsAppPhoneLink from '@/components/base/WhatsAppPhoneLink.vue'
import { useFileSaveProgress } from '@/composables/useFileSaveProgress'
import AreaForm from '@/components/domain/clients/AreaForm.vue'
import SiteForm from '@/components/domain/clients/SiteForm.vue'
import SiteVehiclesPanel from '@/components/domain/clients/SiteVehiclesPanel.vue'
import { ApiClientError } from '@/services/apiService'
import { applyTemplateToSite, listAreaTemplates } from '@/services/areaTemplatesService'
import { getSite } from '@/services/clientsService'
import { deleteMasterFile, getMasterFileUrl, uploadMasterFile } from '@/services/filesService'
import { useClientsStore } from '@/stores/clients'
import { useNotificationsStore } from '@/stores/notifications'
import type { AreaInput, AreaRecord, AreaTemplateRecord, SiteInput, SiteRecord } from '@/types/domain'

type Tab = 'summary' | 'areas' | 'vehicles' | 'devices' | 'findings' | 'history'

const route = useRoute()
const router = useRouter()
const store = useClientsStore()
const notifications = useNotificationsStore()
const { phaseLabel: savePhaseLabel, onUploadPhase, markSaving, reset: resetSaveProgress } = useFileSaveProgress()
const siteId = computed(() => String(route.params.siteId))
const site = computed(() => store.sitesById[siteId.value] ?? null)
const client = computed(() => site.value ? store.clientsById[site.value.clientId] ?? null : null)
const areas = computed(() => store.areasForSite(siteId.value))
const loading = ref(true)
const loadError = ref<string | null>(null)
const initialTab = (): Tab => route.query.tab === 'vehicles' ? 'vehicles' : route.query.tab === 'findings' ? 'findings' : route.query.tab === 'history' ? 'history' : 'summary'
const tab = ref<Tab>(initialTab())
const visited = ref({ devices: false, findings: initialTab() === 'findings' })
const siteFormOpen = ref(false)
const siteForm = ref<SiteInput>(blankSite())
const newArea = ref<AreaInput>(blankArea())
const areaCreateOpen = ref(false)
const editingArea = ref<AreaRecord | null>(null)
const editAreaForm = ref<AreaInput>(blankArea())
const selectedArea = ref<AreaRecord | null>(null)
const deleteAreaTarget = ref<AreaRecord | null>(null)
const dependencyAreaTarget = ref<AreaRecord | null>(null)
const saving = ref(false)
const areasLoading = ref(false)
const sitePlanFile = ref<File | null>(null)
const templateApplyOpen = ref(false)
const templateOptions = ref<AreaTemplateRecord[]>([])
const templateSelectedId = ref('')
const templateLoading = ref(false)
const templateSaving = ref(false)
const selectedTemplate = computed(() => templateOptions.value.find(item => item.id === templateSelectedId.value) ?? null)
let loadRequest = 0

onMounted(load)
watch(siteId, () => {
  visited.value = { devices: false, findings: initialTab() === 'findings' }
  tab.value = initialTab()
  selectedArea.value = null
  void load()
})
async function load(): Promise<void> {
  const request = ++loadRequest
  loading.value = true
  loadError.value = null
  try {
    const loadedSite = await store.ensureSite(siteId.value)
    await store.ensureClient(loadedSite.clientId)
  } catch (error) {
    if (request === loadRequest) loadError.value = message(error, 'No fue posible cargar la Sede')
  } finally {
    if (request === loadRequest) loading.value = false
  }
}

async function changeTab(next: Tab, event?: MouseEvent): Promise<void> {
  tab.value = next
  void router.replace({ query:{ ...route.query,tab:next === 'history' || next === 'findings' || next === 'vehicles' ? next : undefined } })
  ;(event?.currentTarget as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  if (next === 'devices' || next === 'findings') visited.value[next] = true
  // Las Áreas pueden ser creadas por un Técnico mientras el Administrador
  // tiene la Sede en caché. Refrescar al volver a esta pestaña.
  if (next === 'areas') await loadAreas(true)
}

async function loadAreas(force = false): Promise<void> {
  areasLoading.value = true
  try { await store.loadAreas(siteId.value, force) }
  catch (error) { notifications.show(message(error, 'No fue posible cargar las Áreas'), 'error') }
  finally { areasLoading.value = false }
}

function openSiteEdit(): void {
  if (!site.value) return
  siteForm.value = toSiteInput(site.value)
  sitePlanFile.value = null
  siteFormOpen.value = true
}

async function saveSite(): Promise<void> {
  const current = site.value
  if (!current || saving.value) return
  saving.value = true
  resetSaveProgress()
  const uploadedPaths: string[] = []
  try {
    let input = { ...siteForm.value }
    if (sitePlanFile.value) {
      const path = await uploadMasterFile('SITE_PLAN', sitePlanFile.value, onUploadPhase)
      uploadedPaths.push(path)
      input = { ...input, planoStoragePath: path }
    }
    markSaving()
    const saved = await store.updateSite(current.id, input)
    siteFormOpen.value = false
    sitePlanFile.value = null
    if (current.planoStoragePath && current.planoStoragePath !== saved.planoStoragePath) {
      void deleteMasterFile(current.planoStoragePath).catch(() => notifications.show('La Sede se guardó, pero no fue posible limpiar el plano anterior.', 'warning'))
    }
    notifications.show('Configuración de la Sede actualizada.', 'success')
  } catch (error) {
    await Promise.all(uploadedPaths.map((path) => deleteMasterFile(path).catch(() => undefined)))
    if (error instanceof ApiClientError && error.code === 'VERSION_CONFLICT') store.upsertSite(await getSite(current.id))
    notifications.show(message(error, 'No fue posible actualizar la Sede'), 'error')
  } finally {
    saving.value = false
    resetSaveProgress()
  }
}

async function openTemplateApply(): Promise<void> {
  const current = site.value
  if (!current) return
  templateSelectedId.value = ''
  templateOptions.value = []
  templateApplyOpen.value = true
  templateLoading.value = true
  try {
    const options = await listAreaTemplates(current.clientId, true)
    if (siteId.value === current.id) templateOptions.value = options
  } catch (error) { notifications.show(message(error, 'No fue posible cargar las plantillas.'), 'error') }
  finally { templateLoading.value = false }
}

async function applyTemplate(): Promise<void> {
  if (templateSaving.value || !templateSelectedId.value) return
  templateSaving.value = true
  try {
    const result = await applyTemplateToSite(siteId.value, templateSelectedId.value)
    templateApplyOpen.value = false
    notifications.show(result.created
      ? `${result.created} área(s) agregada(s). ${result.skipped} existente(s) sin cambios.`
      : 'Todas las áreas de la plantilla ya existían. No se modificó ninguna.', 'success')
    try {
      await store.loadAreas(siteId.value, true)
      store.upsertSite(await getSite(siteId.value))
    } catch { notifications.show('Se aplicó la plantilla, pero no se pudo actualizar la lista. Vuelve a abrir Áreas.', 'warning') }
  } catch (error) { notifications.show(message(error, 'No fue posible aplicar la plantilla.'), 'error') }
  finally { templateSaving.value = false }
}

function openAreaCreate(): void {
  newArea.value = blankArea()
  areaCreateOpen.value = true
}

async function createArea(): Promise<void> {
  if (saving.value) return
  saving.value = true
  try {
    await store.createArea(siteId.value, newArea.value)
    areaCreateOpen.value = false
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
  } finally { saving.value = false }
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

function selectSiteFile(kind: 'plan', file: File | null): void { if (kind === 'plan') sitePlanFile.value = file }
async function openPrivateFile(storagePath: string): Promise<void> { const popup = window.open('', '_blank'); try { const url = await getMasterFileUrl(storagePath); if (popup) popup.location.href = url; else window.location.href = url } catch (error) { popup?.close(); notifications.show(message(error, 'No fue posible abrir el archivo privado'), 'error') } }
function blankArea(): AreaInput { return { nombre: '', esExterna: false, activo: true } }
function blankSite(): SiteInput { return { nombre: '', direccion: '', correos: [], heredaCorreosCliente: true, contactoPrincipalNombre: '', contactoPrincipalCorreo: null, contactoPrincipalCelular: '', valorServicio: 0, periodicidadMeses: 1, manejaRefuerzo: false, planoStoragePath: null, manejaVehiculos: false, generaCertificadoVehiculo: false, vigenciaCertificadoVehiculoMeses: null, duracionServicioMinutos: 120, activo: true } }
function toSiteInput(record: SiteRecord): SiteInput { return { nombre: record.nombre, direccion: record.direccion, correos: [...record.correos], heredaCorreosCliente: record.heredaCorreosCliente, contactoPrincipalNombre: record.contactoPrincipalNombre, contactoPrincipalCorreo: record.contactoPrincipalCorreo, contactoPrincipalCelular: record.contactoPrincipalCelular, valorServicio: record.valorServicio, periodicidadMeses: record.periodicidadMeses, manejaRefuerzo: record.manejaRefuerzo, planoStoragePath: record.planoStoragePath, manejaVehiculos: record.manejaVehiculos, generaCertificadoVehiculo: record.generaCertificadoVehiculo, vigenciaCertificadoVehiculoMeses: record.vigenciaCertificadoVehiculoMeses, duracionServicioMinutos: record.duracionServicioMinutos, activo: record.activo, version: record.version } }
function message(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback }
function formatMoney(value: number): string { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value) }
</script>

<template>
  <LoadingSkeleton v-if="loading" label="Cargando Sede" :lines="6" />
  <ErrorState v-else-if="loadError" title="No pudimos cargar la Sede" :message="loadError"><BaseButton variant="secondary" @click="load">Reintentar</BaseButton></ErrorState>
  <div v-else-if="site && client" class="site-detail">
    <header class="detail-header">
      <div class="identity">
        <button class="back" @click="router.push('/clientes/' + client.id)">← {{ client.nombre }}</button>
        <div class="site-title">
          <h1>{{ site.nombre }}</h1>
          <StatusBadge :tone="site.activo ? 'success' : 'neutral'">{{ site.activo ? 'Activa' : 'Inactiva' }}</StatusBadge>
        </div>
      </div>
      <BaseButton size="compact" variant="secondary" @click="openSiteEdit"><Pencil :size="16" />Editar Sede</BaseButton>
    </header>
    <nav class="tabs" aria-label="Detalle de Sede">
      <button v-for="item in ([['summary','Resumen'],['areas','Áreas'],['vehicles','Vehículos'],['devices','Puestos de monitoreo'],['findings','Hallazgos'],['history','Historial de servicios']] as const)" :key="item[0]" :aria-current="tab === item[0] ? 'page' : undefined" @click="changeTab(item[0], $event)">{{ item[1] }}</button>
    </nav>

    <section v-if="tab === 'summary'" class="summary-grid"><article><h2>Contacto principal</h2><p>{{ site.contactoPrincipalNombre }}</p><WhatsAppPhoneLink v-if="site.contactoPrincipalCelular" :phone="site.contactoPrincipalCelular" /><p>{{ site.contactoPrincipalCorreo ?? 'Sin correo' }}</p></article><article><h2>Operación</h2><p>{{ formatMoney(site.valorServicio) }} por Servicio</p><p>Cada {{ site.periodicidadMeses }} mes{{ site.periodicidadMeses === 1 ? '' : 'es' }}</p><p>{{ site.duracionServicioMinutos }} minutos</p></article><article><h2>Configuración</h2><p>{{ site.areasCount }} Áreas</p><p>{{ site.manejaVehiculos ? 'Maneja vehículos' : 'Sin vehículos' }}</p></article><article><h2>Plano</h2><p>{{ site.planoStoragePath?.split('/').slice(-1)[0] ?? 'Sin plano' }}</p><BaseButton v-if="site.planoStoragePath" size="compact" variant="secondary" @click="site.planoStoragePath && openPrivateFile(site.planoStoragePath)">Ver plano</BaseButton></article></section>

    <section v-else-if="tab === 'areas'" class="areas-layout">
      <div class="areas-toolbar">
        <div><strong>Áreas</strong><span>{{ areas.length }} {{ areas.length === 1 ? 'área' : 'áreas' }}</span></div>
        <div class="areas-toolbar__actions">
          <BaseButton size="compact" variant="secondary" @click="openTemplateApply">Aplicar plantilla</BaseButton>
          <BaseButton size="compact" @click="openAreaCreate"><Plus :size="16" />Agregar Área</BaseButton>
        </div>
      </div>
      <div class="areas-panel">
        <LoadingSkeleton v-if="areasLoading" label="Cargando Áreas" :lines="5" />
        <EmptyState v-else-if="areas.length === 0" title="No hay Áreas" message="Agrega la primera Área de esta Sede." />
        <ResponsiveTable v-else>
          <template #table>
            <div class="areas-table-scroll">
              <table>
                <thead><tr><th>Área</th><th>Ubicación</th><th>Puestos</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>
                  <tr v-for="area in areas" :key="area.id">
                    <td><button class="area-link" @click="selectedArea = area">{{ area.nombre }}</button></td>
                    <td>{{ area.esExterna ? 'Exterior / perímetro' : 'Interior' }}</td>
                    <td>{{ area.dispositivosCount }}</td>
                    <td><StatusBadge :tone="area.activo ? 'success' : 'neutral'">{{ area.activo ? 'Activa' : 'Inactiva' }}</StatusBadge></td>
                    <td><span class="row-actions">
                      <button :aria-label="'Editar ' + area.nombre" @click="openAreaEdit(area)"><Pencil :size="17" /></button>
                      <button v-if="area.activo" :aria-label="'Eliminar ' + area.nombre" @click="deleteAreaTarget = area"><Trash2 :size="17" /></button>
                      <button v-else :aria-label="'Reactivar ' + area.nombre" @click="setAreaActive(area, true)"><RotateCcw :size="17" /></button>
                    </span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
          <template #cards>
            <article v-for="area in areas" :key="area.id" class="area-mobile-card">
              <div class="area-mobile-card__top">
                <button class="area-link" @click="selectedArea = area">{{ area.nombre }}</button>
                <StatusBadge :tone="area.activo ? 'success' : 'neutral'">{{ area.activo ? 'Activa' : 'Inactiva' }}</StatusBadge>
              </div>
              <div class="area-mobile-card__bottom">
                <span>{{ area.esExterna ? 'Exterior / perímetro' : 'Interior' }} · {{ area.dispositivosCount }} {{ area.dispositivosCount === 1 ? 'puesto' : 'puestos' }}</span>
                <span class="row-actions">
                  <button :aria-label="'Editar ' + area.nombre" @click="openAreaEdit(area)"><Pencil :size="17" /></button>
                  <button v-if="area.activo" :aria-label="'Eliminar ' + area.nombre" @click="deleteAreaTarget = area"><Trash2 :size="17" /></button>
                  <button v-else :aria-label="'Reactivar ' + area.nombre" @click="setAreaActive(area, true)"><RotateCcw :size="17" /></button>
                </span>
              </div>
            </article>
          </template>
        </ResponsiveTable>
      </div>
      <aside v-if="selectedArea" class="area-drawer" aria-label="Detalle del Área">
        <button class="drawer-close" aria-label="Cerrar detalle" @click="selectedArea = null"><X :size="20" /></button>
        <h2>{{ selectedArea.nombre }}</h2>
        <StatusBadge :tone="selectedArea.activo ? 'success' : 'neutral'">{{ selectedArea.activo ? 'Activa' : 'Inactiva' }}</StatusBadge>
        <dl><dt>Ubicación</dt><dd>{{ selectedArea.esExterna ? 'Exterior / perímetro' : 'Interior' }}</dd><dt>Puestos de monitoreo</dt><dd>{{ selectedArea.dispositivosCount }}</dd></dl>
        <BaseButton size="compact" variant="secondary" @click="openAreaEdit(selectedArea)">Editar Área</BaseButton>
      </aside>
    </section>

    <SiteVehiclesPanel v-else-if="tab === 'vehicles'" :key="siteId" :site-id="siteId" :enabled="site.activo && site.manejaVehiculos" />
    <section v-else-if="tab === 'history'" class="history-card">
      <ContextualServiceHistory :site-id="siteId" />
    </section>
    <SiteMonitoringPanel v-if="visited.devices" v-show="tab === 'devices'" :site-id="siteId" :active="tab === 'devices'" />
    <SiteFindingsPanel v-if="visited.findings" v-show="tab === 'findings'" :site-id="siteId" :active="tab === 'findings'" />

    <BaseDialog :model-value="areaCreateOpen" title="Agregar Área" @update:model-value="!saving && (areaCreateOpen = $event)">
      <AreaForm v-model="newArea" mode="create" form-id="area-create-form" id-prefix="new-area" @submit="createArea" @invalid="notifications.show('Ingresa el nombre del Área.', 'error')" />
      <template #footer>
        <BaseButton variant="secondary" :disabled="saving" @click="areaCreateOpen = false">Cancelar</BaseButton>
        <BaseButton type="submit" form="area-create-form" :loading="saving">Agregar Área</BaseButton>
      </template>
    </BaseDialog>
    <BaseDialog :model-value="templateApplyOpen" title="Aplicar plantilla" size="compact" :close-on-escape="!templateSaving"
      @update:model-value="!templateSaving && (templateApplyOpen = $event)">
      <div class="template-apply">
        <BaseSelect v-model="templateSelectedId" name="apply-area-template" label="Plantilla" :disabled="templateLoading">
          <option value="">Selecciona una plantilla</option>
          <option v-for="item in templateOptions" :key="item.id" :value="item.id">{{ item.nombre }} · {{ item.areas.length }} áreas</option>
        </BaseSelect>
        <p v-if="templateLoading">Cargando plantillas…</p>
        <p v-else-if="selectedTemplate">Se añadirán únicamente las áreas que no existan. No se modifican áreas existentes, su historial ni sus puestos.</p>
        <p v-else-if="!templateOptions.length">No hay plantillas activas disponibles para este cliente.</p>
      </div>
      <template #footer>
        <BaseButton variant="secondary" :disabled="templateSaving" @click="templateApplyOpen = false">Cancelar</BaseButton>
        <BaseButton :disabled="!templateSelectedId || templateLoading" :loading="templateSaving" @click="applyTemplate">Aplicar</BaseButton>
      </template>
    </BaseDialog>
    <BaseDialog :model-value="siteFormOpen" title="Editar Sede" @update:model-value="!saving && (siteFormOpen = $event)"><SiteForm v-model="siteForm" mode="edit" :saving="saving" :client-name="client.nombre" @submit="saveSite" @invalid="notifications.show('Revisa los campos marcados.', 'error')" @file-selected="selectSiteFile" @view-plan="siteForm.planoStoragePath && openPrivateFile(siteForm.planoStoragePath)" /><template #footer><BaseButton variant="secondary" :disabled="saving" @click="siteFormOpen = false">Cancelar</BaseButton><BaseButton type="submit" form="site-form" :loading="saving">{{ savePhaseLabel ?? 'Guardar cambios' }}</BaseButton></template></BaseDialog>
    <BaseDialog :model-value="Boolean(editingArea)" title="Editar Área" @update:model-value="!$event && (editingArea = null)"><AreaForm v-model="editAreaForm" mode="edit" form-id="area-edit-form" id-prefix="edit-area" @submit="updateArea" @invalid="notifications.show('Ingresa el nombre del Área.', 'error')" /><template #footer><BaseButton variant="secondary" @click="editingArea = null">Cancelar</BaseButton><BaseButton type="submit" form="area-edit-form" :loading="saving">Guardar cambios</BaseButton></template></BaseDialog>
    <ConfirmDialog :open="Boolean(deleteAreaTarget)" title="Eliminar Área" :message="`Se eliminará ${deleteAreaTarget?.nombre ?? 'el Área'} si no tiene historial ni dependencias.`" confirm-label="Eliminar" danger :loading="saving" @cancel="deleteAreaTarget = null" @confirm="removeArea" />
    <ConfirmDialog :open="Boolean(dependencyAreaTarget)" title="Desactivar Área" message="El Área tiene historial o dependencias. Se conservará y quedará inactiva." confirm-label="Desactivar" danger :loading="saving" @cancel="dependencyAreaTarget = null" @confirm="dependencyAreaTarget && setAreaActive(dependencyAreaTarget, false)" />
  </div>
</template>

<style scoped>
.site-detail { display:grid; gap:0.75rem; min-width:0; }
.detail-header { display:flex; justify-content:space-between; align-items:center; gap:0.75rem; min-width:0; }
.identity { min-width:0; }
.site-title { display:flex; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-top:0.15rem; }
.site-title h1 { margin:0; font-size:1.5rem; line-height:1.2; overflow-wrap:anywhere; }
.back, .area-link { border:0; background:transparent; padding:0; font-weight:600; cursor:pointer; }
.back { color:var(--text-secondary); font-weight:500; }
.area-link { color:var(--text); text-align:left; overflow-wrap:anywhere; }
.back:hover, .back:focus-visible, .area-link:hover, .area-link:focus-visible { color:var(--text); text-decoration:underline; text-underline-offset:2px; }
.tabs { display:flex; min-width:0; width:100%; max-width:100%; overflow-x:auto; overflow-y:hidden; overscroll-behavior-x:contain; scrollbar-width:thin; border-bottom:1px solid var(--border); scroll-snap-type:x proximity; }
.tabs button { flex:none; scroll-snap-align:start; min-height:40px; border:0; border-bottom:2px solid transparent; background:transparent; padding:0.4rem 0.7rem; color:var(--text-secondary); cursor:pointer; white-space:nowrap; }
.tabs button[aria-current='page'] { border-color:var(--accent); color:var(--accent); }
.summary-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); overflow:hidden; }
.summary-grid article { display:grid; min-width:0; align-content:start; gap:0.2rem; padding:0.65rem 0.75rem; }
.summary-grid article + article { border-left:1px solid var(--border); }
.summary-grid h2, .summary-grid p { margin:0; }
.summary-grid h2 { font-size:0.87rem; }
.summary-grid p { color:var(--text-secondary); font-size:0.82rem; overflow-wrap:anywhere; }
.areas-layout { position:relative; display:grid; gap:0.6rem; align-items:start; min-width:0; }
.areas-toolbar { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; }
.areas-toolbar > div { display:flex; align-items:center; flex-wrap:wrap; gap:0.65rem; }
.areas-toolbar > div > span { color:var(--text-secondary); font-size:0.82rem; }
.areas-toolbar__actions { display:flex; align-items:center; gap:0.35rem; flex-wrap:wrap; }
.template-apply { display:grid; gap:0.65rem; }
.template-apply p { font-size:0.8rem; color:var(--text-secondary); margin:0; }
.template-apply :deep(select) { min-height:36px; padding:0.4rem 0.6rem; }
.areas-panel { min-width:0; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); padding:0.7rem; }
.history-card { min-width:0; }
.areas-panel { padding:0; overflow:hidden; }
.areas-table-scroll { max-width:100%; max-height:min(68vh, 42rem); overflow:auto; overscroll-behavior-x:contain; -webkit-overflow-scrolling:touch; }
.areas-table-scroll table { width:100%; border-collapse:collapse; }
.areas-table-scroll thead { position:sticky; z-index:2; top:0; background:var(--surface); }
.areas-table-scroll th, .areas-table-scroll td { padding:0.55rem 0.65rem; }
.row-actions { display:flex; gap:0.2rem; }
.row-actions button, .drawer-close { display:grid; place-items:center; min-width:36px; min-height:36px; border:0; background:transparent; color:var(--text-secondary); cursor:pointer; }
.row-actions button:hover, .drawer-close:hover { background:var(--hover); color:var(--text); }
.area-drawer { position:fixed; z-index:45; top:64px; right:0; bottom:0; width:min(26rem, 100vw); overflow-y:auto; border-left:1px solid var(--border); background:var(--surface-raised); padding:1rem; box-shadow:var(--shadow-lg); }
.drawer-close { margin-left:auto; }
.area-drawer dl { display:grid; grid-template-columns:auto 1fr; gap:0.5rem 1rem; }
.area-drawer dt { color:var(--text-secondary); }
.area-drawer dd { margin:0; }
.pagination { display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:0.5rem; margin-top:0.75rem; }
.area-mobile-card { display:grid; gap:0.4rem; padding:0.65rem 0.7rem; border:1px solid var(--border); border-radius:var(--radius); background:var(--surface); }
.area-mobile-card__top, .area-mobile-card__bottom { display:flex; justify-content:space-between; align-items:center; gap:0.5rem; }
.area-mobile-card__bottom { color:var(--text-secondary); font-size:0.82rem; }
.area-mobile-card__bottom > span:first-child { overflow-wrap:anywhere; }
@media (max-width:800px) {
  .detail-header { align-items:stretch; flex-direction:column; gap:0.5rem; }
  .detail-header > :last-child { align-self:flex-start; }
  .site-title h1 { font-size:1.4rem; }
  .summary-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .summary-grid article:first-child { grid-column:span 2; }
  .summary-grid article + article { border-left:0; border-top:1px solid var(--border); }
  .summary-grid article:nth-child(3) { border-left:1px solid var(--border); }
  .summary-grid article:last-child { grid-column:span 2; }
  .summary-grid article { padding:0.55rem 0.65rem; }
  .tabs button { min-height:44px; }
  .areas-panel { border:0; background:transparent; overflow:visible; }
  .history-card { border:0; background:transparent; padding:0; }
  .row-actions button, .drawer-close { min-width:40px; min-height:40px; }
  .area-mobile-card .area-link { min-height:40px; }
}
</style>
