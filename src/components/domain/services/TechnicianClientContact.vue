<script setup lang="ts">
import { computed } from 'vue'
import { Mail, PhoneCall, UserRound } from 'lucide-vue-next'
import WhatsAppPhoneLink from '@/components/base/WhatsAppPhoneLink.vue'
import type { TechnicianServiceSummary } from '@/types/technicianServices'

const props=defineProps<{ service:TechnicianServiceSummary }>()
const phone=computed(()=>props.service.contactoPrincipalCelular?.trim()??'')
const phoneDial=computed(()=>phone.value.replace(/[^\d+]/g,''))
const emails=computed(()=>{
  const addresses=[...(props.service.contactEmails??[]),props.service.contactoPrincipalCorreo]
    .filter((email):email is string=>typeof email==='string'&&!!email.trim())
    .map(email=>email.trim().toLowerCase())
  return [...new Set(addresses)]
})
</script>

<template>
  <section class="technician-client-contact" aria-label="Contacto del cliente">
    <header class="technician-client-contact__header">
      <UserRound :size="17" aria-hidden="true"/>
      <div><strong>Contacto del cliente</strong><span>{{ service.contactoPrincipalNombre||'Contacto principal' }}</span></div>
    </header>
    <div class="technician-client-contact__grid">
      <div class="technician-client-contact__item">
        <span>Celular</span>
        <div v-if="phone" class="technician-client-contact__links">
          <WhatsAppPhoneLink :phone="phone"/>
          <a :href="'tel:'+phoneDial" class="technician-client-contact__action">
            <PhoneCall :size="16" aria-hidden="true"/> Llamar
          </a>
        </div>
        <p v-else>No disponible</p>
      </div>
      <div class="technician-client-contact__item">
        <span>Correo electrónico</span>
        <div v-if="emails.length" class="technician-client-contact__emails">
          <a v-for="email in emails" :key="email" :href="'mailto:'+encodeURIComponent(email)">
            <Mail :size="15" aria-hidden="true"/> {{ email }}
          </a>
        </div>
        <p v-else>No disponible</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.technician-client-contact{border-top:1px solid var(--border);padding-top:.75rem;display:grid;gap:.6rem;min-width:0}
.technician-client-contact__header{display:flex;align-items:center;gap:.55rem}
.technician-client-contact__header>svg{color:var(--text-secondary);flex:none}
.technician-client-contact__header>div{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem;min-width:0}
.technician-client-contact__header strong{font-size:.86rem;font-weight:650}
.technician-client-contact__header span{font-size:.78rem;color:var(--text-secondary);overflow-wrap:anywhere}
.technician-client-contact__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.6rem 1rem}
.technician-client-contact__item{display:grid;gap:.2rem;min-width:0}
.technician-client-contact__item>span{font-size:.71rem;color:var(--text-secondary)}
.technician-client-contact__item p{margin:0;font-size:.82rem;color:var(--text-muted)}
.technician-client-contact__links{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .85rem}
.technician-client-contact__links :deep(.whatsapp-phone-link){overflow-wrap:anywhere}
.technician-client-contact__action{display:inline-flex;min-height:44px;align-items:center;gap:.3rem;font-size:.78rem;
  color:var(--text);text-decoration:none}
.technician-client-contact__action:hover{text-decoration:underline}
.technician-client-contact__emails{display:grid;justify-items:start;gap:.2rem}
.technician-client-contact__emails a{display:inline-flex;align-items:center;min-height:32px;gap:.35rem;min-width:0;
  max-width:100%;font-size:.79rem;color:var(--text);text-decoration:none;overflow-wrap:anywhere}
.technician-client-contact__emails svg{color:var(--text-secondary);flex:none}
.technician-client-contact__emails a:hover{text-decoration:underline}
.technician-client-contact a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media(max-width:650px){.technician-client-contact__grid{grid-template-columns:1fr}
  .technician-client-contact__emails a{min-height:40px}}
</style>
