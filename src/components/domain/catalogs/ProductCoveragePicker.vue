<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import BaseField from '@/components/base/BaseField.vue'
import { canonicalCoverage, coverageSummary, normalizeCatalogSearch, PEST_GROUP_LABELS } from '@/helpers/mipCatalogs'
import { PEST_GROUPS, type MipCatalogItem, type PestGroup } from '@/types/mipCatalogs'

const props = defineProps<{ categories: PestGroup[]; pestIds: string[]; pests: MipCatalogItem[]; disabled?: boolean; error?: string }>()
const emit = defineEmits<{ change: [value: { categorias: PestGroup[]; plagaIds: string[] }]; blur: [] }>()
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const open = ref(false)
const query = ref('')
const summary = computed(() => coverageSummary(props.categories, props.pests.filter(p => props.pestIds.includes(p.id))))
const visible = computed(() => props.pests.filter(pest => pest.clasificacion && (pest.activo || props.pestIds.includes(pest.id)) && normalizeCatalogSearch(pest.nombre).includes(normalizeCatalogSearch(query.value))))

async function toggleOpen(): Promise<void> {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) { await nextTick(); root.value?.querySelector<HTMLInputElement>('input[type="search"]')?.focus() }
  else emit('blur')
}
function category(group: PestGroup): void {
  if (props.disabled) return
  const selected = props.categories.includes(group) ? props.categories.filter(item => item !== group) : [...props.categories, group]
  emit('change', canonicalCoverage(selected, props.pestIds, props.pests))
}
function togglePest(pest: MipCatalogItem): void {
  if (props.disabled || (pest.clasificacion && props.categories.includes(pest.clasificacion))) return
  if (!pest.activo && !props.pestIds.includes(pest.id)) return
  const selected = props.pestIds.includes(pest.id) ? props.pestIds.filter(id => id !== pest.id) : [...props.pestIds, pest.id]
  emit('change', canonicalCoverage(props.categories, selected, props.pests))
}
function close(restore = false): void { open.value = false; emit('blur'); if (restore) trigger.value?.focus() }
function outside(event: PointerEvent): void { if (open.value && !root.value?.contains(event.target as Node)) close() }
function focusOut(event: FocusEvent): void { if (open.value && event.relatedTarget instanceof Node && !root.value?.contains(event.relatedTarget)) close() }
onMounted(() => document.addEventListener('pointerdown', outside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside))
</script>

<template>
  <BaseField v-slot="{ describedBy }" name="product-coverage" label="Plagas que controla" required :disabled="disabled" :error="error">
    <div ref="root" class="coverage" @focusout="focusOut" @keydown.esc.stop.prevent="close(true)">
      <button id="product-coverage" ref="trigger" type="button" class="coverage__trigger" :disabled="disabled" :aria-expanded="open" aria-controls="product-coverage-options" :aria-describedby="describedBy" :aria-invalid="Boolean(error)" @click="toggleOpen">
        <span>{{ categories.length || pestIds.length ? summary : 'Seleccionar categorías o plagas' }}</span><ChevronDown :size="18" aria-hidden="true" />
      </button>
      <section v-if="open" id="product-coverage-options" class="coverage__options" aria-label="Seleccionar cobertura">
        <label class="sr-only" for="coverage-search">Buscar plaga</label>
        <input id="coverage-search" v-model="query" type="search" placeholder="Buscar plaga…" :disabled="disabled" />
        <fieldset>
          <legend>Categorías completas</legend>
          <label v-for="group in PEST_GROUPS" :key="group" class="coverage__option">
            <input type="checkbox" :checked="categories.includes(group)" :disabled="disabled" @change="category(group)" />
            <span>Todos los {{ PEST_GROUP_LABELS[group].toLowerCase() }}</span>
          </label>
        </fieldset>
        <fieldset v-for="group in PEST_GROUPS" :key="group">
          <legend>{{ PEST_GROUP_LABELS[group] }}</legend>
          <label v-for="pest in visible.filter(p => p.clasificacion === group)" :key="pest.id" class="coverage__option">
            <input type="checkbox" :checked="categories.includes(group) || pestIds.includes(pest.id)" :disabled="disabled || categories.includes(group)" @change="togglePest(pest)" />
            <span>{{ pest.nombre }}<small v-if="categories.includes(group)">Incluida por categoría</small><small v-else-if="!pest.activo">Inactiva · selección conservada</small></span>
          </label>
          <p v-if="!visible.some(p => p.clasificacion === group)" class="coverage__empty">No hay coincidencias.</p>
        </fieldset>
        <button type="button" class="coverage__done" @click="close(true)">Listo</button>
      </section>
    </div>
  </BaseField>
</template>

<style scoped>
.coverage { min-width: 0; }
.coverage__trigger { display: flex; width: 100%; min-height: 44px; align-items: center; justify-content: space-between; gap: var(--space-8); padding: .6rem .75rem; border: 1px solid var(--control-border); border-radius: var(--radius); background: var(--surface); color: var(--text); text-align: left; }
.coverage__trigger span { min-width: 0; overflow-wrap: anywhere; }
.coverage__trigger svg { flex: 0 0 auto; }
.coverage__trigger[aria-invalid='true'] { border-color: var(--danger); }
.coverage__options { display: grid; gap: var(--space-8); max-height: 22rem; overflow-y: auto; margin-top: .35rem; padding: var(--space-8); border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-raised); }
.coverage__options > input { min-width: 0; min-height: 44px; padding: .5rem; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); color: var(--text); }
fieldset { margin: 0; padding: 0; border: 0; min-width: 0; }
legend { padding: .35rem; font-size: .75rem; color: var(--text-secondary); }
.coverage__option { display: flex; align-items: center; gap: var(--space-8); min-height: 40px; padding: .4rem; border-radius: var(--radius-sm); cursor: pointer; }
.coverage__option:hover { background: var(--hover); }
.coverage__option input { width: 17px; height: 17px; flex: 0 0 auto; accent-color: var(--accent); }
.coverage__option span { min-width: 0; overflow-wrap: anywhere; }
.coverage__option small { display: block; color: var(--text-secondary); font-size: .75rem; }
.coverage__done { justify-self: end; min-height: 36px; padding: .4rem .75rem; border: 0; background: transparent; color: var(--accent); cursor: pointer; }
.coverage__empty { margin: .5rem; color: var(--text-secondary); }
@media (max-width: 760px) { .coverage__option, .coverage__done { min-height: 44px; } .coverage__options > input { font-size: 16px; } }
</style>
