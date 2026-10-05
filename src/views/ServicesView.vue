<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import AppShell from '@/components/layout/AppShell.vue'
import { useFormValidation } from '@/composables/useFormValidation'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import { apiRequest } from '@/services/apiService'
import { clearServiceDraft, loadServiceDraft, saveServiceDraft } from '@/services/draftService'
import { useNotificationsStore } from '@/stores/notifications'
import { useSessionStore } from '@/stores/session'
import type { ClientSite, ServiceDraft, ServiceRecord, Technician } from '@/types/domain'

type ClientSiteWire = Omit<ClientSite, 'valorServicio'> & { valorServicio: number | string }

const session = useSessionStore()
const notifications = useNotificationsStore()
const clients = ref<ClientSite[]>([])
const technicians = ref<Technician[]>([])
const services = ref<ServiceRecord[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const saving = ref(false)
const savingClient = ref(false)
const showClientForm = ref(false)
const closeClientConfirmOpen = ref(false)
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

const emptyClientForm = () => ({
  negocioId: '',
  nit: '',
  negocioNombre: '',
  sedeNombre: '',
  direccion: '',
  contactoNombre: '',
  contactoCorreo: '',
  valorServicio: '',
  periodicidadMeses: '1',
  manejaRefuerzo: false,
  tipoSede: 'NEGOCIO',
  duracionServicioMinutos: '120',
  correos: [] as string[],
})
const clientForm = reactive(emptyClientForm())
const clientFormDirty = computed(() => JSON.stringify(clientForm) !== JSON.stringify(emptyClientForm()))
const {
  confirmOpen: discardConfirmOpen,
  cancelDiscard,
  confirmDiscard,
} = useUnsavedChanges(computed(() => showClientForm.value && clientFormDirty.value))

const selectedSite = computed(() => clients.value.find((client) => client.sedeId === form.sedeId))
const businesses = computed(() => Array.from(
  new Map(clients.value.map((client) => [client.negocioId, {
    id: client.negocioId,
    nombre: client.negocioNombre,
    nit: client.nit,
  }])).values(),
).sort((a, b) => a.nombre.localeCompare(b.nombre)))
const serviceValidation = useFormValidation(form, {
  sedeId: (value) => String(value).trim() ? null : 'Selecciona una Sede',
  tecnicoResponsableId: (value) => String(value).trim() ? null : 'Selecciona el Técnico responsable',
  inicioProgramado: (value) => Number.isNaN(new Date(String(value)).getTime()) ? 'Ingresa una fecha válida' : null,
  duracionMinutos: (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0
    ? null
    : 'La duración debe ser un entero mayor que cero',
})
const clientValidation = useFormValidation(clientForm, {
  nit: (value, current) => current.negocioId || String(value).trim() ? null : 'El NIT es obligatorio',
  negocioNombre: (value, current) => current.negocioId || String(value).trim()
    ? null
    : 'El nombre del Negocio es obligatorio',
  sedeNombre: (value) => String(value).trim() ? null : 'El nombre de la Sede es obligatorio',
  direccion: (value) => String(value).trim() ? null : 'La dirección es obligatoria',
  contactoNombre: (value) => String(value).trim() ? null : 'El contacto principal es obligatorio',
  contactoCorreo: (value) => !String(value).trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))
    ? null
    : 'Ingresa un correo válido',
  valorServicio: (value) => Number.isSafeInteger(Number(value)) && Number(value) >= 0
    ? null
    : 'El valor debe ser un entero en COP',
  periodicidadMeses: (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0
    ? null
    : 'La periodicidad debe ser mayor que cero',
  duracionServicioMinutos: (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0
    ? null
    : 'La duración debe ser mayor que cero',
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
    if (session.isAdmin) {
      const [clientRows, technicianRows, serviceRows] = await Promise.all([
        apiRequest<ClientSiteWire[]>('api/clients'),
        apiRequest<Technician[]>('api/catalogs/technicians'),
        apiRequest<ServiceRecord[]>('api/services'),
      ])
      clients.value = clientRows.map(normalizeClientSite)
      technicians.value = technicianRows
      services.value = serviceRows
    } else {
      services.value = await apiRequest<ServiceRecord[]>('api/services')
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'No fue posible cargar los Servicios'
  } finally {
    loading.value = false
  }
}

async function createClient(): Promise<void> {
  if (!clientValidation.validate()) return
  savingClient.value = true
  try {
    const addedToExistingBusiness = Boolean(clientForm.negocioId)
    const result = normalizeClientSite(await apiRequest<ClientSiteWire>('api/clients', {
      method: 'POST',
      body: JSON.stringify({
        ...clientForm,
        valorServicio: Number(clientForm.valorServicio),
        periodicidadMeses: Number(clientForm.periodicidadMeses),
        duracionServicioMinutos: Number(clientForm.duracionServicioMinutos),
        correos: clientForm.contactoCorreo ? [clientForm.contactoCorreo] : [],
      }),
    }))
    clients.value = [...clients.value, result].sort((a, b) =>
      `${a.negocioNombre}\u0000${a.sedeNombre}`.localeCompare(`${b.negocioNombre}\u0000${b.sedeNombre}`),
    )
    form.sedeId = result.sedeId
    form.duracionMinutos = clientForm.duracionServicioMinutos
    showClientForm.value = false
    Object.assign(clientForm, emptyClientForm())
    clientValidation.resetValidation()
    notifications.show(addedToExistingBusiness ? 'Sede creada y seleccionada' : 'Negocio y Sede creados', 'success')
  } catch (error) {
    notifications.show(error instanceof Error ? error.message : 'No fue posible crear el cliente', 'danger')
  } finally {
    savingClient.value = false
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
    const created = await apiRequest<ServiceRecord>('api/services', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        inicioProgramado: new Date(form.inicioProgramado).toISOString(),
        duracionMinutos: Number(form.duracionMinutos),
      }),
    })
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
    notifications.show(error instanceof Error ? error.message : 'No fue posible programar el Servicio', 'danger')
  } finally {
    saving.value = false
  }
}

async function retryCalendar(service: ServiceRecord): Promise<void> {
  retryingId.value = service.id
  try {
    const updated = await apiRequest<ServiceRecord>(`api/services/${service.id}/calendar/retry`, {
      method: 'POST',
    })
    services.value = services.value.map((record) => (record.id === service.id ? { ...record, ...updated } : record))
    notifications.show('Evento sincronizado con Calendar', 'success')
  } catch (error) {
    notifications.show(error instanceof Error ? error.message : 'Calendar volvió a fallar', 'danger')
  } finally {
    retryingId.value = null
  }
}

function updateConnectivity(): void {
  online.value = navigator.onLine
}

function toggleClientForm(): void {
  if (showClientForm.value && clientFormDirty.value) {
    closeClientConfirmOpen.value = true
    return
  }
  showClientForm.value = !showClientForm.value
}

function discardClientForm(): void {
  Object.assign(clientForm, emptyClientForm())
  clientValidation.resetValidation()
  showClientForm.value = false
  closeClientConfirmOpen.value = false
}

function normalizeClientSite(client: ClientSiteWire): ClientSite {
  return { ...client, valorServicio: Number(client.valorServicio) }
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
  <AppShell>
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
            <BaseButton variant="secondary" @click="toggleClientForm">{{ showClientForm ? 'Cerrar cliente' : 'Nuevo cliente' }}</BaseButton>
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
            <BaseInput
              v-model="form.inicioProgramado"
              label="Inicio programado"
              name="inicioProgramado"
              type="datetime-local"
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

        <form v-if="showClientForm" class="card" novalidate @submit.prevent="createClient">
          <h2>Nuevo Negocio o Sede</h2>
          <div class="form-grid service-form">
            <BaseSelect v-model="clientForm.negocioId" label="Negocio" name="negocioId" help="Selecciona uno existente o crea uno nuevo.">
              <option value="">Crear nuevo Negocio</option>
              <option v-for="business in businesses" :key="business.id" :value="business.id">
                {{ business.nombre }} · {{ business.nit }}
              </option>
            </BaseSelect>
            <template v-if="!clientForm.negocioId">
              <BaseInput v-model="clientForm.nit" label="NIT" name="nit" required :error="clientValidation.error('nit')" @blur="clientValidation.touch('nit')" />
              <BaseInput v-model="clientForm.negocioNombre" label="Nombre del Negocio" name="negocioNombre" required :error="clientValidation.error('negocioNombre')" @blur="clientValidation.touch('negocioNombre')" />
            </template>
            <BaseInput v-model="clientForm.sedeNombre" label="Nombre de la Sede" name="sedeNombre" required :error="clientValidation.error('sedeNombre')" @blur="clientValidation.touch('sedeNombre')" />
            <BaseInput v-model="clientForm.direccion" label="Dirección" name="direccion" autocomplete="street-address" required :error="clientValidation.error('direccion')" @blur="clientValidation.touch('direccion')" />
            <BaseInput v-model="clientForm.contactoNombre" label="Contacto principal" name="contactoNombre" autocomplete="name" required :error="clientValidation.error('contactoNombre')" @blur="clientValidation.touch('contactoNombre')" />
            <BaseInput v-model="clientForm.contactoCorreo" label="Correo del contacto" name="contactoCorreo" type="email" autocomplete="email" :error="clientValidation.error('contactoCorreo')" @blur="clientValidation.touch('contactoCorreo')" />
            <BaseInput v-model="clientForm.valorServicio" label="Valor en COP" name="valorServicio" type="number" min="0" step="1" required :error="clientValidation.error('valorServicio')" @blur="clientValidation.touch('valorServicio')" />
            <BaseInput v-model="clientForm.periodicidadMeses" label="Periodicidad en meses" name="periodicidadMeses" type="number" min="1" step="1" required :error="clientValidation.error('periodicidadMeses')" @blur="clientValidation.touch('periodicidadMeses')" />
            <BaseInput v-model="clientForm.duracionServicioMinutos" label="Duración en minutos" name="duracionServicioMinutos" type="number" min="1" step="1" required :error="clientValidation.error('duracionServicioMinutos')" @blur="clientValidation.touch('duracionServicioMinutos')" />
            <BaseSelect v-model="clientForm.tipoSede" label="Tipo de Sede" name="tipoSede" required>
              <option value="NEGOCIO">Negocio</option>
              <option value="RESIDENCIAL">Residencial</option>
            </BaseSelect>
            <BaseCheckbox
              v-model="clientForm.manejaRefuerzo"
              label="La Sede maneja visita de refuerzo"
              name="manejaRefuerzo"
            />
          </div>
          <div class="form-actions">
            <BaseButton type="submit" :loading="savingClient">Crear y seleccionar</BaseButton>
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

      <ConfirmDialog
        :open="closeClientConfirmOpen"
        title="Descartar cliente"
        message="Hay datos del Negocio o la Sede que todavía no se han guardado."
        confirm-label="Descartar"
        danger
        @cancel="closeClientConfirmOpen = false"
        @confirm="discardClientForm"
      />
      <ConfirmDialog
        :open="discardConfirmOpen"
        title="Descartar cambios"
        message="Hay datos del Negocio o la Sede que todavía no se han guardado."
        confirm-label="Descartar y salir"
        danger
        @cancel="cancelDiscard"
        @confirm="confirmDiscard"
      />
    </div>
  </AppShell>
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
