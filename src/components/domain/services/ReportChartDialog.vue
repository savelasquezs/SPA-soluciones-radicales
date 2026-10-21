<script setup lang="ts">
import BaseDialog from '@/components/base/BaseDialog.vue'

defineProps<{open:boolean;title:string}>()
const emit=defineEmits<{close:[]}>()
</script>

<template>
  <BaseDialog class="report-chart-dialog" size="wide" :model-value="open"
    :title="title"
    @update:model-value="value => { if (!value) emit('close') }">
    <div class="report-chart-dialog__content"><slot /></div>
  </BaseDialog>
</template>

<style scoped>
/* The dialog lives inside .report-document: use its light/dark chart tokens. */
.report-chart-dialog{
  background:var(--report-surface);
  color:var(--report-ink);
  border-color:var(--report-border);
  color-scheme:inherit;
  overflow:hidden;
}
.report-chart-dialog :deep(.base-dialog__panel){
  grid-template-rows:auto minmax(0,1fr);
  background:var(--report-surface);
  color:var(--report-ink);
}
.report-chart-dialog :deep(.base-dialog__header){
  position:relative;
  z-index:1;
  align-items:flex-start;
  border-bottom:1px solid var(--report-border);
  padding:1rem 1.25rem .85rem;
  background:var(--report-surface);
  color:var(--report-ink);
}
.report-chart-dialog :deep(.base-dialog__header h2){
  font-size:1.06rem;
  line-height:1.35;
  font-weight:670;
  color:var(--report-ink);
}
.report-chart-dialog :deep(.base-dialog__header p){
  margin:.4rem 0 0;
  font-size:.78rem;
  line-height:1.5;
  color:var(--report-muted);
}
.report-chart-dialog :deep(.base-dialog__header .icon-button){color:var(--report-muted)}
.report-chart-dialog :deep(.base-dialog__header .icon-button:hover){
  color:var(--report-ink);
  background:var(--report-light);
}
.report-chart-dialog :deep(.base-dialog__body){
  min-height:0;
  overflow-y:auto;
  overscroll-behavior:contain;
  padding:.85rem 1.25rem 1.2rem;
  background:var(--report-surface);
  color:var(--report-ink);
}
.report-chart-dialog__content{min-width:0;color:var(--report-ink)}
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
