<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

import { isDateOnly, parseDateOnly, toDateOnly } from '@/helpers/dateTime'
import type { DateOnly } from '@/types/domain'

type DateInputDraftState = 'empty' | 'partial' | 'valid' | 'invalid'
type Segment = 'day' | 'month' | 'year'

const props = withDefaults(defineProps<{
  modelValue: DateOnly | null
  name: string
  disabled?: boolean
  readonly?: boolean
  invalid?: boolean
  required?: boolean
  describedBy?: string
  label?: string
}>(), {
  disabled: false,
  readonly: false,
  invalid: false,
  required: false,
  describedBy: undefined,
  label: 'Fecha',
})

const emit = defineEmits<{
  commit: [value: DateOnly | null, state: DateInputDraftState]
  complete: [value: DateOnly]
}>()

const root = ref<HTMLElement | null>(null)
const dayInput = ref<HTMLInputElement | null>(null)
const monthInput = ref<HTMLInputElement | null>(null)
const yearInput = ref<HTMLInputElement | null>(null)
const day = ref('')
const month = ref('')
const year = ref('')

watch(() => props.modelValue, syncFromModel, { immediate: true })

function syncFromModel(value: DateOnly | null): void {
  const parts = value && isDateOnly(value) ? parseDateOnly(value) : null
  day.value = parts ? String(parts.day).padStart(2, '0') : ''
  month.value = parts ? String(parts.month).padStart(2, '0') : ''
  year.value = parts ? String(parts.year).padStart(4, '0') : ''
}

function draft(): { value: DateOnly | null; state: DateInputDraftState } {
  if (!day.value && !month.value && !year.value) return { value: null, state: 'empty' }
  if (day.value.length !== 2 || month.value.length !== 2 || year.value.length !== 4) return { value: null, state: 'partial' }
  const value = toDateOnly({ day: Number(day.value), month: Number(month.value), year: Number(year.value) })
  return isDateOnly(value) ? { value, state: 'valid' } : { value: null, state: 'invalid' }
}

function segmentRef(segment: Segment): HTMLInputElement | null {
  if (segment === 'day') return dayInput.value
  if (segment === 'month') return monthInput.value
  return yearInput.value
}

function nextSegment(segment: Segment): Segment | null {
  if (segment === 'day') return 'month'
  if (segment === 'month') return 'year'
  return null
}

function previousSegment(segment: Segment): Segment | null {
  if (segment === 'year') return 'month'
  if (segment === 'month') return 'day'
  return null
}

function focusSegment(segment: Segment | null): void {
  if (!segment) return
  const input = segmentRef(segment)
  input?.focus()
  input?.select()
}

function updateSegment(segment: Segment, rawValue: string): void {
  const maxLength = segment === 'year' ? 4 : 2
  const value = rawValue.replace(/\D/g, '').slice(0, maxLength)
  if (segment === 'day') day.value = value
  else if (segment === 'month') month.value = value
  else year.value = value

  const current = draft()
  if (current.state === 'valid' && current.value) emit('complete', current.value)
  if (value.length === maxLength) focusSegment(nextSegment(segment))
}

function handleInput(segment: Segment, event: Event): void {
  updateSegment(segment, (event.currentTarget as HTMLInputElement).value)
}

function handleKeydown(segment: Segment, event: KeyboardEvent): void {
  const input = event.currentTarget as HTMLInputElement
  if (['/', '-', '.'].includes(event.key)) {
    event.preventDefault()
    if (input.value.length > 0) focusSegment(nextSegment(segment))
    return
  }
  if (event.key === 'Backspace' && input.value.length === 0) {
    const previous = previousSegment(segment)
    if (previous) {
      event.preventDefault()
      focusSegment(previous)
    }
    return
  }
  if (event.key === 'ArrowLeft' && input.selectionStart === 0) {
    const previous = previousSegment(segment)
    if (previous) {
      event.preventDefault()
      focusSegment(previous)
    }
    return
  }
  if (event.key === 'ArrowRight' && input.selectionEnd === input.value.length) {
    const next = nextSegment(segment)
    if (next) {
      event.preventDefault()
      focusSegment(next)
    }
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    commit()
  }
}

function handlePaste(event: ClipboardEvent): void {
  const raw = event.clipboardData?.getData('text')?.trim() ?? ''
  if (!raw) return
  let parts = isDateOnly(raw) ? parseDateOnly(raw) : null
  if (!parts) {
    const match = /^(\d{1,2})\D+(\d{1,2})\D+(\d{4})$/.exec(raw)
    if (match) parts = { day: Number(match[1]), month: Number(match[2]), year: Number(match[3]) }
  }
  if (!parts) {
    const digits = raw.replace(/\D/g, '')
    if (digits.length === 8) parts = { day: Number(digits.slice(0, 2)), month: Number(digits.slice(2, 4)), year: Number(digits.slice(4, 8)) }
  }
  if (!parts) return
  const value = toDateOnly(parts)
  if (!isDateOnly(value)) return
  event.preventDefault()
  day.value = String(parts.day).padStart(2, '0')
  month.value = String(parts.month).padStart(2, '0')
  year.value = String(parts.year).padStart(4, '0')
  emit('complete', value)
  yearInput.value?.focus()
  yearInput.value?.select()
}

function commit(): void {
  const current = draft()
  emit('commit', current.value, current.state)
}

function handleBlur(): void {
  void nextTick(() => {
    if (!root.value?.contains(document.activeElement)) commit()
  })
}

function selectAll(event: FocusEvent): void {
  (event.currentTarget as HTMLInputElement).select()
}

function focus(): void {
  dayInput.value?.focus()
  dayInput.value?.select()
}

defineExpose({ focus })
</script>

<template>
  <div ref="root" class="date-segments" role="group" @paste="handlePaste">
    <input
      :id="name"
      ref="dayInput"
      v-model="day"
      :name="`${name}-day`"
      class="date-segments__part date-segments__part--short"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      maxlength="2"
      placeholder="DD"
      :aria-label="`${label}: día`"
      :aria-invalid="invalid"
      :aria-required="required"
      :aria-describedby="describedBy"
      :disabled="disabled"
      :readonly="readonly"
      @input="handleInput('day', $event)"
      @keydown="handleKeydown('day', $event)"
      @blur="handleBlur"
      @focus="selectAll"
    />
    <span class="date-segments__separator" aria-hidden="true">/</span>
    <input
      ref="monthInput"
      v-model="month"
      :name="`${name}-month`"
      class="date-segments__part date-segments__part--short"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      maxlength="2"
      placeholder="MM"
      :aria-label="`${label}: mes`"
      :aria-invalid="invalid"
      :aria-required="required"
      :aria-describedby="describedBy"
      :disabled="disabled"
      :readonly="readonly"
      @input="handleInput('month', $event)"
      @keydown="handleKeydown('month', $event)"
      @blur="handleBlur"
      @focus="selectAll"
    />
    <span class="date-segments__separator" aria-hidden="true">/</span>
    <input
      ref="yearInput"
      v-model="year"
      :name="`${name}-year`"
      class="date-segments__part date-segments__part--year"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      maxlength="4"
      placeholder="AAAA"
      :aria-label="`${label}: año`"
      :aria-invalid="invalid"
      :aria-required="required"
      :aria-describedby="describedBy"
      :disabled="disabled"
      :readonly="readonly"
      @input="handleInput('year', $event)"
      @keydown="handleKeydown('year', $event)"
      @blur="handleBlur"
      @focus="selectAll"
    />
  </div>
</template>

<style scoped>
.date-segments {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 0.12rem;
  font-variant-numeric: tabular-nums;
}

.date-segments__part {
  min-width: 0;
  min-height: 42px;
  border: 0;
  outline: 0;
  background: transparent;
  padding: 0;
  color: var(--text);
  font-size: max(1rem, 16px);
  line-height: 1;
  text-align: center;
}

.date-segments__part--short { width: 2.15ch; }
.date-segments__part--year { width: 4.4ch; }
.date-segments__part::placeholder { color: var(--text-muted); opacity: 0.58; }
.date-segments__part:disabled { cursor: not-allowed; }
.date-segments__separator { color: var(--text-muted); opacity: 0.72; user-select: none; }
</style>
