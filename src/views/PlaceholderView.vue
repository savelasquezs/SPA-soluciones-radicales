<script setup lang="ts">
import { useRoute } from 'vue-router'

import EmptyState from '@/components/base/EmptyState.vue'

const route = useRoute()
</script>

<template>
  <div class="page">
    <header class="page-header"><div><h1>{{ route.meta.placeholderTitle }}</h1><p>{{ route.meta.placeholderDescription }}</p></div></header>
    <EmptyState title="Módulo pendiente" message="Esta entrada conserva el shell sin adelantar comportamiento funcional." />
  </div>
</template>
