<script setup lang="ts">
import BaseDateTimePicker from '@/components/base/BaseDateTimePicker.vue'
withDefaults(defineProps<{ modelValue: { from: string; to: string }; name?: string; disabled?: boolean; error?: string }>(),{ name:'date-range',disabled:false,error:undefined })
const emit=defineEmits<{ 'update:modelValue': [value: { from: string; to: string }] }>()
</script>
<template>
  <fieldset class="date-range-picker" :disabled="disabled">
    <legend class="visually-hidden">Rango de fechas</legend>
    <BaseDateTimePicker :model-value="modelValue.from" mode="date" :name="`${name}-from`" label="Desde" :disabled="disabled" :error="error" @update:model-value="emit('update:modelValue',{ ...modelValue,from:$event ?? '' })" />
    <BaseDateTimePicker :model-value="modelValue.to" mode="date" :name="`${name}-to`" label="Hasta" :disabled="disabled" :min="modelValue.from || undefined" @update:model-value="emit('update:modelValue',{ ...modelValue,to:$event ?? '' })" />
  </fieldset>
</template>
<style scoped>
.date-range-picker { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0.5rem; min-width:0; margin:0; padding:0; border:0; }
.visually-hidden { position:absolute; width:1px; height:1px; margin:-1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
</style>
