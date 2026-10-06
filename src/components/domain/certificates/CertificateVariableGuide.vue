<script setup lang="ts">
import { Copy } from 'lucide-vue-next'
import BaseButton from '@/components/base/BaseButton.vue'
import { CERTIFICATE_BLOCKS, CERTIFICATE_VARIABLES } from '@/types/certificates'
import { useNotificationsStore } from '@/stores/notifications'
const notifications = useNotificationsStore()
const token = (value: string) => `{{${value}}}`
const block = (name: string) => `{{#${name}}}\n${name === 'productos' ? 'Producto: {{nombre}} · {{principio_activo}}\nRegistro sanitario: {{registro_sanitario}} · Lote: {{lote}}\nMétodo: {{metodo}}' : '{{nombre}}'}\n{{/${name}}}`
async function copy(value: string): Promise<void> {
  try { await navigator.clipboard.writeText(value); notifications.show('Copiado', 'success') }
  catch { notifications.show('No se pudo copiar. Selecciona el texto y cópialo manualmente.', 'warning') }
}
</script>
<template>
  <details class="variable-guide">
    <summary>Variables y bloques para Word</summary>
    <div class="variable-guide__content">
      <p>Conserva el diseño de tu Word y reemplaza los datos por estas variables. Son obligatorias <code v-text="token('solicitud')" />, <code v-text="token('fecha_expedicion')" />, <code v-text="token('fecha_vencimiento')" /> y el nombre del negocio o la placa, según el certificado.</p>
      <div class="variable-guide__tokens">
        <button v-for="variable in CERTIFICATE_VARIABLES" :key="variable.name" type="button" :title="`Copiar ${variable.label}`" @click="copy(token(variable.name))"><code>{{ token(variable.name) }}</code><span>{{ variable.label }}</span><Copy :size="14" aria-hidden="true" /></button>
      </div>
      <p>Los bloques repiten únicamente productos aplicados y métodos registrados. Escribe las etiquetas de apertura y cierre en párrafos separados. <code v-text="token('vehiculo_placa')" /> solo se admite en la plantilla vehicular.</p>
      <div class="variable-guide__blocks">
        <section v-for="(fields, name) in CERTIFICATE_BLOCKS" :key="name">
          <header><h3>{{ name === 'productos' ? 'Productos aplicados' : 'Métodos de aplicación' }}</h3><BaseButton variant="ghost" size="compact" @click="copy(block(String(name)))">Copiar bloque</BaseButton></header>
          <pre>{{ block(String(name)) }}</pre>
          <p>{{ fields.map(field => field.label).join(' · ') }}</p>
        </section>
      </div>
    </div>
  </details>
</template>
<style scoped>
.variable-guide { border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); }
summary { padding: 1rem 1.25rem; cursor: pointer; font-weight: 600; }
.variable-guide__content { padding: 0 1.25rem 1.25rem; font-size: .875rem; }
p { color: var(--text-secondary); line-height: 1.6; }
.variable-guide__tokens, .variable-guide__blocks { display: grid; gap: .75rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.variable-guide__tokens button { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg); color: var(--text); padding: .65rem; cursor: pointer; min-height: 44px; text-align: left; }
.variable-guide__tokens span { color: var(--text-secondary); font-size: .8rem; }
.variable-guide__tokens svg { margin-left: auto; }
header { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
h3 { font-size: .9rem; font-weight: 600; }
code, pre { font-size: .8rem; overflow-wrap: anywhere; }
pre { white-space: pre-wrap; padding: 1rem; background: var(--bg); border-radius: var(--radius); }
@media (max-width: 800px) { .variable-guide__tokens, .variable-guide__blocks { grid-template-columns: 1fr; } }
</style>
