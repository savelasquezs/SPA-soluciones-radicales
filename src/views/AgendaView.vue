<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { useAuthStore } from '@/stores/auth'
const auth=useAuthStore()
const AdminServicesView=defineAsyncComponent(()=>import('./AdminServicesView.vue'))
const TechnicianAgendaView=defineAsyncComponent(()=>import('./TechnicianAgendaView.vue'))
</script>
<template>
  <AdminServicesView v-if="auth.isAdmin" />
  <TechnicianAgendaView v-else />
</template>
