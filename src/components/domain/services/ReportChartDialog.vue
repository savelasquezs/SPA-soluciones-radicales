<script setup lang="ts">
import BaseDialog from '@/components/base/BaseDialog.vue'

defineProps<{open:boolean;title:string;description:string}>()
const emit=defineEmits<{close:[]}>()
</script>

<template>
  <BaseDialog class="report-chart-dialog" size="wide" :model-value="open"
    :title="title" :description="description"
    @update:model-value="value => { if (!value) emit('close') }">
    <div class="report-chart-dialog__content"><slot /></div>
  </BaseDialog>
</template>

<style scoped>
.report-chart-dialog :deep(.base-dialog__header){padding:1.15rem 1.35rem 0}
.report-chart-dialog :deep(.base-dialog__header h2){font-weight:650;font-size:1.04rem}
.report-chart-dialog :deep(.base-dialog__header p){margin:.3rem 0 0;font-size:.81rem}
.report-chart-dialog :deep(.base-dialog__body){padding:1rem 1.35rem 1.25rem}
.report-chart-dialog__content{min-width:0}
@media(max-width:600px){
  .report-chart-dialog{width:100vw;max-height:calc(100dvh - .3rem);border-radius:15px 15px 0 0}
  .report-chart-dialog :deep(.base-dialog__header){padding:1rem 1rem 0}
  .report-chart-dialog :deep(.base-dialog__body){padding:.85rem 1rem calc(1.25rem + env(safe-area-inset-bottom))}
}
@media print{.report-chart-dialog{display:none!important}}
</style>
