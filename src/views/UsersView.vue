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
import { certificateStatus, validateUserInput, type CertificateStatus, type UserFormErrors } from '@/helpers/users'
import {
  createUser,
  listUsers,
  setUserActive,
  updateUser,
} from '@/services/usersService'
import { deleteMasterFile, getMasterFileUrl, uploadMasterFile } from '@/services/filesService'
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

function openEdit(user: UserRecord): void {
  formMode.value = 'edit'
  editingUserId.value = user.id
  resetForm()
  Object.assign(userForm, toUserInput(user))
  formBaseline.value = JSON.stringify(userForm)
  formOpen.value = true
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
  editingUserId.value = null
  resetForm()
}

async function submitForm(): Promise<void> {
  if (savingForm.value) return
  formSubmitted.value = true
  if (Object.keys(formErrors.value).length) {
    await focusFirstError()
    notifications.show('Revisa los campos marcados antes de guardar.', 'error')
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
  let uploadedPath: string | null = null
  try {
    let input = { ...userForm }
    if (formFile.value) {
      uploadedPath = await uploadMasterFile('USER_CERTIFICATE', formFile.value)
      input = { ...input, certificadoStoragePath: uploadedPath }
    }
    const created = normalizeUser(await createUser(input))
    users.value = [...users.value, created].sort((left, right) => left.nombreCompleto.localeCompare(right.nombreCompleto, 'es'))
    closeForm()
    notifications.show('Usuario creado correctamente.', 'success')
  } catch (error) {
    if (uploadedPath) await deleteMasterFile(uploadedPath).catch(() => undefined)
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
  let uploadedPath: string | null = null
  try {
    let input = { ...userForm }
    if (formFile.value) {
      uploadedPath = await uploadMasterFile('USER_CERTIFICATE', formFile.value)
      input = { ...input, certificadoStoragePath: uploadedPath }
    }
    const updated = input.activo === user.activo
      ? await updateUser(user.id, input)
      : await setUserActive({ ...user, ...input }, input.activo)
    replaceUser(normalizeUser(updated))
    if (user.certificadoStoragePath && user.certificadoStoragePath !== updated.certificadoStoragePath) {
      void deleteMasterFile(user.certificadoStoragePath).catch(() =>
        notifications.show('El usuario se guardó, pero no fue posible limpiar el certificado anterior.', 'warning'))
    }
    closeForm()
    notifications.show('Usuario actualizado correctamente.', 'success')
  } catch (error) {
    if (uploadedPath) await deleteMasterFile(uploadedPath).catch(() => undefined)
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

async function openPrivateFile(storagePath: string): Promise<void> {
  const popup = window.open('', '_blank')
  try {
    const url = await getMasterFileUrl(storagePath)
    if (popup) popup.location.href = url
    else window.location.href = url
  } catch (error) {
    popup?.close()
    notifications.show(userMessage(error, 'No fue posible abrir el certificado'), 'error')
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
      <form id="user-form" class="dialog-form" novalidate @submit.prevent="submitForm">
        <section class="form-section" aria-labelledby="user-data-heading">
          <header class="form-section__header">
            <div>
              <h3 id="user-data-heading">Datos del usuario</h3>
              <p>Información utilizada para identificar a la persona dentro del sistema.</p>
            </div>
          </header>
          <div class="form-stack">
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
          </div>
        </section>

        <section class="form-section" aria-labelledby="access-heading">
          <header class="form-section__header">
            <div>
              <h3 id="access-heading">Acceso y roles</h3>
              <p>Define qué puede hacer el usuario cuando ingrese.</p>
            </div>
          </header>
          <div class="form-grid form-grid--roles">
            <BaseSelect :model-value="userForm.esAdmin ? 'SI' : 'NO'" name="user-admin" label="Administrador" :error="formError('roles')" @update:model-value="userForm.esAdmin = $event === 'SI'" @blur="touchForm('roles')">
              <option value="NO">No</option><option value="SI">Sí</option>
            </BaseSelect>
            <BaseSelect :model-value="userForm.esTecnico ? 'SI' : 'NO'" name="user-technician" label="Técnico" :error="formError('roles')" @update:model-value="userForm.esTecnico = $event === 'SI'" @blur="touchForm('roles')">
              <option value="NO">No</option><option value="SI">Sí</option>
            </BaseSelect>
            <BaseSelect v-if="formMode === 'edit'" class="form-field--full" :model-value="userForm.activo ? 'ACTIVO' : 'INACTIVO'" name="user-status" label="Estado" @update:model-value="userForm.activo = $event === 'ACTIVO'">
              <option value="ACTIVO">Activo</option><option value="INACTIVO">Inactivo</option>
            </BaseSelect>
          </div>
          <p class="form-note">Si una persona tiene ambos roles, elige con cuál trabajar al iniciar su sesión. Desactivarla bloquea el ingreso sin borrar su historial.</p>
        </section>

        <section v-if="userForm.esTecnico" class="form-section certificate-section" aria-labelledby="certificate-heading">
          <header class="form-section__header">
            <div>
              <h3 id="certificate-heading">Certificado técnico</h3>
              <p>PDF, JPG o PNG. Si adjuntas un archivo, emisión y vencimiento son obligatorios.</p>
            </div>
            <span class="optional-chip">Opcional</span>
          </header>

          <div v-if="formMode === 'edit' && userForm.certificadoStoragePath" class="current-certificate">
            <strong>Certificado actual</strong>
            <span>{{ fileName(userForm.certificadoStoragePath) }}</span><BaseButton type="button" variant="ghost" @click="openPrivateFile(userForm.certificadoStoragePath)">Ver certificado</BaseButton>
          </div>

          <BaseFileUpload
            v-model="formFile"
            class="certificate-upload"
            name="user-certificate"
            label="Seleccionar archivo"
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
            <span>Actualízalo antes de asignar nuevamente a este técnico como responsable.</span>
          </div>
        </section>
      </form>
      <template #footer>
        <BaseButton variant="secondary" :disabled="savingForm" @click="requestCloseForm">Cancelar</BaseButton>
        <BaseButton type="submit" form="user-form" :loading="savingForm">{{ formMode === 'create' ? 'Crear usuario' : 'Guardar cambios' }}</BaseButton>
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

.dialog-form { display: grid; gap: 1.5rem; }
.form-section { display: grid; min-width: 0; gap: 1rem; }
.form-section + .form-section { border-top: 1px solid var(--border); padding-top: 1.5rem; }
.form-section__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
.form-section__header h3 { margin: 0; color: var(--text); font-size: 0.9375rem; font-weight: 600; line-height: 1.25rem; }
.form-section__header p { margin: 0.25rem 0 0; color: var(--text-secondary); font-size: 0.8125rem; line-height: 1.2rem; }
.form-stack { display: grid; gap: 1rem; }
.form-grid { display: grid; min-width: 0; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
.form-field--full { grid-column: 1 / -1; }
.form-note { margin: 0; border-radius: var(--radius); background: var(--accent-subtle); padding: 0.75rem 0.875rem; color: var(--text-secondary); font-size: 0.8125rem; line-height: 1.25rem; }
.email-field { display: grid; gap: 0.375rem; }
.field-warning { margin: 0; color: var(--warning); font-size: 0.8125rem; line-height: 1.125rem; }

.optional-chip { flex: 0 0 auto; border: 1px solid var(--border); border-radius: 999px; background: var(--surface-raised); padding: 0.2rem 0.55rem; color: var(--text-secondary); font-size: 0.75rem; font-weight: 500; line-height: 1rem; }
.certificate-section { min-width: 0; }
.certificate-upload { min-width: 0; }
.certificate-upload :deep(.base-field__label) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
.certificate-upload :deep(.file-upload) { min-height: 5.5rem; border-radius: var(--radius); background: var(--surface-raised); padding: 1rem; }
.certificate-dates { display: grid; min-width: 0; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 1rem; }
.certificate-dates > * { min-width: 0; }
.current-certificate { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 1rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-raised); padding: 0.75rem 0.875rem; }
.current-certificate strong { color: var(--text); font-size: 0.8125rem; }
.current-certificate span { min-width: 0; overflow: hidden; color: var(--text-secondary); font-size: 0.8125rem; text-overflow: ellipsis; white-space: nowrap; }
.certificate-alert { display: grid; gap: 0.25rem; border-radius: var(--radius); background: var(--warning-subtle); padding: 0.75rem 0.875rem; color: var(--warning); }
.certificate-alert span { color: var(--text-secondary); font-size: 0.8125rem; line-height: 1.2rem; }

@media (max-width: 600px) {
  .users-header { align-items: stretch; }
  .users-header :deep(.base-button) { align-self: flex-end; }
  .form-grid, .certificate-dates { grid-template-columns: 1fr; }
  .form-field--full { grid-column: auto; }
  .form-section__header { gap: 0.75rem; }
  .current-certificate { align-items: flex-start; flex-direction: column; gap: 0.25rem; }
}
</style>
