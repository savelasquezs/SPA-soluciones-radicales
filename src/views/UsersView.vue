<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseDateTimePicker from '@/components/base/BaseDateTimePicker.vue'
import BaseDialog from '@/components/base/BaseDialog.vue'
import BaseFileUpload from '@/components/base/BaseFileUpload.vue'
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
  updateUserCertificate,
  UserServiceError,
} from '@/services/usersService'
import { useNotificationsStore } from '@/stores/notifications'
import type { UserInput, UserRecord } from '@/types/domain'

type ErrorKey = keyof UserFormErrors

const notifications = useNotificationsStore()
const users = ref<UserRecord[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const selectedId = ref<string | null>(null)
const profileLoading = ref(false)
const savingProfile = ref(false)
const savingCreate = ref(false)
const savingCertificate = ref(false)
const createOpen = ref(false)
const certificateOpen = ref(false)
const deactivateConfirmOpen = ref(false)
const discardCreateConfirmOpen = ref(false)
const createFile = ref<File | null>(null)
const certificateFile = ref<File | null>(null)
const createTouched = reactive<Partial<Record<ErrorKey, boolean>>>({})
const certificateTouched = reactive<Partial<Record<ErrorKey, boolean>>>({})
const createSubmitted = ref(false)
const certificateSubmitted = ref(false)

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

const createForm = reactive<UserInput>(blankUser())
const profileForm = reactive<UserInput>(blankUser())
const profileBaseline = ref('')
const certificateForm = reactive({
  certificadoFechaEmision: null as string | null,
  certificadoFechaVencimiento: null as string | null,
  certificadoObservaciones: null as string | null,
})

const selectedUser = computed(() => users.value.find((user) => user.id === selectedId.value) ?? null)
const createErrors = computed(() => validateUserInput(createForm, createFile.value))
const createEmailWarning = computed(() => {
  const email = createForm.correoGoogle.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith('@gmail.com')) return null
  return 'Asegúrate de que este correo corresponda a una cuenta de Google.'
})
const createDirty = computed(() => JSON.stringify(createForm) !== JSON.stringify(blankUser()) || Boolean(createFile.value))
const profileDirty = computed(() => Boolean(selectedUser.value) && JSON.stringify(profileForm) !== profileBaseline.value)
const profileErrors = computed(() => validateUserInput(profileForm, null))
const certificateErrors = computed<UserFormErrors>(() => {
  const user = selectedUser.value
  if (!user) return {}
  const errors = validateUserInput({
    ...user,
    certificadoFechaEmision: certificateForm.certificadoFechaEmision,
    certificadoFechaVencimiento: certificateForm.certificadoFechaVencimiento,
    certificadoObservaciones: certificateForm.certificadoObservaciones,
  }, certificateFile.value)
  if (!user.certificadoStoragePath && !certificateFile.value) {
    errors.certificateFile = 'Adjunta el certificado que deseas registrar'
  }
  return errors
})

onMounted(loadUsers)

watch(selectedUser, (user) => {
  if (!user) return
  Object.assign(profileForm, user)
  profileBaseline.value = JSON.stringify(profileForm)
})

watch(() => createForm.esTecnico, (isTechnician) => {
  if (!isTechnician && !createFile.value) {
    createForm.certificadoFechaEmision = null
    createForm.certificadoFechaVencimiento = null
  }
})

watch(createFile, (file) => {
  if (!file) {
    createForm.certificadoFechaEmision = null
    createForm.certificadoFechaVencimiento = null
  }
})

async function loadUsers(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    users.value = (await listUsers()).map(normalizeUser)
    if (!selectedId.value || !users.value.some((user) => user.id === selectedId.value)) {
      selectedId.value = users.value[0]?.id ?? null
    }
  } catch (error) {
    loadError.value = userMessage(error, 'No fue posible cargar los usuarios')
  } finally {
    loading.value = false
  }
}

async function selectUser(user: UserRecord): Promise<void> {
  if (profileDirty.value) {
    notifications.show('Guarda o descarta los cambios del perfil antes de cambiar de usuario.', 'warning')
    return
  }
  selectedId.value = user.id
  profileLoading.value = true
  try {
    const fresh = normalizeUser(await getUser(user.id))
    replaceUser(fresh)
  } catch (error) {
    notifications.show(userMessage(error, 'No fue posible cargar el perfil'), 'error')
  } finally {
    profileLoading.value = false
  }
}

function openCreate(): void {
  resetCreate()
  createOpen.value = true
}

function requestCloseCreate(): void {
  if (createDirty.value) discardCreateConfirmOpen.value = true
  else createOpen.value = false
}

function discardCreate(): void {
  discardCreateConfirmOpen.value = false
  createOpen.value = false
  resetCreate()
}

async function submitCreate(): Promise<void> {
  if (savingCreate.value) return
  createSubmitted.value = true
  if (Object.keys(createErrors.value).length) {
    await focusFirstError()
    notifications.show('Revisa los campos marcados antes de crear el usuario.', 'error')
    return
  }
  if (createFile.value) {
    notifications.show('La carga del certificado estará disponible cuando se conecte el backend autorizado de R2.', 'warning')
    return
  }

  savingCreate.value = true
  try {
    const created = normalizeUser(await createUser(createForm))
    users.value = [...users.value, created].sort((left, right) => left.nombreCompleto.localeCompare(right.nombreCompleto, 'es'))
    selectedId.value = created.id
    createOpen.value = false
    resetCreate()
    notifications.show('Usuario creado correctamente.', 'success')
  } catch (error) {
    notifications.show(userMessage(error, 'No fue posible crear el usuario'), 'error')
  } finally {
    savingCreate.value = false
  }
}

function saveProfile(): void {
  if (Object.keys(profileErrors.value).length) {
    notifications.show('Revisa los roles y los datos del certificado.', 'error')
    void focusFirstError()
    return
  }
  if (selectedUser.value?.activo && !profileForm.activo) {
    deactivateConfirmOpen.value = true
    return
  }
  void persistProfile()
}

async function persistProfile(): Promise<void> {
  const user = selectedUser.value
  if (!user || savingProfile.value) return
  savingProfile.value = true
  deactivateConfirmOpen.value = false
  try {
    const updated = profileForm.activo === user.activo
      ? await updateUser(user.id, profileForm)
      : await setUserActive({ ...user, ...profileForm }, profileForm.activo)
    replaceUser(normalizeUser(updated))
    notifications.show('Perfil actualizado correctamente.', 'success')
  } catch (error) {
    notifications.show(userMessage(error, 'No fue posible actualizar el perfil'), 'error')
  } finally {
    savingProfile.value = false
  }
}

function discardProfile(): void {
  const user = selectedUser.value
  if (user) Object.assign(profileForm, user)
}

function openCertificate(): void {
  const user = selectedUser.value
  if (!user) return
  certificateFile.value = null
  certificateSubmitted.value = false
  Object.keys(certificateTouched).forEach((key) => delete certificateTouched[key as ErrorKey])
  certificateForm.certificadoFechaEmision = user.certificadoFechaEmision
  certificateForm.certificadoFechaVencimiento = user.certificadoFechaVencimiento
  certificateForm.certificadoObservaciones = user.certificadoObservaciones
  certificateOpen.value = true
}

async function submitCertificate(): Promise<void> {
  const user = selectedUser.value
  if (!user || savingCertificate.value) return
  certificateSubmitted.value = true
  if (Object.keys(certificateErrors.value).length) {
    notifications.show('Revisa el archivo y las fechas del certificado.', 'error')
    await focusFirstError()
    return
  }
  savingCertificate.value = true
  try {
    const updated = await updateUserCertificate(user, { ...certificateForm, file: certificateFile.value })
    replaceUser(normalizeUser(updated))
    certificateOpen.value = false
    notifications.show('Certificado actualizado correctamente.', 'success')
  } catch (error) {
    notifications.show(userMessage(error, 'No fue posible actualizar el certificado'), error instanceof UserServiceError && !error.retryable ? 'warning' : 'error')
  } finally {
    savingCertificate.value = false
  }
}

function touchCreate(field: ErrorKey): void {
  createTouched[field] = true
}

function createError(field: ErrorKey): string | undefined {
  return createTouched[field] || createSubmitted.value ? createErrors.value[field] : undefined
}

function touchCertificate(field: ErrorKey): void {
  certificateTouched[field] = true
}

function certificateError(field: ErrorKey): string | undefined {
  return certificateTouched[field] || certificateSubmitted.value ? certificateErrors.value[field] : undefined
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

function resetCreate(): void {
  Object.assign(createForm, blankUser())
  createFile.value = null
  createSubmitted.value = false
  Object.keys(createTouched).forEach((key) => delete createTouched[key as ErrorKey])
}

function replaceUser(user: UserRecord): void {
  users.value = users.value.map((current) => current.id === user.id ? user : current)
  if (selectedId.value === user.id) {
    Object.assign(profileForm, user)
    profileBaseline.value = JSON.stringify(profileForm)
  }
}

function normalizeUser(user: UserRecord): UserRecord {
  return { ...user, version: Number(user.version) }
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
    <template v-else>
      <ResponsiveTable>
        <template #table>
          <table class="users-table">
            <thead><tr><th>Usuario</th><th>Correo Google</th><th>Roles</th><th>Credencial</th><th>Estado</th></tr></thead>
            <tbody>
              <tr
                v-for="user in users"
                :key="user.id"
                :class="{ 'is-selected': selectedId === user.id }"
                tabindex="0"
                role="button"
                :aria-label="`Ver perfil de ${user.nombreCompleto}`"
                @click="selectUser(user)"
                @keydown.enter.prevent="selectUser(user)"
                @keydown.space.prevent="selectUser(user)"
              >
                <td><strong>{{ user.nombreCompleto }}</strong><small v-if="selectedId === user.id">Perfil seleccionado</small></td>
                <td>{{ user.correoGoogle }}</td>
                <td><div class="badge-row"><StatusBadge v-if="user.esAdmin" tone="info" icon="shield">Administrador</StatusBadge><StatusBadge v-if="user.esTecnico" tone="technician" icon="technician">Técnico</StatusBadge></div></td>
                <td><StatusBadge :tone="certificateTone(certificateStatus(user))" :icon="certificateIcon(certificateStatus(user))">{{ certificateLabel(user) }}</StatusBadge></td>
                <td><StatusBadge :tone="user.activo ? 'success' : 'neutral'" :icon="user.activo ? 'check' : 'x'">{{ user.activo ? 'Activo' : 'Inactivo' }}</StatusBadge></td>
              </tr>
            </tbody>
          </table>
        </template>
        <template #cards>
          <button v-for="user in users" :key="user.id" type="button" class="user-card" :class="{ 'is-selected': selectedId === user.id }" @click="selectUser(user)">
            <span><strong>{{ user.nombreCompleto }}</strong><small>{{ user.correoGoogle }}</small></span>
            <span class="badge-row"><StatusBadge v-if="user.esAdmin" tone="info" icon="shield">Administrador</StatusBadge><StatusBadge v-if="user.esTecnico" tone="technician" icon="technician">Técnico</StatusBadge></span>
            <span class="badge-row"><StatusBadge :tone="certificateTone(certificateStatus(user))" :icon="certificateIcon(certificateStatus(user))">{{ certificateLabel(user) }}</StatusBadge><StatusBadge :tone="user.activo ? 'success' : 'neutral'" :icon="user.activo ? 'check' : 'x'">{{ user.activo ? 'Activo' : 'Inactivo' }}</StatusBadge></span>
          </button>
        </template>
      </ResponsiveTable>

      <div v-if="selectedUser" class="profile-grid">
        <section class="profile-card" :aria-busy="profileLoading">
          <h2>{{ selectedUser.nombreCompleto }}</h2>
          <div class="badge-row">
            <StatusBadge :tone="selectedUser.activo ? 'success' : 'neutral'" :icon="selectedUser.activo ? 'check' : 'x'">{{ selectedUser.activo ? 'Activo' : 'Inactivo' }}</StatusBadge>
            <StatusBadge v-if="selectedUser.esAdmin" tone="info" icon="shield">Administrador</StatusBadge>
            <StatusBadge v-if="selectedUser.esTecnico" tone="technician" icon="technician">Técnico</StatusBadge>
            <StatusBadge v-if="selectedUser.esTecnico" :tone="certificateTone(certificateStatus(selectedUser))" :icon="certificateIcon(certificateStatus(selectedUser))">{{ certificateLabel(selectedUser) }}</StatusBadge>
          </div>
          <div class="profile-fields">
            <BaseSelect :model-value="profileForm.esAdmin ? 'SI' : 'NO'" name="profile-admin" label="Rol administrador" :error="profileErrors.roles" @update:model-value="profileForm.esAdmin = $event === 'SI'">
              <option value="NO">No</option><option value="SI">Sí</option>
            </BaseSelect>
            <BaseSelect :model-value="profileForm.esTecnico ? 'SI' : 'NO'" name="profile-technician" label="Rol técnico" :error="profileErrors.roles" @update:model-value="profileForm.esTecnico = $event === 'SI'">
              <option value="NO">No</option><option value="SI">Sí</option>
            </BaseSelect>
            <BaseSelect :model-value="profileForm.activo ? 'ACTIVO' : 'INACTIVO'" name="profile-status" label="Estado" @update:model-value="profileForm.activo = $event === 'ACTIVO'">
              <option value="ACTIVO">Activo</option><option value="INACTIVO">Inactivo</option>
            </BaseSelect>
            <div v-if="profileForm.esTecnico" class="certificate-summary">
              <strong>Certificado técnico</strong>
              <span class="certificate-summary__value">{{ certificateSummary(selectedUser) }}</span>
              <small>Opcional. Si existe, debe tener fecha de emisión y vencimiento.</small>
              <BaseButton variant="secondary" @click="openCertificate">{{ selectedUser.certificadoStoragePath ? 'Actualizar certificado' : 'Agregar certificado' }}</BaseButton>
            </div>
          </div>
          <div class="profile-actions">
            <BaseButton v-if="profileDirty" variant="ghost" :disabled="savingProfile" @click="discardProfile">Descartar</BaseButton>
            <BaseButton :loading="savingProfile" :disabled="!profileDirty" @click="saveProfile">Guardar perfil</BaseButton>
          </div>
        </section>

        <aside class="rules-card">
          <h2>Un rol activo a la vez</h2>
          <p>Una persona con ambos roles elige con cuál trabajar antes de cargar datos. En modo Técnico solo ve servicios en los que está asignada.</p>
          <div v-if="certificateStatus(selectedUser) === 'expiring' || certificateStatus(selectedUser) === 'expired'" class="certificate-alert">
            <strong>{{ certificateStatus(selectedUser) === 'expired' ? 'Certificado vencido' : 'Certificado próximo a vencer' }}</strong>
            <p>El certificado es opcional. Si existe y vence, debe actualizarse antes de asignar al técnico como responsable.</p>
          </div>
          <p>Desactivar un usuario bloquea el ingreso, pero no borra su participación en servicios anteriores.</p>
        </aside>
      </div>
    </template>

    <BaseDialog :model-value="createOpen" title="Agregar usuario" description="El correo debe corresponder a una cuenta Google." @update:model-value="!$event && requestCloseCreate()">
      <form id="create-user-form" class="dialog-form" novalidate @submit.prevent="submitCreate">
        <BaseInput v-model="createForm.nombreCompleto" name="create-name" label="Nombre completo" required autocomplete="name" :error="createError('nombreCompleto')" @blur="touchCreate('nombreCompleto')" />
        <div class="email-field">
          <BaseInput v-model="createForm.correoGoogle" name="create-email" label="Correo Google" type="email" required autocomplete="email" :error="createError('correoGoogle')" @blur="touchCreate('correoGoogle')" />
          <p v-if="createEmailWarning && !createError('correoGoogle')" class="field-warning" role="status">{{ createEmailWarning }}</p>
        </div>
        <BaseSelect :model-value="createForm.esAdmin ? 'SI' : 'NO'" name="create-admin" label="Rol administrador" :error="createError('roles')" @update:model-value="createForm.esAdmin = $event === 'SI'" @blur="touchCreate('roles')">
          <option value="NO">No</option><option value="SI">Sí</option>
        </BaseSelect>
        <BaseSelect :model-value="createForm.esTecnico ? 'SI' : 'NO'" name="create-technician" label="Rol técnico" :error="createError('roles')" @update:model-value="createForm.esTecnico = $event === 'SI'" @blur="touchCreate('roles')">
          <option value="NO">No</option><option value="SI">Sí</option>
        </BaseSelect>
        <section v-if="createForm.esTecnico" class="certificate-section">
          <div class="certificate-section__title"><h3>Certificado técnico</h3><span>Opcional</span></div>
          <BaseFileUpload v-model="createFile" name="create-certificate" label="Adjuntar certificado" :error="createError('certificateFile')" @blur="touchCreate('certificateFile')" />
          <div v-if="createFile" class="certificate-dates">
            <BaseDateTimePicker v-model="createForm.certificadoFechaEmision" mode="date" name="create-issued" label="Fecha de emisión" required :error="createError('certificadoFechaEmision')" @blur="touchCreate('certificadoFechaEmision')" />
            <BaseDateTimePicker v-model="createForm.certificadoFechaVencimiento" mode="date" name="create-expiry" label="Fecha de vencimiento" required :min="createForm.certificadoFechaEmision ?? undefined" :error="createError('certificadoFechaVencimiento')" @blur="touchCreate('certificadoFechaVencimiento')" />
          </div>
        </section>
      </form>
      <template #footer>
        <BaseButton variant="secondary" :disabled="savingCreate" @click="requestCloseCreate">Cancelar</BaseButton>
        <BaseButton type="submit" form="create-user-form" :loading="savingCreate">Crear usuario</BaseButton>
      </template>
    </BaseDialog>

    <BaseDialog v-if="selectedUser" v-model="certificateOpen" title="Actualizar certificado" description="Este técnico tiene un certificado adjunto. Mientras exista el archivo, fecha de emisión y fecha de vencimiento son obligatorias.">
      <form id="certificate-form" class="dialog-form" novalidate @submit.prevent="submitCertificate">
        <p class="required-legend"><span>*</span> Campos obligatorios</p>
        <div v-if="selectedUser.certificadoStoragePath" class="current-certificate"><strong>Certificado actual</strong><span>{{ fileName(selectedUser.certificadoStoragePath) }} · Archivo adjunto</span></div>
        <BaseDateTimePicker v-model="certificateForm.certificadoFechaEmision" mode="date" name="certificate-issued" label="Fecha de emisión" :required="Boolean(selectedUser.certificadoStoragePath || certificateFile)" hint="Obligatoria porque existe un certificado adjunto." :error="certificateError('certificadoFechaEmision')" @blur="touchCertificate('certificadoFechaEmision')" />
        <BaseDateTimePicker v-model="certificateForm.certificadoFechaVencimiento" mode="date" name="certificate-expiry" label="Fecha de vencimiento" :required="Boolean(selectedUser.certificadoStoragePath || certificateFile)" :min="certificateForm.certificadoFechaEmision ?? undefined" hint="Obligatoria porque existe un certificado adjunto." :error="certificateError('certificadoFechaVencimiento')" @blur="touchCertificate('certificadoFechaVencimiento')" />
        <BaseFileUpload v-model="certificateFile" class="certificate-replacement" name="replace-certificate" label="Reemplazar certificado · opcional" hint="Déjalo vacío para conservar el archivo actual." :error="certificateError('certificateFile')" @blur="touchCertificate('certificateFile')" />
      </form>
      <template #footer>
        <BaseButton variant="secondary" :disabled="savingCertificate" @click="certificateOpen = false">Cancelar</BaseButton>
        <BaseButton type="submit" form="certificate-form" :loading="savingCertificate">Guardar certificado</BaseButton>
      </template>
    </BaseDialog>

    <ConfirmDialog :open="deactivateConfirmOpen" title="Desactivar usuario" :message="`Desactivar a ${selectedUser?.nombreCompleto ?? 'este usuario'} bloqueará su ingreso sin borrar el historial.`" confirm-label="Desactivar" danger :loading="savingProfile" @cancel="deactivateConfirmOpen = false" @confirm="persistProfile" />
    <ConfirmDialog :open="discardCreateConfirmOpen" title="Descartar usuario" message="Los datos ingresados todavía no se han guardado." confirm-label="Descartar" danger @cancel="discardCreateConfirmOpen = false" @confirm="discardCreate" />
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
.users-table tbody tr { cursor: pointer; outline: 0; }
.users-table tbody tr:hover { background: var(--hover); }
.users-table tbody tr.is-selected { background: var(--accent-subtle); }
.users-table tbody tr:focus-visible { box-shadow: inset var(--focus-ring); }
.users-table td:first-child strong, .users-table td:first-child small { display: block; color: var(--text); }
.users-table td:first-child small { color: var(--accent); }
.badge-row { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.user-card { display: grid; gap: 0.75rem; border: 1px solid var(--border); border-radius: var(--radius-panel); background: var(--surface); padding: 1rem; color: var(--text); text-align: left; }
.user-card.is-selected { border-color: var(--accent); background: var(--accent-subtle); }
.user-card > span:first-child { display: grid; gap: 0.125rem; }
.user-card small { color: var(--text-secondary); overflow-wrap: anywhere; }
.profile-grid { display: grid; grid-template-columns: minmax(0, 3fr) minmax(18rem, 2fr); gap: 1.5rem; }
.profile-card, .rules-card { border: 1px solid var(--border); border-radius: var(--radius-panel); background: var(--surface); padding: 1.5rem; }
.profile-card { display: grid; gap: 1rem; }
.profile-card h2, .rules-card h2 { margin: 0; font-size: 1.25rem; font-weight: 500; }
.profile-fields { display: grid; gap: 1rem; }
.certificate-summary { display: grid; gap: 0.5rem; }
.certificate-summary span, .certificate-summary small { color: var(--text-secondary); }
.certificate-summary__value { min-height: 44px; display: flex; align-items: center; border: 1px solid var(--control-border); border-radius: var(--radius-input); padding: 0.65rem 0.75rem; }
.certificate-summary .base-button { justify-self: start; }
.profile-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.rules-card { display: grid; align-content: start; gap: 1rem; }
.rules-card p { margin: 0; color: var(--text-secondary); }
.certificate-alert { display: grid; gap: 0.25rem; border-radius: 8px; background: var(--warning-subtle); padding: 1rem; color: var(--warning); }
.dialog-form { display: grid; gap: 1.25rem; }
.required-legend { margin: 0; color: var(--text-secondary); font-size: 0.8125rem; }
.required-legend span { color: var(--danger); }
.email-field { display: grid; gap: 0.375rem; }
.field-warning { margin: 0; color: var(--warning); font-size: 0.8125rem; line-height: 1.125rem; }
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
.certificate-replacement { width: min(100%, 22rem); }

@media (max-width: 900px) {
  .profile-grid { grid-template-columns: 1fr; }
}
@media (max-width: 600px) {
  .users-header { align-items: stretch; }
  .users-header :deep(.base-button) { align-self: flex-end; }
  .certificate-dates { grid-template-columns: 1fr; }
}
</style>
