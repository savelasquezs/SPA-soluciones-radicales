<script setup lang="ts">
import { computed } from 'vue'
import { Camera, ChevronDown, Clock3 } from 'lucide-vue-next'
import BaseDrawer from '@/components/base/BaseDrawer.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import ErrorState from '@/components/base/ErrorState.vue'
import EmptyState from '@/components/base/EmptyState.vue'
import EvidenceLightbox from '@/components/base/EvidenceLightbox.vue'
import InsightFilters from './InsightFilters.vue'
import InsightPagination from './InsightPagination.vue'
import { useInsightList } from '@/composables/useInsightList'
import { useEvidenceGallery } from '@/composables/useEvidenceGallery'
import { listMonitoringReviews } from '@/services/siteInsightsService'
import { conditionLabel, conditionTone, evidenceKey, insightDate } from '@/helpers/siteInsights'
import type { EvidenceReference, MonitoringPoint, MonitoringReview } from '@/types/siteInsights'

const props = defineProps<{ siteId: string; point: MonitoringPoint }>()
const emit = defineEmits<{ close: [] }>()
const { data, items, page, filters, loading, error, load, changeFilters, resetFilters } = useInsightList<MonitoringReview>(
  () => `${props.siteId}/${props.point.id}`, () => true,
  (query, signal) => listMonitoringReviews(props.siteId,props.point.id,query,signal),
)
const gallery = useEvidenceGallery(() => props.siteId)
const { open, index, state, url, current, photos } = gallery
const pagePhotos = computed(() => items.value.flatMap(review => review.photos))
function showPhoto(photo?: EvidenceReference): void {
  const selected = photo ? pagePhotos.value.findIndex(item => evidenceKey(item) === evidenceKey(photo)) : 0
  gallery.show(pagePhotos.value, Math.max(0, selected))
}
</script>

<template>
  <BaseDrawer :model-value="true" :title="`Puesto ${point.number}`" @update:model-value="!$event && emit('close')">
    <div class="insight-detail">
      <div class="insight-tags"><StatusBadge :tone="conditionTone(point.condition)">{{ conditionLabel(point.condition) }}</StatusBadge><StatusBadge v-if="!point.enabled" tone="neutral">No habilitado</StatusBadge></div>
      <dl><div><dt>Trampa</dt><dd>{{ point.trapName }}</dd></div><div><dt>Área actual</dt><dd>{{ point.areaName }}{{ !point.areaActive ? ' · Inactiva' : '' }}</dd></div><div><dt>Ubicación actual</dt><dd>{{ point.location }}</dd></div><div><dt>Última revisión finalizada</dt><dd>{{ point.lastReview ? insightDate(point.lastReview.date) : 'Sin revisiones finalizadas' }}</dd></div></dl>
      <p v-if="point.inProgress" class="insight-provisional"><Clock3 :size="16" />Hay una revisión en curso. La condición actual puede ser provisional.</p>
      <div class="insight-section-title insight-divider"><h3>Historial de revisiones</h3><BaseButton v-if="pagePhotos.length" size="compact" variant="secondary" @click="showPhoto()"><Camera :size="16" />Fotos ({{ pagePhotos.length }})</BaseButton></div>
      <InsightFilters mode="reviews" :model-value="filters" @update:model-value="changeFilters" @reset="resetFilters" />
      <LoadingSkeleton v-if="loading && !data" label="Cargando revisiones" :lines="5" />
      <ErrorState v-else-if="error && !data" title="No pudimos cargar el historial" :message="error"><BaseButton size="compact" variant="secondary" @click="load">Reintentar</BaseButton></ErrorState>
      <template v-else>
        <div v-if="error" class="insight-feedback" role="alert">{{ error }}<BaseButton size="compact" variant="secondary" @click="load">Reintentar</BaseButton></div>
        <p v-if="loading" class="insight-muted" role="status">Actualizando revisiones…</p>
        <EmptyState v-if="!items.length" title="Sin revisiones" message="No hay revisiones para este rango y estado." />
        <details v-for="review in items" :key="review.id" class="insight-review">
          <summary><span><strong>{{ review.service.number }}</strong><small class="insight-muted">{{ insightDate(review.service.date,true) }}</small></span><span class="insight-tags"><StatusBadge v-if="review.service.state === 'EN_PROCESO'" tone="info">En curso</StatusBadge><StatusBadge :tone="conditionTone(review.condition)">{{ conditionLabel(review.condition) }}</StatusBadge><ChevronDown :size="16" aria-hidden="true" /></span></summary>
          <div class="insight-review__body">
            <p v-if="review.service.state === 'EN_PROCESO'" class="insight-provisional">Revisión provisional: el servicio aún no ha finalizado.</p>
            <dl><div><dt>Técnico responsable</dt><dd>{{ review.service.technician }}</dd></div><div><dt>Trampa de la visita</dt><dd>{{ review.trapName }}</dd></div><div><dt>Área de la visita</dt><dd>{{ review.areaName }}</dd></div><div><dt>Ubicación de la visita</dt><dd>{{ review.location }}</dd></div></dl>
            <p v-if="review.previousCondition !== review.condition" class="insight-muted">{{ conditionLabel(review.previousCondition) }} → {{ conditionLabel(review.condition) }}</p>
            <div><h4>Plagas evidenciadas</h4><ul v-if="review.captures.length" class="insight-captures"><li v-for="capture in review.captures" :key="capture.plagaCodigo">{{ capture.plagaNombreSnapshot }} <strong>{{ capture.cantidad }}</strong></li></ul><p v-else class="insight-muted">Sin capturas registradas.</p></div>
            <dl v-if="review.chemical || review.antidote || review.consumption"><div v-if="review.chemical"><dt>Producto registrado en la revisión</dt><dd>{{ review.chemical }}</dd></div><div v-if="review.antidote"><dt>Antídoto registrado</dt><dd>{{ review.antidote }}</dd></div><div v-if="review.consumption"><dt>Consumo</dt><dd>{{ review.consumption }}</dd></div></dl>
            <div v-if="review.notes"><h4>Observaciones</h4><p>{{ review.notes }}</p></div>
            <div class="insight-photos"><BaseButton v-if="review.photos.length" size="compact" variant="secondary" @click="showPhoto(review.photos[0])"><Camera :size="16" />Ver fotografía</BaseButton><span v-else class="insight-muted">Sin evidencia fotográfica registrada.</span></div>
            <details v-if="review.serviceProducts.length" class="insight-divider"><summary>Productos del servicio ({{ review.serviceProducts.length }})</summary><div class="insight-products"><p class="insight-muted">Registrados en el servicio; no asociados directamente a este puesto.</p><article v-for="(product, productIndex) in review.serviceProducts" :key="productIndex"><strong>{{ product.name }}</strong><p v-if="product.ingredient">{{ product.ingredient }}</p><p v-if="product.dose">Dosis: {{ product.dose }}</p><p v-if="product.method">Método: {{ product.method }}</p><p>Lote: {{ product.batch || 'Sin registrar' }} · Vence: {{ product.expiry ? insightDate(`${product.expiry}T12:00:00-05:00`) : 'Sin registrar' }}</p></article></div></details>
            <RouterLink class="insight-link" :to="`/servicios/${review.service.id}`">Ver servicio {{ review.service.number }}</RouterLink>
          </div>
        </details>
        <InsightPagination :page="page" :page-size="data?.pageSize ?? 20" :total="data?.total ?? 0" :loading="loading" @change="page = $event" />
        <p v-if="pagePhotos.length && (data?.total ?? 0) > 20" class="insight-muted">El visor recorre las fotos de esta página del historial.</p>
      </template>
    </div>
  </BaseDrawer>
  <EvidenceLightbox :open="open" :index="index" :total="photos.length" :state="state" :url="url" :title="current?.label ?? 'Fotografías del puesto'" :caption="current ? insightDate(current.date,true) : ''" @close="gallery.close" @select="gallery.select" @retry="gallery.retry" @image-error="gallery.imageFailed" />
</template>
