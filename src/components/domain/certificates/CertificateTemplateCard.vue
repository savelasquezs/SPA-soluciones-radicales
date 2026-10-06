<script setup lang="ts">
import { FileCheck2, FileText, Eye, Save } from 'lucide-vue-next'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseFileUpload from '@/components/base/BaseFileUpload.vue'
import { certificateTypeLabel } from '@/helpers/certificates'
import type { CertificateTemplate, CertificateType } from '@/types/certificates'

defineProps<{ type: CertificateType; template: CertificateTemplate; file: File | null; error: string; phase: string; busy: boolean; active: boolean; converterReady: boolean }>()
const emit = defineEmits<{ select: [file: File | null]; save: []; preview: []; download: [] }>()
</script>
<template>
  <section class="template-card" :aria-busy="active">
    <header><FileCheck2 :size="20" aria-hidden="true" /><h2>{{ certificateTypeLabel(type) }}</h2><span>{{ template.storagePath ? 'Configurada' : 'Sin plantilla' }}</span></header>
    <p class="template-card__scope">{{ type === 'ESTABLECIMIENTO' ? 'Se usa cuando el negocio no tiene una plantilla propia.' : 'Se usa cuando la sede no tiene una plantilla propia.' }}</p>
    <div v-if="template.storagePath" class="template-card__current">
      <FileText :size="16" aria-hidden="true" /><span :title="template.fileName ?? ''">{{ template.fileName }}</span>
      <BaseButton variant="ghost" size="compact" :disabled="busy" @click="emit('download')">Abrir Word</BaseButton>
    </div>
    <BaseFileUpload :model-value="file" :name="`certificate-template-${type}`" :label="template.storagePath ? 'Reemplazar Word' : 'Seleccionar Word'" accept=".docx" hint="Word .docx · hasta 10 MB" :error="error || undefined" :disabled="busy" @update:model-value="emit('select', $event)" />
    <footer>
      <BaseButton size="compact" :disabled="busy || !file" :loading="active && !phase.includes('prueba') && !phase.includes('Word')" @click="emit('save')"><Save :size="16" aria-hidden="true" />{{ active ? phase : 'Guardar plantilla' }}</BaseButton>
      <BaseButton size="compact" variant="secondary" :disabled="busy || !(file || template.storagePath) || !converterReady" @click="emit('preview')"><Eye :size="16" aria-hidden="true" />Probar PDF</BaseButton>
    </footer>
  </section>
</template>
<style scoped>
.template-card { display: flex; flex-direction: column; gap: 1rem; min-width: 0; padding: 1.25rem; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); }
header { display: flex; align-items: center; gap: .55rem; flex-wrap: wrap; }
h2 { margin: 0; font-size: 1rem; font-weight: 600; }
header span { margin-left: auto; font-size: .8rem; color: var(--text-secondary); }
.template-card__scope { margin: 0; font-size: .875rem; color: var(--text-secondary); }
.template-card__current { display: flex; min-width: 0; gap: .4rem; align-items: center; }
.template-card__current span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .85rem; }
footer { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: auto; }
</style>
