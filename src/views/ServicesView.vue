<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import AppShell from '@/components/layout/AppShell.vue'
import { apiRequest } from '@/services/apiService'
import { clearServiceDraft, loadServiceDraft, saveServiceDraft } from '@/services/draftService'
import { useNotificationsStore } from '@/stores/notifications'
import { useSessionStore } from '@/stores/session'
import type { ClientSite, ServiceDraft, ServiceRecord, Technician } from '@/types/domain'

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
const retryingId = ref<string | null>(null)
const online = ref(navigator.onLine)
let draftReady = false

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
  observaciones: '',
})

const clientForm = reactive({
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

const selectedSite = computed(() => clients.value.find((client) => client.sedeId === form.sedeId))

watch(
  form,
  async (draft) => {
    if (draftReady) {
      await saveServiceDraft({ ...draft, tecnicosColaboradoresIds: [...draft.tecnicosColaboradoresIds] })
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
        apiRequest<ClientSite[]>('api/clients'),
        apiRequest<Technician[]>('api/catalogs/technicians'),
        apiRequest<ServiceRecord[]>('api/services'),
      ])
      clients.value = clientRows
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
  savingClient.value = true
  try {
    const result = await apiRequest<{ negocioId: string; sedeId: string }>('api/clients', {
      method: 'POST',
      body: JSON.stringify({
        ...clientForm,
        valorServicio: Number(clientForm.valorServicio),
        periodicidadMeses: Number(clientForm.periodicidadMeses),
        duracionServicioMinutos: Number(clientForm.duracionServicioMinutos),
        correos: clientForm.contactoCorreo ? [clientForm.contactoCorreo] : [],
      }),
    })
    clients.value = await apiRequest<ClientSite[]>('api/clients')
    form.sedeId = result.sedeId
    showClientForm.value = false
    notifications.show('Negocio y Sede creados', 'success')
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

  saving.value = true
  try {
    const created = await apiRequest<ServiceRecord>('api/services', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        inicioProgramado: new Date(form.inicioProgramado).toISOString(),
      }),
    })
    await clearServiceDraft()
    services.value = [created, ...services.value]
    form.sedeId = ''
    form.tecnicoResponsableId = ''
    form.tecnicosColaboradoresIds = []
    form.inicioProgramado = defaultStart()
    form.observaciones = ''
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
        <form class="card" @submit.prevent="createService">
          <div class="section-heading">
            <div>
              <h2>Programar Servicio</h2>
              <p class="muted">El valor y la duración se derivan de la Sede.</p>
            </div>
            <BaseButton variant="secondary" @click="showClientForm = !showClientForm">{{ showClientForm ? 'Cerrar cliente' : 'Nuevo cliente' }}</BaseButton>
          </div>
          <div class="form-grid service-form">
            <BaseSelect v-model="form.sedeId" label="Negocio y Sede" name="sedeId" required>
              <option value="" disabled>Selecciona una Sede</option>
              <option v-for="client in clients" :key="client.sedeId" :value="client.sedeId">
                {{ client.negocioNombre }} · {{ client.sedeNombre }}
              </option>
            </BaseSelect>
            <BaseSelect v-model="form.tecnicoResponsableId" label="Técnico responsable" name="tecnicoResponsableId" required>
              <option value="" disabled>Selecciona un Técnico</option>
              <option v-for="technician in technicians" :key="technician.id" :value="technician.id">
                {{ technician.nombreCompleto }}
              </option>
            </BaseSelect>
            <BaseInput v-model="form.inicioProgramado" label="Inicio programado" name="inicioProgramado" type="datetime-local" required />
            <div class="summary-field">
              <span>Duración y valor</span>
              <strong v-if="selectedSite">{{ selectedSite.duracionServicioMinutos }} min · ${{ selectedSite.valorServicio.toLocaleString('es-CO') }}</strong>
              <strong v-else>Selecciona una Sede</strong>
            </div>
            <label class="notes-field form-grid__wide">
              <span>Observaciones</span>
              <textarea v-model="form.observaciones" rows="3"></textarea>
            </label>
          </div>
          <div class="form-actions">
            <BaseButton type="submit" :loading="saving" :disabled="!online">Programar Servicio</BaseButton>
          </div>
        </form>

        <form v-if="showClientForm" class="card" @submit.prevent="createClient">
          <h2>Nuevo Negocio y Sede</h2>
          <div class="form-grid service-form">
            <BaseInput v-model="clientForm.nit" label="NIT" name="nit" required />
            <BaseInput v-model="clientForm.negocioNombre" label="Nombre del Negocio" name="negocioNombre" required />
            <BaseInput v-model="clientForm.sedeNombre" label="Nombre de la Sede" name="sedeNombre" required />
            <BaseInput v-model="clientForm.direccion" label="Dirección" name="direccion" required />
            <BaseInput v-model="clientForm.contactoNombre" label="Contacto principal" name="contactoNombre" required />
            <BaseInput v-model="clientForm.contactoCorreo" label="Correo del contacto" name="contactoCorreo" type="email" />
            <BaseInput v-model="clientForm.valorServicio" label="Valor en COP" name="valorServicio" type="number" min="0" required />
            <BaseInput v-model="clientForm.periodicidadMeses" label="Periodicidad en meses" name="periodicidadMeses" type="number" min="1" required />
            <BaseInput v-model="clientForm.duracionServicioMinutos" label="Duración en minutos" name="duracionServicioMinutos" type="number" min="1" required />
            <BaseSelect v-model="clientForm.tipoSede" label="Tipo de Sede" name="tipoSede" required>
              <option value="NEGOCIO">Negocio</option>
              <option value="RESIDENCIAL">Residencial</option>
            </BaseSelect>
          </div>
          <div class="form-actions">
            <BaseButton type="submit" :loading="savingClient">Crear y seleccionar</BaseButton>
          </div>
        </form>
      </template>

      <StatusPanel v-if="loading" title="Cargando Servicios" busy />
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
              <td><strong>{{ service.solicitud }}</strong><br /><span class="muted">{{ service.negocioNombre }} · {{ service.sedeNombre }}</span></td>
              <td>{{ formatDate(service.inicioProgramado) }}</td>
              <td>{{ service.tecnicoNombre ?? '—' }}</td>
              <td>
                <span class="badge" :class="calendarBadge(service.calendarSyncEstado)">{{ service.calendarSyncEstado }}</span>
                <small v-if="service.calendarSyncError" class="calendar-error">{{ service.calendarSyncError }}</small>
              </td>
              <td v-if="session.isAdmin">
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

.summary-field,
.notes-field {
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

textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  padding: 0.75rem;
  resize: vertical;
}

.calendar-error {
  display: block;
  max-width: 22rem;
  margin-top: 0.35rem;
  color: var(--danger);
}

@media (max-width: 620px) {
  .section-heading {
    display: grid;
  }
}
</style>
