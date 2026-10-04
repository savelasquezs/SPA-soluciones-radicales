<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import AppShell from '@/components/layout/AppShell.vue'
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

onMounted(loadUsers)

async function loadUsers(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    users.value = await dataApiSelect<UserRecord[]>(
      'usuarios',
      new URLSearchParams({
        select:
          'id,nombreCompleto:nombre_completo,correoGoogle:correo_google,esAdmin:es_admin,esTecnico:es_tecnico,activo,certificadoStoragePath:certificado_storage_path,certificadoFechaEmision:certificado_fecha_emision,certificadoFechaVencimiento:certificado_fecha_vencimiento,certificadoObservaciones:certificado_observaciones,version',
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
    ...user,
    certificadoFechaEmision: dateOnly(user.certificadoFechaEmision),
    certificadoFechaVencimiento: dateOnly(user.certificadoFechaVencimiento),
  })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function reset(): void {
  editingId.value = null
  Object.assign(form, emptyForm())
}

async function save(): Promise<void> {
  if (!form.esAdmin && !form.esTecnico) {
    notifications.show('Selecciona al menos un rol', 'warning')
    return
  }

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

async function toggleActive(user: UserRecord): Promise<void> {
  const action = user.activo ? 'desactivar' : 'reactivar'
  if (!window.confirm(`¿Deseas ${action} a ${user.nombreCompleto}?`)) {
    return
  }

  try {
    const updated = await apiRequest<UserRecord>(`api/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...user, activo: !user.activo }),
    })
    users.value = users.value.map((record) => (record.id === user.id ? updated : record))
    notifications.show(`Usuario ${updated.activo ? 'reactivado' : 'desactivado'}`, 'success')
  } catch (error) {
    notifications.show(error instanceof Error ? error.message : `No fue posible ${action} el usuario`, 'danger')
  }
}

function dateOnly(value: string | null): string | null {
  return value ? value.slice(0, 10) : null
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
          <BaseInput v-model="form.nombreCompleto" label="Nombre completo" name="nombreCompleto" required />
          <BaseInput v-model="form.correoGoogle" label="Correo Google" name="correoGoogle" type="email" required />

          <fieldset class="role-field form-grid__wide">
            <legend>Roles</legend>
            <label><input v-model="form.esAdmin" type="checkbox" /> Administrador</label>
            <label><input v-model="form.esTecnico" type="checkbox" /> Técnico</label>
            <label><input v-model="form.activo" type="checkbox" /> Usuario activo</label>
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
              @update:model-value="form.certificadoFechaVencimiento = $event || null"
            />
          </template>
        </div>
        <div class="form-actions">
          <BaseButton v-if="editingId" variant="ghost" @click="reset">Cancelar</BaseButton>
          <BaseButton type="submit" :loading="saving">{{ editingId ? 'Guardar cambios' : 'Crear usuario' }}</BaseButton>
        </div>
      </form>

      <StatusPanel v-if="loading" title="Cargando usuarios" busy />
      <StatusPanel v-else-if="loadError" title="No pudimos cargar los usuarios" :message="loadError" tone="danger">
        <BaseButton variant="secondary" @click="loadUsers">Reintentar</BaseButton>
      </StatusPanel>
      <StatusPanel v-else-if="users.length === 0" title="Aún no hay usuarios" message="Autoriza el primer acceso desde el formulario." />
      <section v-else class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Roles</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td><strong>{{ user.nombreCompleto }}</strong><br /><span class="muted">{{ user.correoGoogle }}</span></td>
              <td>
                <span v-if="user.esAdmin" class="badge">Admin</span>
                <span v-if="user.esTecnico" class="badge">Técnico</span>
              </td>
              <td><span class="badge" :class="user.activo ? 'badge--success' : 'badge--danger'">{{ user.activo ? 'Activo' : 'Inactivo' }}</span></td>
              <td class="actions-cell">
                <BaseButton variant="secondary" @click="edit(user)">Editar</BaseButton>
                <BaseButton :variant="user.activo ? 'danger' : 'secondary'" @click="toggleActive(user)">
                  {{ user.activo ? 'Desactivar' : 'Reactivar' }}
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

.role-field label {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 0.5rem;
}

.role-field input {
  width: 1.1rem;
  height: 1.1rem;
}

.actions-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

td .badge + .badge {
  margin-left: 0.35rem;
}
</style>
