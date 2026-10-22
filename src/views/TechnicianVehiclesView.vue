<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, Check, Plus, Truck, WifiOff } from 'lucide-vue-next'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import ServicePage from '@/components/domain/services/ServicePage.vue'
import TechnicianServiceNavigation from '@/components/domain/services/TechnicianServiceNavigation.vue'
import { orderedTechnicianAreas } from '@/helpers/technicianServices'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import { useTechnicianServicesStore } from '@/stores/technicianServices'

const services = useTechnicianServicesStore()
const route = useRoute()
const router = useRouter()
const { online } = useNetworkStatus()
const serviceId = computed(() => String(route.params.id ?? ''))
const context = computed(() => services.currentPackage)
const loading = ref(true)
const error = ref('')
const notice = ref('')
const busy = ref(false)
const savingDraft = ref(false)
const search = ref('')
const filter = ref<'all' | 'selected'>('all')
const showCreate = ref(false)
const newPlate = ref('')
const selection = computed(() => context.value?.vehicleDraftIds ?? context.value?.attendedVehicleIds ?? [])
const selected = computed(() => new Set(selection.value))
const confirmed = computed(() => context.value?.attendedVehicleIds !== null && context.value?.attendedVehicleIds !== undefined)
const changed = computed(() => JSON.stringify([...selection.value].sort()) !==
  JSON.stringify([...(context.value?.attendedVehicleIds ?? [])].sort()))
const editable = computed(() => context.value?.service.estado === 'EN_PROCESO'
  && Boolean(services.currentCache?.lock))
const firstAreaId = computed(() => orderedTechnicianAreas(context.value?.areas ?? [])[0]?.id)
const pendingChanges = computed(() => services.currentMutations.filter(
  item => item.kind === 'VEHICLE_CREATE' || item.kind === 'VEHICLE_SELECTION'))
const conflict = computed(() => pendingChanges.value.find(item => item.status === 'CONFLICT'))
const hasFinalization = computed(() => services.currentMutations.some(item => item.kind === 'SERVICE_FINALIZE'))
const visible = computed(() => {
  const term = search.value.trim().toUpperCase().replace(/\s/g, '')
  return (context.value?.vehicles ?? []).filter(vehicle =>
    (!term || vehicle.placa.replace(/\s/g, '').includes(term))
      && (filter.value === 'all' || selected.value.has(vehicle.id)))
})
const visibleLimit = ref(40)
const shown = computed(() => visible.value.slice(0, visibleLimit.value))
const plateError = computed(() => {
  const plate = newPlate.value.trim().toUpperCase()
  if (!/^[A-Z0-9-]{3,12}$/.test(plate)) return 'Utiliza de 3 a 12 letras, números o guiones.'
  if (context.value?.vehicles.some(vehicle => vehicle.placa === plate)) return 'Esta placa ya está registrada.'
  return ''
})

onMounted(async () => {
  try { await services.ensurePackage(serviceId.value) }
  catch (failure) { error.value = failure instanceof Error ? failure.message : 'No fue posible cargar los vehículos.' }
  finally { loading.value = false }
})

async function toggle(id: string): Promise<void> {
  if (!editable.value || savingDraft.value || busy.value || hasFinalization.value) return
  savingDraft.value = true
  error.value = ''
  const ids = selected.value.has(id) ? selection.value.filter(value => value !== id) : [...selection.value, id]
  try { await services.applyVehicleDraft(serviceId.value, ids); notice.value = 'Selección guardada en este celular.' }
  catch (failure) { error.value = failure instanceof Error ? failure.message : 'No se pudo guardar la selección.' }
  finally { savingDraft.value = false }
}

async function addVehicle(): Promise<void> {
  if (plateError.value || busy.value) return
  busy.value = true
  error.value = ''
  const plate = newPlate.value.trim().toUpperCase()
  try {
    const outcome = await services.applyVehicleCreation(serviceId.value, plate)
    if (outcome === 'conflict') return
    showCreate.value = false
    newPlate.value = ''
    search.value = plate
    filter.value = 'all'
    notice.value = outcome === 'pending'
      ? 'Placa guardada en el celular. Se sincronizará con conexión.'
      : 'Placa registrada. Puedes continuar con la selección.'
  } catch (failure) { error.value = failure instanceof Error ? failure.message : 'No fue posible registrar la placa.' }
  finally { busy.value = false }
}

async function confirm(): Promise<void> {
  if (!editable.value || busy.value || savingDraft.value || hasFinalization.value) return
  busy.value = true
  error.value = ''
  try {
    const outcome = await services.confirmVehicleSelection(serviceId.value)
    if (outcome === 'conflict') {
      error.value = 'Un cambio necesita revisión. Conservamos tu selección en este celular.'
      return
    }
    await router.push({ name: 'technician-service-review', params: { id: serviceId.value } })
  } catch (failure) { error.value = failure instanceof Error ? failure.message : 'No fue posible confirmar los vehículos.' }
  finally { busy.value = false }
}

function openPrevious(): void {
  if (firstAreaId.value) {
    void router.push({ name: 'technician-service-area',
      params: { id: serviceId.value, areaId: firstAreaId.value }, query: { tab: 'findings' } })
  } else void router.push({ name: 'technician-service-work', params: { id: serviceId.value }, query: { overview: '1' } })
}
</script>

<template>
  <ServicePage title="Vehículos atendidos" :caption="context?.service.solicitud">
    <LoadingSkeleton v-if="loading" label="Preparando vehículos" :rows="5" />
    <StatusPanel v-else-if="error && !context" tone="danger" title="Vehículos no disponibles" :message="error" />
    <template v-else-if="context">
      <TechnicianServiceNavigation :service-id="serviceId" active="vehicles"
        :vehicles-enabled="context.vehiclesEnabled" :first-area-id="firstAreaId" />
      <StatusPanel v-if="!context.vehiclesEnabled" tone="neutral" compact title="No aplica"
        message="Esta sede no requiere registro de vehículos." />
      <template v-else>
        <div class="vehicle-overview">
          <span><Truck :size="17" aria-hidden="true" /> <strong>{{ selection.length }}</strong> atendidos</span>
          <span>{{ context.vehicles.length }} registrados</span>
          <span v-if="!online" class="vehicle-offline"><WifiOff :size="15" /> Sin conexión</span>
        </div>
        <p class="vehicle-help">Marca solo los vehículos que realmente recibieron atención. No necesitas atender toda la flota.</p>
        <StatusPanel v-if="conflict" tone="warning" compact title="Sincronización pendiente de revisión"
          :message="conflict.error || 'Conservamos los datos en este dispositivo; revisa la selección antes de reintentar.'" />
        <p v-if="error" role="alert" class="vehicle-error">{{ error }}</p>
        <div v-if="notice" class="vehicle-feedback" role="status">{{ notice }}</div>
        <section class="vehicle-workspace">
          <div class="vehicle-search">
            <BaseInput v-model="search" name="service-vehicle-search" label="Buscar placa"
              placeholder="Ej. ABC123" autocomplete="off" />
            <BaseButton v-if="editable && !hasFinalization" variant="secondary" size="compact"
              :disabled="busy" @click="showCreate = !showCreate">
              <Plus :size="17" /> Nueva placa
            </BaseButton>
          </div>
          <form v-if="showCreate" class="vehicle-create" @submit.prevent="addVehicle">
            <BaseInput v-model="newPlate" name="service-new-plate" label="Placa nueva"
              placeholder="ABC123" :maxlength="12" autocomplete="off"
              :error="newPlate ? plateError : undefined" />
            <div class="vehicle-create__actions">
              <BaseButton type="button" variant="ghost" size="compact" @click="showCreate = false">Cancelar</BaseButton>
              <BaseButton type="submit" size="compact" :loading="busy" :disabled="Boolean(plateError)">Agregar placa</BaseButton>
            </div>
          </form>
          <div class="vehicle-filters" role="group" aria-label="Filtrar vehículos">
            <button type="button" :aria-pressed="filter === 'all'" @click="filter = 'all'; visibleLimit = 40">Todos ({{ context.vehicles.length }})</button>
            <button type="button" :aria-pressed="filter === 'selected'" @click="filter = 'selected'; visibleLimit = 40">Atendidos ({{ selection.length }})</button>
          </div>
          <p v-if="!visible.length" class="vehicle-empty">
            {{ search ? 'No encontramos placas con ese texto.' :
              filter === 'selected' ? 'Aún no has seleccionado vehículos.' : 'No hay vehículos registrados. Puedes agregar una placa.' }}
          </p>
          <div v-else class="vehicle-list">
            <button v-for="vehicle in shown" :key="vehicle.id" type="button" class="vehicle-item"
              :class="{ 'vehicle-item--selected': selected.has(vehicle.id) }"
              :aria-pressed="selected.has(vehicle.id)"
              :disabled="!editable || savingDraft || busy || hasFinalization || (!vehicle.activo && !selected.has(vehicle.id))"
              @click="toggle(vehicle.id)">
              <span class="vehicle-check" aria-hidden="true"><Check v-if="selected.has(vehicle.id)" :size="16" stroke-width="3" /></span>
              <span class="vehicle-item__identity"><strong>{{ vehicle.placa }}</strong>
                <small v-if="vehicle.creacionPendiente">Nueva · pendiente de sincronizar</small>
                <small v-else-if="!vehicle.activo">Inactivo · histórico</small>
              </span>
            </button>
          </div>
          <BaseButton v-if="visible.length > visibleLimit" variant="secondary" size="compact" class="vehicle-show-more"
            @click="visibleLimit += 40">Mostrar más ({{ visible.length - visibleLimit }} restantes)</BaseButton>
        </section>
        <div class="vehicle-footer">
          <div class="vehicle-footer__state">
            <span v-if="savingDraft">Guardando en este celular…</span>
            <span v-else-if="changed">Selección modificada · falta confirmar</span>
            <span v-else-if="pendingChanges.length">Hay cambios por sincronizar</span>
            <span v-else-if="confirmed">Atención confirmada · {{ selection.length }} vehículos</span>
            <span v-else>Sin confirmar</span>
          </div>
          <div class="vehicle-footer__actions">
            <BaseButton variant="secondary" size="compact" @click="openPrevious"><ArrowLeft :size="16" /> Áreas</BaseButton>
            <BaseButton v-if="editable && !hasFinalization && (!confirmed || changed)" :loading="busy"
              :disabled="savingDraft" @click="confirm">
              Confirmar {{ selection.length }} {{ selection.length === 1 ? 'atendido' : 'atendidos' }} <ArrowRight :size="16" />
            </BaseButton>
            <BaseButton v-else :disabled="!confirmed" @click="router.push({ name: 'technician-service-review', params: { id: serviceId } })">
              Ir al cierre <ArrowRight :size="16" />
            </BaseButton>
          </div>
        </div>
      </template>
    </template>
  </ServicePage>
</template>

<style scoped>
.vehicle-overview { display:flex; align-items:center; flex-wrap:wrap; gap:.45rem 1rem;
  font-size:.82rem; color:var(--text-secondary); }
.vehicle-overview span { display:inline-flex; align-items:center; gap:.35rem; }
.vehicle-overview strong { color:var(--text); font-size:1rem; }
.vehicle-offline { color:var(--warning); }
.vehicle-help { margin:-.3rem 0 0; font-size:.8rem; color:var(--text-secondary); }
.vehicle-workspace { border:1px solid var(--border); border-radius:var(--radius-lg);
  padding:.8rem; background:var(--surface); display:grid; gap:.75rem; }
.vehicle-search { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:end; gap:.5rem; }
.vehicle-search :deep(.base-field) { min-width:0; }
.vehicle-search :deep(.base-button) { margin-bottom:.1rem; }
.vehicle-create { display:grid; gap:.55rem; border:1px solid var(--border); border-radius:var(--radius);
  padding:.75rem; background:var(--surface-raised); }
.vehicle-create__actions { display:flex; flex-wrap:wrap; gap:.4rem; justify-content:flex-end; }
.vehicle-filters { display:flex; gap:.3rem; }
.vehicle-filters button { min-height:37px; padding:.3rem .8rem; font:inherit; font-size:.82rem;
  border:1px solid var(--border); border-radius:var(--radius); background:transparent;
  color:var(--text-secondary); cursor:pointer; }
.vehicle-filters button[aria-pressed="true"] { color:var(--accent); background:var(--accent-subtle);
  border-color:var(--accent); font-weight:600; }
.vehicle-list { display:grid; gap:.25rem; }
.vehicle-show-more { width:100%; }
.vehicle-item { display:flex; align-items:center; width:100%; min-height:49px; text-align:left;
  gap:.75rem; padding:.42rem .6rem; background:transparent; border:1px solid transparent;
  color:var(--text); border-radius:var(--radius); font:inherit; cursor:pointer; }
.vehicle-item:hover:not(:disabled) { background:var(--hover); }
.vehicle-item--selected { background:var(--accent-subtle); border-color:var(--border); }
.vehicle-item:disabled { cursor:default; opacity:.72; }
.vehicle-item:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }
.vehicle-check { flex-shrink:0; display:grid; place-items:center; width:23px; height:23px; border-radius:6px;
  border:1.5px solid var(--border-strong); color:white; }
.vehicle-item--selected .vehicle-check { background:var(--accent); border-color:var(--accent); }
.vehicle-item__identity { display:grid; min-width:0; gap:.08rem; font-size:.91rem; }
.vehicle-item__identity small { color:var(--text-secondary); font-size:.72rem; }
.vehicle-footer { position:sticky; bottom:0; display:grid; gap:.5rem; border:1px solid var(--border);
  border-radius:var(--radius); background:var(--surface-raised); padding:.65rem; z-index:3; }
.vehicle-footer__state { color:var(--text-secondary); font-size:.77rem; }
.vehicle-footer__actions { display:flex; gap:.5rem; justify-content:space-between; }
.vehicle-footer__actions :deep(.base-button:last-child) { flex:1; max-width:21rem; }
.vehicle-feedback { color:var(--success); font-size:.8rem; }
.vehicle-error { margin:0; color:var(--danger); font-size:.82rem; }
.vehicle-empty { margin:0; color:var(--text-secondary); font-size:.84rem; padding:.75rem 0; }
@media(max-width:410px) {
  .vehicle-search { grid-template-columns:minmax(0,1fr); }
  .vehicle-search :deep(.base-button) { justify-self:start; }
  .vehicle-footer__actions { flex-wrap:wrap; }
}
</style>
