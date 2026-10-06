<script setup lang="ts">
import { Check, ChevronDown } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import BaseField from '@/components/base/BaseField.vue'

export type MultiSelectOption = { id: string; label: string; description?: string }

const props = withDefaults(defineProps<{
  modelValue: string[]
  options: MultiSelectOption[]
  label: string
  name: string
  required?: boolean
  disabled?: boolean
  error?: string
  hint?: string
  itemLabel?: string
  itemsLabel?: string
  placeholder?: string
  emptyText?: string
}>(), { required: false, disabled: false, error: undefined, hint: undefined, itemLabel: 'formulario', itemsLabel: 'formularios', placeholder: 'Selecciona formularios', emptyText: 'No hay formularios activos.' })

const emit = defineEmits<{ 'update:modelValue': [value: string[]]; blur: [] }>()
const root = ref<HTMLElement | null>(null)
const list = ref<HTMLElement | null>(null)
const open = ref(false)
const activeIndex = ref(0)
const summary = computed(() => props.modelValue.length
  ? `${props.modelValue.length} ${props.modelValue.length === 1 ? props.itemLabel : props.itemsLabel} seleccionado${props.modelValue.length === 1 ? '' : 's'}`
  : props.placeholder)

onMounted(() => document.addEventListener('pointerdown', onOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside))

async function toggleOpen(): Promise<void> {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) {
    activeIndex.value = Math.max(0, props.options.findIndex((option) => props.modelValue.includes(option.id)))
    await nextTick()
    focusActive()
  }
}

watch(() => props.disabled, (disabled) => { if (disabled) open.value = false })

function toggle(id: string): void {
  if (props.disabled) return
  const values = props.modelValue.includes(id)
    ? props.modelValue.filter((value) => value !== id)
    : [...props.modelValue, id]
  emit('update:modelValue', values)
}

function onTriggerKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (!open.value) void toggleOpen()
  }
}

function onListKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    close(true)
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!props.options.length) return
    const direction = event.key === 'ArrowDown' ? 1 : -1
    activeIndex.value = (activeIndex.value + direction + props.options.length) % props.options.length
    focusActive()
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const option = props.options[activeIndex.value]
    if (option) toggle(option.id)
  }
}

function close(restoreFocus = false): void {
  open.value = false
  emit('blur')
  if (restoreFocus) root.value?.querySelector<HTMLButtonElement>('.multi-select__trigger')?.focus()
}

function focusActive(): void {
  list.value?.querySelectorAll<HTMLElement>('[role="option"]')[activeIndex.value]?.focus()
}

function onOutside(event: PointerEvent): void {
  if (open.value && !root.value?.contains(event.target as Node)) close()
}
</script>

<template>
  <BaseField v-slot="{ describedBy }" :name="name" :label="label" :required="required" :disabled="disabled" :error="error" :hint="hint">
    <div ref="root" class="multi-select">
      <button
        :id="name"
        type="button"
        class="multi-select__trigger"
        :disabled="disabled"
        :aria-expanded="open"
        aria-haspopup="listbox"
        :aria-invalid="Boolean(error)"
        :aria-describedby="describedBy"
        @click="toggleOpen"
        @keydown="onTriggerKeydown"
      >
        <span>{{ summary }}</span><ChevronDown :size="18" aria-hidden="true" />
      </button>
      <div v-if="open" ref="list" class="multi-select__list" role="listbox" :aria-label="label" aria-multiselectable="true" @keydown="onListKeydown">
        <button
          v-for="(option, index) in options"
          :key="option.id"
          type="button"
          role="option"
          class="multi-select__option"
          :aria-selected="modelValue.includes(option.id)"
          :tabindex="index === activeIndex ? 0 : -1"
          @focus="activeIndex = index"
          @click="toggle(option.id)"
        >
          <span class="multi-select__check"><Check v-if="modelValue.includes(option.id)" :size="16" /></span>
          <span><strong>{{ option.label }}</strong><small v-if="option.description">{{ option.description }}</small></span>
        </button>
        <p v-if="options.length === 0">{{ emptyText }}</p>
      </div>
    </div>
  </BaseField>
</template>

<style scoped>
.multi-select { position: relative; }
.multi-select__trigger { display: flex; width: 100%; min-height: 44px; align-items: center; justify-content: space-between; gap: 0.75rem; border: 1px solid var(--control-border); border-radius: var(--radius); background: var(--surface); padding: 0.65rem 0.75rem; color: var(--text); text-align: left; }
.multi-select__trigger[aria-invalid='true'] { border-color: var(--danger); }
.multi-select__trigger:disabled { background: var(--surface-hover); color: var(--text-muted); }
.multi-select__list { position: absolute; z-index: 20; top: calc(100% + 0.35rem); right: 0; left: 0; max-height: 15rem; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-raised); padding: 0.35rem; box-shadow: var(--shadow-lg); }
.multi-select__option { display: grid; width: 100%; min-height: 44px; grid-template-columns: 1.25rem 1fr; align-items: center; gap: 0.6rem; border: 0; border-radius: var(--radius-sm); background: transparent; padding: 0.55rem; color: var(--text); text-align: left; }
.multi-select__option:hover, .multi-select__option:focus-visible { background: var(--hover); }
.multi-select__option > span:last-child { display: grid; }
.multi-select__option small { color: var(--text-secondary); }
.multi-select__check { display: grid; width: 1.15rem; height: 1.15rem; place-items: center; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); color: var(--accent); }
.multi-select__list p { margin: 0; padding: 0.75rem; color: var(--text-secondary); }
</style>
