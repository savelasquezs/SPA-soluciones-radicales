<script setup lang="ts">
import { FlaskConical, ExternalLink } from 'lucide-vue-next'
import type { TechnicianProduct } from '@/types/technicianServices'
import { ref } from 'vue'
import { technicianProductSheetUrl } from '@/services/servicesService'
import { openProtectedDocument } from '@/helpers/openProtectedDocument'
import { useNotificationsStore } from '@/stores/notifications'

const props=defineProps<{ products: TechnicianProduct[]; serviceId: string }>()
const notifications=useNotificationsStore()
const activeSheet=ref<string | null>(null)
async function openSheet(id:string):Promise<void>{
  if(activeSheet.value)return
  activeSheet.value=id
  try{
    await openProtectedDocument(()=>technicianProductSheetUrl(props.serviceId,id))
  }catch(error){
    notifications.show(error instanceof Error ? error.message : 'No fue posible abrir la ficha técnica.','error')
  }finally{activeSheet.value=null}
}

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
        <button v-if="product.fichaTecnicaDisponible" type="button" class="technical-sheet-link"
          :disabled="activeSheet!==null" :aria-label="'Ver ficha técnica de '+product.nombre"
          @click="openSheet(product.id)">Ver ficha técnica <ExternalLink :size="14" aria-hidden="true" /></button>
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
.technical-sheet-link{display:inline-flex;align-items:center;gap:.3rem;width:fit-content;padding:.1rem 0;border:0;background:none;color:var(--text);font-size:.79rem;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.technical-sheet-link:hover{color:var(--accent)}
.technical-sheet-link:disabled{opacity:.65;cursor:wait}
dl { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0.65rem 1rem; }
dt { color:var(--text-secondary); font-size:0.72rem; font-weight:600; }
dd { overflow-wrap:anywhere; font-size:0.875rem; }
.technician-empty { color:var(--text-secondary); }
@media (min-width:760px) { .technician-section { padding:1.25rem; } .technician-products { grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>
