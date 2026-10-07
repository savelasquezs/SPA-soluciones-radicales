import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ApiClientError } from '@/services/apiService'
import * as service from '@/services/certificatesService'
import { fetchAdminService } from '@/services/adminServicesService'
import { certificateError, defaultCertificateMail, downloadLink, generationSelection } from '@/helpers/certificates'
import { useClientsStore } from '@/stores/clients'
import { useNotificationsStore } from '@/stores/notifications'
import type { CertificateContext, CertificateDocument, CertificateServiceOption, CertificateType, GenerateCertificateInput, SendCertificatesInput } from '@/types/certificates'

export function useCertificateGeneration() {
  const clients = useClientsStore()
  const notifications = useNotificationsStore()
  const clientId = ref(''), siteId = ref(''), serviceId = ref('')
  const type = ref<CertificateType>('ESTABLECIMIENTO')
  const vehicleIds = ref<string[]>([])
  const services = ref<CertificateServiceOption[]>([])
  const context = ref<CertificateContext | null>(null)
  const initialLoading = ref(false), loading = ref(false), initialized = ref(false)
  const page = ref(1), hasMore = ref(false)
  const loadError = ref(''), actionError = ref(''), phase = ref('')
  const busy = computed(() => Boolean(phase.value))
  const replaceOpen = ref(false), sendOpen = ref(false)
  const generationAttempt = ref<GenerateCertificateInput | null>(null)
  const sendAttempt = ref<SendCertificatesInput | null>(null)
  const deliveryUnknown = ref(false)
  const mail = reactive({ documents: [] as string[], recipients: [] as string[], subject: '', text: '' })
  const mailDirty = ref(false)
  const selectedDocuments = computed(() => context.value?.documents.filter((document) => mail.documents.includes(document.id)) ?? [])
  const availability = computed(() => context.value?.availability[type.value])
  const selection = computed(() => context.value ? generationSelection(context.value, type.value, vehicleIds.value) : null)
  const canGenerate = computed(() => !loading.value && !busy.value && Boolean(availability.value?.available) && (type.value === 'ESTABLECIMIENTO' || vehicleIds.value.length > 0 && vehicleIds.value.length <= 10))
  const canSend = computed(() => !busy.value && !loading.value && !deliveryUnknown.value && mail.documents.length > 0 && mail.documents.length <= 10 && mail.recipients.length > 0 && mail.recipients.length <= 20 && Boolean(mail.subject.trim()) && Boolean(mail.text.trim()) && !/[\r\n]/.test(mail.subject) && mail.subject.length <= 200 && mail.text.length <= 10_000)
  // Retain inactive businesses too: historical certificates remain accessible.
  const businesses = computed(() => Object.values(clients.clientsById).filter((client) => client.tipoCliente === 'NEGOCIO').sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
  const sites = computed(() => clients.sitesForClient(clientId.value).filter((site) => site.tipoSede === 'NEGOCIO'))
  let request = 0, alive = true
  let retryLoad: () => Promise<void> = init
  function resetContext(): void {
    context.value = null
    vehicleIds.value = []
    generationAttempt.value = null
    sendAttempt.value = null
    actionError.value = ''
    deliveryUnknown.value = false
    mailDirty.value = false
    Object.assign(mail, { documents: [], recipients: [], subject: '', text: '' })
  }
  async function init(): Promise<void> {
    if (initialLoading.value || initialized.value) return
    initialLoading.value = true
    loadError.value = ''
    retryLoad = init
    try {
      await Promise.all([clients.loadClients(true), clients.loadClients(false)])
      if (alive) initialized.value = true
    } catch (error) { if (alive) loadError.value = certificateError(error) }
    finally { if (alive) initialLoading.value = false }
  }
  async function selectClient(id: string): Promise<void> {
    if (busy.value) return
    const current = ++request
    clientId.value = id; siteId.value = ''; serviceId.value = ''
    services.value = []; hasMore.value = false; resetContext(); loadError.value = ''
    loading.value = Boolean(id)
    retryLoad = () => selectClient(id)
    try { if (id) await clients.loadSites(id) }
    catch (error) { if (alive && current === request) loadError.value = certificateError(error) }
    finally { if (alive && current === request) loading.value = false }
  }
  async function selectSite(id: string): Promise<void> {
    if (busy.value) return
    siteId.value = id; serviceId.value = ''; services.value = []; hasMore.value = false
    resetContext()
    await loadServices(1)
  }
  async function loadServices(nextPage: number): Promise<void> {
    const current = ++request
    const id = siteId.value
    loading.value = Boolean(id); loadError.value = ''
    retryLoad = () => loadServices(nextPage)
    try {
      if (!id) return
      const result = await service.listCertificateServices(id, nextPage)
      if (!alive || current !== request) return
      services.value = nextPage === 1 ? result.items : [...services.value, ...result.items]
      page.value = result.page; hasMore.value = result.hasMore
    } catch (error) { if (alive && current === request) loadError.value = certificateError(error) }
    finally { if (alive && current === request) loading.value = false }
  }
  async function selectService(id: string): Promise<void> {
    if (busy.value) return
    const current = ++request
    serviceId.value = id; resetContext(); loadError.value = ''; loading.value = Boolean(id)
    retryLoad = () => selectService(id)
    try {
      if (!id) return
      const loaded = await service.getCertificateContext(id)
      if (!alive || current !== request) return
      context.value = loaded
      Object.assign(mail, defaultCertificateMail(loaded), { documents: loaded.documents.map((document) => document.id), recipients: [...loaded.recipients] })
    } catch (error) { if (alive && current === request) loadError.value = certificateError(error) }
    finally { if (alive && current === request) loading.value = false }
  }
  async function openService(id: string): Promise<void> {
    if (busy.value || loading.value) return
    loadError.value=''; loading.value=true
    try {
      const target=await fetchAdminService(id)
      if (!alive) return
      if (target.tipoServicio!=='PRINCIPAL' || target.estado!=='FINALIZADO') throw new Error('Los certificados requieren un servicio Principal finalizado.')
      await init()
      if (!alive || loadError.value) return
      await selectClient(target.clientId)
      if (!alive || loadError.value) return
      siteId.value=target.sedeId
      services.value=[{ id:target.id,solicitud:target.solicitud,fecha:target.inicioReal ?? target.inicioProgramado }]
      hasMore.value=false
      await selectService(target.id)
    } catch (error) { if (alive) loadError.value=certificateError(error) }
    finally {
      if (alive) { loading.value=false; retryLoad=()=>openService(id) }
    }
  }
  function setType(value: string): void {
    if (value !== 'ESTABLECIMIENTO' && value !== 'VEHICULO') return
    type.value = value; generationAttempt.value = null; actionError.value = ''
  }
  watch(vehicleIds, () => { generationAttempt.value = null; actionError.value = '' }, { flush: 'sync' })
  function editMail(): void {
    mailDirty.value = true
    sendAttempt.value = null
  }
  function fail(error: unknown): void {
    actionError.value = certificateError(error)
    notifications.show(actionError.value, 'error')
  }
  function requestGeneration(): void {
    if (!canGenerate.value) return
    if (selection.value?.replacing) replaceOpen.value = true
    else void generate(false)
  }
  async function generate(confirmReplace: boolean): Promise<void> {
    replaceOpen.value = false
    if (!canGenerate.value || !context.value || !selection.value) return
    phase.value = 'Generando y guardando PDF…'; actionError.value = ''
    // An unchanged retry reuses the same server-side idempotency key, including after a timeout.
    generationAttempt.value ??= {
      requestId: crypto.randomUUID(), serviceId: serviceId.value, type: type.value,
      vehicleIds: type.value === 'VEHICULO' ? [...vehicleIds.value].sort() : [], previousPaths: selection.value.previousPaths, confirmReplace,
    }
    try {
      const result = await service.generateCertificates(generationAttempt.value)
      if (!alive || !context.value) return
      const ids = new Set(result.documents.map((document) => document.id))
      context.value.documents = [...context.value.documents.filter((document) => !ids.has(document.id)), ...result.documents]
      mail.documents = result.documents.map((document) => document.id)
      sendAttempt.value = null
      generationAttempt.value = null
      notifications.show(result.documents.length === 1 ? 'Certificado generado' : `${result.documents.length} certificados generados`, 'success')
    } catch (error) { if (alive) fail(error) }
    finally { if (alive) phase.value = '' }
  }
  async function send(): Promise<void> {
    sendOpen.value = false
    if (!canSend.value) return
    phase.value = 'Enviando certificados…'; actionError.value = ''
    sendAttempt.value ??= {
      requestId: crypto.randomUUID(), serviceId: serviceId.value,
      documents: selectedDocuments.value.map(({ id, storagePath }) => ({ id, storagePath })),
      recipients: [...mail.recipients].sort(), subject: mail.subject.trim(), text: mail.text.trim(),
    }
    try {
      await service.sendCertificates(sendAttempt.value)
      if (!alive) return
      mailDirty.value = false
      // Keep the successful key until composition changes: repeated clicks do not send again.
      notifications.show('Correo enviado', 'success')
    } catch (error) {
      if (alive) {
        deliveryUnknown.value = !(error instanceof ApiClientError) || error.status >= 500 || ['EMAIL_DELIVERY_UNKNOWN', 'OPERATION_RUNNING'].includes(error.code ?? '')
        fail(error)
      }
    } finally { if (alive) phase.value = '' }
  }
  function acknowledgeDelivery(): void {
    // This is an explicit user decision after checking Gmail, never an automatic retry.
    deliveryUnknown.value = false; sendAttempt.value = null; actionError.value = ''
  }
  async function download(document: CertificateDocument): Promise<void> {
    if (busy.value) return
    phase.value = 'Preparando descarga…'
    try { downloadLink(await service.getCertificateUrl(document.id)) }
    catch (error) { fail(error) }
    finally { phase.value = '' }
  }
  onBeforeUnmount(() => { alive = false; request++ })
  return {
    clients, clientId, siteId, serviceId, type, vehicleIds, services, context, initialLoading, loading, initialized,
    loadError, actionError, phase, busy, replaceOpen, sendOpen, mail, mailDirty, deliveryUnknown, selectedDocuments,
    availability, selection, canGenerate, canSend, businesses, sites, hasMore,
    init, openService, selectClient, selectSite, selectService, setType, editMail, requestGeneration, generate, send, download,
    retry: () => retryLoad(), loadMore: () => loadServices(page.value + 1), acknowledgeDelivery,
  }
}
