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
/* The report charts use a fixed light palette, even when the SPA is in dark mode.
   Set the tokens at the actual dialog root, outside .report-document's scope. */
.report-chart-dialog{
  --report-ink:#203645;
  --report-muted:#536b7b;
  --report-border:#dbe5eb;
  --report-accent:#247d9f;
  --report-light:#f4f8fa;
  --surface:#fff;
  --text:#203645;
  --text-secondary:#536b7b;
  --hover:#eef5f8;
  background:#fff;
  color:#203645;
  color-scheme:light;
  border-color:#dbe5eb;
  overflow:hidden;
}
.report-chart-dialog :deep(.base-dialog__panel){
  grid-template-rows:auto minmax(0,1fr);
  background:#fff;
  color:#203645;
}
.report-chart-dialog :deep(.base-dialog__header){
  position:relative;
  z-index:1;
  align-items:flex-start;
  border-bottom:1px solid #e5edf1;
  padding:1rem 1.25rem .85rem;
  background:#fff;
  color:#203645;
}
.report-chart-dialog :deep(.base-dialog__header h2){
  font-size:1.06rem;
  line-height:1.35;
  font-weight:670;
  color:#203645;
}
.report-chart-dialog :deep(.base-dialog__header p){
  margin:.4rem 0 0;
  font-size:.78rem;
  line-height:1.5;
  color:#536b7b;
}
.report-chart-dialog :deep(.base-dialog__header .icon-button){color:#536b7b}
.report-chart-dialog :deep(.base-dialog__header .icon-button:hover){color:#203645;background:#eef5f8}
.report-chart-dialog :deep(.base-dialog__body){
  min-height:0;
  overflow-y:auto;
  overscroll-behavior:contain;
  padding:.85rem 1.25rem 1.2rem;
  background:#fff;
  color:#203645;
}
.report-chart-dialog__content{min-width:0;color:#203645}
@media(max-width:600px){
  .report-chart-dialog{
    width:100vw;
    max-width:100vw;
    max-height:calc(100dvh - .35rem);
    margin:auto 0 0;
    border-radius:16px 16px 0 0;
  }
  .report-chart-dialog :deep(.base-dialog__header){padding:.9rem 1rem .75rem}
  .report-chart-dialog :deep(.base-dialog__header h2){font-size:1rem;line-height:1.32}
  .report-chart-dialog :deep(.base-dialog__header p){font-size:.77rem;margin:.3rem 0 0}
  .report-chart-dialog :deep(.base-dialog__body){
    padding:.7rem .95rem calc(.9rem + env(safe-area-inset-bottom));
  }
}
@media print{.report-chart-dialog{display:none!important}}
</style>
