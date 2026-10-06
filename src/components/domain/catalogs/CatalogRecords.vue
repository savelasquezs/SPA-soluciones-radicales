<script setup lang="ts">
import { Bug, Feather } from 'lucide-vue-next'
import ResponsiveTable from '@/components/base/ResponsiveTable.vue'
import CatalogActions from './CatalogActions.vue'
import CatalogStatus from './CatalogStatus.vue'
import { coverageSummary, PEST_GROUP_LABELS, PRODUCT_PEST_CATEGORY_LABELS } from '@/helpers/mipCatalogs'
import type { MipCatalogItem, MipCatalogKind, MipProduct, MipRecord, PestGroup, ProductPestCategory } from '@/types/mipCatalogs'

defineProps<{ kind: MipCatalogKind; rows: MipRecord[]; busy?: boolean }>()
const emit = defineEmits<{ detail: [record: MipRecord]; edit: [record: MipRecord]; state: [record: MipRecord]; delete: [record: MipRecord] }>()
const product = (row: MipRecord): MipProduct => row as MipProduct
const group = (row: MipRecord): PestGroup | null => 'clasificacion' in row ? row.clasificacion : null
const productCategory = (row: MipRecord): ProductPestCategory | null => 'categoriaProducto' in row ? (row as MipCatalogItem).categoriaProducto : null
</script>

<template>
  <ResponsiveTable>
    <template #table>
      <div class="catalog-table" tabindex="0" role="region" :aria-label="`Lista de ${kind === 'products' ? 'productos' : kind === 'traps' ? 'trampas' : kind === 'pests' ? 'plagas' : 'métodos'}`">
        <table>
          <thead><tr>
            <th scope="col">{{ kind === 'products' ? 'Producto' : kind === 'traps' ? 'Trampa' : kind === 'pests' ? 'Plaga' : 'Método' }}</th>
            <template v-if="kind === 'products'"><th scope="col">Principio activo</th><th scope="col">Dosis</th><th scope="col">Métodos</th><th scope="col">Controla</th></template>
            <th v-else-if="kind !== 'methods'" scope="col">Monitoreo</th>
            <th v-if="kind === 'pests'" scope="col">Productos</th>
            <th scope="col">Estado</th><th scope="col">Acciones</th>
          </tr></thead>
          <tbody><tr v-for="row in rows" :key="row.id">
            <th scope="row"><button class="entity-link" type="button" :disabled="busy" @click="emit('detail', row)">{{ row.nombre }}</button></th>
            <template v-if="kind === 'products'">
              <td>{{ product(row).principioActivo }}</td><td>{{ product(row).dosisAplicacion || 'Sin definir' }}</td>
              <td>{{ product(row).metodos.map(m => m.nombre).join(' · ') || 'Sin definir' }}</td>
              <td>{{ coverageSummary(product(row).categorias, product(row).plagas) }}</td>
            </template>
            <td v-else-if="kind !== 'methods'"><span v-if="group(row)" class="classification"><Bug v-if="group(row) === 'RASTREROS'" :size="15" aria-hidden="true" /><Feather v-else :size="15" aria-hidden="true" />{{ PEST_GROUP_LABELS[group(row)!] }}</span><span v-else class="classification--missing">Completar clasificación</span></td>
            <td v-if="kind === 'pests'"><span v-if="productCategory(row)" class="classification">{{ PRODUCT_PEST_CATEGORY_LABELS[productCategory(row)!] }}</span><span v-else class="classification--missing">Completar categoría</span></td>
            <td><CatalogStatus :active="row.activo" :feminine="kind === 'pests' || kind === 'traps'" /></td>
            <td><CatalogActions :name="row.nombre" :active="row.activo" :disabled="busy" @edit="emit('edit', row)" @state="emit('state', row)" @delete="emit('delete', row)" /></td>
          </tr></tbody>
        </table>
      </div>
    </template>
    <template #cards>
      <article v-for="row in rows" :key="row.id" class="catalog-card">
        <header><button type="button" class="entity-link" :disabled="busy" @click="emit('detail', row)">{{ row.nombre }}</button><CatalogStatus :active="row.activo" :feminine="kind === 'pests' || kind === 'traps'" /></header>
        <dl v-if="kind === 'products'">
          <div><dt>Principio activo</dt><dd>{{ product(row).principioActivo }}</dd></div>
          <div><dt>Dosis</dt><dd>{{ product(row).dosisAplicacion || 'Sin definir' }}</dd></div>
          <div><dt>Métodos</dt><dd>{{ product(row).metodos.map(m => m.nombre).join(' · ') || 'Sin definir' }}</dd></div>
          <div><dt>Controla</dt><dd>{{ coverageSummary(product(row).categorias, product(row).plagas) }}</dd></div>
        </dl>
        <div v-else-if="kind !== 'methods'" class="catalog-card__classifications">
          <p class="classification">{{ group(row) ? PEST_GROUP_LABELS[group(row)!] : 'Completar clasificación' }}</p>
          <p v-if="kind === 'pests'" class="classification">{{ productCategory(row) ? PRODUCT_PEST_CATEGORY_LABELS[productCategory(row)!] : 'Completar categoría para productos' }}</p>
        </div>
        <footer><CatalogActions :name="row.nombre" :active="row.activo" :disabled="busy" @edit="emit('edit', row)" @state="emit('state', row)" @delete="emit('delete', row)" /></footer>
      </article>
    </template>
  </ResponsiveTable>
</template>

<style scoped>
.catalog-table { min-width: 0; max-height: max(18rem, calc(100dvh - 18rem)); overflow: auto; border: 1px solid var(--border); border-radius: var(--radius-panel); background: var(--surface); }
.catalog-table table { border-spacing: 0; border-collapse: separate; width: 100%; font-size: .8125rem; }
.catalog-table th, .catalog-table td { padding: .65rem .75rem; vertical-align: middle; border-bottom: 1px solid var(--border); }
.catalog-table thead th { position: sticky; z-index: 1; top: 0; background: var(--sidebar); color: var(--text-secondary); font-size: .75rem; font-weight: 500; letter-spacing: 0; text-transform: none; }
.catalog-table tbody th { font-weight: 500; text-transform: none; letter-spacing: 0; min-width: 9rem; }
.catalog-table td { max-width: 15rem; overflow-wrap: anywhere; }
.catalog-table tr:last-child > * { border-bottom: 0; }
.entity-link { padding: 0; border: 0; background: none; color: var(--text); font: inherit; font-weight: 500; text-align: left; cursor: pointer; overflow-wrap: anywhere; }
.entity-link:hover, .entity-link:focus-visible { text-decoration: underline; }
.classification { display: inline-flex; gap: var(--space-4); align-items: center; color: var(--text-secondary); font-size: .8125rem; }
.classification--missing { color: var(--warning); }
.catalog-card { min-width: 0; padding: var(--space-16); border: 1px solid var(--border); border-radius: var(--radius-panel); background: var(--surface); }
.catalog-card header { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-12); }
.catalog-card .entity-link { min-height: 44px; }
.catalog-card dl { display: grid; gap: .5rem; margin: .5rem 0; }
.catalog-card dl > div { display: grid; grid-template-columns: 7rem minmax(0, 1fr); gap: .5rem; font-size: .8125rem; }
.catalog-card dt { color: var(--text-secondary); }
.catalog-card dd { margin: 0; overflow-wrap: anywhere; }
.catalog-card__classifications { display: grid; gap: var(--space-4); margin: .5rem 0; }
.catalog-card__classifications p { margin: 0; }
.catalog-card footer { display: flex; justify-content: flex-end; }
</style>
