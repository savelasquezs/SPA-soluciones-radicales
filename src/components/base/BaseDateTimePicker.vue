<script setup lang="ts">
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, X } from 'lucide-vue-next'
import { computed, nextTick, ref, useId, watch } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/base/BaseDialog.vue'
import BaseField from '@/components/base/BaseField.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import {
  compareDateOnly,
  daysInMonth,
  firstWeekdayMonday,
  formatDateInput,
  formatDateOnly,
  formatLocalDateTime,
  isDateOnly,
  isLocalDateTime,
  isTimeOnly,
  joinLocalDateTime,
  monthName,
  normalizeTime,
  parseDateInput,
  parseDateOnly,
  shiftDate,
  shiftMonth,
  splitLocalDateTime,
  todayInTimeZone,
} from '@/helpers/dateTime'
import type { DateOnly, LocalDateTime, TimeOnly } from '@/types/domain'

type PickerMode = 'date' | 'time' | 'datetime'
type CalendarCell = { key: string; date: DateOnly | null; day: number | null }

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
const today = ref(todayInTimeZone())
const initialParts = parseDateOnly(today.value)!
const viewYear = ref(initialParts.year)
const viewMonth = ref(initialParts.month)
const calendarButtons = ref<Record<string, HTMLButtonElement | null>>({})

const weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const effectiveError = computed(() => props.error ?? localError.value ?? undefined)
const hasDate = computed(() => props.mode !== 'time')
const hasTime = computed(() => props.mode !== 'date')
const title = computed(() => props.mode === 'date' ? 'Seleccionar fecha' : props.mode === 'time' ? 'Seleccionar hora' : 'Seleccionar fecha y hora')
const yearOptions = computed(() => {
  const minYear = parseDateOnly(datePart(props.min))?.year ?? viewYear.value - 80
  const maxYear = parseDateOnly(datePart(props.max))?.year ?? viewYear.value + 20
  return Array.from({ length: maxYear - minYear + 1 }, (_, index) => minYear + index)
})
const minuteOptions = computed(() => {
  const step = validStep(props.minuteStep)
  return Array.from({ length: Math.ceil(60 / step) }, (_, index) => index * step).filter((value) => value < 60)
})
const calendarCells = computed<CalendarCell[]>(() => {
  const blanks = firstWeekdayMonday(viewYear.value, viewMonth.value)
  const count = daysInMonth(viewYear.value, viewMonth.value)
  const cells: CalendarCell[] = Array.from({ length: blanks }, (_, index) => ({ key: `blank-${index}`, date: null, day: null }))
  for (let day = 1; day <= count; day += 1) {
    const date = `${viewYear.value}-${String(viewMonth.value).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    cells.push({ key: date, date, day })
  }
  while (cells.length % 7 !== 0) cells.push({ key: `tail-${cells.length}`, date: null, day: null })
  return cells
})
const timeHours = computed(() => selectedTime.value?.slice(0, 2) ?? '09')
const timeMinutes = computed(() => selectedTime.value?.slice(3, 5) ?? String(minuteOptions.value[0] ?? 0).padStart(2, '0'))

watch(() => props.modelValue, syncFromModel, { immediate: true })

function syncFromModel(value: string | null): void {
  localError.value = null
  if (props.mode === 'date') {
    selectedDate.value = value && isDateOnly(value) ? value : null
    selectedTime.value = null
    inputText.value = selectedDate.value ? formatDateInput(selectedDate.value) : ''
  } else if (props.mode === 'time') {
    selectedDate.value = null
    selectedTime.value = value && isTimeOnly(value) ? value : null
    inputText.value = selectedTime.value ?? ''
  } else {
    const parts = value && isLocalDateTime(value) ? splitLocalDateTime(value) : null
    selectedDate.value = parts?.date ?? null
    selectedTime.value = parts?.time ?? null
    inputText.value = parts ? formatLocalDateTime(value as LocalDateTime) : ''
  }
  const parts = parseDateOnly(selectedDate.value ?? today.value)
  if (parts) {
    viewYear.value = parts.year
    viewMonth.value = parts.month
  }
}

function showPicker(): void {
  if (props.disabled || props.readonly) return
  syncFromModel(props.modelValue)
  if (hasTime.value && !selectedTime.value) {
    const minimumTime = props.mode === 'time'
      ? normalizeTime(props.min ?? '', validStep(props.minuteStep))
      : splitLocalDateTime(props.min as LocalDateTime | undefined)?.time
    selectedTime.value = minimumTime ?? '09:00'
  }
  open.value = true
}

function commitInput(): void {
  const value = inputText.value.trim()
  if (!value) {
    if (props.required) localError.value = 'Este campo es obligatorio'
    else emit('update:modelValue', null)
    emit('blur')
    return
  }
  let parsed: string | null = null
  if (props.mode === 'date') parsed = parseDateInput(value)
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

function selectDate(value: DateOnly): void {
  if (dateDisabled(value)) return
  selectedDate.value = value
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
  open.value = false
}

function clear(): void {
  selectedDate.value = null
  selectedTime.value = null
  localError.value = null
  emit('update:modelValue', null)
  open.value = false
}

function chooseToday(): void {
  if (!dateDisabled(today.value)) {
    selectedDate.value = today.value
    const parts = parseDateOnly(today.value)!
    viewYear.value = parts.year
    viewMonth.value = parts.month
  }
}

function changeMonth(amount: number): void {
  const next = shiftMonth(viewYear.value, viewMonth.value, amount)
  viewYear.value = next.year
  viewMonth.value = next.month
}

function moveFocus(date: DateOnly, amount: number): void {
  const next = shiftDate(date, amount)
  const parts = parseDateOnly(next)!
  viewYear.value = parts.year
  viewMonth.value = parts.month
  void nextTick(() => calendarButtons.value[next]?.focus())
}

function handleDateKeydown(event: KeyboardEvent, date: DateOnly): void {
  const movements: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
  const movement = movements[event.key]
  if (movement) {
    event.preventDefault()
    moveFocus(date, movement)
  }
}

function dateDisabled(value: DateOnly): boolean {
  const min = datePart(props.min)
  const max = datePart(props.max)
  return Boolean((min && compareDateOnly(value, min) < 0)
    || (max && compareDateOnly(value, max) > 0)
    || props.isDateDisabled?.(value))
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
  <BaseField
    v-slot="{ describedBy }"
    :name="name"
    :label="label"
    :required="required"
    :hint="hint"
    :error="effectiveError"
    :disabled="disabled"
  >
    <div class="date-time-control" :class="{ 'date-time-control--invalid': effectiveError, 'date-time-control--disabled': disabled }">
      <input
        :id="name"
        v-model="inputText"
        type="text"
        :name="name"
        :placeholder="mode === 'time' ? 'HH:mm' : mode === 'date' ? 'DD / MM / AAAA' : 'DD / MM / AAAA · HH:mm'"
        :required="required"
        :disabled="disabled"
        :readonly="readonly"
        :aria-invalid="Boolean(effectiveError)"
        :aria-describedby="describedBy"
        @blur="commitInput"
        @keydown.down.prevent="showPicker"
        @keydown.esc="open = false"
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

  <BaseDialog v-model="open" :title="title">
    <div class="picker">
      <section v-if="hasDate" class="calendar" aria-label="Calendario">
        <div class="calendar__toolbar">
          <BaseIconButton label="Mes anterior" size="small" @click="changeMonth(-1)"><ChevronLeft :size="18" /></BaseIconButton>
          <div class="calendar__selectors">
            <label>
              <span class="sr-only">Mes</span>
              <select v-model.number="viewMonth">
                <option v-for="month in 12" :key="month" :value="month">{{ monthName(month) }}</option>
              </select>
            </label>
            <label>
              <span class="sr-only">Año</span>
              <select v-model.number="viewYear">
                <option v-for="year in yearOptions" :key="year" :value="year">{{ year }}</option>
              </select>
            </label>
          </div>
          <BaseIconButton label="Mes siguiente" size="small" @click="changeMonth(1)"><ChevronRight :size="18" /></BaseIconButton>
        </div>
        <div class="calendar__weekdays" aria-hidden="true"><span v-for="day in weekdays" :key="day">{{ day }}</span></div>
        <div class="calendar__grid">
          <template v-for="cell in calendarCells" :key="cell.key">
            <span v-if="!cell.date" aria-hidden="true"></span>
            <button
              v-else
              :ref="(element) => { calendarButtons[cell.date!] = element as HTMLButtonElement | null }"
              type="button"
              :disabled="dateDisabled(cell.date)"
              :class="{ 'is-selected': selectedDate === cell.date, 'is-today': today === cell.date }"
              :aria-label="formatDateOnly(cell.date, true)"
              :aria-current="today === cell.date ? 'date' : undefined"
              :aria-pressed="selectedDate === cell.date"
              @click="selectDate(cell.date)"
              @keydown="handleDateKeydown($event, cell.date)"
            >{{ cell.day }}</button>
          </template>
        </div>
        <BaseButton variant="ghost" @click="chooseToday">Hoy</BaseButton>
      </section>

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
      <BaseButton v-if="clearable" variant="ghost" @click="clear">Limpiar</BaseButton>
      <BaseButton variant="secondary" @click="open = false">Cancelar</BaseButton>
      <BaseButton @click="apply">Aplicar</BaseButton>
    </template>
  </BaseDialog>
</template>

<style scoped>
.date-time-control { display: flex; min-height: 44px; align-items: center; border: 1px solid var(--control-border); border-radius: var(--radius-input); background: var(--surface); }
.date-time-control:focus-within { box-shadow: var(--focus-ring); }
.date-time-control--invalid { border-color: var(--danger); }
.date-time-control--disabled { background: var(--bg); }
.date-time-control input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; padding: 0.65rem 0.75rem; color: var(--text); font-size: max(1rem, 16px); }
.picker { display: grid; gap: 1.5rem; }
.calendar { display: grid; gap: 0.75rem; }
.calendar__toolbar { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 0.5rem; }
.calendar__selectors { display: flex; min-width: 0; justify-content: center; gap: 0.5rem; }
.calendar select, .time-picker select { min-height: 44px; border: 1px solid var(--control-border); border-radius: var(--radius-input); background: var(--surface); padding: 0.5rem; color: var(--text); }
.calendar__weekdays, .calendar__grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 0.25rem; text-align: center; }
.calendar__weekdays { color: var(--text-secondary); font-size: 0.75rem; font-weight: 500; }
.calendar__grid button, .calendar__grid > span { min-width: 44px; min-height: 44px; }
.calendar__grid button { border: 1px solid transparent; border-radius: var(--radius-button); background: transparent; color: var(--text); cursor: pointer; }
.calendar__grid button:hover:not(:disabled) { background: var(--hover); }
.calendar__grid button.is-today { border-color: var(--accent); }
.calendar__grid button.is-selected { background: var(--accent); color: var(--on-accent); }
.calendar__grid button:disabled { color: var(--text-muted); opacity: 0.45; cursor: not-allowed; }
.time-picker { display: flex; align-items: flex-end; justify-content: center; gap: 0.75rem; }
.time-picker label { display: grid; gap: 0.5rem; color: var(--text-secondary); font-size: 0.8125rem; }
.time-picker select { min-width: 6rem; font-size: 1rem; }
.time-picker > span { padding-bottom: 0.65rem; font-size: 1.25rem; }
.picker__error { margin: 0; color: var(--danger); font-size: 0.8125rem; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

@media (max-width: 520px) {
  .calendar__selectors { gap: 0.25rem; }
  .calendar__selectors select { max-width: 8rem; }
  .calendar__grid button, .calendar__grid > span { min-width: 0; min-height: 44px; }
}
</style>
