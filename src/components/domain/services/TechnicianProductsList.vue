<script setup lang="ts">
import { FlaskConical } from 'lucide-vue-next'
import type { TechnicianProduct } from '@/types/technicianServices'

defineProps<{ products: TechnicianProduct[] }>()

function dateLabel(value: string | null): string {
  if (!value) return 'No informada'
  const [year, month, day] = value.slice(0, 10).split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}
</script>

<template>
  <section class="technician-section" aria-labelledby="technician-products-title">
    <header><div class="technician-section__icon"><FlaskConical :size="20" aria-hidden="true" /></div><div><h2 id="technician-products-title">Productos a aplicar</h2><p>Dosis y métodos del catálogo MIP. Lote y vencimiento registrados en la visita. No editable.</p></div></header>
    <p v-if="!products.length" class="technician-empty">No hay productos asignados.</p>
    <div v-else class="technician-products">
      <article v-for="product in products" :key="product.id">
        <h3>{{ product.nombre }}</h3>
        <p>{{ product.principioActivo }}</p>
        <dl>
          <div><dt>Lote</dt><dd>{{ product.lote || 'No informado' }}</dd></div>
          <div><dt>Dosis del catálogo</dt><dd>{{ product.dosis || 'No informada' }}</dd></div>
          <div><dt>Métodos del catálogo</dt><dd>{{ product.metodoAplicacion || 'No informados' }}</dd></div>
          <div><dt>Registro sanitario</dt><dd>{{ product.registroSanitario || 'No informado' }}</dd></div>
          <div><dt>Vencimiento</dt><dd>{{ dateLabel(product.fechaVencimiento) }}</dd></div>
        </dl>
      </article>
    </div>
  </section>
</template>

<style scoped>
.technician-section { display:grid; gap:1rem; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); padding:1rem; }
.technician-section > header { display:flex; align-items:flex-start; gap:0.75rem; }
.technician-section__icon { display:grid; width:40px; height:40px; flex:0 0 auto; place-items:center; border-radius:var(--radius); background:var(--accent-subtle); color:var(--accent); }
h2, h3, p, dl, dd { margin:0; }
h2 { font-size:1rem; }
header p, article > p { margin-top:0.2rem; color:var(--text-secondary); font-size:0.8125rem; }
.technician-products { display:grid; gap:0.75rem; }
article { display:grid; gap:0.75rem; border:1px solid var(--border); border-radius:var(--radius); padding:0.9rem; }
h3 { font-size:0.9375rem; }
dl { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0.65rem 1rem; }
dt { color:var(--text-secondary); font-size:0.72rem; font-weight:600; }
dd { overflow-wrap:anywhere; font-size:0.875rem; }
.technician-empty { color:var(--text-secondary); }
@media (min-width:760px) { .technician-section { padding:1.25rem; } .technician-products { grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>
