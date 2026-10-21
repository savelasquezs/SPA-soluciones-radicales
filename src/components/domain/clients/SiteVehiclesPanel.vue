<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Download, Eye, FileText, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-vue-next'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/base/BaseDialog.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'
import EmptyState from '@/components/base/EmptyState.vue'
import ErrorState from '@/components/base/ErrorState.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import ResponsiveTable from '@/components/base/ResponsiveTable.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import VehicleForm from './VehicleForm.vue'
import { getCertificateUrl } from '@/services/certificatesService'
import { listVehicleCertificates } from '@/services/clientsService'
import { downloadLink } from '@/helpers/certificates'
import { ApiClientError } from '@/services/apiService'
import { useClientsStore } from '@/stores/clients'
import { useNotificationsStore } from '@/stores/notifications'
import type { VehicleInput, VehicleRecord, VehicleCertificate } from '@/types/domain'

const props = defineProps<{ siteId: string; enabled: boolean }>()
const store = useClientsStore()
const notifications = useNotificationsStore()
const vehicles = computed(() => store.vehiclesForSite(props.siteId))
const search = ref('')
const filtered = computed(() => vehicles.value.filter(v => v.placa.includes(search.value.trim().toUpperCase())).sort((a,b) =>
  Number(b.activo) - Number(a.activo) || a.placa.localeCompare(b.placa, 'es')))
const loading = ref(true)
const error = ref('')
const saving = ref(false)
const formOpen = ref(false)
const editing = ref<VehicleRecord | null>(null)
const form = ref<VehicleInput>({ placa: '', activo: true })
const deleteTarget = ref<VehicleRecord | null>(null)
const dependencyTarget = ref<VehicleRecord | null>(null)
const historyVehicle = ref<VehicleRecord | null>(null)
const documents = ref<VehicleCertificate[]>([])
const historyPage = ref(1)
const hasMore = ref(false)
const historyLoading = ref(false)
const historyError = ref('')
const previewUrl = ref('')
const previewDocument = ref<VehicleCertificate | null>(null)
const previewLoading = ref(false)
let historyRequest = 0

async function load(force = false): Promise<void> {
  loading.value = true
  error.value = ''
  try { await store.loadVehicles(props.siteId, force) }
  catch { error.value = 'No pudimos cargar los vehículos.' }
  finally { loading.value = false }
}
onMounted(() => void load())
watch(() => props.siteId, () => { closeHistory(); void load() })

function create(): void {
  editing.value = null
  form.value = { placa: '', activo: true }
  formOpen.value = true
}
function edit(vehicle: VehicleRecord): void {
  editing.value = vehicle
  form.value = { placa: vehicle.placa, activo: vehicle.activo, version: vehicle.version }
  formOpen.value = true
}
async function save(): Promise<void> {
  if (saving.value) return
  saving.value = true
  try {
    if (editing.value) await store.updateVehicle(editing.value.id, form.value)
    else await store.createVehicle(props.siteId, form.value)
    formOpen.value = false
    notifications.show(editing.value ? 'Vehículo actualizado.' : 'Vehículo creado.', 'success')
  } catch (cause) {
    if (cause instanceof ApiClientError && cause.code === 'VERSION_CONFLICT') await load(true)
    notifications.show(cause instanceof Error ? cause.message : 'No fue posible guardar el vehículo.', 'error')
  } finally { saving.value = false }
}
async function remove(): Promise<void> {
  const target = deleteTarget.value
  if (!target || saving.value) return
  saving.value = true
  try {
    await store.removeVehicle(target)
    notifications.show('Vehículo eliminado.', 'success')
  } catch (cause) {
    if (cause instanceof ApiClientError && cause.code === 'DEPENDENCIES') dependencyTarget.value = target
    else {
      if (cause instanceof ApiClientError && cause.code === 'VERSION_CONFLICT') await load(true)
      notifications.show(cause instanceof Error ? cause.message : 'No fue posible eliminar el vehículo.', 'error')
    }
  } finally { deleteTarget.value = null; saving.value = false }
}
async function setActive(vehicle: VehicleRecord, active: boolean): Promise<void> {
  if (saving.value) return
  saving.value = true
  try {
    await store.updateVehicle(vehicle.id, { placa: vehicle.placa, activo: active, version: vehicle.version })
    notifications.show(active ? 'Vehículo reactivado.' : 'Vehículo desactivado; se conserva su historial.', 'success')
  } catch (cause) {
    if (cause instanceof ApiClientError && cause.code === 'VERSION_CONFLICT') await load(true)
    notifications.show(cause instanceof Error ? cause.message : 'No fue posible cambiar el estado.', 'error')
  } finally { saving.value = false; dependencyTarget.value = null }
}

function closeHistory(): void {
  historyRequest++
  historyVehicle.value = null
  documents.value = []
  previewUrl.value = ''
  previewDocument.value = null
  historyError.value = ''
}
async function openHistory(vehicle: VehicleRecord): Promise<void> {
  closeHistory()
  historyVehicle.value = vehicle
  await loadHistory(1)
}
async function loadHistory(page: number): Promise<void> {
  if (!historyVehicle.value || page < 1) return
  const request = ++historyRequest
  const vehicleId = historyVehicle.value.id
  historyLoading.value = true
  historyError.value = ''
  try {
    const result = await listVehicleCertificates(props.siteId, vehicleId, page)
    if (request !== historyRequest) return
    documents.value = result.items
    historyPage.value = result.page
    hasMore.value = result.hasMore
  } catch {
    if (request === historyRequest) historyError.value = 'No pudimos consultar los certificados.'
  } finally { if (request === historyRequest) historyLoading.value = false }
}
async function view(document: VehicleCertificate): Promise<void> {
  if (previewLoading.value || !document.pdfAvailable) return
  previewLoading.value = true
  const vehicleId = historyVehicle.value?.id
  try {
    const url = await getCertificateUrl(document.id, true)
    if (!vehicleId || historyVehicle.value?.id !== vehicleId) return
    previewUrl.value = url
    previewDocument.value = document
  } catch (cause) {
    notifications.show(cause instanceof Error ? cause.message : 'No fue posible abrir el certificado.', 'error')
  } finally { previewLoading.value = false }
}
async function download(document: VehicleCertificate): Promise<void> {
  try { downloadLink(await getCertificateUrl(document.id)) }
  catch (cause) { notifications.show(cause instanceof Error ? cause.message : 'No fue posible descargar el certificado.', 'error') }
}
function formatDate(date: string): string { return date.slice(0,10).split('-').reverse().join('/') }
</script>

<template>
  <section class="vehicles-panel">
    <header class="vehicles-header">
      <div><h2>Vehículos</h2><p>{{ vehicles.length }} registrados · {{ vehicles.filter(v => v.activo).length }} activos</p></div>
      <BaseButton v-if="enabled" size="compact" @click="create"><Plus :size="16" />Agregar vehículo</BaseButton>
    </header>
    <p v-if="!enabled" class="disabled-notice">La Sede no tiene habilitada la gestión de vehículos. Puedes consultar su historial, pero debes activarla en Configuración para agregar vehículos.</p>
    <div v-if="vehicles.length" class="vehicles-search">
      <BaseInput v-model="search" label="Buscar por placa" name="vehicle-search" placeholder="Buscar placa…" />
    </div>
    <LoadingSkeleton v-if="loading" label="Cargando vehículos" :lines="4" />
    <ErrorState v-else-if="error" title="No se pudieron cargar los vehículos" :message="error"><BaseButton variant="secondary" @click="load(true)">Reintentar</BaseButton></ErrorState>
    <EmptyState v-else-if="!vehicles.length" title="No hay vehículos" message="Los vehículos de esta Sede aparecerán aquí." />
    <EmptyState v-else-if="!filtered.length" title="Sin resultados" message="No hay vehículos con esa placa." />
    <ResponsiveTable v-else>
      <template #table>
        <table class="vehicles-table">
          <thead><tr><th>Placa</th><th>Estado</th><th class="actions-heading">Acciones</th></tr></thead>
          <tbody>
            <tr v-for="vehicle in filtered" :key="vehicle.id">
              <td><strong>{{ vehicle.placa }}</strong></td>
              <td><StatusBadge :tone="vehicle.activo ? 'success' : 'neutral'">{{ vehicle.activo ? 'Activo' : 'Inactivo' }}</StatusBadge></td>
              <td><div class="actions">
                <button :aria-label="'Certificados de ' + vehicle.placa" title="Ver certificados" @click="openHistory(vehicle)"><FileText :size="17" /></button>
                <button v-if="enabled" :aria-label="'Editar ' + vehicle.placa" title="Editar" @click="edit(vehicle)"><Pencil :size="17" /></button>
                <button v-if="enabled && vehicle.activo" :aria-label="'Eliminar ' + vehicle.placa" title="Eliminar o desactivar" :disabled="saving" @click="deleteTarget = vehicle"><Trash2 :size="17" /></button>
                <button v-else-if="enabled" :aria-label="'Reactivar ' + vehicle.placa" title="Reactivar" :disabled="saving" @click="setActive(vehicle, true)"><RotateCcw :size="17" /></button>
              </div></td>
            </tr>
          </tbody>
        </table>
      </template>
      <template #cards>
        <div class="vehicle-cards">
          <article v-for="vehicle in filtered" :key="vehicle.id" class="vehicle-card">
            <div class="vehicle-identity"><strong>{{ vehicle.placa }}</strong><StatusBadge :tone="vehicle.activo ? 'success' : 'neutral'">{{ vehicle.activo ? 'Activo' : 'Inactivo' }}</StatusBadge></div>
            <div class="actions">
              <button :aria-label="'Certificados de ' + vehicle.placa" title="Ver certificados" @click="openHistory(vehicle)"><FileText :size="17" /></button>
              <button v-if="enabled" :aria-label="'Editar ' + vehicle.placa" title="Editar" @click="edit(vehicle)"><Pencil :size="17" /></button>
              <button v-if="enabled && vehicle.activo" :aria-label="'Eliminar ' + vehicle.placa" title="Eliminar o desactivar" :disabled="saving" @click="deleteTarget = vehicle"><Trash2 :size="17" /></button>
              <button v-else-if="enabled" :aria-label="'Reactivar ' + vehicle.placa" title="Reactivar" :disabled="saving" @click="setActive(vehicle, true)"><RotateCcw :size="17" /></button>
            </div>
          </article>
        </div>
      </template>
    </ResponsiveTable>
    <BaseDialog :model-value="formOpen" :title="editing ? 'Editar vehículo' : 'Agregar vehículo'" size="compact"
      @update:model-value="!saving && (formOpen = $event)">
      <VehicleForm :key="editing?.id ?? 'new'" v-model="form" :mode="editing ? 'edit' : 'create'" :disabled="saving"
        @submit="save" @invalid="notifications.show('Revisa la placa.', 'error')" />
      <template #footer>
        <BaseButton variant="secondary" :disabled="saving" @click="formOpen = false">Cancelar</BaseButton>
        <BaseButton form="vehicle-form" type="submit" :loading="saving">{{ editing ? 'Guardar cambios' : 'Crear vehículo' }}</BaseButton>
      </template>
    </BaseDialog>
    <ConfirmDialog :open="Boolean(deleteTarget)" title="Eliminar vehículo"
      :message="`Se eliminará ${deleteTarget?.placa ?? 'el vehículo'} solo si no tiene historial ni dependencias.`"
      confirm-label="Eliminar" danger :loading="saving" @cancel="deleteTarget = null" @confirm="remove" />
    <ConfirmDialog :open="Boolean(dependencyTarget)" title="Desactivar vehículo"
      message="Este vehículo tiene historial y no puede eliminarse. Se conservarán sus servicios y certificados."
      confirm-label="Desactivar" danger :loading="saving" @cancel="dependencyTarget = null"
      @confirm="dependencyTarget && setActive(dependencyTarget, false)" />
    <BaseDialog :model-value="Boolean(historyVehicle)" :title="`Certificados · ${historyVehicle?.placa ?? ''}`" size="wide"
      @update:model-value="!$event && closeHistory()">
      <template v-if="previewDocument">
        <BaseButton size="compact" variant="ghost" @click="previewDocument = null; previewUrl = ''">← Volver a certificados</BaseButton>
        <p class="certificate-description">{{ previewDocument.solicitud }} · {{ formatDate(previewDocument.issuedOn) }}</p>
        <iframe v-if="previewUrl" class="certificate-frame" :src="previewUrl" :title="'Certificado de ' + historyVehicle?.placa" />
      </template>
      <template v-else>
        <LoadingSkeleton v-if="historyLoading" label="Cargando certificados" :lines="3" />
        <ErrorState v-else-if="historyError" title="No se pudieron consultar los certificados" :message="historyError">
          <BaseButton variant="secondary" @click="loadHistory(historyPage)">Reintentar</BaseButton>
        </ErrorState>
        <EmptyState v-else-if="!documents.length" title="Sin certificados" message="Este vehículo aún no tiene certificados generados." />
        <template v-else>
          <div class="certificate-list">
            <div v-for="document in documents" :key="document.id" class="certificate-row">
              <FileText :size="18" class="certificate-icon" />
              <div class="certificate-meta">
                <strong>{{ document.solicitud }}</strong>
                <small>Expedido: {{ formatDate(document.issuedOn) }} · Vence: {{ formatDate(document.expiresOn) }}</small>
                <small v-if="!document.pdfAvailable" class="unavailable">PDF no disponible · Se conserva su registro histórico</small>
              </div>
              <BaseButton v-if="document.pdfAvailable" variant="ghost" size="compact" :disabled="previewLoading" @click="view(document)"><Eye :size="16" />Ver</BaseButton>
            </div>
          </div>
          <div v-if="historyPage > 1 || hasMore" class="history-pagination">
            <BaseButton size="compact" variant="ghost" :disabled="historyLoading || historyPage === 1" @click="loadHistory(historyPage - 1)">Anterior</BaseButton>
            <small>Página {{ historyPage }}</small>
            <BaseButton size="compact" variant="ghost" :disabled="historyLoading || !hasMore" @click="loadHistory(historyPage + 1)">Siguiente</BaseButton>
          </div>
        </template>
      </template>
      <template #footer>
        <BaseButton v-if="previewDocument" size="compact" variant="secondary" @click="download(previewDocument)"><Download :size="16" />Descargar PDF</BaseButton>
        <BaseButton size="compact" variant="ghost" @click="closeHistory">Cerrar</BaseButton>
      </template>
    </BaseDialog>
  </section>
</template>

<style scoped>
.vehicles-panel { display:grid; gap:.75rem; min-width:0; }
.vehicles-header { display:flex; justify-content:space-between; align-items:center; gap:.5rem; flex-wrap:wrap; }
.vehicles-header h2 { font-size:1rem; margin:0; font-weight:600; }
.vehicles-header p { font-size:.78rem; margin:.15rem 0 0; color:var(--text-secondary); }
.vehicles-search { max-width:21rem; }
.disabled-notice { margin:0; padding:.65rem .75rem; border:1px solid var(--border); border-radius:var(--radius); color:var(--text-secondary); font-size:.84rem; }
.vehicles-table { width:100%; border-collapse:collapse; font-size:.875rem; }
.vehicles-table th { color:var(--text-secondary); font-size:.75rem; font-weight:500; text-align:left; }
.vehicles-table td,.vehicles-table th { padding:.65rem .85rem; border-bottom:1px solid var(--border); }
.vehicles-table .actions-heading { text-align:right; }
.actions { display:flex; align-items:center; justify-content:flex-end; gap:.25rem; }
.actions button { display:grid; place-items:center; background:transparent; border:0; border-radius:var(--radius-sm); min-height:38px; min-width:38px; color:var(--text-secondary); cursor:pointer; }
.actions button:hover { color:var(--text); background:var(--hover); }
.actions button:focus-visible { outline:2px solid var(--accent); }
.actions button:disabled { opacity:.45; cursor:default; }
.vehicle-cards { display:grid; gap:.5rem; }
.vehicle-card { display:flex; justify-content:space-between; align-items:center; gap:.5rem; border:1px solid var(--border); border-radius:var(--radius); padding:.4rem .6rem; }
.vehicle-identity { display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; }
.certificate-list { display:grid; }
.certificate-row { display:flex; align-items:center; gap:.75rem; border-bottom:1px solid var(--border); padding:.6rem 0; }
.certificate-meta { flex:1; min-width:0; display:grid; gap:.15rem; }
.certificate-meta small,.certificate-description { color:var(--text-secondary); font-size:.8rem; }
.certificate-icon { color:var(--text-secondary); flex:none; }
.certificate-meta .unavailable { color:var(--text-secondary); }
.certificate-frame { width:100%; height:60dvh; background:white; border:1px solid var(--border); border-radius:var(--radius-sm); }
.history-pagination { display:flex; justify-content:flex-end; align-items:center; gap:.5rem; padding-top:.5rem; }
@media(max-width:600px) {
  .actions button { min-width:44px; min-height:44px; }
  .certificate-row { gap:.35rem; }
  .certificate-frame { height:68dvh; }
}
</style>
