<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'

import BaseIconButton from '@/components/base/BaseIconButton.vue'
import {
  compareDateOnly,
  daysInMonth,
  firstWeekdayMonday,
  formatDateOnly,
  monthName,
  parseDateOnly,
  shiftDate,
  shiftMonth,
  todayInTimeZone,
  toDateOnly,
} from '@/helpers/dateTime'
import type { DateOnly } from '@/types/domain'

type CalendarMode = 'single' | 'range'
type CalendarCell = { key: string; date: DateOnly | null; day: number | null }

const props = withDefaults(defineProps<{
  mode?: CalendarMode
  selected?: DateOnly | null
  rangeStart?: DateOnly | null
  rangeEnd?: DateOnly | null
  min?: DateOnly
  max?: DateOnly
  isDateDisabled?: (value: DateOnly) => boolean
}>(), {
  mode: 'single',
  selected: null,
  rangeStart: null,
  rangeEnd: null,
  min: undefined,
  max: undefined,
  isDateDisabled: undefined,
})

const emit = defineEmits<{ select: [value: DateOnly] }>()
const today = ref(todayInTimeZone())
const initial = parseDateOnly(anchorDate())!
const viewYear = ref(initial.year)
const viewMonth = ref(initial.month)
const calendarButtons = ref<Record<string, HTMLButtonElement | null>>({})
const weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const yearOptions = computed(() => {
  const minYear = parseDateOnly(props.min)?.year ?? viewYear.value - 80
  const maxYear = parseDateOnly(props.max)?.year ?? viewYear.value + 20
  return Array.from({ length: maxYear - minYear + 1 }, (_, index) => minYear + index)
})

const calendarCells = computed<CalendarCell[]>(() => {
  const blanks = firstWeekdayMonday(viewYear.value, viewMonth.value)
  const count = daysInMonth(viewYear.value, viewMonth.value)
  const cells: CalendarCell[] = Array.from({ length: blanks }, (_, index) => ({ key: `blank-${index}`, date: null, day: null }))
  for (let day = 1; day <= count; day += 1) {
    const date = toDateOnly({ year: viewYear.value, month: viewMonth.value, day })
    cells.push({ key: date, date, day })
  }
  while (cells.length % 7 !== 0) cells.push({ key: `tail-${cells.length}`, date: null, day: null })
  return cells
})

watch(() => anchorDate(), (value) => {
  const parts = parseDateOnly(value)
  if (!parts || (parts.year === viewYear.value && parts.month === viewMonth.value)) return
  viewYear.value = parts.year
  viewMonth.value = parts.month
})

function anchorDate(): DateOnly {
  if (props.mode === 'range') return props.rangeStart ?? props.rangeEnd ?? today.value
  return props.selected ?? today.value
}

function changeMonth(amount: number): void {
  const next = shiftMonth(viewYear.value, viewMonth.value, amount)
  viewYear.value = next.year
  viewMonth.value = next.month
}

function selectDate(value: DateOnly): void {
  if (!dateDisabled(value)) emit('select', value)
}

function chooseToday(): void {
  selectDate(today.value)
  const parts = parseDateOnly(today.value)!
  viewYear.value = parts.year
  viewMonth.value = parts.month
}

function dateDisabled(value: DateOnly): boolean {
  return Boolean((props.min && compareDateOnly(value, props.min) < 0)
    || (props.max && compareDateOnly(value, props.max) > 0)
    || props.isDateDisabled?.(value))
}

function isSelected(value: DateOnly): boolean {
  return props.mode === 'single' && props.selected === value
}

function isRangeStart(value: DateOnly): boolean {
  return props.mode === 'range' && props.rangeStart === value
}

function isRangeEnd(value: DateOnly): boolean {
  return props.mode === 'range' && props.rangeEnd === value
}

function isInRange(value: DateOnly): boolean {
  return Boolean(props.mode === 'range' && props.rangeStart && props.rangeEnd
    && compareDateOnly(value, props.rangeStart) > 0
    && compareDateOnly(value, props.rangeEnd) < 0)
}

function moveFocus(date: DateOnly, amount: number): void {
  const next = shiftDate(date, amount)
  focusDate(next)
}

function moveMonthFocus(date: DateOnly, amount: number): void {
  const parts = parseDateOnly(date)
  if (!parts) return
  const targetMonth = shiftMonth(parts.year, parts.month, amount)
  const next = toDateOnly({ ...targetMonth, day: Math.min(parts.day, daysInMonth(targetMonth.year, targetMonth.month)) })
  focusDate(next)
}

function focusDate(date: DateOnly): void {
  const parts = parseDateOnly(date)
  if (!parts || dateDisabled(date)) return
  viewYear.value = parts.year
  viewMonth.value = parts.month
  void nextTick(() => calendarButtons.value[date]?.focus())
}

function handleDateKeydown(event: KeyboardEvent, date: DateOnly): void {
  const movements: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
  const movement = movements[event.key]
  if (movement) {
    event.preventDefault()
    moveFocus(date, movement)
    return
  }
  if (event.key === 'PageUp' || event.key === 'PageDown') {
    event.preventDefault()
    moveMonthFocus(date, event.key === 'PageUp' ? -1 : 1)
    return
  }
  if (event.key === 'Home' || event.key === 'End') {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
    const mondayIndex = weekday === 0 ? 6 : weekday - 1
    event.preventDefault()
    moveFocus(date, event.key === 'Home' ? -mondayIndex : 6 - mondayIndex)
  }
}
</script>

<template>
  <section class="calendar" aria-label="Calendario">
    <div class="calendar__toolbar">
      <BaseIconButton label="Mes anterior" size="small" @click="changeMonth(-1)"><ChevronLeft :size="17" /></BaseIconButton>
      <div class="calendar__selectors">
        <label>
          <span class="sr-only">Mes</span>
          <select v-model.number="viewMonth" aria-label="Mes">
            <option v-for="month in 12" :key="month" :value="month">{{ monthName(month) }}</option>
          </select>
        </label>
        <label>
          <span class="sr-only">Año</span>
          <select v-model.number="viewYear" aria-label="Año">
            <option v-for="year in yearOptions" :key="year" :value="year">{{ year }}</option>
          </select>
        </label>
      </div>
      <BaseIconButton label="Mes siguiente" size="small" @click="changeMonth(1)"><ChevronRight :size="17" /></BaseIconButton>
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
          :class="{
            'is-selected': isSelected(cell.date),
            'is-today': today === cell.date,
            'is-range-start': isRangeStart(cell.date),
            'is-range-end': isRangeEnd(cell.date),
            'is-in-range': isInRange(cell.date),
          }"
          :aria-label="formatDateOnly(cell.date, true)"
          :aria-current="today === cell.date ? 'date' : undefined"
          :aria-pressed="isSelected(cell.date) || isRangeStart(cell.date) || isRangeEnd(cell.date)"
          @click="selectDate(cell.date)"
          @keydown="handleDateKeydown($event, cell.date)"
        >{{ cell.day }}</button>
      </template>
    </div>
    <button class="calendar__today" type="button" :disabled="dateDisabled(today)" @click="chooseToday">Hoy</button>
  </section>
</template>

<style scoped>
.calendar { display: grid; gap: 0.55rem; }
.calendar__toolbar { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 0.35rem; }
.calendar__selectors { display: flex; min-width: 0; justify-content: center; gap: 0.35rem; }
.calendar__selectors select {
  min-height: 34px;
  border: 1px solid var(--control-border);
  border-radius: var(--radius-button);
  background: var(--surface);
  padding: 0.32rem 0.45rem;
  color: var(--text);
  font-size: 0.8125rem;
  text-transform: capitalize;
}
.calendar__weekdays,
.calendar__grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 0.125rem; text-align: center; }
.calendar__weekdays { color: var(--text-muted); font-size: 0.6875rem; font-weight: 600; }
.calendar__weekdays span { display: grid; min-height: 24px; place-items: center; }
.calendar__grid button,
.calendar__grid > span { min-width: 0; min-height: 34px; }
.calendar__grid button {
  position: relative;
  border: 1px solid transparent;
  border-radius: var(--radius-button);
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
}
.calendar__grid button:hover:not(:disabled) { background: var(--hover); }
.calendar__grid button.is-today { border-color: var(--accent); }
.calendar__grid button.is-in-range { border-radius: var(--radius-sm); background: var(--accent-subtle); }
.calendar__grid button.is-selected,
.calendar__grid button.is-range-start,
.calendar__grid button.is-range-end { background: var(--accent); color: var(--on-accent); }
.calendar__grid button:disabled { color: var(--text-muted); opacity: 0.4; cursor: not-allowed; }
.calendar__today {
  justify-self: center;
  min-height: 30px;
  border: 0;
  border-radius: var(--radius-button);
  background: transparent;
  padding: 0.25rem 0.55rem;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 600;
}
.calendar__today:hover:not(:disabled) { background: var(--hover); color: var(--text); }
.calendar__today:disabled { opacity: 0.45; cursor: not-allowed; }

@media (max-width: 600px) {
  .calendar__toolbar :deep(.icon-button) { min-width: 44px; min-height: 44px; }
  .calendar__selectors select { min-height: 44px; font-size: 1rem; }
  .calendar__grid button,
  .calendar__grid > span { min-height: 44px; }
  .calendar__grid button { font-size: 0.9375rem; }
  .calendar__today { min-height: 44px; }
}

@media (max-width: 360px) {
  .calendar__grid { gap: 0; }
}
</style>
