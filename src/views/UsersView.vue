<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { Pencil } from 'lucide-vue-next'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseDateTimePicker from '@/components/base/BaseDateTimePicker.vue'
import BaseDialog from '@/components/base/BaseDialog.vue'
import BaseFileUpload from '@/components/base/BaseFileUpload.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'
import EmptyState from '@/components/base/EmptyState.vue'
import ErrorState from '@/components/base/ErrorState.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import ResponsiveTable from '@/components/base/ResponsiveTable.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import { formatDateOnly } from '@/helpers/dateTime'
import { certificateStatus, validateUserInput, type CertificateStatus, type UserFormErrors } from '@/helpers/users'
import {
  createUser,
  getUser,
  listUsers,
  setUserActive,
  updateUser,
} from '@/services/usersService'
import { useNotificationsStore } from '@/stores/notifications'
import type { UserInput, UserRecord } from '@/types/domain'

type ErrorKey = keyof UserFormErrors
type FormMode = 'create' | 'edit'

const notifications = useNotificationsStore()
const users = ref<UserRecord[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const formMode = ref<FormMode>('create')
const formOpen = ref(false)
const formLoading = ref(false)
const savingForm = ref(false)
const editingUserId = ref<string | null>(null)
const deactivateConfirmOpen = ref(false)
const discardConfirmOpen = ref(false)
const formFile = ref<File | null>(null)
const formTouched = reactive<Partial<Record<ErrorKey, boolean>>>({})
const formSubmitted = ref(false)
const formBaseline = ref('')

const blankUser = (): UserInput => ({
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

const userForm = reactive<UserInput>(blankUser())

const editingUser = computed(() => users.value.find((user) => user.id === editingUserId.value) ?? null)
const formErrors = computed(() => validateUserInput(userForm, formFile.value))
const formDirty = computed(() => JSON.stringify(userForm) !== formBaseline.value || Boolean(formFile.value))
const formTitle = computed(() => formMode.value === 'create' ? 'Agregar usuario' : 'Editar usuario')
const formDescription = computed(() => {
  if (formMode.value === 'create') return 'El correo debe corresponder a una cuenta Google.'
  if (editingUser.value?.authUserId) return 'El correo está vinculado a Google y no puede modificarse.'
  return 'Actualiza los datos, roles y estado del usuario.'
})
const formEmailWarning = computed(() => {
  const email = userForm.correoGoogle.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith('@gmail.com')) return null
  return 'Asegúrate de que este correo corresponda a una cuenta de Google.'
})
const discardTitle = computed(() => formMode.value === 'create' ? 'Descartar usuario' : 'Descartar cambios')
const discardMessage = computed(() => formMode.value === 'create'
  ? 'Los datos ingresados todavía no se han guardado.'
  : 'Los cambios realizados todavía no se han guardado.')

onMounted(loadUsers)

watch(() => userForm.esTecnico, (isTechnician) => {
  if (!isTechnician && !formFile.value && !userForm.certificadoStoragePath) {
    userForm.certificadoFechaEmision = null
    userForm.certificadoFechaVencimiento = null
  }
})

watch(formFile, (file) => {
  if (!file && !userForm.certificadoStoragePath) {
    userForm.certificadoFechaEmision = null
    userForm.certificadoFechaVencimiento = null
  }
})

async function loadUsers(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    users.value = (await listUsers()).map(normalizeUser)
  } catch (error) {
    loadError.value = userMessage(error, 'No fue posible cargar los usuarios')
  } finally {
    loading.value = false
  }
}

function openCreate(): void {
  formMode.value = 'create'
  editingUserId.value = null
  resetForm()
  formOpen.value = true
}

async function openEdit(user: UserRecord): Promise<void> {
  formMode.value = 'edit'
  editingUserId.value = user.id
  resetForm()
  formOpen.value = true
  formLoading.value = true
  try {
    const fresh = normalizeUser(await getUser(user.id))
    replaceUser(fresh)
    Object.assign(userForm, toUserInput(fresh))
    formBaseline.value = JSON.stringify(userForm)
  } catch (error) {
    formOpen.value = false
    notifications.show(userMessage(error, 'No fue posible cargar el usuario'), 'error')
  } finally {
    formLoading.value = false
  }
}

function requestCloseForm(): void {
  if (savingForm.value) return
  if (formDirty.value) discardConfirmOpen.value = true
  else closeForm()
}

function discardForm(): void {
  discardConfirmOpen.value = false
  closeForm()
}

function closeForm(): void {
  formOpen.value = false
  deactivateConfirmOpen.value = false
  resetForm()
}

async function submitForm(): Promise<void> {
  if (savingForm.value || formLoading.value) return
  formSubmitted.value = true
  if (Object.keys(formErrors.value).length) {
    await focusFirstError()
    notifications.show('Revisa los campos marcados antes de guardar.', 'error')
    return
  }
  if (formFile.value) {
    notifications.show('La carga de certificados estará disponible cuando se conecte el backend autorizado de R2.', 'warning')
    return
  }

  if (formMode.value === 'create') {
    await persistCreate()
    return
  }

  const user = editingUser.value
  if (!user) return
  if (user.activo && !userForm.activo) {
    deactivateConfirmOpen.value = true
    return
  }
  await persistEdit()
}

async function persistCreate(): Promise<void> {
  savingForm.value = true
  try {
    const created = normalizeUser(await createUser(userForm))
    users.value = [...users.value, created].sort((left, right) => left.nombreCompleto.localeCompare(right.nombreCompleto, 'es'))
    closeForm()
    notifications.show('Usuario creado correctamente.', 'success')
  } catch (error) {
    notifications.show(userMessage(error, 'No fue posible crear el usuario'), 'error')
  } finally {
    savingForm.value = false
  }
}

async function persistEdit(): Promise<void> {
  const user = editingUser.value
  if (!user || savingForm.value) return
  savingForm.value = true
  deactivateConfirmOpen.value = false
  try {
    const updated = userForm.activo === user.activo
      ? await updateUser(user.id, userForm)
      : await setUserActive({ ...user, ...userForm }, userForm.activo)
    replaceUser(normalizeUser(updated))
    closeForm()
    notifications.show('Usuario actualizado correctamente.', 'success')
  } catch (error) {
    notifications.show(userMessage(error, 'No fue posible actualizar el usuario'), 'error')
  } finally {
    savingForm.value = false
  }
}

function touchForm(field: ErrorKey): void {
  formTouched[field] = true
}

function formError(field: ErrorKey): string | undefined {
  return formTouched[field] || formSubmitted.value ? formErrors.value[field] : undefined
}

function resetForm(): void {
  Object.assign(userForm, blankUser())
  delete userForm.version
  formFile.value = null
  formSubmitted.value = false
  Object.keys(formTouched).forEach((key) => delete formTouched[key as ErrorKey])
  formBaseline.value = JSON.stringify(userForm)
}

function replaceUser(user: UserRecord): void {
  users.value = users.value.map((current) => current.id === user.id ? user : current)
}

function normalizeUser(user: UserRecord): UserRecord {
  return { ...user, version: Number(user.version) }
}

function toUserInput(user: UserRecord): UserInput {
  return {
    nombreCompleto: user.nombreCompleto,
    correoGoogle: user.correoGoogle,
    esAdmin: user.esAdmin,
    esTecnico: user.esTecnico,
    activo: user.activo,
    certificadoStoragePath: user.certificadoStoragePath,
    certificadoFechaEmision: user.certificadoFechaEmision,
    certificadoFechaVencimiento: user.certificadoFechaVencimiento,
    certificadoObservaciones: user.certificadoObservaciones,
    version: user.version,
  }
}

function userMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

async function focusFirstError(): Promise<void> {
  await nextTick()
  document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
}

function fileName(path: string | null): string {
  const segments = path?.split('/')
  return segments?.[segments.length - 1] ?? 'Sin archivo'
}

function certificateLabel(user: UserRecord): string {
  return {
    'not-applicable': 'No aplica',
    none: 'Sin certificado',
    valid: 'Vigente',
    expiring: 'Por vencer',
    expired: 'Vencido',
  }[certificateStatus(user)]
}

function certificateTone(status: CertificateStatus): 'neutral' | 'success' | 'warning' | 'danger' {
  return status === 'valid' ? 'success' : status === 'expiring' ? 'warning' : status === 'expired' ? 'danger' : 'neutral'
}

function certificateIcon(status: CertificateStatus): 'check' | 'warning' | 'error' | 'info' {
  return status === 'valid' ? 'check' : status === 'expiring' ? 'warning' : status === 'expired' ? 'error' : 'info'
}

function certificateSummary(user: UserRecord): string {
  if (!user.certificadoStoragePath) return 'Sin certificado'
  const expiry = formatDateOnly(user.certificadoFechaVencimiento)
  return expiry ? `Adjunto · vence ${expiry}` : 'Adjunto'
}
</script>

<template>
  <div class="users-page">
    <header class="users-header">
      <div><h1>Usuarios</h1><p>Acceso, roles y credenciales del equipo.</p></div>
      <BaseButton @click="openCreate">Agregar usuario</BaseButton>
    </header>

    <LoadingSkeleton v-if="loading" label="Cargando usuarios" :lines="5" />
    <ErrorState v-else-if="loadError" title="No pudimos cargar los usuarios" :message="loadError">
      <BaseButton variant="secondary" @click="loadUsers">Reintentar</BaseButton>
    </ErrorState>
    <EmptyState v-else-if="users.length === 0" title="Aún no hay usuarios" message="Agrega el primer usuario autorizado.">
      <BaseButton @click="openCreate">Agregar usuario</BaseButton>
    </EmptyState>
    <ResponsiveTable v-else>
      <template #table>
        <table class="users-table">
          <thead>
            <tr><th>Usuario</th><th>Correo Google</th><th>Roles</th><th>Credencial</th><th>Estado</th><th class="actions-heading">Acciones</th></tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td><strong>{{ user.nombreCompleto }}</strong></td>
              <td>{{ user.correoGoogle }}</td>
              <td><div class="badge-row"><StatusBadge v-if="user.esAdmin" tone="info" icon="shield">Administrador</StatusBadge><StatusBadge v-if="user.esTecnico" tone="technician" icon="technician">Técnico</StatusBadge></div></td>
              <td><StatusBadge :tone="certificateTone(certificateStatus(user))" :icon="certificateIcon(certificateStatus(user))">{{ certificateLabel(user) }}</StatusBadge></td>
              <td><StatusBadge :tone="user.activo ? 'success' : 'neutral'" :icon="user.activo ? 'check' : 'x'">{{ user.activo ? 'Activo' : 'Inactivo' }}</StatusBadge></td>
              <td class="actions-cell">
                <BaseIconButton :label="`Editar ${user.nombreCompleto}`" @click="openEdit(user)">
                  <Pencil :size="18" />
                </BaseIconButton>
              </td>
            </tr>
          </tbody>
        </table>
      </template>
      <template #cards>
        <article v-for="user in users" :key="user.id" class="user-card">
          <span><strong>{{ user.nombreCompleto }}</strong><small>{{ user.correoGoogle }}</small></span>
          <span class="badge-row"><StatusBadge v-if="user.esAdmin" tone="info" icon="shield">Administrador</StatusBadge><StatusBadge v-if="user.esTecnico" tone="technician" icon="technician">Técnico</StatusBadge></span>
          <span class="badge-row"><StatusBadge :tone="certificateTone(certificateStatus(user))" :icon="certificateIcon(certificateStatus(user))">{{ certificateLabel(user) }}</StatusBadge><StatusBadge :tone="user.activo ? 'success' : 'neutral'" :icon="user.activo ? 'check' : 'x'">{{ user.activo ? 'Activo' : 'Inactivo' }}</StatusBadge></span>
          <BaseButton variant="secondary" @click="openEdit(user)">Editar usuario</BaseButton>
        </article>
      </template>
    </ResponsiveTable>

    <BaseDialog
      :model-value="formOpen"
      :title="formTitle"
      :description="formDescription"
      @update:model-value="!$event && requestCloseForm()"
    >
      <LoadingSkeleton v-if="formLoading" label="Cargando usuario" :lines="5" />
      <form v-else id="user-form" class="dialog-form" novalidate @submit.prevent="submitForm">
        <BaseInput v-model="userForm.nombreCompleto" name="user-name" label="Nombre completo" required autocomplete="name" :error="formError('nombreCompleto')" @blur="touchForm('nombreCompleto')" />
        <div class="email-field">
          <BaseInput
            v-model="userForm.correoGoogle"
            name="user-email"
            label="Correo Google"
            type="email"
            required
            autocomplete="email"
            :disabled="formMode === 'edit' && Boolean(editingUser?.authUserId)"
            :hint="formMode === 'edit' && editingUser?.authUserId ? 'Vinculado a la identidad Google del usuario.' : undefined"
            :error="formError('correoGoogle')"
            @blur="touchForm('correoGoogle')"
          />
          <p v-if="formEmailWarning && !formError('correoGoogle')" class="field-warning" role="status">{{ formEmailWarning }}</p>
        </div>
        <BaseSelect :model-value="userForm.esAdmin ? 'SI' : 'NO'" name="user-admin" label="Rol administrador" :error="formError('roles')" @update:model-value="userForm.esAdmin = $event === 'SI'" @blur="touchForm('roles')">
          <option value="NO">No</option><option value="SI">Sí</option>
        </BaseSelect>
        <BaseSelect :model-value="userForm.esTecnico ? 'SI' : 'NO'" name="user-technician" label="Rol técnico" :error="formError('roles')" @update:model-value="userForm.esTecnico = $event === 'SI'" @blur="touchForm('roles')">
          <option value="NO">No</option><option value="SI">Sí</option>
        </BaseSelect>
        <BaseSelect v-if="formMode === 'edit'" :model-value="userForm.activo ? 'ACTIVO' : 'INACTIVO'" name="user-status" label="Estado" @update:model-value="userForm.activo = $event === 'ACTIVO'">
          <option value="ACTIVO">Activo</option><option value="INACTIVO">Inactivo</option>
        </BaseSelect>

        <p class="role-help">Una persona con ambos roles elige con cuál trabajar al iniciar su sesión. Desactivar un usuario bloquea el ingreso sin borrar su historial.</p>

        <section v-if="userForm.esTecnico" class="certificate-section">
          <div class="certificate-section__title"><h3>Certificado técnico</h3><span>Opcional</span></div>
          <div v-if="formMode === 'edit' && userForm.certificadoStoragePath" class="current-certificate">
            <strong>Certificado actual</strong>
            <span>{{ fileName(userForm.certificadoStoragePath) }} · {{ editingUser ? certificateSummary(editingUser) : 'Archivo adjunto' }}</span>
          </div>
          <BaseFileUpload
            v-model="formFile"
            name="user-certificate"
            :label="formMode === 'edit' && userForm.certificadoStoragePath ? 'Reemplazar certificado · opcional' : 'Adjuntar certificado'"
            :hint="formMode === 'edit' && userForm.certificadoStoragePath ? 'Déjalo vacío para conservar el archivo actual.' : undefined"
            :error="formError('certificateFile')"
            @blur="touchForm('certificateFile')"
          />
          <div v-if="formFile || userForm.certificadoStoragePath" class="certificate-dates">
            <BaseDateTimePicker v-model="userForm.certificadoFechaEmision" mode="date" name="user-issued" label="Fecha de emisión" required :error="formError('certificadoFechaEmision')" @blur="touchForm('certificadoFechaEmision')" />
            <BaseDateTimePicker v-model="userForm.certificadoFechaVencimiento" mode="date" name="user-expiry" label="Fecha de vencimiento" required :min="userForm.certificadoFechaEmision ?? undefined" :error="formError('certificadoFechaVencimiento')" @blur="touchForm('certificadoFechaVencimiento')" />
          </div>
          <div v-if="editingUser && (certificateStatus(editingUser) === 'expiring' || certificateStatus(editingUser) === 'expired')" class="certificate-alert">
            <strong>{{ certificateStatus(editingUser) === 'expired' ? 'Certificado vencido' : 'Certificado próximo a vencer' }}</strong>
            <span>Si existe un certificado, debe mantenerse vigente antes de asignar al técnico como responsable.</span>
          </div>
        </section>
      </form>
      <template #footer>
        <BaseButton variant="secondary" :disabled="savingForm" @click="requestCloseForm">Cancelar</BaseButton>
        <BaseButton type="submit" form="user-form" :loading="savingForm" :disabled="formLoading">{{ formMode === 'create' ? 'Crear usuario' : 'Guardar cambios' }}</BaseButton>
      </template>
    </BaseDialog>

    <ConfirmDialog
      :open="deactivateConfirmOpen"
      title="Desactivar usuario"
      :message="`Desactivar a ${editingUser?.nombreCompleto ?? 'este usuario'} bloqueará su ingreso sin borrar el historial.`"
      confirm-label="Desactivar"
      danger
      :loading="savingForm"
      @cancel="deactivateConfirmOpen = false"
      @confirm="persistEdit"
    />
    <ConfirmDialog
      :open="discardConfirmOpen"
      :title="discardTitle"
      :message="discardMessage"
      confirm-label="Descartar"
      danger
      @cancel="discardConfirmOpen = false"
      @confirm="discardForm"
    />
  </div>
</template>

<style scoped>
.users-page { display: grid; gap: 1.5rem; }
.users-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; }
.users-header h1 { margin: 0; font-size: 1.75rem; font-weight: 500; line-height: 2.125rem; letter-spacing: -0.02em; }
.users-header p { margin: 0.25rem 0 0; color: var(--text-secondary); }
.users-table { overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-panel); background: var(--surface); border-spacing: 0; border-collapse: separate; }
.users-table th { height: 44px; border: 0; background: var(--sidebar); padding: 0.75rem; color: var(--text-secondary); font-size: 0.75rem; font-weight: 500; text-transform: none; letter-spacing: 0; }
.users-table td { height: 64px; border: 0; border-top: 1px solid var(--border); padding: 0.75rem; vertical-align: middle; color: var(--text-secondary); }
.users-table tbody tr:hover { background: var(--hover); }
.users-table td:first-child strong { display: block; color: var(--text); }
.actions-heading, .actions-cell { width: 5.5rem; text-align: center; }
.actions-cell :deep(.icon-button) { margin-inline: auto; }
.badge-row { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.user-card { display: grid; gap: 0.75rem; border: 1px solid var(--border); border-radius: var(--radius-panel); background: var(--surface); padding: 1rem; color: var(--text); }
.user-card > span:first-child { display: grid; gap: 0.125rem; }
.user-card small { color: var(--text-secondary); overflow-wrap: anywhere; }
.user-card :deep(.base-button) { justify-self: start; }
.dialog-form { display: grid; gap: 1.25rem; }
.email-field { display: grid; gap: 0.375rem; }
.field-warning { margin: 0; color: var(--warning); font-size: 0.8125rem; line-height: 1.125rem; }
.role-help { margin: 0; color: var(--text-secondary); font-size: 0.875rem; line-height: 1.35rem; }
.certificate-section { display: grid; gap: 0.75rem; border: 1px solid var(--border); border-radius: var(--radius-panel); background: var(--bg); padding: 1rem; }
.certificate-section__title { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.certificate-section__title h3 { margin: 0; font-size: 1rem; font-weight: 500; }
.certificate-section__title span, .certificate-section p { margin: 0; color: var(--text-secondary); font-size: 0.8125rem; }
.certificate-dates { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 0.75rem; }
.certificate-dates :deep(.date-time-control) { min-height: 44px; height: 44px; }
.certificate-dates :deep(.date-time-control input) { height: 42px; padding-block: 0.5rem; }
.certificate-dates :deep(.icon-button) { align-self: center; }
.current-certificate { display: grid; gap: 0.25rem; border-radius: 8px; background: var(--info-subtle); padding: 0.75rem; color: var(--info); }
.current-certificate span { color: var(--text-secondary); }
.certificate-alert { display: grid; gap: 0.25rem; border-radius: 8px; background: var(--warning-subtle); padding: 0.75rem; color: var(--warning); }
.certificate-alert span { color: var(--text-secondary); }

@media (max-width: 600px) {
  .users-header { align-items: stretch; }
  .users-header :deep(.base-button) { align-self: flex-end; }
  .certificate-dates { grid-template-columns: 1fr; }
}
</style>
