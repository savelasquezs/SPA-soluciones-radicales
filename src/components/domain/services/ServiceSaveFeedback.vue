<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import ServiceConflictResolver from './ServiceConflictResolver.vue'
import type { ScheduleConflict, ScheduleResolution, ServiceSchedule, ServiceTechnician } from '@/types/adminServices'
withDefaults(defineProps<{
  error:string; conflict:boolean; overlaps:ScheduleConflict[]
  overlapOpen:boolean; saving:boolean; technicians?:ServiceTechnician[]; schedules?:ServiceSchedule[]
  currentClientName?:string; currentServiceIsNew?:boolean
}>(),{technicians:()=>[],schedules:()=>[],currentClientName:'',currentServiceIsNew:false})
const emit=defineEmits<{reload:[];accept:[value:ScheduleResolution];cancel:[]}>()
</script>
<template>
  <div v-if="error" class="svc-inline-error" role="alert">
    <span>{{ error }}</span>
    <BaseButton v-if="conflict" size="compact" variant="secondary" :disabled="saving" @click="emit('reload')">Revisar versión actual</BaseButton>
  </div>
  <ServiceConflictResolver v-if="overlapOpen" :open="overlapOpen" :conflicts="overlaps"
    :schedules="schedules" :technicians="technicians" :saving="saving"
    :current-client-name="currentClientName" :current-service-is-new="currentServiceIsNew"
    @accept="emit('accept',$event)" @cancel="emit('cancel')" />
</template>
