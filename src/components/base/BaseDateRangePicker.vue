<script setup lang="ts">
import { CalendarDays, X } from 'lucide-vue-next'
import { computed, ref, useId } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseCalendar from '@/components/base/BaseCalendar.vue'
import BaseDateInputSegments from '@/components/base/BaseDateInputSegments.vue'
import BaseDialog from '@/components/base/BaseDialog.vue'
import BaseField from '@/components/base/BaseField.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import { compareDateOnly, isDateOnly } from '@/helpers/dateTime'
import type { DateOnly } from '@/types/domain'

type DateInputDraftState = 'empty' | 'partial' | 'valid' | 'invalid'
type RangeValue = { from: string; to: string }
type RangePart = 'from' | 'to'

const props = withDefaults(defineProps<{
  modelValue: RangeValue
  name?: string
  label?: string
  disabled?: boolean
  readonly?: boolean
  error?: string
  min?: DateOnly
  max?: DateOnly
  clearable?: boolean
  isDateDisabled?: (value: DateOnly) => boolean
}>(), {
  name: undefined,
  label: 'Rango de fechas',
  disabled: false,
  readonly: false,
  error: undefined,
  min: undefined,
  max: undefined,
  clearable: false,
  isDateDisabled: undefined,
})

const emit = defineEmits<{ 'update:modelValue': [value: RangeValue] }>()
const uid = useId()
const name = computed(() => props.name ?? `date-range-${uid}`)
const open = ref(false)
const localError = ref<string | null>(null)
const draftFrom = ref<DateOnly | null>(null)
const draftTo = ref<DateOnly | null>(null)
const effectiveError = computed(() => props.error ?? localError.value ?? undefined)
const currentFrom = computed<DateOnly | null>(() => isDateOnly(props.modelValue.from) ? props.modelValue.from : null)
const currentTo = computed<DateOnly | null>(() => isDateOnly(props.modelValue.to) ? props.modelValue.to : null)
const hasValue = computed(() => Boolean(props.modelValue.from || props.modelValue.to))
const selectionHint = computed(() => draftFrom.value && !draftTo.value ? 'Selecciona la fecha final' : 'Selecciona la fecha inicial y la final')

function showPicker(): void {
  if (props.disabled || props.readonly) return
  draftFrom.value = currentFrom.value
  draftTo.value = currentTo.value
  localError.value = null
  open.value = true
}

function selectDate(value: DateOnly): void {
  if (!draftFrom.value || draftTo.value) {
    draftFrom.value = value
    draftTo.value = null
    return
  }
  if (compareDateOnly(value, draftFrom.value) < 0) {
    draftTo.value = draftFrom.value
    draftFrom.value = value
  } else {
    draftTo.value = value
  }
  localError.value = null
}

function apply(): void {
  if (!draftFrom.value || !draftTo.value) {
    localError.value = 'Selecciona la fecha inicial y la final'
    return
  }
  if (!validRange(draftFrom.value, draftTo.value)) {
    localError.value = 'Selecciona un rango válido dentro de los límites permitidos'
    return
  }
  localError.value = null
  emit('update:modelValue', { from: draftFrom.value, to: draftTo.value })
  open.value = false
}

function clear(): void {
  draftFrom.value = null
  draftTo.value = null
  localError.value = null
  emit('update:modelValue', { from: '', to: '' })
  open.value = false
}

function cancelPicker(): void {
  open.value = false
}

function commitTyped(part: RangePart, value: DateOnly | null, state: DateInputDraftState): void {
  const label = part === 'from' ? 'inicial' : 'final'
  if (state === 'empty') {
    localError.value = props.modelValue.from || props.modelValue.to ? 'Completa el rango de fechas' : null
    return
  }
  if (state === 'partial') {
    localError.value = `Completa la fecha ${label}`
    return
  }
  if (state === 'invalid' || (value && !dateAllowed(value))) {
    localError.value = `Ingresa una fecha ${label} válida`
    return
  }

  const next: RangeValue = {
    from: part === 'from' ? value ?? '' : props.modelValue.from,
    to: part === 'to' ? value ?? '' : props.modelValue.to,
  }
  if (next.from && next.to && (!isDateOnly(next.from) || !isDateOnly(next.to) || compareDateOnly(next.from, next.to) > 0)) {
    localError.value = 'La fecha inicial no puede ser posterior a la fecha final'
    return
  }
  localError.value = null
  emit('update:modelValue', next)
}

function validRange(from: DateOnly, to: DateOnly): boolean {
  return compareDateOnly(from, to) <= 0 && dateAllowed(from) && dateAllowed(to)
}

function dateAllowed(value: DateOnly): boolean {
  return Boolean((!props.min || compareDateOnly(value, props.min) >= 0)
    && (!props.max || compareDateOnly(value, props.max) <= 0)
    && !props.isDateDisabled?.(value))
}
</script>

<template>
  <div class="date-range-picker-root">
    <BaseField
      v-slot="{ describedBy }"
      :name="name"
      :label="label"
      :error="effectiveError"
      :disabled="disabled"
    >
      <div
        class="date-range-control"
        :class="{ 'date-range-control--invalid': effectiveError, 'date-range-control--disabled': disabled }"
        @keydown.down.prevent="showPicker"
        @keydown.esc="open = false"
      >
        <div class="date-range-control__dates">
          <BaseDateInputSegments
            class="date-range-control__segments"
            :model-value="currentFrom"
            :name="name"
            :disabled="disabled"
            :readonly="readonly"
            :invalid="Boolean(effectiveError)"
            :described-by="describedBy"
            label="Desde"
            @complete="(value) => commitTyped('from', value, 'valid')"
            @commit="(value, state) => commitTyped('from', value, state)"
          />
          <span class="date-range-control__separator" aria-hidden="true">–</span>
          <BaseDateInputSegments
            class="date-range-control__segments"
            :model-value="currentTo"
            :name="`${name}-to`"
            :disabled="disabled"
            :readonly="readonly"
            :invalid="Boolean(effectiveError)"
            :described-by="describedBy"
            label="Hasta"
            @complete="(value) => commitTyped('to', value, 'valid')"
            @commit="(value, state) => commitTyped('to', value, state)"
          />
        </div>
        <BaseIconButton label="Seleccionar rango de fechas" size="small" :disabled="disabled || readonly" @click="showPicker">
          <CalendarDays :size="18" />
        </BaseIconButton>
        <BaseIconButton v-if="clearable && hasValue && !readonly" label="Limpiar rango" size="small" :disabled="disabled" @click="clear">
          <X :size="17" />
        </BaseIconButton>
      </div>
    </BaseField>

    <BaseDialog v-model="open" title="Seleccionar rango" size="compact">
      <div class="range-picker">
        <p class="range-picker__hint">{{ selectionHint }}</p>
        <BaseCalendar
          mode="range"
          :range-start="draftFrom"
          :range-end="draftTo"
          :min="min"
          :max="max"
          :is-date-disabled="isDateDisabled"
          @select="selectDate"
        />
        <p v-if="localError" class="range-picker__error" role="alert">{{ localError }}</p>
      </div>
      <template #footer>
        <BaseButton v-if="clearable" size="compact" variant="ghost" @click="clear">Limpiar</BaseButton>
        <BaseButton size="compact" variant="secondary" @click="cancelPicker">Cancelar</BaseButton>
        <BaseButton size="compact" @click="apply">Aplicar</BaseButton>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.date-range-picker-root { width: 100%; min-width: 0; }
.date-range-control { display: flex; width: 100%; min-width: 0; min-height: 44px; align-items: center; overflow: hidden; border: 1px solid var(--control-border); border-radius: var(--radius-input); background: var(--surface); }
.date-range-control:focus-within { box-shadow: var(--focus-ring); }
.date-range-control--invalid { border-color: var(--danger); }
.date-range-control--disabled { background: var(--bg); }
.date-range-control__dates { display: flex; min-width: 0; flex: 1 1 auto; align-items: center; gap: 0.4rem; padding: 0 0.7rem; }
.date-range-control__segments { flex: 0 0 auto; }
.date-range-control__separator { flex: 0 0 auto; color: var(--text-muted); }
.date-range-control :deep(.icon-button) { flex: 0 0 auto; }
.range-picker { display: grid; gap: 0.55rem; }
.range-picker__hint { margin: 0; color: var(--text-secondary); font-size: 0.75rem; }
.range-picker__error { margin: 0; color: var(--danger); font-size: 0.8125rem; }

@media (max-width: 420px) {
  .date-range-control__dates { gap: 0.2rem; padding: 0 0.45rem; }
}
</style>
