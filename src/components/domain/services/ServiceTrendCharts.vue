<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import type { ReportHistoricalVisit } from '@/helpers/serviceTrends'
import {
  REPORT_TREND_GEOMETRY as geometry, buildReportTrends, chartY, signedTrend,
} from '@/helpers/serviceTrends'
import { bogotaDate, scoreText } from '@/helpers/serviceReport'

const props = defineProps<{ visits: ReportHistoricalVisit[] }>()
type Metric = 'compliance' | 'captures'
const complianceTitleId = useId()
const capturesTitleId = useId()
const trends = computed(() => buildReportTrends(props.visits))
const activeMetric = ref<Metric | null>(null)
const activeIndex = ref<number | null>(null)
const selected = computed(() => activeIndex.value === null ? null : trends.value.visits[activeIndex.value] ?? null)
const lineSelection = computed(() => activeMetric.value === 'compliance' ? selected.value : null)
const capturesSelection = computed(() => activeMetric.value === 'captures' ? selected.value : null)
const captureTicks = computed(() => [...new Set([0, Math.ceil(trends.value.maxCaptures / 2), trends.value.maxCaptures])])
const captureWidth = computed(() => Math.min(32, 275 / Math.max(1, trends.value.visits.length)))
const hitWidth = computed(() => Math.max(35, 310 / Math.max(1, trends.value.visits.length)))

function activate(metric: Metric, index: number): void {
  activeMetric.value = metric
  activeIndex.value = index
}
function clear(metric: Metric): void {
  if (activeMetric.value === metric) {
    activeMetric.value = null
    activeIndex.value = null
  }
}
function activateNearest(event: PointerEvent, metric: Metric): void {
  if (!trends.value.visits.length) return
  const svg = event.currentTarget as SVGSVGElement
  const bounds = svg.getBoundingClientRect()
  if (!bounds.width) return
  const x = (event.clientX - bounds.left) * geometry.width / bounds.width
  let index = 0
  let distance = Infinity
  trends.value.visits.forEach((point, candidate) => {
    const current = Math.abs(point.x - x)
    if (current < distance) {
      index = candidate
      distance = current
    }
  })
  activate(metric, index)
}

const locale = new Intl.NumberFormat('es-CO')
const summary = computed(() => {
  const visits = trends.value.visits
  if (visits.length < 2) return 'Se requiere al menos una visita anterior para interpretar la evolución.'
  const last = visits[visits.length - 1]!
  const parts: string[] = []
  if (last.complianceDelta !== null) {
    const delta = Math.abs(last.complianceDelta).toLocaleString('es-CO', { maximumFractionDigits: 1 })
    parts.push(last.complianceDelta < 0
      ? 'El cumplimiento MIP disminuyó ' + delta + ' puntos porcentuales frente a la visita anterior.'
      : last.complianceDelta > 0
        ? 'El cumplimiento MIP aumentó ' + delta + ' puntos porcentuales frente a la visita anterior.'
        : 'El cumplimiento MIP se mantuvo sin cambios.')
  }
  if (last.capturesDelta !== null) {
    const count = locale.format(Math.abs(last.capturesDelta))
    parts.push(last.capturesDelta < 0
      ? 'Se registraron ' + count + ' capturas menos que en la visita anterior.'
      : last.capturesDelta > 0
        ? 'Se registraron ' + count + ' capturas más que en la visita anterior.'
        : 'El número de capturas se mantuvo sin cambios.')
  }
  if (last.capturesDelta !== null && last.capturesDelta < 0)
    parts.push('Una reducción de capturas no demuestra por sí sola una disminución de la presencia de plagas.')
  return parts.join(' ')
})

</script>

<template>
  <div v-if="!trends.visits.length" class="report-document__empty">Aún no hay visitas históricas para comparar.</div>
  <div v-else class="report-trends">
    <figure class="report-trend" data-testid="mip-trend-figure">
      <div class="report-trend__header">
        <h3>Cumplimiento MIP</h3>
        <span class="report-trend__change" data-testid="mip-compliance-delta">{{ signedTrend(trends.complianceChange, 'pp') }}</span>
      </div>
      <div class="report-trend__visual">
        <svg class="report-trend__svg" :viewBox="'0 0 ' + geometry.width + ' ' + geometry.height"
          data-testid="mip-compliance-chart" :aria-labelledby="complianceTitleId"
          role="group" @pointermove="activateNearest($event, 'compliance')"
          @pointerdown="activateNearest($event, 'compliance')" @pointerleave="clear('compliance')">
          <title :id="complianceTitleId">Tendencia del cumplimiento MIP en porcentaje por visita</title>
          <g v-for="tick in [0, 50, 100]" :key="tick">
            <line :x1="geometry.left" :x2="geometry.right" :y1="chartY(tick, 100)" :y2="chartY(tick, 100)"
              stroke="#dee6eb" stroke-width="1" :stroke-dasharray="tick === 0 ? undefined : '3 4'" />
            <text :x="geometry.left - 7" :y="chartY(tick, 100) + 3" text-anchor="end" class="report-trend__axis">{{ tick }}</text>
          </g>
          <line v-for="(segment, i) in trends.complianceSegments" :key="i"
            :x1="segment.x1" :y1="segment.y1" :x2="segment.x2" :y2="segment.y2"
            stroke="#206b89" stroke-width="2.5" stroke-linecap="round" />
          <g v-for="(visit, index) in trends.visits" :key="visit.solicitud + ':' + index">
            <template v-if="visit.complianceY !== null">
              <circle :cx="visit.x" :cy="visit.complianceY" :r="activeMetric === 'compliance' && activeIndex === index ? 7 : 4.5"
                fill="#206b89" stroke="white" stroke-width="1.5" class="report-trend__point" />
              <text :x="visit.x" :y="Math.max(visit.complianceY - 10, 20)"
                text-anchor="middle" class="report-trend__value">{{ scoreText(visit.cumplimiento) }}</text>
            </template>
            <text v-else :x="visit.x" :y="geometry.bottom - 12" text-anchor="middle" class="report-trend__value">—</text>
            <text :x="visit.x" :y="geometry.bottom + 19" text-anchor="middle" class="report-trend__date">{{ visit.dateLabel }}</text>
            <rect class="report-trend__hit" :x="visit.x - hitWidth / 2" :y="geometry.top - 15"
              :width="hitWidth" :height="geometry.bottom - geometry.top + 26" fill="transparent"
              role="button" tabindex="0" :data-testid="'mip-compliance-visit-' + index"
              :aria-label="visit.solicitud + ', ' + bogotaDate(visit.fecha) + ', ' + scoreText(visit.cumplimiento) +
                ', ' + signedTrend(visit.complianceDelta, 'pp')"
              @pointerenter="activate('compliance', index)" @focus="activate('compliance', index)"
              @blur="clear('compliance')" @click="activate('compliance', index)"
              @keydown.enter.prevent="activate('compliance', index)"
              @keydown.space.prevent="activate('compliance', index)" />
          </g>
        </svg>
        <div v-if="lineSelection" class="report-trend__tooltip" data-testid="mip-compliance-tooltip" role="status">
          <strong>{{ lineSelection.solicitud }} · {{ bogotaDate(lineSelection.fecha) }}</strong>
          <span>{{ lineSelection.cumplimiento === null ? 'Sin evaluación registrada' : 'Cumplimiento: ' + scoreText(lineSelection.cumplimiento) }}</span>
          <small v-if="lineSelection.complianceDelta !== null">{{ signedTrend(lineSelection.complianceDelta, 'pp') }} respecto a la visita anterior</small>
          <small v-else>Sin comparación con la visita anterior</small>
        </div>
      </div>
      <figcaption>C = 100 %, CP = 50 %, NC = 0 %; sin acceso y NA excluidos.</figcaption>
    </figure>

    <figure class="report-trend" data-testid="mip-captures-figure">
      <div class="report-trend__header">
        <h3>Capturas totales</h3>
        <span class="report-trend__change" data-testid="mip-captures-delta">{{ signedTrend(trends.captureChange, 'capturas') }}</span>
      </div>
      <div class="report-trend__visual">
        <svg class="report-trend__svg" :viewBox="'0 0 ' + geometry.width + ' ' + geometry.height"
          data-testid="mip-captures-chart" :aria-labelledby="capturesTitleId" role="group"
          @pointermove="activateNearest($event, 'captures')"
          @pointerdown="activateNearest($event, 'captures')" @pointerleave="clear('captures')">
          <title :id="capturesTitleId">Total de individuos de todas las plagas capturados por visita</title>
          <g v-for="tick in captureTicks" :key="tick">
            <line :x1="geometry.left" :x2="geometry.right" :y1="chartY(tick, trends.maxCaptures)"
              :y2="chartY(tick, trends.maxCaptures)" stroke="#dee6eb" stroke-width="1"
              :stroke-dasharray="tick === 0 ? undefined : '3 4'" />
            <text :x="geometry.left - 7" :y="chartY(tick, trends.maxCaptures) + 3"
              text-anchor="end" class="report-trend__axis">{{ locale.format(tick) }}</text>
          </g>
          <g v-for="(visit, index) in trends.visits" :key="visit.solicitud + ':' + index">
            <rect :x="visit.x - captureWidth / 2" :y="visit.capturesY"
              :width="captureWidth" :height="geometry.bottom - visit.capturesY"
              rx="3" :fill="activeMetric === 'captures' && activeIndex === index ? '#164c63' : '#206b89'" />
            <text :x="visit.x" :y="Math.max(visit.capturesY - 9, 20)"
              text-anchor="middle" class="report-trend__value">{{ locale.format(visit.captures) }}</text>
            <text :x="visit.x" :y="geometry.bottom + 19" text-anchor="middle" class="report-trend__date">{{ visit.dateLabel }}</text>
            <rect class="report-trend__hit" :x="visit.x - hitWidth / 2" :y="geometry.top - 15"
              :width="hitWidth" :height="geometry.bottom - geometry.top + 26" fill="transparent"
              role="button" tabindex="0" :data-testid="'mip-captures-visit-' + index"
              :aria-label="visit.solicitud + ', ' + bogotaDate(visit.fecha) + ', ' +
                locale.format(visit.captures) + ' capturas, ' + signedTrend(visit.capturesDelta, 'capturas')"
              @pointerenter="activate('captures', index)" @focus="activate('captures', index)"
              @blur="clear('captures')" @click="activate('captures', index)"
              @keydown.enter.prevent="activate('captures', index)"
              @keydown.space.prevent="activate('captures', index)" />
          </g>
        </svg>
        <div v-if="capturesSelection" class="report-trend__tooltip" data-testid="mip-captures-tooltip" role="status">
          <strong>{{ capturesSelection.solicitud }} · {{ bogotaDate(capturesSelection.fecha) }}</strong>
          <span>Total: {{ locale.format(capturesSelection.captures) }} capturas</span>
          <small v-if="capturesSelection.capturesDelta !== null">{{ signedTrend(capturesSelection.capturesDelta, 'capturas') }} respecto a la visita anterior</small>
          <small v-else>Sin comparación con la visita anterior</small>
        </div>
      </div>
      <figcaption>Suma de todas las plagas capturadas en los puestos revisados.</figcaption>
    </figure>
    <p class="report-trends__summary" data-testid="mip-trend-summary">{{ summary }}</p>
  </div>
</template>

<style scoped>
.report-trends__summary{grid-column:1/-1;margin:0;padding:.55rem .7rem;border-left:2px solid var(--report-accent);font-size:.75rem;line-height:1.5;color:var(--report-ink)}
.report-trends{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;align-items:start}
.report-trend{margin:0;min-width:0;padding:.8rem .65rem .65rem;border:1px solid var(--report-border);border-radius:7px;background:#fff;break-inside:avoid;page-break-inside:avoid}
.report-trend__header{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:.2rem .5rem;padding:0 .35rem}
.report-trend__header h3{font-size:.81rem;font-weight:650;color:var(--report-ink);margin:0!important}
.report-trend__change{font-size:.68rem;font-weight:600;color:var(--report-accent);font-variant-numeric:tabular-nums}
.report-trend__visual{position:relative;min-width:0;margin:.15rem 0}
.report-trend__svg{display:block;width:100%;height:auto;max-height:195px;overflow:visible;touch-action:pan-y}
.report-trend__axis{fill:var(--report-muted);font-size:9px;font-family:inherit}
.report-trend__date{fill:var(--report-muted);font-size:9.4px;font-family:inherit}
.report-trend__value{fill:var(--report-ink);font-size:9.4px;font-weight:600;font-family:inherit}
.report-trend__point{transition:r .1s}
.report-trend__hit{cursor:crosshair;outline:none}
.report-trend__hit:focus-visible{stroke:var(--report-accent);stroke-width:1.5;stroke-dasharray:3 4;fill:rgba(32,107,137,.06)}
.report-trend__tooltip{position:absolute;top:6px;right:6px;z-index:3;display:grid;gap:.15rem;max-width:200px;padding:.55rem .65rem;border:1px solid #c9d9e1;border-radius:6px;background:rgba(255,255,255,.97);box-shadow:0 6px 18px rgba(26,58,75,.12);font-size:.72rem;line-height:1.35;color:var(--report-ink);pointer-events:none}
.report-trend__tooltip strong{font-size:.71rem;font-weight:650}
.report-trend__tooltip span{font-weight:600;font-variant-numeric:tabular-nums}
.report-trend__tooltip small{color:var(--report-muted);font-size:.66rem}
.report-trend figcaption{font-size:.67rem;line-height:1.4;color:var(--report-muted);padding:0 .35rem}
@media(max-width:720px){.report-trends{grid-template-columns:1fr;gap:.75rem}.report-trend{max-width:none}}
@media print{
.report-trends{grid-template-columns:repeat(2,minmax(0,1fr));gap:3mm;break-inside:avoid;page-break-inside:avoid}
.report-trend{padding:2mm 1.5mm;box-shadow:none!important;break-inside:avoid;page-break-inside:avoid}
.report-trend__tooltip{display:none!important}
.report-trend__hit{pointer-events:none}
.report-trend__svg{max-height:none}
.report-trend__axis,.report-trend__date,.report-trend__value{fill:#21384a!important}
.report-trend__date{fill:#607482!important}
.report-trend__change{color:#206b89!important}
}
</style>
