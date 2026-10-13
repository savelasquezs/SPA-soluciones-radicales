<script setup lang="ts">
import { ChevronDown, Mail } from 'lucide-vue-next'

defineProps<{
  subject: string
  message: string
  disabled?: boolean
  subjectError?: string
  messageError?: string
}>()
const emit = defineEmits<{
  'update:subject': [value: string]
  'update:message': [value: string]
}>()
</script>

<template>
  <details class="email-composer">
    <summary>
      <Mail :size="16" aria-hidden="true" />
      <span class="email-composer__label">
        <strong>Asunto y mensaje</strong>
        <small>Personalizar correo · Opcional</small>
      </span>
      <ChevronDown :size="16" class="email-composer__chevron" aria-hidden="true" />
    </summary>
    <div class="email-composer__body">
      <label for="email-composer-subject">Asunto</label>
      <input id="email-composer-subject" type="text" autocomplete="off" :disabled="disabled"
        :value="subject" maxlength="200" :aria-invalid="!!subjectError"
        @input="emit('update:subject', ($event.target as HTMLInputElement).value)" />
      <small v-if="subjectError" class="email-composer__error" role="alert">{{ subjectError }}</small>
      <label for="email-composer-message">Mensaje</label>
      <textarea id="email-composer-message" :disabled="disabled" :value="message" :aria-invalid="!!messageError"
        maxlength="4000" rows="5" @input="emit('update:message', ($event.target as HTMLTextAreaElement).value)"></textarea>
      <small v-if="messageError" class="email-composer__error" role="alert">{{ messageError }}</small>
      <p>El botón «Abrir aquí», el QR y la fecha de vencimiento se agregan automáticamente.</p>
    </div>
  </details>
</template>

<style scoped>
.email-composer{border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);min-width:0}
.email-composer summary{display:flex;align-items:center;gap:.55rem;padding:.65rem .75rem;cursor:pointer;list-style:none;min-height:44px}
.email-composer summary::-webkit-details-marker{display:none}
.email-composer summary:hover{background:var(--hover)}
.email-composer summary:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.email-composer__label{display:grid;gap:.08rem;min-width:0;flex:1}
.email-composer__label strong{font-size:.81rem;font-weight:600}
.email-composer__label small{font-size:.71rem;color:var(--text-secondary)}
.email-composer__chevron{transition:transform .15s}
.email-composer[open] .email-composer__chevron{transform:rotate(180deg)}
.email-composer__body{display:grid;gap:.45rem;border-top:1px solid var(--border);padding:.75rem}
.email-composer__body label{font-size:.74rem;font-weight:600}
.email-composer__body input,.email-composer__body textarea{
  min-width:0;width:100%;border:1px solid var(--control-border);border-radius:6px;
  background:var(--surface);color:var(--text);padding:.55rem .65rem;font:inherit;font-size:.83rem;
}
.email-composer__body input{min-height:36px}
.email-composer__body textarea{resize:vertical;min-height:100px;max-height:220px;line-height:1.5}
.email-composer__body [aria-invalid='true']{border-color:var(--danger)}
.email-composer__body p{font-size:.71rem;color:var(--text-secondary);margin:0}
.email-composer__error{font-size:.72rem;color:var(--danger)}
</style>
