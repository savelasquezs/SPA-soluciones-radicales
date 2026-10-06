import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { certificateError, downloadLink, validateCertificateTemplateFile } from '@/helpers/certificates'
import * as service from '@/services/certificatesService'
import { deleteMasterFile, getMasterFileUrl, uploadMasterFile } from '@/services/filesService'
import { useNotificationsStore } from '@/stores/notifications'
import { CERTIFICATE_TYPES, type CertificateTemplate, type CertificateType } from '@/types/certificates'

type Draft = { template: CertificateTemplate; file: File | null; stagedPath: string | null; error: string; phase: string }
export function useCertificateTemplates() {
  const notifications = useNotificationsStore()
  const drafts = reactive(Object.fromEntries(CERTIFICATE_TYPES.map((type) => [type, {
    template: { type, storagePath: null, revision: null, fileName: null }, file: null, stagedPath: null, error: '', phase: '',
  }])) as Record<CertificateType, Draft>)
  const loading = ref(false)
  const loaded = ref(false)
  const loadError = ref('')
  const converterReady = ref(false)
  const busyType = ref<CertificateType | null>(null)
  const previewUrl = ref('')
  const busy = computed(() => busyType.value !== null)
  const dirty = computed(() => CERTIFICATE_TYPES.some((type) => Boolean(drafts[type].file)))
  let alive = true

  async function load(): Promise<void> {
    if (loading.value || busy.value) return
    loading.value = true
    loadError.value = ''
    try {
      const settings = await service.getCertificateSettings()
      if (!alive) return
      settings.templates.forEach((template) => { drafts[template.type].template = template })
      converterReady.value = settings.converterReady
      loaded.value = true
    } catch (error) { if (alive) loadError.value = certificateError(error) }
    finally { if (alive) loading.value = false }
  }
  function discardStaged(draft: Draft): void {
    // Saved/historical templates are protected by the backend. Never delete them optimistically.
    if (draft.stagedPath && draft.stagedPath !== draft.template.storagePath) void deleteMasterFile(draft.stagedPath).catch(() => undefined)
    draft.stagedPath = null
  }
  function select(type: CertificateType, file: File | null): void {
    if (busy.value) return
    const draft = drafts[type]
    if (draft.file === file) return
    discardStaged(draft)
    draft.file = file
    draft.error = validateCertificateTemplateFile(file) ?? ''
  }
  async function ensurePath(type: CertificateType): Promise<string> {
    const draft = drafts[type]
    const validation = validateCertificateTemplateFile(draft.file)
    if (validation) throw new Error(validation)
    if (draft.file && !draft.stagedPath) {
      draft.phase = 'Subiendo…'
      draft.stagedPath = await uploadMasterFile(type === 'ESTABLECIMIENTO' ? 'CLIENT_ESTABLISHMENT_TEMPLATE' : 'SITE_VEHICLE_TEMPLATE', draft.file)
    }
    const path = draft.stagedPath ?? draft.template.storagePath
    if (!path) throw new Error('Selecciona una plantilla Word.')
    return path
  }
  async function operate(type: CertificateType, preview: boolean): Promise<void> {
    if (busy.value || validateCertificateTemplateFile(drafts[type].file) || !loaded.value) return
    if (!preview && !drafts[type].file) return
    const draft = drafts[type]
    busyType.value = type
    draft.error = ''
    try {
      const path = await ensurePath(type)
      draft.phase = preview ? 'Generando prueba…' : 'Validando y guardando…'
      if (preview) {
        const blob = await service.previewCertificate(type, path)
        if (!alive) return
        closePreview()
        previewUrl.value = URL.createObjectURL(blob)
      } else {
        const template = await service.saveCertificateTemplate(type, path, draft.template.revision)
        if (!alive) return
        draft.template = template
        draft.file = null
        draft.stagedPath = null
        notifications.show('Plantilla guardada', 'success')
      }
    } catch (error) {
      if (alive) {
        draft.error = certificateError(error)
        notifications.show(draft.error, 'error')
      }
    } finally {
      if (alive) { draft.phase = ''; busyType.value = null }
    }
  }
  async function downloadTemplate(type: CertificateType): Promise<void> {
    const path = drafts[type].template.storagePath
    if (!path || busy.value) return
    busyType.value = type
    drafts[type].phase = 'Abriendo Word…'
    try { downloadLink(await getMasterFileUrl(path)) }
    catch (error) { notifications.show(certificateError(error), 'error') }
    finally { busyType.value = null; drafts[type].phase = '' }
  }
  function closePreview(): void {
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
  onBeforeUnmount(() => {
    alive = false
    closePreview()
    // A navigation forced outside this view must not delete an in-flight save.
    if (!busy.value) CERTIFICATE_TYPES.forEach((type) => discardStaged(drafts[type]))
  })
  return { drafts, loading, loaded, loadError, converterReady, busy, dirty, busyType, previewUrl, load, select, operate, downloadTemplate, closePreview }
}
