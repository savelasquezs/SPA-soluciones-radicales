<script setup lang="ts">
import { CalendarDays, Clock3, X } from 'lucide-vue-next'
import { computed, ref, useId, watch } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseCalendar from '@/components/base/BaseCalendar.vue'
import BaseDateInputSegments from '@/components/base/BaseDateInputSegments.vue'
import BaseDialog from '@/components/base/BaseDialog.vue'
import BaseField from '@/components/base/BaseField.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import {
  formatDateInput,
  isDateOnly,
  isLocalDateTime,
  isTimeOnly,
  joinLocalDateTime,
  normalizeTime,
  parseDateInput,
  splitLocalDateTime,
} from '@/helpers/dateTime'
import type { DateOnly, LocalDateTime, TimeOnly } from '@/types/domain'

type PickerMode = 'date' | 'time' | 'datetime'
type DateInputDraftState = 'empty' | 'partial' | 'valid' | 'invalid'

const props = withDefaults(defineProps<{
  modelValue: string | null
  mode: PickerMode
  name?: string
  label: string
  required?: boolean
  hint?: string
  error?: string
  disabled?: boolean
  readonly?: boolean
  min?: string
  max?: string
  clearable?: boolean
  minuteStep?: number
  isDateDisabled?: (value: DateOnly) => boolean
}>(), {
  name: undefined,
  required: false,
  hint: undefined,
  error: undefined,
  disabled: false,
  readonly: false,
  min: undefined,
  max: undefined,
  clearable: false,
  minuteStep: 5,
  isDateDisabled: undefined,
})

const emit = defineEmits<{ 'update:modelValue': [value: string | null]; blur: [] }>()
const uid = useId()
const name = computed(() => props.name ?? `date-time-${uid}`)
const open = ref(false)
const inputText = ref('')
const localError = ref<string | null>(null)
const selectedDate = ref<DateOnly | null>(null)
const selectedTime = ref<TimeOnly | null>(null)
let restoreOnClose = true

const effectiveError = computed(() => props.error ?? localError.value ?? undefined)
const hasDate = computed(() => props.mode !== 'time')
const hasTime = computed(() => props.mode !== 'date')
const title = computed(() => props.mode === 'date' ? 'Seleccionar fecha' : props.mode === 'time' ? 'Seleccionar hora' : 'Seleccionar fecha y hora')
const minuteOptions = computed(() => {
  const step = validStep(props.minuteStep)
  return Array.from({ length: Math.ceil(60 / step) }, (_, index) => index * step).filter((value) => value < 60)
})
const timeHours = computed(() => selectedTime.value?.slice(0, 2) ?? '09')
const timeMinutes = computed(() => selectedTime.value?.slice(3, 5) ?? String(minuteOptions.value[0] ?? 0).padStart(2, '0'))

watch(() => props.modelValue, syncFromModel, { immediate: true })

function syncFromModel(value: string | null): void {
  localError.value = null
  if (props.mode === 'date') {
    selectedDate.value = value && isDateOnly(value) ? value : null
    selectedTime.value = null
    inputText.value = ''
  } else if (props.mode === 'time') {
    selectedDate.value = null
    selectedTime.value = value && isTimeOnly(value) ? value : null
    inputText.value = selectedTime.value ?? ''
  } else {
    const parts = value && isLocalDateTime(value) ? splitLocalDateTime(value) : null
    selectedDate.value = parts?.date ?? null
    selectedTime.value = parts?.time ?? null
    inputText.value = parts ? `${formatDateInput(parts.date)} · ${parts.time}` : ''
  }
}

function showPicker(): void {
  if (props.disabled || props.readonly) return
  syncFromModel(props.modelValue)
  restoreOnClose = true
  if (hasTime.value && !selectedTime.value) {
    const minimumTime = props.mode === 'time'
      ? normalizeTime(props.min ?? '', validStep(props.minuteStep))
      : splitLocalDateTime(props.min as LocalDateTime | undefined)?.time
    selectedTime.value = minimumTime ?? '09:00'
  }
  open.value = true
}

function commitInput(): void {
  if (props.mode === 'date') return
  const value = inputText.value.trim()
  if (!value) {
    if (props.required) localError.value = 'Este campo es obligatorio'
    else emit('update:modelValue', null)
    emit('blur')
    return
  }
  let parsed: string | null = null
  if (props.mode === 'time') parsed = normalizeTime(value, validStep(props.minuteStep))
  if (props.mode === 'datetime') {
    const match = /^(.+?)(?:\s*[·,]\s*|\s+)(\d{1,2}:\d{2})$/.exec(value)
    const date = match?.[1] ? parseDateInput(match[1]) : null
    const time = match?.[2] ? normalizeTime(match[2], validStep(props.minuteStep)) : null
    parsed = date && time ? joinLocalDateTime(date, time) : null
  }
  if (!parsed || !withinRange(parsed)) {
    localError.value = 'Ingresa un valor válido dentro del rango permitido'
  } else {
    localError.value = null
    emit('update:modelValue', parsed)
  }
  emit('blur')
}

function handleDateComplete(value: DateOnly): void {
  selectedDate.value = value
  if (!withinRange(value) || dateDisabled(value)) {
    localError.value = 'Ingresa una fecha válida dentro del rango permitido'
    return
  }
  localError.value = null
  if (props.modelValue !== value) emit('update:modelValue', value)
}

function commitDateInput(value: DateOnly | null, state: DateInputDraftState): void {
  if (state === 'empty') {
    selectedDate.value = null
    if (props.required) localError.value = 'Este campo es obligatorio'
    else {
      localError.value = null
      emit('update:modelValue', null)
    }
  } else if (state === 'partial') {
    localError.value = 'Completa la fecha'
  } else if (state === 'invalid' || !value || !withinRange(value) || dateDisabled(value)) {
    localError.value = 'Ingresa una fecha válida dentro del rango permitido'
  } else {
    selectedDate.value = value
    localError.value = null
    if (props.modelValue !== value) emit('update:modelValue', value)
  }
  emit('blur')
}

function selectDate(value: DateOnly): void {
  if (!dateDisabled(value)) selectedDate.value = value
}

function setTimePart(part: 'hour' | 'minute', value: string): void {
  const hour = part === 'hour' ? value : timeHours.value
  const minute = part === 'minute' ? value : timeMinutes.value
  selectedTime.value = `${hour}:${minute}`
}

function apply(): void {
  let value: string | null = null
  if (props.mode === 'date') value = selectedDate.value
  if (props.mode === 'time') value = selectedTime.value
  if (props.mode === 'datetime' && selectedDate.value && selectedTime.value) value = joinLocalDateTime(selectedDate.value, selectedTime.value)
  if (!value) {
    localError.value = 'Selecciona los valores requeridos'
    return
  }
  if (!withinRange(value)) {
    localError.value = 'La selección está fuera del rango permitido'
    return
  }
  localError.value = null
  emit('update:modelValue', value)
  restoreOnClose = false
  open.value = false
}

function cancelPicker(): void {
  open.value = false
}

function clear(): void {
  selectedDate.value = null
  selectedTime.value = null
  inputText.value = ''
  localError.value = null
  emit('update:modelValue', null)
  restoreOnClose = false
  open.value = false
}

function handleDialogClosed(): void {
  if (restoreOnClose) syncFromModel(props.modelValue)
  restoreOnClose = true
}

function dateDisabled(value: DateOnly): boolean {
  const min = datePart(props.min)
  const max = datePart(props.max)
  return Boolean((min && value < min) || (max && value > max) || props.isDateDisabled?.(value))
}

function withinRange(value: string): boolean {
  return (!props.min || value >= props.min) && (!props.max || value <= props.max)
}

function datePart(value?: string): DateOnly | undefined {
  const date = value?.slice(0, 10)
  return date && isDateOnly(date) ? date : undefined
}

function validStep(value: number): number {
  return Number.isInteger(value) && value > 0 && value <= 60 ? value : 5
}
</script>

<template>
  <div class="date-time-picker-root">
    <BaseField
      v-slot="{ describedBy }"
      :name="name"
      :label="label"
      :required="required"
      :hint="hint"
      :error="effectiveError"
      :disabled="disabled"
    >
      <div
        class="date-time-control"
        :class="{ 'date-time-control--invalid': effectiveError, 'date-time-control--disabled': disabled }"
        @keydown.down.prevent="showPicker"
        @keydown.esc="open = false"
      >
        <BaseDateInputSegments
          v-if="mode === 'date'"
          class="date-time-control__segments"
          :model-value="selectedDate"
          :name="name"
          :disabled="disabled"
          :readonly="readonly"
          :invalid="Boolean(effectiveError)"
          :required="required"
          :described-by="describedBy"
          :label="label"
          @complete="handleDateComplete"
          @commit="commitDateInput"
        />
        <input
          v-else
          :id="name"
          v-model="inputText"
          type="text"
          :name="name"
          :placeholder="mode === 'time' ? 'HH:mm' : 'DD / MM / AAAA · HH:mm'"
          :required="required"
          :disabled="disabled"
          :readonly="readonly"
          :aria-invalid="Boolean(effectiveError)"
          :aria-describedby="describedBy"
          @blur="commitInput"
        />
        <BaseIconButton :label="title" size="small" :disabled="disabled || readonly" @click="showPicker">
          <Clock3 v-if="mode === 'time'" :size="18" />
          <CalendarDays v-else :size="18" />
        </BaseIconButton>
        <BaseIconButton v-if="clearable && modelValue && !readonly" label="Limpiar" size="small" :disabled="disabled" @click="clear">
          <X :size="17" />
        </BaseIconButton>
      </div>
    </BaseField>

    <BaseDialog v-model="open" :title="title" size="compact" @closed="handleDialogClosed">
      <div class="picker">
        <BaseCalendar
          v-if="hasDate"
          mode="single"
          :selected="selectedDate"
          :min="datePart(min)"
          :max="datePart(max)"
          :is-date-disabled="isDateDisabled"
          @select="selectDate"
        />

        <section v-if="hasTime" class="time-picker" aria-label="Hora">
          <label>
            <span>Hora</span>
            <select :value="timeHours" @change="setTimePart('hour', ($event.target as HTMLSelectElement).value)">
              <option v-for="hour in 24" :key="hour - 1" :value="String(hour - 1).padStart(2, '0')">{{ String(hour - 1).padStart(2, '0') }}</option>
            </select>
          </label>
          <span aria-hidden="true">:</span>
          <label>
            <span>Minutos</span>
            <select :value="timeMinutes" @change="setTimePart('minute', ($event.target as HTMLSelectElement).value)">
              <option v-for="minute in minuteOptions" :key="minute" :value="String(minute).padStart(2, '0')">{{ String(minute).padStart(2, '0') }}</option>
            </select>
          </label>
        </section>
        <p v-if="localError" class="picker__error" role="alert">{{ localError }}</p>
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
.date-time-picker-root { width: 100%; min-width: 0; }
.date-time-control { display: flex; width: 100%; min-width: 0; min-height: 44px; box-sizing: border-box; align-items: center; overflow: hidden; border: 1px solid var(--control-border); border-radius: var(--radius-input); background: var(--surface); }
.date-time-control:focus-within { box-shadow: var(--focus-ring); }
.date-time-control--invalid { border-color: var(--danger); }
.date-time-control--disabled { background: var(--bg); }
.date-time-control input { width: 0; min-width: 0; flex: 1 1 0%; box-sizing: border-box; border: 0; outline: 0; background: transparent; padding: 0.65rem 0.75rem; color: var(--text); font-size: max(1rem, 16px); }
.date-time-control__segments { flex: 1 1 auto; padding: 0 0.75rem; }
.date-time-control :deep(.icon-button) { flex: 0 0 auto; }
.picker { display: grid; gap: 0.875rem; }
.time-picker { display: flex; align-items: flex-end; justify-content: center; gap: 0.6rem; }
.time-picker label { display: grid; gap: 0.3rem; color: var(--text-secondary); font-size: 0.75rem; }
.time-picker select { min-width: 5rem; min-height: 36px; border: 1px solid var(--control-border); border-radius: var(--radius-input); background: var(--surface); padding: 0.4rem 0.5rem; color: var(--text); }
.time-picker > span { padding-bottom: 0.45rem; font-size: 1.1rem; }
.picker__error { margin: 0; color: var(--danger); font-size: 0.8125rem; }

@media (max-width: 600px) {
  .time-picker select { min-height: 44px; font-size: 1rem; }
}
</style>
