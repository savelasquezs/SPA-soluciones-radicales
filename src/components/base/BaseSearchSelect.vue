<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { ChevronDown, Search } from 'lucide-vue-next'
import BaseField from '@/components/base/BaseField.vue'

export type SearchSelectOption = { id: string; label: string; description?: string }
const props = withDefaults(defineProps<{
  modelValue: string
  options: SearchSelectOption[]
  name: string
  label: string
  placeholder?: string
  emptyText?: string
  required?: boolean
  disabled?: boolean
  error?: string
  hint?: string
}>(), { placeholder:'Buscar…', emptyText:'No hay coincidencias.', required:false,disabled:false,error:undefined,hint:undefined })
const emit = defineEmits<{ 'update:modelValue': [value:string]; blur:[] }>()
const id = useId()
const root = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const open = ref(false)
const query = ref('')
const activeIndex = ref(0)
const selected = computed(() => props.options.find(item => item.id === props.modelValue))
const normalize = (value:string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim()
const filtered = computed(() => {
  const term = normalize(query.value)
  if (!term) return props.options
  return props.options.filter(item => normalize(item.label + ' ' + (item.description ?? '')).includes(term))
})
function expand(): void {
  if (props.disabled) return
  open.value = true
  query.value = ''
  activeIndex.value = Math.max(0,filtered.value.findIndex(item => item.id === props.modelValue))
}
function choose(option: SearchSelectOption): void {
  emit('update:modelValue',option.id)
  close()
  input.value?.focus()
}
function close(): void {
  if (!open.value) return
  open.value = false
  query.value = ''
  emit('blur')
}
function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') { event.preventDefault();close();return }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!open.value) expand()
    else if (filtered.value.length) activeIndex.value = (activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + filtered.value.length) % filtered.value.length
  }
  if (event.key === 'Enter' && open.value) {
    event.preventDefault()
    const option = filtered.value[activeIndex.value]
    if (option) choose(option)
  }
}
function onOutside(event: PointerEvent): void {
  if (open.value && !root.value?.contains(event.target as Node)) close()
}
watch(filtered, () => { activeIndex.value = 0 })
watch(() => props.disabled, value => { if (value) close() })
onMounted(() => document.addEventListener('pointerdown',onOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown',onOutside))
</script>

<template>
  <BaseField v-slot="{describedBy}" :name="name" :label="label" :required="required" :disabled="disabled" :error="error" :hint="hint">
    <div ref="root" class="search-select">
      <div class="search-select__control" :class="{ 'search-select__control--invalid':error }">
        <Search :size="16" aria-hidden="true" />
        <input :id="name" ref="input" type="search" autocomplete="off"
          :value="open ? query : selected?.label ?? ''" :placeholder="placeholder" :disabled="disabled"
          role="combobox" :aria-expanded="open" aria-autocomplete="list" :aria-controls="id+'-list'"
          :aria-activedescendant="open && filtered[activeIndex] ? id+'-option-'+activeIndex : undefined"
          :aria-invalid="Boolean(error)" :aria-describedby="describedBy"
          @focus="expand" @input="query=($event.target as HTMLInputElement).value;open=true"
          @keydown="onKey" />
        <ChevronDown :size="16" aria-hidden="true" />
      </div>
      <div v-if="open" :id="id+'-list'" class="search-select__list" role="listbox" :aria-label="label">
        <button v-for="(option,index) in filtered" :id="id+'-option-'+index" :key="option.id" type="button"
          role="option" :aria-selected="option.id===modelValue"
          class="search-select__option" :class="{ 'search-select__option--active':index===activeIndex }"
          @mousedown.prevent @click="choose(option)">
          <span>{{ option.label }}</span><small v-if="option.description">{{ option.description }}</small>
        </button>
        <p v-if="!filtered.length">{{ emptyText }}</p>
      </div>
    </div>
  </BaseField>
</template>

<style scoped>
.search-select{position:relative;min-width:0}
.search-select__control{display:flex;align-items:center;gap:.5rem;min-height:44px;border:1px solid var(--control-border);border-radius:var(--radius);background:var(--surface);padding:0 .75rem;color:var(--text-secondary)}
.search-select__control:focus-within{box-shadow:var(--focus-ring)}
.search-select__control--invalid{border-color:var(--danger)}
.search-select__control input{min-width:0;flex:1;border:0!important;outline:0!important;box-shadow:none!important;background:transparent;color:var(--text);padding:.65rem 0;font-size:max(1rem,16px)}
.search-select__control input:disabled{opacity:.65}
.search-select__list{position:absolute;z-index:25;top:calc(100% + .3rem);left:0;right:0;max-height:15rem;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface-raised);box-shadow:var(--shadow-lg);padding:.25rem}
.search-select__option{display:grid;width:100%;gap:.1rem;min-height:40px;padding:.5rem .65rem;background:transparent;border:0;border-radius:var(--radius-sm);color:var(--text);text-align:left;cursor:pointer;font-size:.83rem}
.search-select__option small{color:var(--text-secondary)}
.search-select__option:hover,.search-select__option--active{background:var(--hover)}
.search-select__list p{font-size:.8rem;margin:0;padding:.75rem;color:var(--text-secondary)}
</style>
