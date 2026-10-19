<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Plus, Search } from 'lucide-vue-next'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/base/BaseDialog.vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'
import ErrorState from '@/components/base/ErrorState.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import CatalogRecords from '@/components/domain/catalogs/CatalogRecords.vue'
import CatalogStatus from '@/components/domain/catalogs/CatalogStatus.vue'
import MipProductForm from '@/components/domain/catalogs/MipProductForm.vue'
import MipCatalogItemForm from '@/components/domain/catalogs/MipCatalogItemForm.vue'
import MipCriterionForm from '@/components/domain/catalogs/MipCriterionForm.vue'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import { coverageSummary, emptyProductInput, normalizeCatalogSearch, PEST_GROUP_LABELS, PRODUCT_PEST_CATEGORY_LABELS, productToInput } from '@/helpers/mipCatalogs'
import { ApiClientError } from '@/services/apiService'
import { deleteMasterFile, getMasterFileUrl, uploadMasterFile } from '@/services/filesService'
import { deleteMipRecord, saveMipRecord, setMipRecordActive } from '@/services/mipCatalogsService'
import { useAuthStore } from '@/stores/auth'
import { useMipCatalogsStore } from '@/stores/mipCatalogs'
import { useNotificationsStore } from '@/stores/notifications'
import type { CatalogErrors, MipCatalogItem, MipCatalogKind, MipCriterion, MipCriterionInput, MipItemInput, MipItemKind, MipProduct, MipRecord, PestGroup } from '@/types/mipCatalogs'

const store = useMipCatalogsStore(), auth = useAuthStore(), notifications = useNotificationsStore()
const router = useRouter(), route = useRoute()
const LABELS: Record<MipCatalogKind, string> = { products: 'Productos', traps: 'Trampas', pests: 'Plagas', methods: 'Métodos de aplicación', criteria: 'Criterios' }
const SINGLE: Record<MipCatalogKind, string> = { products: 'producto', traps: 'trampa', pests: 'plaga', methods: 'método', criteria: 'criterio' }
const TABS = ['products', 'traps', 'pests', 'criteria'] as const
const current = computed(() => TABS.includes(route.query.tab as typeof TABS[number]) ? route.query.tab as typeof TABS[number] : 'products')
const active = computed(() => route.query.estado !== 'inactivos')
const filter = reactive<Record<MipCatalogKind, { query: string; group: PestGroup | '' }>>({ products: { query: '', group: '' }, traps: { query: '', group: '' }, pests: { query: '', group: '' }, methods: { query: '', group: '' }, criteria: { query: '', group: '' } })
const key = computed(() => `${current.value}:${active.value}`)
const methodsOpen = ref(false), methodsActive = ref(true)
const methodsKey = computed(() => `methods:${methodsActive.value}`)
const saving = ref(false), actionBusy = ref(false), fileReading = ref(false)
const phase = ref('Guardando…')
const editorOpen = ref(false), detail = ref<{ kind: MipCatalogKind; record: MipRecord } | null>(null)
const editorKind = ref<MipCatalogKind>('products'), editing = ref<MipRecord | null>(null)
const productDraft = ref(emptyProductInput()), itemDraft = ref<MipItemInput>({ nombre: '', clasificacion: null, categoriaProducto: null }), criterionDraft = ref<MipCriterionInput>({ nombre: '', soloAreaExterna: false })
const file = ref<File | null>(null), original = ref(''), editorKey = ref(0)
const serverErrors = ref<CatalogErrors>({}), saveError = ref(''), conflict = ref(false)
const discard = ref<'close' | 'refresh' | null>(null)
const confirm = ref<{ kind: MipCatalogKind; record: MipRecord; action: 'state' | 'delete' } | null>(null)
let uploaded: { file: File; path: string } | null = null
let alive = true
const session = () => `${auth.profile?.id ?? ''}:${auth.activeRole ?? ''}`
const busy = computed(() => saving.value || actionBusy.value)
const dirty = computed(() => editorOpen.value && (JSON.stringify(editorKind.value === 'products' ? productDraft.value : editorKind.value === 'criteria' ? criterionDraft.value : itemDraft.value) !== original.value || file.value !== null))
const navigation = useUnsavedChanges(dirty, busy)
const editorTitle = computed(() => `${editing.value ? 'Editar' : editorKind.value === 'traps' || editorKind.value === 'pests' ? 'Nueva' : 'Nuevo'} ${SINGLE[editorKind.value]}`)
const dialogModel = computed({ get: () => editorOpen.value, set: (open: boolean) => { if (!open) requestClose() } })

function rows(kind: MipCatalogKind, state: boolean): MipRecord[] {
  const { query, group } = filter[kind], search = normalizeCatalogSearch(query)
  return store.list(kind, state).filter(row => {
    const product = kind === 'products' ? row as MipProduct : null
    const haystack = [row.nombre, product?.principioActivo, product?.fabricante, product?.registroSanitario].filter(Boolean).join(' ')
    return normalizeCatalogSearch(haystack).includes(search) && (!group || ('clasificacion' in row && row.clasificacion === group))
  })
}
const visible = computed(() => rows(current.value, active.value))
const methodRows = computed(() => rows('methods', methodsActive.value))
watch([current, active], () => { void store.load(current.value, active.value); if (current.value === 'products') void store.loadOptions() }, { immediate: true })
watch([methodsOpen, methodsActive], () => { if (methodsOpen.value) void store.load('methods', methodsActive.value) })
function switchTab(tab: typeof TABS[number]): void { void router.replace({ query: { ...route.query, tab, estado: 'activos' } }) }
function switchState(value: boolean): void { void router.replace({ query: { ...route.query, estado: value ? 'activos' : 'inactivos' } }) }
function feminine(kind: MipCatalogKind): boolean { return kind === 'pests' || kind === 'traps' }

function fillDraft(kind: MipCatalogKind, record: MipRecord | null): void {
  editorKind.value = kind; editing.value = record; editorKey.value++
  productDraft.value = kind === 'products' && record ? productToInput(record as MipProduct) : emptyProductInput()
  itemDraft.value = record && kind !== 'products' && kind !== 'criteria' ? { nombre: record.nombre, clasificacion: (record as MipCatalogItem).clasificacion, categoriaProducto: (record as MipCatalogItem).categoriaProducto } : { nombre: '', clasificacion: null, categoriaProducto: null }
  criterionDraft.value = record && kind === 'criteria' ? { nombre: record.nombre, soloAreaExterna: (record as MipCriterion).soloAreaExterna } : { nombre: '', soloAreaExterna: false }
  original.value = JSON.stringify(kind === 'products' ? productDraft.value : kind === 'criteria' ? criterionDraft.value : itemDraft.value)
  file.value = null; serverErrors.value = {}; saveError.value = ''; conflict.value = false
}
function openEditor(kind: MipCatalogKind, record: MipRecord | null = null): void {
  if (busy.value) return
  detail.value = null
  fillDraft(kind, record)
  editorOpen.value = true
  if (kind === 'products') void store.loadOptions()
}
function changed(): void { serverErrors.value = {}; if (!conflict.value) saveError.value = '' }
function invalid(): void { notifications.show('Revisa los campos marcados.', 'error') }
function requestClose(): void {
  if (saving.value) return
  if (dirty.value) discard.value = 'close'
  else closeEditor()
}
function cleanupPending(): void {
  const path = uploaded?.path; uploaded = null
  if (path) void deleteMasterFile(path).catch(() => { /* Preserve an uncertain upload; never delete a referenced master. */ })
}
function closeEditor(): void { editorOpen.value = false; file.value = null; cleanupPending() }
async function confirmDiscard(): Promise<void> {
  const action = discard.value; discard.value = null
  if (action === 'refresh' && editing.value) {
    const recordId = editing.value.id, kind = editorKind.value
    saving.value = true
    try {
      const refreshed = await store.refreshRecord(kind, recordId)
      if (refreshed && alive) { cleanupPending(); fillDraft(kind, refreshed) }
    } catch (error) { notifications.show(error instanceof Error ? error.message : 'No fue posible actualizar el registro.', 'error') }
    finally { saving.value = false }
  } else closeEditor()
}

async function save(): Promise<void> {
  if (saving.value || conflict.value) return
  if (editorKind.value === 'products' && !store.optionsLoaded) { notifications.show('Carga los métodos y las plagas antes de guardar.', 'error'); return }
  saving.value = true; saveError.value = ''; phase.value = 'Guardando…'
  const kind = editorKind.value, prior = editing.value, stamp = session()
  try {
    if (kind === 'products' && file.value) {
      if (uploaded?.file !== file.value) {
        cleanupPending()
        const selected = file.value
        const path = await uploadMasterFile('PRODUCT_TECHNICAL_SHEET', selected, value => { phase.value = value === 'compressing' ? 'Comprimiendo…' : 'Subiendo…' })
        uploaded = { file: selected, path }
      }
      productDraft.value = { ...productDraft.value, fichaTecnicaStoragePath: uploaded!.path }
    }
    phase.value = 'Guardando…'
    const result = await saveMipRecord(kind, kind === 'products' ? productDraft.value : kind === 'criteria' ? criterionDraft.value : itemDraft.value, prior ?? undefined)
    if (!alive || session() !== stamp) return
    store.upsert(kind, result)
    uploaded = null; file.value = null; editorOpen.value = false
    notifications.show(`${kind === 'products' ? 'Producto' : kind === 'traps' ? 'Trampa' : kind === 'pests' ? 'Plaga' : kind === 'criteria' ? 'Criterio' : 'Método'} ${prior ? 'actualizado' : 'creado'} correctamente.`, 'success')
  } catch (error) {
    if (!alive || session() !== stamp) return
    saveError.value = error instanceof Error ? error.message : 'No fue posible guardar. Tus datos se conservan.'
    if (error instanceof ApiClientError) {
      conflict.value = error.code === 'VERSION_CONFLICT'
      const fields = error.details?.fields
      if (fields && typeof fields === 'object' && !Array.isArray(fields)) serverErrors.value = Object.fromEntries(Object.entries(fields).filter(([, v]) => typeof v === 'string')) as CatalogErrors
    }
    notifications.show(saveError.value, 'error')
    await nextTick(); document.querySelector<HTMLElement>('#mip-product-form [aria-invalid="true"], #mip-item-form [aria-invalid="true"], #mip-criterion-form [aria-invalid="true"]')?.focus()
  } finally { saving.value = false }
}

async function applyAction(): Promise<void> {
  if (!confirm.value || actionBusy.value) return
  const target = confirm.value, stamp = session()
  actionBusy.value = true
  try {
    if (target.action === 'delete') {
      await deleteMipRecord(target.kind, target.record)
      if (alive && session() === stamp) store.remove(target.kind, target.record.id)
    } else {
      const updated = await setMipRecordActive(target.kind, target.record, !target.record.activo)
      if (alive && session() === stamp) store.upsert(target.kind, updated)
    }
    if (alive && session() === stamp) { detail.value = null; notifications.show(target.action === 'delete' ? 'Registro eliminado.' : target.record.activo ? 'Registro desactivado.' : 'Registro reactivado.', 'success') }
    confirm.value = null
  } catch (error) {
    if (!alive || session() !== stamp) return
    notifications.show(error instanceof Error ? error.message : 'No fue posible completar la operación.', 'error')
    confirm.value = null
    if (error instanceof ApiClientError && error.code === 'VERSION_CONFLICT') {
      openEditor(target.kind, target.record); conflict.value = true; saveError.value = error.message
    }
  } finally { actionBusy.value = false }
}
const confirmTitle = computed(() => confirm.value ? `${confirm.value.action === 'delete' ? 'Eliminar' : confirm.value.record.activo ? 'Desactivar' : 'Reactivar'} ${SINGLE[confirm.value.kind]}` : '')
const confirmMessage = computed(() => !confirm.value ? '' : confirm.value.action === 'delete'
  ? `Se eliminará ${confirm.value.record.nombre} solo si no tiene referencias ni historial. Esta acción no se puede deshacer.`
  : confirm.value.record.activo ? `${confirm.value.record.nombre} dejará de ofrecerse para nuevas selecciones. Su historial se conserva.` : `${confirm.value.record.nombre} volverá a estar disponible.`)

async function viewFile(path: string | null | undefined): Promise<void> {
  if (!path || fileReading.value) return
  // Open synchronously from the gesture; only populate with a validated signed HTTPS URL.
  const tab = window.open('about:blank', '_blank')
  if (tab) tab.opener = null
  fileReading.value = true
  try {
    const url = await getMasterFileUrl(path)
    if (!url.startsWith('https://')) throw new Error('No se recibió un enlace válido al archivo.')
    if (tab) tab.location.href = url
    else notifications.show('Permite ventanas emergentes para visualizar la ficha técnica.', 'warning')
  } catch (error) { tab?.close(); notifications.show(error instanceof Error ? error.message : 'No fue posible abrir la ficha técnica.', 'error') }
  finally { fileReading.value = false }
}
watch(() => session(), () => { editorOpen.value = false; methodsOpen.value = false; detail.value = null; confirm.value = null; file.value = null; uploaded = null })
onBeforeUnmount(() => { alive = false; cleanupPending() })
</script>

<template>
  <section class="mip-page">
    <header class="mip-page__header admin-page-header">
      <div class="admin-page-heading"><h1>{{ LABELS[current] }}</h1><p>— Catálogos MIP</p></div>
      <div class="mip-page__actions"><BaseButton v-if="current === 'products'" variant="secondary" size="compact" @click="methodsOpen = true">Métodos de aplicación</BaseButton><BaseButton size="compact" @click="openEditor(current)"><Plus :size="16" aria-hidden="true" />{{ feminine(current) ? 'Nueva' : 'Nuevo' }} {{ SINGLE[current] }}</BaseButton></div>
    </header>
    <nav class="mip-tabs" aria-label="Catálogos MIP"><button v-for="tab in TABS" :key="tab" type="button" :aria-current="current === tab ? 'page' : undefined" @click="switchTab(tab)">{{ LABELS[tab] }}</button></nav>
    <div class="mip-toolbar">
      <nav class="mip-tabs mip-tabs--state" aria-label="Estado de los registros"><button type="button" :aria-current="active ? 'page' : undefined" @click="switchState(true)">{{ feminine(current) ? 'Activas' : 'Activos' }}</button><button type="button" :aria-current="!active ? 'page' : undefined" @click="switchState(false)">{{ feminine(current) ? 'Inactivas' : 'Inactivos' }}</button></nav>
      <label class="mip-search"><Search :size="16" aria-hidden="true" /><span class="sr-only">Buscar {{ LABELS[current].toLowerCase() }}</span><input v-model="filter[current].query" type="search" :placeholder="`Buscar ${LABELS[current].toLowerCase()}…`" /></label>
      <label v-if="current === 'traps' || current === 'pests'" class="mip-filter"><span class="sr-only">Monitoreo</span><select v-model="filter[current].group"><option value="">Todas</option><option value="RASTREROS">Rastreros</option><option value="VOLADORES">Voladores</option></select></label>
    </div>
    <LoadingSkeleton v-if="store.loading[key] && !visible.length" />
    <ErrorState v-else-if="store.errors[key]" title="No se pudo cargar el catálogo" :message="store.errors[key]!"><BaseButton variant="secondary" size="compact" @click="store.load(current, active, true)">Reintentar</BaseButton></ErrorState>
    <CatalogRecords v-else-if="visible.length" :kind="current" :rows="visible" :busy="busy" @detail="detail = { kind: current, record: $event }" @edit="openEditor(current, $event)" @state="confirm = { kind: current, record: $event, action: 'state' }" @delete="confirm = { kind: current, record: $event, action: 'delete' }" />
    <section v-else class="mip-empty"><h2>{{ filter[current].query || filter[current].group ? 'No hay coincidencias' : `No hay ${LABELS[current].toLowerCase()} ${active ? 'activos' : 'inactivos'}` }}</h2><p>{{ active ? 'Agrega un registro o ajusta la búsqueda.' : 'Los registros desactivados aparecerán aquí.' }}</p></section>
    <small v-if="visible.length" class="mip-count">{{ visible.length }} registros</small>

    <BaseDialog :model-value="methodsOpen" title="Métodos de aplicación" class="mip-methods-dialog" @update:model-value="!busy && (methodsOpen = $event)">
      <div class="mip-toolbar"><nav class="mip-tabs" aria-label="Estado de métodos"><button type="button" :aria-current="methodsActive ? 'page' : undefined" @click="methodsActive = true">Activos</button><button type="button" :aria-current="!methodsActive ? 'page' : undefined" @click="methodsActive = false">Inactivos</button></nav><BaseButton size="compact" @click="openEditor('methods')">Nuevo método</BaseButton></div>
      <LoadingSkeleton v-if="store.loading[methodsKey] && !methodRows.length" />
      <ErrorState v-else-if="store.errors[methodsKey]" title="No se pudieron cargar los métodos" :message="store.errors[methodsKey]!"><BaseButton size="compact" @click="store.load('methods', methodsActive, true)">Reintentar</BaseButton></ErrorState>
      <CatalogRecords v-else-if="methodRows.length" kind="methods" :rows="methodRows" :busy="busy" @detail="openEditor('methods', $event)" @edit="openEditor('methods', $event)" @state="confirm = { kind: 'methods', record: $event, action: 'state' }" @delete="confirm = { kind: 'methods', record: $event, action: 'delete' }" />
      <p v-else class="mip-muted">No hay métodos {{ methodsActive ? 'activos' : 'inactivos' }}.</p>
    </BaseDialog>

    <BaseDialog v-model="dialogModel" :title="editorTitle" :close-on-escape="!saving" :class="{ 'mip-product-dialog': editorKind === 'products' }">
      <div v-if="saveError" class="mip-save-error" role="alert"><p>{{ saveError }}</p><BaseButton v-if="conflict" variant="secondary" size="compact" :disabled="saving" @click="discard = 'refresh'">Descartar borrador y actualizar</BaseButton></div>
      <template v-if="editorKind === 'products'">
        <p v-if="store.loading.options && !store.optionsLoaded" role="status">Cargando métodos y plagas…</p>
        <div v-if="store.errors.options" class="mip-save-error" role="alert"><p>{{ store.errors.options }}</p><BaseButton variant="secondary" size="compact" @click="store.loadOptions(true)">Reintentar opciones</BaseButton></div>
        <MipProductForm :key="editorKey" v-model="productDraft" :options="store.options" :saving="saving" :server-errors="serverErrors" :file="file" @update:file="file = $event" @change="changed" @invalid="invalid" @submit="save" @view-file="viewFile(productDraft.fichaTecnicaStoragePath)" />
      </template>
      <MipCriterionForm v-else-if="editorKind === 'criteria'" :key="editorKey" v-model="criterionDraft" :saving="saving" :server-errors="serverErrors" @change="changed" @invalid="invalid" @submit="save" />
      <MipCatalogItemForm v-else :key="editorKey" v-model="itemDraft" :kind="editorKind as MipItemKind" :saving="saving" :server-errors="serverErrors" @change="changed" @invalid="invalid" @submit="save" />
      <template #footer><div class="mip-form-actions"><BaseButton variant="secondary" size="compact" :disabled="saving" @click="requestClose">Cancelar</BaseButton><BaseButton type="submit" size="compact" :form="editorKind === 'products' ? 'mip-product-form' : editorKind === 'criteria' ? 'mip-criterion-form' : 'mip-item-form'" :loading="saving" :disabled="conflict || (editorKind === 'products' && !store.optionsLoaded)">{{ saving ? phase : editing ? 'Guardar cambios' : `Crear ${SINGLE[editorKind]}` }}</BaseButton></div></template>
    </BaseDialog>

    <BaseDialog :model-value="Boolean(detail)" :title="detail?.record.nombre ?? ''" @update:model-value="!$event && (detail = null)">
      <template v-if="detail">
        <CatalogStatus :active="detail.record.activo" :feminine="feminine(detail.kind)" />
        <dl v-if="detail.kind === 'products'" class="mip-detail">
          <div><dt>Principio activo</dt><dd>{{ (detail.record as MipProduct).principioActivo }}</dd></div><div><dt>Dosis de aplicación</dt><dd>{{ (detail.record as MipProduct).dosisAplicacion || 'Sin definir' }}</dd></div>
          <div><dt>Métodos</dt><dd>{{ (detail.record as MipProduct).metodos.map(m => m.nombre).join(' · ') || 'Sin definir' }}</dd></div><div><dt>Controla</dt><dd>{{ coverageSummary((detail.record as MipProduct).categorias, (detail.record as MipProduct).plagas) }}</dd></div>
          <div><dt>Registro sanitario</dt><dd>{{ (detail.record as MipProduct).registroSanitario || 'No registrado' }}</dd></div><div><dt>Grado toxicológico</dt><dd>{{ (detail.record as MipProduct).gradoToxicologico || 'No registrado' }}</dd></div><div><dt>Laboratorio</dt><dd>{{ (detail.record as MipProduct).fabricante || 'No registrado' }}</dd></div><div><dt>Antídoto</dt><dd>{{ (detail.record as MipProduct).antidoto || 'No registrado' }}</dd></div>
        </dl>
        <dl v-else-if="detail.kind === 'criteria'" class="mip-detail">
          <div><dt>Aplicación</dt><dd>{{ (detail.record as MipCriterion).soloAreaExterna ? 'Solo exterior / perímetro' : 'Todas las áreas' }}</dd></div>
        </dl>
        <dl v-else-if="(detail.record as MipCatalogItem).clasificacion" class="mip-detail">
          <div><dt>Monitoreo</dt><dd>{{ PEST_GROUP_LABELS[(detail.record as MipCatalogItem).clasificacion!] }}</dd></div>
          <div v-if="detail.kind === 'pests'"><dt>Categoría para productos</dt><dd>{{ (detail.record as MipCatalogItem).categoriaProducto ? PRODUCT_PEST_CATEGORY_LABELS[(detail.record as MipCatalogItem).categoriaProducto!] : 'Sin definir' }}</dd></div>
        </dl>
        <BaseButton v-if="detail.kind === 'products' && (detail.record as MipProduct).fichaTecnicaStoragePath" variant="secondary" size="compact" :loading="fileReading" @click="viewFile((detail!.record as MipProduct).fichaTecnicaStoragePath)">Ver ficha técnica</BaseButton>
      </template>
      <template #footer><BaseButton v-if="detail" size="compact" @click="openEditor(detail.kind, detail.record)">Editar</BaseButton></template>
    </BaseDialog>

    <ConfirmDialog :open="Boolean(confirm)" :title="confirmTitle" :message="confirmMessage" :confirm-label="confirmTitle.split(' ')[0]" :danger="confirm?.action === 'delete' || Boolean(confirm?.record.activo)" :loading="actionBusy" @cancel="!actionBusy && (confirm = null)" @confirm="applyAction" />
    <ConfirmDialog :open="Boolean(discard)" title="Descartar cambios" :message="discard === 'refresh' ? 'Se reemplazará el borrador por el registro actual del servidor.' : 'Se perderán los cambios que todavía no guardaste.'" confirm-label="Descartar" danger :loading="saving" @cancel="!saving && (discard = null)" @confirm="confirmDiscard" />
    <ConfirmDialog :open="navigation.confirmOpen.value" title="Salir sin guardar" message="Los cambios del formulario no se han guardado." confirm-label="Salir" danger @cancel="navigation.cancelDiscard" @confirm="navigation.confirmDiscard" />
  </section>
</template>

<style scoped>
.mip-page { min-width: 0; display: grid; gap: var(--space-8); }
.mip-page__header, .mip-page__actions, .mip-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-12); }
.mip-page__header h1 { margin: 0; font-size: 1.5rem; font-weight: 600; }
.mip-page__actions { justify-content: flex-end; gap: var(--space-8); }
.mip-tabs { display: flex; max-width: 100%; gap: var(--space-8); overflow-x: auto; border-bottom: 1px solid var(--border); }
.mip-tabs button { min-height: 36px; padding: .35rem .65rem; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--text-secondary); cursor: pointer; white-space: nowrap; }
.mip-tabs button[aria-current='page'] { color: var(--text); border-bottom-color: var(--accent); }
.mip-tabs--state { border-bottom: 0; }
.mip-toolbar { justify-content: flex-start; margin-bottom: 0; }
.mip-search { display: flex; align-items: center; gap: var(--space-8); width: min(100%, 26rem); min-width: 0; min-height: 36px; padding: .25rem .55rem; border: 1px solid var(--border-strong); border-radius: var(--radius); background: var(--surface); color: var(--text-secondary); }
.mip-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--text); }
.mip-search:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
.mip-filter select { min-height: 36px; padding: .25rem .55rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text); }
.mip-empty { display: grid; align-content: center; justify-items: center; gap: var(--space-8); min-height: 15rem; padding: var(--space-24); border: 1px solid var(--border); border-radius: var(--radius-panel); background: var(--surface); text-align: center; }
.mip-empty h2 { margin: 0; font-size: 1rem; }
.mip-empty p, .mip-count, .mip-muted { color: var(--text-secondary); margin: 0; }
.mip-form-actions { display: flex; width: 100%; justify-content: flex-end; gap: var(--space-8); }
.mip-save-error { margin-bottom: var(--space-16); padding: var(--space-12); border-radius: var(--radius); background: var(--danger-subtle); color: var(--danger); }
.mip-save-error p { margin: 0 0 .5rem; }
.mip-detail { display: grid; gap: var(--space-12); }
.mip-detail > div { display: grid; grid-template-columns: 9rem minmax(0, 1fr); gap: var(--space-12); }
.mip-detail dt { color: var(--text-secondary); }
.mip-detail dd { margin: 0; overflow-wrap: anywhere; }
:deep(.mip-product-dialog) { width: min(58rem, calc(100vw - 2rem)); }
:deep(.mip-methods-dialog) { width: min(48rem, calc(100vw - 2rem)); }
@media (max-width: 760px) {
  .mip-tabs button { min-height: 44px; }
  .mip-search { width: 100%; min-height: 44px; }
  .mip-search input, .mip-filter select { font-size: 16px; }
  .mip-page__actions { justify-content: flex-start; }
  .mip-detail > div { grid-template-columns: 1fr; gap: var(--space-4); }
  :deep(.mip-product-dialog), :deep(.mip-methods-dialog) { width: 100vw; }
}
</style>
