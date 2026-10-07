<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { useAuthStore } from '@/stores/auth'
const auth=useAuthStore()
const AdminServicesView=defineAsyncComponent(()=>import('./AdminServicesView.vue'))
const TechnicianServicesView=defineAsyncComponent(()=>import('./TechnicianServicesView.vue'))
</script>
<template><AdminServicesView v-if="auth.isAdmin" /><TechnicianServicesView v-else /></template>
