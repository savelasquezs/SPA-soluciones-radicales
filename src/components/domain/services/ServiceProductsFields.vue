<script setup lang="ts">
import { computed } from 'vue'
import { X } from 'lucide-vue-next'
import BaseMultiSelect from '@/components/base/BaseMultiSelect.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseDateTimePicker from '@/components/base/BaseDateTimePicker.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import type { ServiceErrors, ServiceProductInput, ServiceProductOption, ServiceProductRecord } from '@/types/adminServices'

const props = withDefaults(defineProps<{
  modelValue: ServiceProductInput[]
  products: ServiceProductOption[]
  previous?: ServiceProductRecord[]
  disabled?: boolean
  errors?: ServiceErrors
  serviceDate?: string
}>(), { previous: () => [], disabled: false, errors: () => ({}), serviceDate: '' })

const emit = defineEmits<{ 'update:modelValue': [value: ServiceProductInput[]]; blur: [field: string] }>()
const options = computed(() => {
  const all = new Map(props.products.map(product => [product.id, {
    id: product.id, label: product.nombre, description: product.principioActivo,
  }]))
  for (const product of props.previous) {
    if (!all.has(product.productoId)) {
      all.set(product.productoId, {
        id: product.productoId, label: product.nombre, description: 'Producto inactivo; se conserva el registro.',
      })
    }
  }
  return [...all.values()]
})

function select(ids: string[]): void {
  emit('update:modelValue', ids.map(productoId =>
    props.modelValue.find(product => product.productoId === productoId) ?? { productoId, lote: '', fechaVencimiento: null },
  ))
  emit('blur', 'productos')
}

function change<K extends keyof ServiceProductInput>(index: number, key: K, value: ServiceProductInput[K]): void {
  emit('update:modelValue', props.modelValue.map((product, position) =>
    position === index ? { ...product, [key]: value } : product,
  ))
  emit('blur', `productos.${index}.${key}`)
}

function previous(id: string): ServiceProductRecord | undefined {
  return props.previous.find(product => product.productoId === id)
}

function label(id: string): string {
  return options.value.find(option => option.id === id)?.label ?? 'Producto registrado'
}

function dose(id: string): string {
  const historical = previous(id)
  if (historical?.aplicado) return historical.dosis || 'Sin configurar'
  return props.products.find(product => product.id === id)?.dosisAplicacion || historical?.dosis || 'Sin configurar en catálogo'
}

function methods(id: string): string {
  const historical = previous(id)
  if (historical?.aplicado) return historical.metodoAplicacionNombre || 'Sin configurar'
  const catalog = props.products.find(product => product.id === id)?.metodos.map(method => method.nombre).filter(Boolean).join(', ')
  return catalog || historical?.metodoAplicacionNombre || 'Sin configurar en catálogo'
}

function applied(id: string): boolean {
  return Boolean(previous(id)?.aplicado)
}
</script>

<template>
  <div>
    <BaseMultiSelect
      :model-value="modelValue.map(product => product.productoId)"
      :options="options"
      label="Productos a utilizar"
      name="servicio-productos"
      item-label="producto"
      items-label="productos"
      placeholder="Agregar productos"
      empty-text="No hay productos activos en el catálogo."
      :disabled="disabled || previous.some(product => product.aplicado)"
      :error="errors.productos"
      @update:model-value="select"
    />
    <div class="svc-product-list">
      <div v-for="(product, index) in modelValue" :key="product.productoId" class="svc-product-row">
        <div>
          <strong>{{ label(product.productoId) }}</strong>
          <small class="svc-muted">Dosis: {{ dose(product.productoId) }} · Métodos: {{ methods(product.productoId) }}</small>
          <small v-if="applied(product.productoId)" class="svc-muted">Aplicación registrada</small>
          <small v-else-if="product.fechaVencimiento && serviceDate && product.fechaVencimiento < serviceDate" class="svc-error">Vence antes de la visita</small>
        </div>
        <BaseInput
          :model-value="product.lote"
          :name="`producto-${index}-lote`"
          label="Lote"
          maxlength="120"
          :disabled="disabled || applied(product.productoId)"
          :error="errors[`productos.${index}.lote`]"
          @update:model-value="change(index, 'lote', $event)"
          @blur="emit('blur', `productos.${index}.lote`)"
        />
        <BaseDateTimePicker
          :model-value="product.fechaVencimiento"
          mode="date"
          :name="`producto-${index}-vencimiento`"
          label="Vencimiento"
          clearable
          :disabled="disabled || applied(product.productoId)"
          :error="errors[`productos.${index}.fechaVencimiento`]"
          @update:model-value="change(index, 'fechaVencimiento', $event)"
        />
        <BaseIconButton
          :label="`Quitar ${label(product.productoId)}`"
          size="small"
          :disabled="disabled || applied(product.productoId)"
          @click="select(modelValue.filter(item => item.productoId !== product.productoId).map(item => item.productoId))"
        ><X :size="16" /></BaseIconButton>
      </div>
    </div>
  </div>
</template>
