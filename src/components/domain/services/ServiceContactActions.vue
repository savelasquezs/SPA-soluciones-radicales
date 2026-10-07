<script setup lang="ts">
import { Mail } from 'lucide-vue-next'
import { computed } from 'vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import WhatsAppPhoneLink from '@/components/base/WhatsAppPhoneLink.vue'
import type { ServiceContact } from '@/types/adminServices'
const props=withDefaults(defineProps<{ contact: ServiceContact; confirmation?: boolean; disabled?: boolean }>(),{ confirmation:false,disabled:false })
const emit=defineEmits<{ email: [] }>()
const mailto=computed(()=>`mailto:${props.contact.correos.map(encodeURIComponent).join(',')}`)
</script>
<template>
  <span class="svc-contact">
    <WhatsAppPhoneLink v-if="contact.celular" :phone="contact.celular" />
    <BaseIconButton v-if="confirmation && contact.correos.length" label="Enviar correo de confirmación" size="small" :disabled="disabled" @click="emit('email')"><Mail :size="16" /></BaseIconButton>
    <a v-else-if="contact.correos.length" class="svc-icon-link" :href="mailto" :aria-label="`Escribir correo a ${contact.nombre ?? 'contacto de la sede'}`" :title="contact.correos.join(', ')"><Mail :size="16" aria-hidden="true" /></a>
    <span v-if="!contact.celular && !contact.correos.length" class="svc-muted">Sin contacto</span>
  </span>
</template>
