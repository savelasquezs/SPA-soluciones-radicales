<script setup lang="ts">
import ResponsiveTable from '@/components/base/ResponsiveTable.vue'
import type { ServiceHistoryItem } from '@/types/domain'

defineProps<{ items: ServiceHistoryItem[] }>()

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(value))
}
function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value)
}
</script>

<template>
  <ResponsiveTable>
    <template #table>
      <div class="history-scroll" tabindex="0" aria-label="Historial de servicios: desplazar horizontalmente para ver todas las columnas">
        <table class="history-table">
          <thead><tr><th>Servicio</th><th>Fecha</th><th>Tipo</th><th>Técnico</th><th>Estado</th><th>Valor</th></tr></thead>
          <tbody>
            <tr v-for="item in items" :key="item.id">
              <td><RouterLink class="service-link" :to="'/servicios/' + item.id">{{ item.solicitud }}</RouterLink></td>
              <td>{{ formatDate(item.fecha) }}</td><td>{{ item.tipo }}</td><td>{{ item.tecnico }}</td>
              <td>{{ item.estado }}</td><td>{{ formatMoney(item.valor) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <template #cards>
      <article v-for="item in items" :key="item.id" class="history-mobile-card">
        <div class="history-mobile-card__top">
          <RouterLink class="service-link" :to="'/servicios/' + item.id">{{ item.solicitud }}</RouterLink>
          <time :datetime="item.fecha">{{ formatDate(item.fecha) }}</time>
        </div>
        <div class="history-mobile-card__row">
          <span>{{ item.tipo }}</span>
          <span class="history-status">{{ item.estado }}</span>
        </div>
        <div class="history-mobile-card__bottom">
          <span>{{ item.tecnico }}</span>
          <strong>{{ formatMoney(item.valor) }}</strong>
        </div>
      </article>
    </template>
  </ResponsiveTable>
</template>

<style scoped>
.history-scroll { max-width:100%; min-width:0; overflow-x:auto; overscroll-behavior-x:contain; -webkit-overflow-scrolling:touch; }
.history-table { width:100%; min-width:45rem; border-collapse:collapse; font-size:0.85rem; }
.history-table th, .history-table td { padding:0.6rem 0.7rem; text-align:left; border-bottom:1px solid var(--border); }
.history-table th { color:var(--text-secondary); font-weight:500; }
.history-table tr:last-child td { border-bottom:0; }
.service-link { color:var(--text); font-weight:600; text-decoration:none; overflow-wrap:anywhere; }
.service-link:hover, .service-link:focus-visible { text-decoration:underline; text-underline-offset:2px; }
.history-mobile-card { display:grid; gap:0.4rem; min-width:0; padding:0.7rem; border:1px solid var(--border); border-radius:var(--radius); background:var(--surface); font-size:0.85rem; }
.history-mobile-card__top, .history-mobile-card__row, .history-mobile-card__bottom { display:flex; justify-content:space-between; align-items:center; gap:0.4rem 0.75rem; min-width:0; }
.history-mobile-card__top time, .history-mobile-card__bottom > span { color:var(--text-secondary); font-size:0.78rem; }
.history-mobile-card__top time { flex-shrink:0; }
.history-mobile-card__row { color:var(--text-secondary); }
.history-mobile-card__bottom > span { min-width:0; overflow-wrap:anywhere; }
.history-mobile-card__bottom strong { flex:none; font-size:0.83rem; }
.history-status { max-width:60%; color:var(--text); overflow-wrap:anywhere; text-align:right; }
@media (max-width:760px) {
  .history-mobile-card { padding:0.6rem 0.7rem; gap:0.3rem; }
}
</style>
