<script setup lang="ts">
import { computed } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'
import { formatServiceDate } from '@/helpers/adminServices'
import type { ScheduleConflict } from '@/types/adminServices'
const props=defineProps<{ error: string; conflict: boolean; overlaps: ScheduleConflict[]; overlapOpen: boolean; saving: boolean }>()
const emit=defineEmits<{ reload: []; accept: []; cancel: [] }>()
const warning=computed(()=>props.overlaps.slice(0,3).map(item=>`${item.solicitud}: ${item.tecnicos.join(', ')} · ${formatServiceDate(item.inicioProgramado)} ${formatServiceDate(item.inicioProgramado,true)}`).join('; ')
  + '. Los servicios existentes no se moverán y el equipo seleccionado se conservará.')
</script>
<template>
  <div v-if="error" class="svc-inline-error" role="alert">
    <span>{{ error }}</span>
    <BaseButton v-if="conflict" size="compact" variant="secondary" :disabled="saving" @click="emit('reload')">Revisar versión actual</BaseButton>
  </div>
  <ConfirmDialog :open="overlapOpen" title="Cruce de horarios" :message="warning" confirm-label="Guardar de todos modos" :loading="saving" @confirm="emit('accept')" @cancel="emit('cancel')" />
</template>
