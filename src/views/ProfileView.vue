<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Camera, ExternalLink, ShieldCheck, UserRound } from 'lucide-vue-next'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseDateTimePicker from '@/components/base/BaseDateTimePicker.vue'
import BaseFileUpload from '@/components/base/BaseFileUpload.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'
import ErrorState from '@/components/base/ErrorState.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import { useFileSaveProgress } from '@/composables/useFileSaveProgress'
import { useAccountTransition } from '@/composables/useAccountTransition'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import { certificateFieldErrors, personalFieldErrors, technicianCertificateStatus } from '@/helpers/profile'
import { clearPendingGoogleHandoff, savePendingGoogleHandoff } from '@/helpers/googleHandoff'
import {
  discardPersonalUpload, getPersonalCertificateUrl, getPersonalProfile,
  savePersonalCertificate, savePersonalData, saveProfileAvatar,
  startGoogleIdentityChange, uploadPersonalFile,
} from '@/services/profileService'
import { useAuthStore } from '@/stores/auth'
import { useNotificationsStore } from '@/stores/notifications'
import type { PersonalProfile } from '@/types/domain'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const notifications = useNotificationsStore()
const accountTransition = useAccountTransition()
const profile = ref<PersonalProfile | null>(null)
const loading = ref(true)
const loadError = ref<string | null>(null)
const personal = reactive({ nombreCompleto: '', telefono: '' })
const certificate = reactive({ issue: null as string | null, expiry: null as string | null })
const photoFile = ref<File | null>(null)
const certificateFile = ref<File | null>(null)
const photoPreview = ref<string | null>(null)
const photoFailed = ref(false)
const touched = reactive({ name: false, phone: false, certificate: false })
const busyPersonal = ref(false)
const busyPhoto = ref(false)
const busyCertificate = ref(false)
const busyGoogle = ref(false)
const leavingForGoogle = ref(false)
const googleConfirmOpen = ref(false)
const photoProgress = useFileSaveProgress()
const certificateProgress = useFileSaveProgress()
const formErrors = computed(() => personalFieldErrors(personal.nombreCompleto, personal.telefono))
const certificateErrors = computed(() => certificateFieldErrors(
  certificateFile.value ? certificateFile.value.name : profile.value?.certificadoStoragePath ?? null,
  certificate.issue, certificate.expiry,
))
const certificateStatus = computed(() => technicianCertificateStatus(
  profile.value?.certificadoFechaVencimiento ?? null, new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }),
))
const isPersonalDirty = computed(() => Boolean(profile.value && (
  personal.nombreCompleto !== profile.value.nombreCompleto ||
  personal.telefono !== (profile.value.telefono ?? '')
)))
const isCertificateDirty = computed(() => Boolean(profile.value && profile.value.esTecnico && (
  certificateFile.value ||
  certificate.issue !== profile.value.certificadoFechaEmision ||
  certificate.expiry !== profile.value.certificadoFechaVencimiento
)))
const busy = computed(() => busyPersonal.value || busyPhoto.value || busyCertificate.value || busyGoogle.value)
const dirty = computed(() => !leavingForGoogle.value && !accountTransition?.discardApproved.value && (isPersonalDirty.value || Boolean(photoFile.value) || isCertificateDirty.value))
const leave = useUnsavedChanges(dirty, busy)
watch([dirty, busy], () => { accountTransition?.setStatus(dirty.value, busy.value) }, { immediate: true })

watch(photoFile, file => {
  if (photoPreview.value) URL.revokeObjectURL(photoPreview.value)
  photoPreview.value = file ? URL.createObjectURL(file) : null
  photoFailed.value = false
})
watch(() => auth.avatarUrl, () => { photoFailed.value = false })
onBeforeUnmount(() => {
  if (photoPreview.value) URL.revokeObjectURL(photoPreview.value)
  accountTransition?.reset()
})
onMounted(() => {
  void load()
  if (route.query.googleActualizado === '1') notifications.show('Cuenta Google actualizada correctamente.', 'success')
})

async function load(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    const record = await getPersonalProfile()
    profile.value = record
    personal.nombreCompleto = record.nombreCompleto
    personal.telefono = record.telefono ?? ''
    certificate.issue = record.certificadoFechaEmision
    certificate.expiry = record.certificadoFechaVencimiento
    touched.name = false
    touched.phone = false
    touched.certificate = false
  } catch (error) {
    loadError.value = message(error, 'No fue posible cargar el perfil')
  } finally {
    loading.value = false
  }
}

async function imageError(): Promise<void> {
  const previous = auth.avatarUrl
  photoFailed.value = true
  if (photoPreview.value || !profile.value?.fotoStoragePath) return
  await auth.recoverExpiredAvatar()
  if (auth.avatarUrl && auth.avatarUrl !== previous) photoFailed.value = false
}

function setProfile(record: PersonalProfile): void {
  profile.value = record
  auth.applyPersonalProfile(record)
}

async function savePersonal(): Promise<void> {
  if (!profile.value || busy.value) return
  touched.name = true
  touched.phone = true
  if (formErrors.value.nombre || formErrors.value.telefono) return
  busyPersonal.value = true
  try {
    const saved = await savePersonalData({
      nombreCompleto: personal.nombreCompleto.trim(),
      telefono: personal.telefono.trim() || null,
      version: profile.value.version,
    })
    setProfile(saved)
    personal.nombreCompleto = saved.nombreCompleto
    personal.telefono = saved.telefono ?? ''
    notifications.show('Datos personales actualizados.', 'success')
  } catch (error) {
    notifications.show(message(error, 'No fue posible guardar tus datos'), 'error')
  } finally {
    busyPersonal.value = false
  }
}

async function savePhoto(): Promise<void> {
  if (!profile.value || !photoFile.value || busy.value) return
  if (!/\.(jpg|jpeg|png|webp)$/i.test(photoFile.value.name)) {
    notifications.show('Selecciona una fotografía JPG, PNG o WebP.', 'error')
    return
  }
  busyPhoto.value = true
  photoProgress.reset()
  let uploaded: string | null = null
  try {
    uploaded = await uploadPersonalFile('AVATAR', photoFile.value, photoProgress.onUploadPhase)
    photoProgress.markSaving()
    const saved = await saveProfileAvatar(uploaded, profile.value.version)
    uploaded = null
    setProfile(saved)
    photoFile.value = null
    await auth.refreshAvatar()
    notifications.show('Fotografía actualizada.', 'success')
  } catch (error) {
    if (uploaded) await discardPersonalUpload('AVATAR', uploaded).catch(() => undefined)
    notifications.show(message(error, 'No fue posible actualizar la fotografía'), 'error')
  } finally {
    busyPhoto.value = false
    photoProgress.reset()
  }
}

async function useGooglePhoto(): Promise<void> {
  if (!profile.value?.fotoStoragePath || busy.value) return
  busyPhoto.value = true
  try {
    const saved = await saveProfileAvatar(null, profile.value.version)
    setProfile(saved)
    photoFile.value = null
    await auth.refreshAvatar()
    notifications.show('Se restauró la fotografía de Google.', 'success')
  } catch (error) {
    notifications.show(message(error, 'No fue posible restaurar la fotografía'), 'error')
  } finally {
    busyPhoto.value = false
  }
}

async function saveCertificate(): Promise<void> {
  if (!profile.value?.esTecnico || busy.value) return
  touched.certificate = true
  if (certificateErrors.value.file || certificateErrors.value.issue || certificateErrors.value.expiry) return
  busyCertificate.value = true
  certificateProgress.reset()
  let uploaded: string | null = null
  try {
    if (certificateFile.value) uploaded = await uploadPersonalFile('CERTIFICATE', certificateFile.value, certificateProgress.onUploadPhase)
    certificateProgress.markSaving()
    const saved = await savePersonalCertificate({
      certificadoStoragePath: uploaded ?? profile.value.certificadoStoragePath,
      certificadoFechaEmision: certificate.issue,
      certificadoFechaVencimiento: certificate.expiry,
      version: profile.value.version,
    })
    uploaded = null
    setProfile(saved)
    certificate.issue = saved.certificadoFechaEmision
    certificate.expiry = saved.certificadoFechaVencimiento
    certificateFile.value = null
    touched.certificate = false
    notifications.show('Certificado técnico actualizado.', 'success')
  } catch (error) {
    if (uploaded) await discardPersonalUpload('CERTIFICATE', uploaded).catch(() => undefined)
    notifications.show(message(error, 'No fue posible actualizar el certificado'), 'error')
  } finally {
    busyCertificate.value = false
    certificateProgress.reset()
  }
}

async function openCertificate(): Promise<void> {
  const popup = window.open('', '_blank')
  try {
    const url = await getPersonalCertificateUrl()
    if (popup) popup.location.href = url
    else window.location.href = url
  } catch (error) {
    popup?.close()
    notifications.show(message(error, 'No fue posible abrir el certificado'), 'error')
  }
}

function requestGoogleChange(): void {
  if (dirty.value) googleConfirmOpen.value = true
  else void changeGoogle()
}

async function changeGoogle(): Promise<void> {
  if (busy.value) return
  googleConfirmOpen.value = false
  busyGoogle.value = true
  try {
    const { token, expiresInSeconds } = await startGoogleIdentityChange()
    savePendingGoogleHandoff(token, expiresInSeconds, auth.session?.user?.id ?? null)
    leavingForGoogle.value = true
    // Neon Auth must release the original account BEFORE its Google OAuth flow.
    // The pending, one-use handoff remains in sessionStorage across sign-out.
    await auth.useAnotherAccount(new URL('/cuenta/cambiar-google', window.location.origin).toString())
  } catch (error) {
    clearPendingGoogleHandoff()
    notifications.show(message(error, 'No fue posible iniciar la verificación con Google'), 'error')
    if (auth.status === 'unauthenticated') {
      // If sign-out worked but OAuth did not start, never leave a stale profile
      // that appears editable while the browser no longer has a session.
      await router.replace({ name: 'login' })
    } else {
      leavingForGoogle.value = false
    }
  } finally {
    busyGoogle.value = false
  }
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function filename(path: string): string {
  return path.split('/').pop() ?? 'Certificado adjunto'
}
</script>

<template>
  <div class="profile-page">
    <header class="profile-page__heading">
      <h1>Mi perfil</h1>
      <p>Actualiza tus datos y credenciales personales.</p>
    </header>

    <LoadingSkeleton v-if="loading" label="Cargando perfil" :lines="5" />
    <ErrorState v-else-if="loadError" title="No se pudo cargar el perfil" :message="loadError">
      <BaseButton @click="load">Reintentar</BaseButton>
    </ErrorState>

    <div v-else-if="profile" class="profile-grid">
      <div class="profile-stack">
        <section class="profile-card" aria-labelledby="profile-photo-heading">
          <header class="profile-card__header">
            <h2 id="profile-photo-heading">Fotografía</h2>
          </header>
          <div class="photo-row">
            <div class="photo-preview" aria-label="Fotografía del usuario">
              <img
                v-if="(photoPreview || auth.avatarUrl) && !photoFailed"
                :src="photoPreview || auth.avatarUrl || ''"
                alt="Tu fotografía de perfil"
                @error="imageError"
              />
              <UserRound v-else :size="30" aria-hidden="true" />
            </div>
            <div class="photo-actions">
              <BaseFileUpload
                v-model="photoFile"
                name="profile-photo"
                label="Nueva fotografía"
                button-label="Seleccionar fotografía"
                size="compact"
                accept=".jpg,.jpeg,.png,.webp"
                :disabled="busy"
              />
              <p class="profile-hint">JPG, PNG o WebP · máximo 2 MB después de comprimir.</p>
            </div>
          </div>
          <div class="profile-actions">
            <BaseButton v-if="profile.fotoStoragePath" variant="ghost" :disabled="busy" @click="useGooglePhoto">Usar foto de Google</BaseButton>
            <BaseButton :disabled="!photoFile || busy" :loading="busyPhoto" @click="savePhoto">
              {{ photoProgress.phaseLabel.value ?? 'Guardar fotografía' }}
            </BaseButton>
          </div>
        </section>

        <section class="profile-card" aria-labelledby="personal-heading">
          <header class="profile-card__header">
            <h2 id="personal-heading">Información personal</h2>
          </header>
          <form class="profile-fields" novalidate @submit.prevent="savePersonal">
            <BaseInput
              v-model="personal.nombreCompleto"
              name="profile-name"
              label="Nombre completo"
              required
              autocomplete="name"
              :disabled="busy"
              :error="touched.name ? formErrors.nombre : undefined"
              @blur="touched.name = true"
            />
            <BaseInput
              v-model="personal.telefono"
              name="profile-phone"
              label="Celular"
              type="tel"
              autocomplete="tel"
              placeholder="+57 300 123 4567"
              hint="Opcional · puedes escribir tu número colombiano sin indicativo."
              :disabled="busy"
              :error="touched.phone ? formErrors.telefono : undefined"
              @blur="touched.phone = true"
            />
            <div class="profile-actions">
              <BaseButton type="submit" :loading="busyPersonal" :disabled="!isPersonalDirty || busy">Guardar datos</BaseButton>
            </div>
          </form>
        </section>
      </div>

      <div class="profile-stack">
        <section class="profile-card" aria-labelledby="access-heading">
          <header class="profile-card__header">
            <h2 id="access-heading">Cuenta Google</h2>
            <ShieldCheck :size="19" aria-hidden="true" />
          </header>
          <BaseInput
            :model-value="profile.correoGoogle"
            name="profile-email"
            label="Correo vinculado"
            type="email"
            disabled
          />
          <p class="profile-hint">Para cambiarlo tendrás que iniciar sesión con la nueva cuenta. Conservarás tus permisos e historial.</p>
          <div class="profile-actions">
            <BaseButton variant="secondary" :loading="busyGoogle" :disabled="busy" @click="requestGoogleChange">
              Cambiar cuenta de Google
            </BaseButton>
          </div>
        </section>

        <section v-if="profile.esTecnico" class="profile-card" aria-labelledby="credential-heading">
          <header class="profile-card__header">
            <h2 id="credential-heading">Credencial técnica</h2>
            <StatusBadge :tone="certificateStatus.tone">{{ certificateStatus.label }}</StatusBadge>
          </header>
          <div v-if="profile.certificadoStoragePath" class="current-file">
            <span class="current-file__name">{{ filename(profile.certificadoStoragePath) }}</span>
            <BaseButton size="compact" variant="ghost" :disabled="busy" @click="openCertificate">
              <ExternalLink :size="16" aria-hidden="true" /> Ver certificado
            </BaseButton>
          </div>
          <div class="profile-fields">
            <BaseFileUpload
              v-model="certificateFile"
              name="profile-certificate"
              label="Certificado técnico"
              icon="file"
              size="compact"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              :disabled="busy"
              :hint="profile.certificadoStoragePath ? 'Deja vacío para conservar el certificado actual.' : 'PDF o imagen del certificado.'"
              :error="touched.certificate ? certificateErrors.file : undefined"
            />
            <div class="date-grid">
              <BaseDateTimePicker
                v-model="certificate.issue"
                mode="date"
                name="profile-certificate-issue"
                label="Fecha de emisión"
                required
                :disabled="busy"
                :error="touched.certificate ? certificateErrors.issue : undefined"
                @blur="touched.certificate = true"
              />
              <BaseDateTimePicker
                v-model="certificate.expiry"
                mode="date"
                name="profile-certificate-expiry"
                label="Fecha de vencimiento"
                required
                :min="certificate.issue ?? undefined"
                :disabled="busy"
                :error="touched.certificate ? certificateErrors.expiry : undefined"
                @blur="touched.certificate = true"
              />
            </div>
            <div class="profile-actions">
              <BaseButton :disabled="!isCertificateDirty || busy" :loading="busyCertificate" @click="saveCertificate">
                {{ certificateProgress.phaseLabel.value ?? 'Guardar certificado' }}
              </BaseButton>
            </div>
          </div>
        </section>

        <section class="profile-card profile-card--summary" aria-label="Permisos de acceso">
          <div class="profile-summary">
            <Camera :size="18" aria-hidden="true" />
            <div>
              <strong>Permisos de acceso</strong>
              <p>{{ [profile.esAdmin ? 'Administrador' : '', profile.esTecnico ? 'Técnico' : ''].filter(Boolean).join(' · ') }}</p>
            </div>
          </div>
          <p class="profile-hint">Los permisos y el estado de tu cuenta los administra Soluciones Radicales.</p>
        </section>
      </div>
    </div>

    <ConfirmDialog
      :open="leave.confirmOpen.value"
      title="Descartar cambios"
      message="Tienes datos sin guardar. Si sales se perderán los cambios pendientes."
      confirm-label="Salir sin guardar"
      danger
      @cancel="leave.cancelDiscard"
      @confirm="leave.confirmDiscard"
    />
    <ConfirmDialog
      :open="googleConfirmOpen"
      title="Verificar otra cuenta"
      message="Tienes cambios sin guardar. Al autenticar otra cuenta de Google se descartarán."
      confirm-label="Continuar con Google"
      :loading="busyGoogle"
      @cancel="googleConfirmOpen = false"
      @confirm="changeGoogle"
    />
  </div>
</template>

<style scoped>
.profile-page { width: 100%; max-width: 960px; min-width: 0; margin-inline: auto; display: grid; gap: 1.1rem; padding-bottom: 2rem; }
.profile-page__heading h1 { margin: 0; color: var(--text); font-size: 1.6rem; font-weight: 600; letter-spacing: -0.02em; }
.profile-page__heading p { margin: 0.3rem 0 0; color: var(--text-secondary); font-size: 0.9rem; }
.profile-grid { display: grid; grid-template-columns: 1fr; gap: 1rem; min-width: 0; }
.profile-stack { display: grid; gap: 1rem; min-width: 0; align-content: start; }
.profile-card { min-width: 0; border: 1px solid var(--border); border-radius: var(--radius-panel); background: var(--surface); padding: clamp(1rem, 2vw, 1.25rem); }
.profile-card__header { display: flex; align-items: center; justify-content: space-between; gap: 0.65rem; margin-bottom: 1rem; }
.profile-card__header h2 { margin: 0; font-size: 1rem; font-weight: 600; }
.profile-card__header svg { color: var(--text-secondary); }
.profile-fields { display: grid; gap: 0.9rem; min-width: 0; }
.photo-row { display: flex; align-items: center; gap: 1rem; min-width: 0; }
.photo-preview { display: grid; width: 78px; height: 78px; flex: 0 0 78px; place-items: center; overflow: hidden; border: 1px solid var(--border); border-radius: 50%; background: var(--accent-subtle); color: var(--text-secondary); }
.photo-preview img { width: 100%; height: 100%; object-fit: cover; }
.photo-actions { min-width: 0; flex: 1; }
.profile-hint { margin: 0.55rem 0 0; color: var(--text-secondary); font-size: 0.78rem; line-height: 1.5; overflow-wrap: anywhere; }
.profile-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
.profile-actions :deep(button) { max-width: 100%; }
.current-file { display: flex; min-width: 0; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.85rem; border-radius: var(--radius); background: var(--bg); padding: 0.5rem 0.7rem; }
.current-file__name { color: var(--text-secondary); font-size: 0.8125rem; min-width: 0; overflow-wrap: anywhere; }
.date-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.7rem; }
.profile-summary { display: flex; align-items: flex-start; gap: 0.65rem; }
.profile-summary svg { flex: 0 0 auto; color: var(--text-secondary); }
.profile-summary strong { color: var(--text); font-size: 0.9rem; font-weight: 600; }
.profile-summary p { margin: 0.2rem 0 0; color: var(--text-secondary); font-size: 0.8125rem; }
@media (min-width: 700px) {
  .date-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 900px) {
  .profile-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .date-grid { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 560px) {
  .profile-page { gap: 0.95rem; }
  .profile-page__heading h1 { font-size: 1.35rem; }
  .photo-preview { width: 64px; height: 64px; flex-basis: 64px; }
  .photo-row { gap: 0.7rem; }
  .profile-actions { justify-content: stretch; }
  .profile-actions :deep(button) { flex: 1 1 auto; min-height: 44px; }
  .current-file :deep(button) { min-height: 44px; }
}
</style>
