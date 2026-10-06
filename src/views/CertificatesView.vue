<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Download, FileCheck2, Mail, RefreshCw } from 'lucide-vue-next'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseMultiSelect from '@/components/base/BaseMultiSelect.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import BaseDialog from '@/components/base/BaseDialog.vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'
import EmptyState from '@/components/base/EmptyState.vue'
import ErrorState from '@/components/base/ErrorState.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import CertificateTemplateCard from '@/components/domain/certificates/CertificateTemplateCard.vue'
import CertificateVariableGuide from '@/components/domain/certificates/CertificateVariableGuide.vue'
import { useCertificateTemplates } from '@/composables/useCertificateTemplates'
import { useCertificateGeneration } from '@/composables/useCertificateGeneration'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import { downloadLink } from '@/helpers/certificates'
import { CERTIFICATE_TYPES } from '@/types/certificates'

const templates = reactive(useCertificateTemplates())
const generation = reactive(useCertificateGeneration())
const tab = ref<'templates' | 'generate'>('templates')
const busy = computed(() => templates.busy || generation.busy)
const dirty = computed(() => templates.dirty || generation.mailDirty)
const unsaved = useUnsavedChanges(dirty, busy)
const changeOpen = ref(false)
const deliveryConfirmOpen = ref(false)
let pendingChange: (() => void) | null = null
function changeContext(action: () => void): void {
  if (busy.value) return
  if (generation.mailDirty) { pendingChange = action; changeOpen.value = true }
  else action()
}
function confirmContext(): void {
  changeOpen.value = false; pendingChange?.(); pendingChange = null
}
function chooseTab(value: 'templates' | 'generate'): void {
  tab.value = value
  if (value === 'generate') void generation.init()
}
function toggleDocument(id: string, selected: boolean): void {
  generation.mail.documents = selected ? [...generation.mail.documents, id] : generation.mail.documents.filter((value) => value !== id)
  generation.editMail()
}
const formatDate = (value: string) => value.slice(0, 10).split('-').reverse().join('/')
onMounted(() => templates.load())
</script>
<template>
  <section class="certificates-page">
    <header class="page-heading"><div><RouterLink to="/configuracion" class="back-link">Configuración</RouterLink><h1>Certificados</h1></div></header>
    <nav class="section-tabs" aria-label="Secciones de certificados">
      <BaseButton :variant="tab === 'templates' ? 'secondary' : 'ghost'" size="compact" :aria-current="tab === 'templates' ? 'page' : undefined" :disabled="busy" @click="chooseTab('templates')">Plantillas</BaseButton>
      <BaseButton :variant="tab === 'generate' ? 'secondary' : 'ghost'" size="compact" :aria-current="tab === 'generate' ? 'page' : undefined" :disabled="busy" @click="chooseTab('generate')">Generar y enviar</BaseButton>
    </nav>

    <div v-show="tab === 'templates'" class="section-stack">
      <LoadingSkeleton v-if="templates.loading && !templates.loaded" />
      <ErrorState v-if="templates.loadError" title="No se pudo cargar la configuración" :message="templates.loadError"><BaseButton variant="secondary" :loading="templates.loading" @click="templates.load">Reintentar</BaseButton></ErrorState>
      <template v-if="templates.loaded">
        <p v-if="!templates.converterReady" class="notice" role="status">La integración empresarial de Google debe volver a autorizarse con acceso a los archivos creados por la aplicación para habilitar la prueba PDF y la generación.</p>
        <div class="template-grid">
          <CertificateTemplateCard v-for="type in CERTIFICATE_TYPES" :key="type" :type="type" :template="templates.drafts[type].template" :file="templates.drafts[type].file" :error="templates.drafts[type].error" :phase="templates.drafts[type].phase" :busy="busy" :active="templates.busyType === type" :converter-ready="templates.converterReady" @select="templates.select(type, $event)" @save="templates.operate(type, false)" @preview="templates.operate(type, true)" @download="templates.downloadTemplate(type)" />
        </div>
        <div class="configuration-actions"><span>La vigencia se configura en cada negocio o sede.</span><BaseButton variant="ghost" size="compact" :disabled="busy" :loading="templates.loading" @click="templates.load"><RefreshCw :size="15" aria-hidden="true" />Actualizar configuración</BaseButton></div>
        <CertificateVariableGuide />
      </template>
    </div>

    <div v-show="tab === 'generate'" class="section-stack" :aria-busy="generation.busy">
      <LoadingSkeleton v-if="generation.initialLoading" />
      <ErrorState v-if="generation.loadError" title="No se pudieron cargar los datos" :message="generation.loadError"><BaseButton variant="secondary" :disabled="generation.loading" @click="generation.retry">Reintentar</BaseButton></ErrorState>
      <template v-if="generation.initialized">
        <section class="panel">
          <div class="context-filters">
            <BaseSelect :model-value="generation.clientId" name="cert-business" label="Negocio" :disabled="busy" @update:model-value="changeContext(() => generation.selectClient($event))"><option value="">Selecciona un negocio</option><option v-for="client in generation.businesses" :key="client.id" :value="client.id">{{ client.nombre }}{{ client.activo ? '' : ' (inactivo)' }}</option></BaseSelect>
            <BaseSelect :model-value="generation.siteId" name="cert-site" label="Sede" :disabled="busy || !generation.clientId || generation.loading" @update:model-value="changeContext(() => generation.selectSite($event))"><option value="">Selecciona una sede</option><option v-for="site in generation.sites" :key="site.id" :value="site.id">{{ site.nombre }}</option></BaseSelect>
            <BaseSelect :model-value="generation.serviceId" name="cert-service" label="Servicio finalizado" :disabled="busy || !generation.siteId || generation.loading" @update:model-value="changeContext(() => generation.selectService($event))"><option value="">Selecciona un servicio</option><option v-for="item in generation.services" :key="item.id" :value="item.id">{{ item.solicitud }} · {{ formatDate(item.fecha) }}</option></BaseSelect>
          </div>
          <div class="context-status" aria-live="polite"><span v-if="generation.loading">Cargando datos…</span><span v-else-if="generation.siteId && !generation.services.length && !generation.loadError">No hay servicios principales finalizados para esta sede.</span><span v-else>Solo servicios principales finalizados de negocios.</span><BaseButton v-if="generation.hasMore" variant="ghost" size="compact" :disabled="generation.loading || busy" @click="generation.loadMore">Cargar más servicios</BaseButton></div>
          <div v-if="generation.context" class="generation-form">
            <BaseSelect :model-value="generation.type" name="cert-type" label="Tipo de certificado" :disabled="busy" @update:model-value="generation.setType"><option value="ESTABLECIMIENTO">Establecimiento</option><option value="VEHICULO">Vehículo</option></BaseSelect>
            <BaseMultiSelect v-if="generation.type === 'VEHICULO'" v-model="generation.vehicleIds" name="cert-vehicles" label="Vehículos atendidos" item-label="vehículo" items-label="vehículos" placeholder="Selecciona vehículos" empty-text="No se registraron vehículos atendidos." :options="generation.context.vehicles.map(vehicle => ({ id: vehicle.id, label: vehicle.placa }))" :disabled="busy" hint="Hasta 10 certificados por operación." />
            <p v-if="generation.availability?.reason" class="notice generation-explanation">{{ generation.availability.reason }}</p>
            <div class="generation-actions">
              <small v-if="generation.availability?.available">Plantilla general. Regenerar conserva las fechas originales.</small>
              <BaseButton size="compact" :disabled="busy || !generation.canGenerate || generation.vehicleIds.length > 10" :loading="generation.busy && generation.phase.startsWith('Generando')" @click="generation.requestGeneration"><FileCheck2 :size="16" aria-hidden="true" />{{ generation.phase.startsWith('Generando') ? generation.phase : generation.selection?.replacing ? 'Regenerar PDF' : 'Generar PDF' }}</BaseButton>
            </div>
          </div>
        </section>
        <EmptyState v-if="!generation.clientId && !generation.businesses.length" title="No hay negocios" message="Crea un cliente de tipo Negocio para configurar sus certificados." />
        <template v-if="generation.context">
          <div v-if="generation.actionError" class="notice notice--error" role="alert"><p>{{ generation.actionError }}</p><BaseButton v-if="!generation.deliveryUnknown" variant="ghost" size="compact" :disabled="busy" @click="changeContext(() => generation.selectService(generation.serviceId))">Actualizar servicio</BaseButton></div>
          <section v-if="generation.context.documents.length" class="panel documents-panel">
            <header class="panel-heading"><h2>Certificados del servicio</h2><span>{{ generation.context.documents.length }}</span></header>
            <div v-for="document in generation.context.documents" :key="document.id" class="document-row">
              <BaseCheckbox :model-value="generation.mail.documents.includes(document.id)" :name="`cert-document-${document.id}`" :label="document.label" :disabled="busy" @update:model-value="toggleDocument(document.id, $event)" />
              <span class="document-dates">{{ formatDate(document.issuedOn) }} — {{ formatDate(document.expiresOn) }}</span>
              <BaseButton variant="ghost" size="compact" :disabled="busy" :aria-label="`Descargar PDF ${document.label}`" @click="generation.download(document)"><Download :size="16" aria-hidden="true" />PDF</BaseButton>
            </div>
            <form class="mail-form" @submit.prevent="generation.sendOpen = true">
              <header class="panel-heading"><h2>Enviar por correo</h2><span>{{ generation.selectedDocuments.length }} adjunto(s)</span></header>
              <BaseMultiSelect v-model="generation.mail.recipients" :options="generation.context.recipients.map(email => ({ id: email, label: email }))" name="cert-recipients" label="Destinatarios" item-label="correo" items-label="correos" placeholder="Selecciona destinatarios" empty-text="No hay correos registrados en el negocio o la sede." :disabled="busy" required @update:model-value="generation.editMail" />
              <p v-if="!generation.context.recipients.length" class="notice">Registra primero los correos del negocio o de la sede para habilitar el envío.</p>
              <div v-else class="selected-recipients">{{ generation.mail.recipients.join(' · ') }}</div>
              <BaseInput v-model="generation.mail.subject" name="cert-subject" label="Asunto" :disabled="busy" required maxlength="200" @update:model-value="generation.editMail" />
              <BaseTextarea v-model="generation.mail.text" name="cert-message" label="Mensaje" :disabled="busy" required maxlength="10000" :rows="5" @update:model-value="generation.editMail" />
              <div v-if="generation.deliveryUnknown" class="notice" role="alert"><p>No repitas el envío sin revisar primero la carpeta Enviados de Gmail.</p><BaseButton variant="secondary" size="compact" @click="deliveryConfirmOpen = true">Ya revisé Gmail; iniciar un nuevo envío</BaseButton></div>
              <footer class="mail-actions"><small>Se adjuntan únicamente los certificados seleccionados.</small><BaseButton type="submit" size="compact" :disabled="!generation.canSend" :loading="generation.busy && generation.phase.startsWith('Enviando')"><Mail :size="16" aria-hidden="true" />{{ generation.phase.startsWith('Enviando') ? generation.phase : 'Enviar certificados' }}</BaseButton></footer>
            </form>
          </section>
          <EmptyState v-else title="Sin certificados generados" message="Selecciona el tipo de certificado y genera el PDF. El envío se realiza por separado." />
        </template>
      </template>
    </div>
    <p v-if="busy" class="operation-status" role="status" aria-live="polite">{{ generation.phase || templates.drafts[templates.busyType ?? 'ESTABLECIMIENTO'].phase }}</p>
    <BaseDialog :model-value="Boolean(templates.previewUrl)" class="certificate-preview" title="Prueba de certificado" description="Datos ficticios. No crea un certificado oficial ni envía correos." @update:model-value="!$event && templates.closePreview()">
      <iframe v-if="templates.previewUrl" :src="templates.previewUrl" title="Vista previa del certificado de prueba" />
      <template #footer><BaseButton variant="secondary" @click="downloadLink(templates.previewUrl, 'prueba-sin-validez.pdf')"><Download :size="16" aria-hidden="true" />Descargar prueba</BaseButton><BaseButton variant="ghost" @click="templates.closePreview">Cerrar</BaseButton></template>
    </BaseDialog>
    <ConfirmDialog :open="generation.replaceOpen" title="Regenerar certificados" :message="`Se reemplazará el PDF vigente de ${generation.selection?.replacing ?? 0} certificado(s). Se conservan las fechas originales y el historial. No se enviará ningún correo automáticamente.`" confirm-label="Regenerar" @confirm="generation.generate(true)" @cancel="generation.replaceOpen = false" />
    <ConfirmDialog :open="generation.sendOpen" title="Enviar certificados" :message="`Se enviarán ${generation.selectedDocuments.length} PDF a: ${generation.mail.recipients.join(', ')}.`" confirm-label="Enviar correo" @confirm="generation.send" @cancel="generation.sendOpen = false" />
    <ConfirmDialog :open="changeOpen" title="Descartar borrador del correo" message="Al cambiar de contexto se perderán los cambios del correo que aún no has enviado." confirm-label="Descartar y continuar" @confirm="confirmContext" @cancel="changeOpen = false; pendingChange = null" />
    <ConfirmDialog :open="deliveryConfirmOpen" title="Confirmar nuevo intento" message="El intento anterior pudo haber sido entregado. Confirma solo si revisaste Gmail y decidiste realizar un envío nuevo; podría duplicar el correo anterior." confirm-label="Habilitar nuevo envío" @confirm="generation.acknowledgeDelivery(); deliveryConfirmOpen = false" @cancel="deliveryConfirmOpen = false" />
    <ConfirmDialog :open="unsaved.confirmOpen.value" title="Cambios sin guardar" message="Hay una plantilla o un borrador de correo sin guardar. ¿Deseas descartarlo y salir?" confirm-label="Descartar y salir" @confirm="unsaved.confirmDiscard" @cancel="unsaved.cancelDiscard" />
  </section>
</template>
<style scoped>
.certificates-page, .section-stack { display: grid; gap: 1rem; min-width: 0; }
.page-heading h1 { margin: .25rem 0 0; font-size: 1.5rem; font-weight: 600; }
.back-link { color: var(--text-secondary); font-size: .8rem; text-decoration: none; }
.back-link:hover { text-decoration: underline; }
.section-tabs { display: flex; gap: .5rem; border-bottom: 1px solid var(--border); padding-bottom: .75rem; }
.template-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
.configuration-actions, .context-status, .generation-actions, .mail-actions { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: .75rem; }
.configuration-actions, .context-status, small, .selected-recipients { color: var(--text-secondary); font-size: .8rem; }
.notice { padding: .85rem 1rem; margin: 0; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text-secondary); font-size: .875rem; line-height: 1.5; }
.notice p { margin: 0 0 .5rem; }
.notice--error { border-color: var(--danger); color: var(--danger); }
.panel { padding: 1.25rem; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); min-width: 0; }
.context-filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }
.context-status { margin-top: .65rem; min-height: 1.5rem; }
.generation-form { display: grid; grid-template-columns: minmax(12rem, 1fr) minmax(12rem, 2fr); gap: 1rem; border-top: 1px solid var(--border); padding-top: 1rem; margin-top: 1rem; }
.generation-actions, .generation-explanation { grid-column: 1 / -1; }
.generation-actions > button { margin-left: auto; }
.panel-heading { display: flex; align-items: center; gap: .75rem; justify-content: space-between; }
.panel-heading h2 { margin: 0; font-size: 1rem; font-weight: 600; }
.panel-heading span { color: var(--text-secondary); font-size: .8rem; }
.document-row { display: flex; align-items: center; gap: 1rem; border-bottom: 1px solid var(--border); padding: .75rem 0; }
.document-row > :first-child { flex: 1; }
.document-dates { color: var(--text-secondary); font-size: .8rem; }
.mail-form { display: grid; gap: .85rem; margin-top: 1.5rem; max-width: 55rem; }
.mail-actions { margin-top: .25rem; }
.selected-recipients { overflow-wrap: anywhere; margin-top: -.4rem; }
.operation-status { margin: 0; font-size: .875rem; color: var(--text-secondary); }
.certificate-preview { width: min(60rem, calc(100vw - 2rem)); }
.certificate-preview iframe { display: block; border: 1px solid var(--border); width: 100%; height: 60dvh; }
@media (max-width: 850px) { .template-grid, .context-filters, .generation-form { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .panel { padding: 1rem; } .document-row { flex-wrap: wrap; gap: .5rem; } .document-dates { order: 3; width: 100%; } .mail-actions > button { width: 100%; } .certificate-preview { width: 100vw; } }
</style>
