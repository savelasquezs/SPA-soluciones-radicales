<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseDateTimePicker from '@/components/base/BaseDateTimePicker.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import { useFormValidation } from '@/composables/useFormValidation'
import { clearServiceDraft, loadServiceDraft, saveServiceDraft } from '@/services/draftService'
import { createScheduledService, getServiceWorkspace, retryServiceCalendar } from '@/services/servicesService'
import { useNotificationsStore } from '@/stores/notifications'
import { useAuthStore } from '@/stores/auth'
import type { ClientSite, ServiceDraft, ServiceRecord, Technician } from '@/types/domain'

const session = useAuthStore()
const notifications = useNotificationsStore()
const router = useRouter()
const clients = ref<ClientSite[]>([])
const technicians = ref<Technician[]>([])
const services = ref<ServiceRecord[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const saving = ref(false)
const retryingId = ref<string | null>(null)
const online = ref(navigator.onLine)
let draftReady = false
let draftPersistenceWarningShown = false

const defaultStart = () => {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000)
  date.setMinutes(0, 0, 0)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

const form = reactive<ServiceDraft>({
  sedeId: '',
  tecnicoResponsableId: '',
  tecnicosColaboradoresIds: [],
  inicioProgramado: defaultStart(),
  duracionMinutos: '120',
  observaciones: '',
})

const selectedSite = computed(() => clients.value.find((client) => client.sedeId === form.sedeId))
const serviceValidation = useFormValidation(form, {
  sedeId: (value) => String(value).trim() ? null : 'Selecciona una Sede',
  tecnicoResponsableId: (value) => String(value).trim() ? null : 'Selecciona el Técnico responsable',
  inicioProgramado: (value) => Number.isNaN(new Date(String(value)).getTime()) ? 'Ingresa una fecha válida' : null,
  duracionMinutos: (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0
    ? null
    : 'La duración debe ser un entero mayor que cero',
})

watch(
  form,
  async (draft) => {
    if (draftReady) {
      try {
        await saveServiceDraft({ ...draft, tecnicosColaboradoresIds: [...draft.tecnicosColaboradoresIds] })
        draftPersistenceWarningShown = false
      } catch {
        if (!draftPersistenceWarningShown) {
          notifications.show('No pudimos guardar el borrador local', 'warning')
          draftPersistenceWarningShown = true
        }
      }
    }
  },
  { deep: true },
)

onMounted(async () => {
  window.addEventListener('online', updateConnectivity)
  window.addEventListener('offline', updateConnectivity)
  const draft = await loadServiceDraft()
  if (draft) {
    Object.assign(form, draft)
    notifications.show('Recuperamos tu borrador de programación', 'info')
  }
  draftReady = true
  await loadData()
})

onBeforeUnmount(() => {
  window.removeEventListener('online', updateConnectivity)
  window.removeEventListener('offline', updateConnectivity)
})

async function loadData(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    const workspace = await getServiceWorkspace(session.isAdmin)
    clients.value = workspace.clients
    technicians.value = workspace.technicians
    services.value = workspace.services
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'No fue posible cargar los Servicios'
  } finally {
    loading.value = false
  }
}

async function createService(): Promise<void> {
  if (!online.value) {
    notifications.show('El borrador quedó guardado. Conéctate para programar el Servicio.', 'warning')
    return
  }
  if (!serviceValidation.validate()) return

  saving.value = true
  try {
    const created = await createScheduledService(form)
    draftReady = false
    services.value = [created, ...services.value]
    form.sedeId = ''
    form.tecnicoResponsableId = ''
    form.tecnicosColaboradoresIds = []
    form.inicioProgramado = defaultStart()
    form.duracionMinutos = '120'
    form.observaciones = ''
    try {
      await clearServiceDraft()
    } catch {
      notifications.show('El Servicio se creó, pero no pudimos limpiar el borrador local', 'warning')
    } finally {
      draftReady = true
    }
    serviceValidation.resetValidation()
    notifications.show(
      created.calendarSyncEstado === 'SINCRONIZADO'
        ? `${created.solicitud} programado y sincronizado con Calendar`
        : `${created.solicitud} guardado; Calendar quedó pendiente`,
      created.calendarSyncEstado === 'SINCRONIZADO' ? 'success' : 'warning',
    )
    await loadData()
  } catch (error) {
    notifications.show(error instanceof Error ? error.message : 'No fue posible programar el Servicio', 'error')
  } finally {
    saving.value = false
  }
}

async function retryCalendar(service: ServiceRecord): Promise<void> {
  retryingId.value = service.id
  try {
    const updated = await retryServiceCalendar(service.id)
    services.value = services.value.map((record) => (record.id === service.id ? { ...record, ...updated } : record))
    notifications.show('Evento sincronizado con Calendar', 'success')
  } catch (error) {
    notifications.show(error instanceof Error ? error.message : 'Calendar volvió a fallar', 'error')
  } finally {
    retryingId.value = null
  }
}

function updateConnectivity(): void {
  online.value = navigator.onLine
}

function selectSite(sedeId: string): void {
  form.sedeId = sedeId
  const site = clients.value.find((client) => client.sedeId === sedeId)
  if (site) form.duracionMinutos = String(site.duracionServicioMinutos)
}

function calendarBadge(status: ServiceRecord['calendarSyncEstado']): string {
  if (status === 'SINCRONIZADO') return 'badge--success'
  if (status === 'ERROR') return 'badge--danger'
  return 'badge--warning'
}

function formatDate(value?: string): string {
  return value
    ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : '—'
}
</script>

<template>
  <div class="page">
      <header class="page-header">
        <div>
          <h1>Servicios</h1>
          <p>Programa la visita interna primero; Calendar se sincroniza como efecto reintentable.</p>
        </div>
        <span class="badge" :class="online ? 'badge--success' : 'badge--warning'">{{ online ? 'En línea' : 'Sin conexión' }}</span>
      </header>

      <template v-if="session.isAdmin">
        <form class="card" novalidate @submit.prevent="createService">
          <div class="section-heading">
            <div>
              <h2>Programar Servicio</h2>
              <p class="muted">El valor se deriva de la Sede y la duración puede ajustarse para esta visita.</p>
            </div>
            <BaseButton variant="secondary" @click="router.push('/clientes')">Administrar clientes</BaseButton>
          </div>
          <div class="form-grid service-form">
            <BaseSelect
              :model-value="form.sedeId"
              label="Negocio y Sede"
              name="sedeId"
              required
              :error="serviceValidation.error('sedeId')"
              @update:model-value="selectSite"
              @blur="serviceValidation.touch('sedeId')"
            >
              <option value="" disabled>Selecciona una Sede</option>
              <option v-for="client in clients" :key="client.sedeId" :value="client.sedeId">
                {{ client.negocioNombre }} · {{ client.sedeNombre }}
              </option>
            </BaseSelect>
            <BaseSelect
              v-model="form.tecnicoResponsableId"
              label="Técnico responsable"
              name="tecnicoResponsableId"
              required
              :error="serviceValidation.error('tecnicoResponsableId')"
              @blur="serviceValidation.touch('tecnicoResponsableId')"
            >
              <option value="" disabled>Selecciona un Técnico</option>
              <option v-for="technician in technicians" :key="technician.id" :value="technician.id">
                {{ technician.nombreCompleto }}
              </option>
            </BaseSelect>
            <BaseDateTimePicker
              v-model="form.inicioProgramado"
              mode="datetime"
              label="Inicio programado"
              name="inicioProgramado"
              required
              :error="serviceValidation.error('inicioProgramado')"
              @blur="serviceValidation.touch('inicioProgramado')"
            />
            <BaseInput
              v-model="form.duracionMinutos"
              label="Duración en minutos"
              name="duracionMinutos"
              type="number"
              min="1"
              step="1"
              required
              :error="serviceValidation.error('duracionMinutos')"
              @blur="serviceValidation.touch('duracionMinutos')"
            />
            <div class="summary-field form-grid__wide">
              <span>Valor del Servicio</span>
              <strong v-if="selectedSite">${{ selectedSite.valorServicio.toLocaleString('es-CO') }}</strong>
              <strong v-else>Selecciona una Sede</strong>
            </div>
            <BaseTextarea v-model="form.observaciones" class="form-grid__wide" label="Observaciones" name="observaciones" :rows="3" />
          </div>
          <div class="form-actions">
            <BaseButton type="submit" :loading="saving" :disabled="!online">Programar Servicio</BaseButton>
          </div>
        </form>

      </template>

      <LoadingSkeleton v-if="loading" label="Cargando Servicios" :lines="5" />
      <StatusPanel v-else-if="loadError" title="No pudimos cargar los Servicios" :message="loadError" tone="danger">
        <BaseButton variant="secondary" @click="loadData">Reintentar</BaseButton>
      </StatusPanel>
      <StatusPanel v-else-if="services.length === 0" title="No hay Servicios visibles" message="Los Servicios programados aparecerán aquí." />
      <section v-else class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Servicio</th>
              <th>Programación</th>
              <th>Técnico</th>
              <th>Calendar</th>
              <th v-if="session.isAdmin">Acción</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="service in services" :key="service.id">
              <td data-label="Servicio"><strong>{{ service.solicitud }}</strong><br /><span class="muted">{{ service.negocioNombre }} · {{ service.sedeNombre }}</span></td>
              <td data-label="Programación">
                {{ formatDate(service.inicioProgramado) }}<br />
                <small class="muted">Hasta {{ formatDate(service.finProgramado) }}</small>
              </td>
              <td data-label="Técnico">{{ service.tecnicoNombre ?? '—' }}</td>
              <td data-label="Calendar">
                <span class="badge" :class="calendarBadge(service.calendarSyncEstado)">{{ service.calendarSyncEstado }}</span>
                <small v-if="service.calendarEventId" class="calendar-event">Evento {{ service.calendarEventId }}</small>
                <small v-if="service.calendarSyncError" class="calendar-error">{{ service.calendarSyncError }}</small>
              </td>
              <td v-if="session.isAdmin" data-label="Acción">
                <BaseButton
                  v-if="service.calendarSyncEstado === 'ERROR'"
                  variant="secondary"
                  :loading="retryingId === service.id"
                  @click="retryCalendar(service)"
                >
                  Reintentar
                </BaseButton>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

  </div>
</template>

<style scoped>
.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.service-form {
  margin-top: 1.25rem;
}

.summary-field {
  display: grid;
  gap: 0.45rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 650;
}

.summary-field strong {
  display: flex;
  min-height: 44px;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-hover);
  padding: 0.65rem 0.75rem;
  color: var(--text);
}

.calendar-error {
  display: block;
  max-width: 22rem;
  margin-top: 0.35rem;
  color: var(--danger);
}

.calendar-event {
  display: block;
  max-width: 22rem;
  margin-top: 0.35rem;
  overflow-wrap: anywhere;
  color: var(--text-muted);
}

@media (max-width: 620px) {
  .section-heading {
    display: grid;
  }

  .table-wrap {
    overflow: visible;
  }

  table,
  tbody,
  tr,
  td {
    display: block;
  }

  thead {
    display: none;
  }

  tbody {
    display: grid;
    gap: 0.8rem;
  }

  tr {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.8rem;
  }

  td {
    display: grid;
    grid-template-columns: minmax(6rem, 0.7fr) minmax(0, 1.3fr);
    gap: 0.65rem;
    border: 0;
    padding: 0.45rem 0;
  }

  td::before {
    content: attr(data-label);
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 750;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
}
</style>
