<script setup lang="ts">
import { computed } from 'vue'
import { Camera } from 'lucide-vue-next'
import BaseDrawer from '@/components/base/BaseDrawer.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import EvidenceLightbox from '@/components/base/EvidenceLightbox.vue'
import { useEvidenceGallery } from '@/composables/useEvidenceGallery'
import { findingLabel, findingTone, insightDate } from '@/helpers/siteInsights'
import type { SiteFinding } from '@/types/siteInsights'
const props = defineProps<{ siteId: string; finding: SiteFinding }>()
const emit = defineEmits<{ close: [] }>()
const opening = computed(() => props.finding.photos.filter(photo => photo.kind === 'OPENING'))
const closure = computed(() => props.finding.photos.filter(photo => photo.kind === 'CLOSURE'))
const gallery = useEvidenceGallery(() => props.siteId)
const { open, index, state, url, current, photos } = gallery
function show(phase: 'OPENING' | 'CLOSURE'): void {
  const collection = [...opening.value,...closure.value]
  gallery.show(collection,phase === 'OPENING' ? 0 : opening.value.length)
}
</script>
<template>
  <BaseDrawer :model-value="true" title="Detalle del hallazgo" @update:model-value="!$event && emit('close')">
    <div class="insight-detail">
      <div class="insight-tags"><StatusBadge :tone="findingTone(finding.state)">{{ findingLabel(finding.state) }}</StatusBadge><span class="insight-muted">{{ finding.areaName }}</span></div>
      <p v-if="finding.openingService.state === 'EN_PROCESO'" class="insight-provisional">Registrado en un servicio en curso.</p>
      <div><h3>Hallazgo</h3><p>{{ finding.description }}</p></div>
      <div><h3>Recomendación o acción correctiva</h3><p>{{ finding.recommendation }}</p></div>
      <dl><div><dt>Responsable de la acción</dt><dd>{{ finding.responsibleName }}</dd></div><div v-if="finding.responsibleEmail"><dt>Correo del responsable</dt><dd>{{ finding.responsibleEmail }}</dd></div></dl>
      <div class="insight-divider"><h3>Apertura</h3></div>
      <dl><div><dt>Fecha</dt><dd>{{ insightDate(finding.openedAt,true) }}</dd></div><div><dt>Servicio</dt><dd><RouterLink class="insight-link" :to="`/servicios/${finding.openingService.id}`">{{ finding.openingService.number }}</RouterLink></dd></div><div><dt>Técnico responsable del servicio</dt><dd>{{ finding.openingService.technician }}</dd></div></dl>
      <div class="insight-photos"><BaseButton v-if="opening.length" size="compact" variant="secondary" @click="show('OPENING')"><Camera :size="16" />Fotos de apertura ({{ opening.length }})</BaseButton><span v-else class="insight-muted">Sin evidencia fotográfica de apertura.</span></div>
      <template v-if="finding.state === 'CERRADO'">
        <div class="insight-divider"><h3>Cierre</h3></div>
        <p v-if="finding.closingService?.state === 'EN_PROCESO'" class="insight-provisional">Cierre registrado en un servicio aún en curso.</p>
        <dl><div><dt>Fecha</dt><dd>{{ insightDate(finding.closedAt,true) }}</dd></div><div v-if="finding.closingService"><dt>Servicio</dt><dd><RouterLink class="insight-link" :to="`/servicios/${finding.closingService.id}`">{{ finding.closingService.number }}</RouterLink></dd></div><div v-if="finding.closingService"><dt>Técnico responsable del servicio</dt><dd>{{ finding.closingService.technician }}</dd></div></dl>
        <div v-if="finding.closingNotes"><h4>Observación de cierre</h4><p>{{ finding.closingNotes }}</p></div>
        <div class="insight-photos"><BaseButton v-if="closure.length" size="compact" variant="secondary" @click="show('CLOSURE')"><Camera :size="16" />Fotos de cierre ({{ closure.length }})</BaseButton><span v-else class="insight-muted">Sin evidencia fotográfica de cierre registrada.</span></div>
      </template>
    </div>
  </BaseDrawer>
  <EvidenceLightbox :open="open" :index="index" :total="photos.length" :state="state" :url="url" :title="current?.label ?? 'Fotografías del hallazgo'" :caption="current ? `${finding.areaName} · ${insightDate(current.date,true)}` : ''" @close="gallery.close" @select="gallery.select" @retry="gallery.retry" @image-error="gallery.imageFailed" />
</template>
