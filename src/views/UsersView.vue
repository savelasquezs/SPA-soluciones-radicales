<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

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
import { dataApiSelect } from '@/services/dataApiService'
import { useNotificationsStore } from '@/stores/notifications'
import type { UserInput, UserRecord } from '@/types/domain'

const notifications = useNotificationsStore()
const users = ref<UserRecord[]>([])
const loading = ref(true)
const saving = ref(false)
const loadError = ref<string | null>(null)
const editingId = ref<string | null>(null)
const pendingToggle = ref<UserRecord | null>(null)
const togglingId = ref<string | null>(null)
const search = ref('')
const statusFilter = ref('TODOS')
const roleFilter = ref('TODOS')

const emptyForm = (): UserInput => ({
  nombreCompleto: '',
  correoGoogle: '',
  esAdmin: false,
  esTecnico: true,
  activo: true,
  certificadoStoragePath: null,
  certificadoFechaEmision: null,
  certificadoFechaVencimiento: null,
  certificadoObservaciones: null,
})

const form = reactive<UserInput>(emptyForm())
const formBaseline = ref(JSON.stringify(form))
const formDirty = computed(() => JSON.stringify(form) !== formBaseline.value)
const {
  confirmOpen: discardConfirmOpen,
  cancelDiscard,
  confirmDiscard,
} = useUnsavedChanges(formDirty)
const validation = useFormValidation(form, {
  nombreCompleto: (value) => String(value).trim().length >= 2 ? null : 'Ingresa el nombre completo',
  correoGoogle: (value) => {
    if (!String(value).trim()) return 'El correo Google es obligatorio'
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value)) ? null : 'Ingresa un correo válido'
  },
  esAdmin: (_value, current) => current.esAdmin || current.esTecnico ? null : 'Selecciona al menos un rol',
  certificadoFechaVencimiento: (value, current) => {
    if (!value || !current.certificadoFechaEmision) return null
    return value >= current.certificadoFechaEmision ? null : 'El vencimiento debe ser posterior a la emisión'
  },
})

const filteredUsers = computed(() => {
  const term = search.value.trim().toLocaleLowerCase('es-CO')
  return users.value.filter((user) => {
    const matchesSearch = !term
      || user.nombreCompleto.toLocaleLowerCase('es-CO').includes(term)
      || user.correoGoogle.toLocaleLowerCase('es-CO').includes(term)
    const matchesStatus = statusFilter.value === 'TODOS'
      || (statusFilter.value === 'ACTIVOS' ? user.activo : !user.activo)
    const matchesRole = roleFilter.value === 'TODOS'
      || (roleFilter.value === 'ADMINISTRADOR' ? user.esAdmin : user.esTecnico)
    return matchesSearch && matchesStatus && matchesRole
  })
})
const editingUser = computed(() => users.value.find((user) => user.id === editingId.value) ?? null)

onMounted(loadUsers)

async function loadUsers(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    users.value = await dataApiSelect<UserRecord[]>(
      'usuarios',
      new URLSearchParams({
        select:
          'id,authUserId:auth_user_id,nombreCompleto:nombre_completo,correoGoogle:correo_google,esAdmin:es_admin,esTecnico:es_tecnico,activo,certificadoStoragePath:certificado_storage_path,certificadoFechaEmision:certificado_fecha_emision,certificadoFechaVencimiento:certificado_fecha_vencimiento,certificadoObservaciones:certificado_observaciones,version',
        order: 'activo.desc,nombre_completo.asc',
      }),
    )
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'No fue posible cargar los usuarios'
  } finally {
    loading.value = false
  }
}

function edit(user: UserRecord): void {
  editingId.value = user.id
  Object.assign(form, {
    nombreCompleto: user.nombreCompleto,
    correoGoogle: user.correoGoogle,
    esAdmin: user.esAdmin,
    esTecnico: user.esTecnico,
    activo: user.activo,
    certificadoStoragePath: user.certificadoStoragePath,
    certificadoFechaEmision: dateOnly(user.certificadoFechaEmision),
    certificadoFechaVencimiento: dateOnly(user.certificadoFechaVencimiento),
    certificadoObservaciones: user.certificadoObservaciones,
    version: user.version,
  })
  formBaseline.value = JSON.stringify(form)
  validation.resetValidation()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function reset(): void {
  editingId.value = null
  Object.assign(form, emptyForm())
  formBaseline.value = JSON.stringify(form)
  validation.resetValidation()
}

async function save(): Promise<void> {
  if (!validation.validate()) return

  saving.value = true
  try {
    if (editingId.value) {
      const updated = await apiRequest<UserRecord>(`api/users/${editingId.value}`, {
        method: 'PATCH',
        body: JSON.stringify(form),
      })
      users.value = users.value.map((user) => (user.id === updated.id ? updated : user))
      notifications.show('Usuario actualizado', 'success')
    } else {
      const created = await apiRequest<UserRecord>('api/users', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      users.value = [...users.value, created].sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto))
      notifications.show('Usuario creado', 'success')
    }
    reset()
  } catch (error) {
    notifications.show(error instanceof Error ? error.message : 'No fue posible guardar el usuario', 'danger')
  } finally {
    saving.value = false
  }
}

function requestToggle(user: UserRecord): void {
  pendingToggle.value = user
}

async function confirmToggle(): Promise<void> {
  const user = pendingToggle.value
  if (!user) return
  const action = user.activo ? 'desactivar' : 'reactivar'
  togglingId.value = user.id
  try {
    const updated = await apiRequest<UserRecord>(`api/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...user, activo: !user.activo }),
    })
    users.value = users.value.map((record) => (record.id === user.id ? updated : record))
    notifications.show(`Usuario ${updated.activo ? 'reactivado' : 'desactivado'}`, 'success')
  } catch (error) {
    notifications.show(error instanceof Error ? error.message : `No fue posible ${action} el usuario`, 'danger')
  } finally {
    togglingId.value = null
    pendingToggle.value = null
  }
}

function dateOnly(value: string | null): string | null {
  return value ? value.slice(0, 10) : null
}

function formatCertificateDate(value: string | null): string {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value))
}
</script>

<template>
  <AppShell>
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Usuarios</h1>
          <p>La identidad Google debe coincidir con el correo autorizado aquí.</p>
        </div>
      </header>

      <form class="card" @submit.prevent="save">
        <h2>{{ editingId ? 'Editar usuario' : 'Autorizar usuario' }}</h2>
        <div class="form-grid user-form">
          <BaseInput
            v-model="form.nombreCompleto"
            label="Nombre completo"
            name="nombreCompleto"
            autocomplete="name"
            required
            :error="validation.error('nombreCompleto')"
            @blur="validation.touch('nombreCompleto')"
          />
          <BaseInput
            v-model="form.correoGoogle"
            label="Correo Google"
            name="correoGoogle"
            type="email"
            autocomplete="email"
            required
            :disabled="Boolean(editingUser?.authUserId)"
            :help="editingUser?.authUserId ? 'La identidad Google ya está vinculada y su correo no puede cambiarse.' : undefined"
            :error="validation.error('correoGoogle')"
            @blur="validation.touch('correoGoogle')"
          />

          <fieldset class="role-field form-grid__wide" :aria-invalid="Boolean(validation.error('esAdmin'))">
            <legend>Roles <span class="required" aria-hidden="true">*</span></legend>
            <BaseCheckbox v-model="form.esAdmin" label="Administrador" name="esAdmin" @blur="validation.touch('esAdmin')" />
            <BaseCheckbox v-model="form.esTecnico" label="Técnico" name="esTecnico" @blur="validation.touch('esAdmin')" />
            <BaseCheckbox v-model="form.activo" label="Usuario activo" name="activo" />
            <small v-if="validation.error('esAdmin')" class="field-error" role="alert">{{ validation.error('esAdmin') }}</small>
          </fieldset>

          <template v-if="form.esTecnico">
            <BaseInput
              :model-value="form.certificadoFechaEmision ?? ''"
              label="Emisión del certificado"
              name="certificadoFechaEmision"
              type="date"
              @update:model-value="form.certificadoFechaEmision = $event || null"
            />
            <BaseInput
              :model-value="form.certificadoFechaVencimiento ?? ''"
              label="Vencimiento del certificado"
              name="certificadoFechaVencimiento"
              type="date"
              :error="validation.error('certificadoFechaVencimiento')"
              @update:model-value="form.certificadoFechaVencimiento = $event || null"
              @blur="validation.touch('certificadoFechaVencimiento')"
            />
            <BaseTextarea
              :model-value="form.certificadoObservaciones ?? ''"
              class="form-grid__wide"
              label="Observaciones del certificado"
              name="certificadoObservaciones"
              @update:model-value="form.certificadoObservaciones = $event || null"
            />
          </template>
        </div>
        <div class="form-actions">
          <BaseButton v-if="editingId" variant="ghost" @click="reset">Cancelar</BaseButton>
          <BaseButton type="submit" :loading="saving">{{ editingId ? 'Guardar cambios' : 'Crear usuario' }}</BaseButton>
        </div>
      </form>

      <LoadingSkeleton v-if="loading" label="Cargando usuarios" :lines="5" />
      <StatusPanel v-else-if="loadError" title="No pudimos cargar los usuarios" :message="loadError" tone="danger">
        <BaseButton variant="secondary" @click="loadUsers">Reintentar</BaseButton>
      </StatusPanel>
      <StatusPanel v-else-if="users.length === 0" title="Aún no hay usuarios" message="Autoriza el primer acceso desde el formulario." />
      <section v-else class="card directory">
        <div class="form-grid filters">
          <BaseInput v-model="search" label="Buscar" name="userSearch" placeholder="Nombre o correo" />
          <BaseSelect v-model="statusFilter" label="Estado" name="statusFilter">
            <option value="TODOS">Todos</option>
            <option value="ACTIVOS">Activos</option>
            <option value="INACTIVOS">Inactivos</option>
          </BaseSelect>
          <BaseSelect v-model="roleFilter" label="Rol" name="roleFilter">
            <option value="TODOS">Todos</option>
            <option value="ADMINISTRADOR">Administrador</option>
            <option value="TECNICO">Técnico</option>
          </BaseSelect>
        </div>
        <StatusPanel
          v-if="filteredUsers.length === 0"
          title="Sin coincidencias"
          message="Ajusta la búsqueda o los filtros para ver otros usuarios."
        />
        <div v-else class="table-wrap">
          <table>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Roles</th>
              <th>Estado</th>
              <th>Certificado Técnico</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in filteredUsers" :key="user.id">
              <td data-label="Usuario">
                <strong>{{ user.nombreCompleto }}</strong><br />
                <span class="muted">{{ user.correoGoogle }}</span><br />
                <span class="auth-state" :class="user.authUserId ? 'auth-state--linked' : ''">
                  {{ user.authUserId ? 'Identidad Google vinculada' : 'Acceso aún no utilizado' }}
                </span>
              </td>
              <td data-label="Roles">
                <span v-if="user.esAdmin" class="badge">Admin</span>
                <span v-if="user.esTecnico" class="badge">Técnico</span>
              </td>
              <td data-label="Estado"><span class="badge" :class="user.activo ? 'badge--success' : 'badge--danger'">{{ user.activo ? 'Activo' : 'Inactivo' }}</span></td>
              <td data-label="Certificado Técnico">
                <template v-if="user.esTecnico">
                  <span :class="user.certificadoStoragePath ? 'auth-state--linked' : 'muted'">
                    {{ user.certificadoStoragePath ? 'Archivo vinculado' : 'Sin archivo' }}
                  </span><br />
                  <small class="muted">
                    {{ formatCertificateDate(user.certificadoFechaEmision) }} →
                    {{ formatCertificateDate(user.certificadoFechaVencimiento) }}
                  </small>
                </template>
                <span v-else class="muted">No aplica</span>
              </td>
              <td class="actions-cell" data-label="Acciones">
                <BaseButton variant="secondary" @click="edit(user)">Editar</BaseButton>
                <BaseButton :variant="user.activo ? 'danger' : 'secondary'" @click="requestToggle(user)">
                  {{ user.activo ? 'Desactivar' : 'Reactivar' }}
                </BaseButton>
              </td>
            </tr>
          </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialog
        :open="Boolean(pendingToggle)"
        :title="pendingToggle?.activo ? 'Desactivar usuario' : 'Reactivar usuario'"
        :message="`¿Deseas ${pendingToggle?.activo ? 'desactivar' : 'reactivar'} a ${pendingToggle?.nombreCompleto ?? 'este usuario'}?`"
        :confirm-label="pendingToggle?.activo ? 'Desactivar' : 'Reactivar'"
        :danger="Boolean(pendingToggle?.activo)"
        :loading="togglingId === pendingToggle?.id"
        @cancel="pendingToggle = null"
        @confirm="confirmToggle"
      />
      <ConfirmDialog
        :open="discardConfirmOpen"
        title="Descartar cambios"
        message="Hay cambios del usuario que todavía no se han guardado."
        confirm-label="Descartar y salir"
        danger
        @cancel="cancelDiscard"
        @confirm="confirmDiscard"
      />
    </div>
  </AppShell>
</template>

<style scoped>
.user-form {
  margin-top: 1.25rem;
}

.role-field {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.8rem;
}

.role-field legend {
  padding: 0 0.35rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 700;
}

.role-field[aria-invalid='true'] {
  border-color: var(--danger);
}

.required,
.field-error {
  color: var(--danger);
}

.field-error {
  flex-basis: 100%;
}

.filters {
  grid-template-columns: minmax(13rem, 2fr) repeat(2, minmax(10rem, 1fr));
  margin-bottom: 1.25rem;
}

.auth-state {
  color: var(--text-muted);
  font-size: 0.78rem;
}

.auth-state--linked {
  color: var(--success);
}

.actions-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

td .badge + .badge {
  margin-left: 0.35rem;
}

@media (max-width: 760px) {
  .filters {
    grid-template-columns: 1fr;
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

  .actions-cell {
    display: grid;
  }
}
</style>
