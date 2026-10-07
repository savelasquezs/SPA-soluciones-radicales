<script setup lang="ts">
import { computed } from 'vue'
import { X } from 'lucide-vue-next'
import BaseMultiSelect from '@/components/base/BaseMultiSelect.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseDateTimePicker from '@/components/base/BaseDateTimePicker.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import type { ServiceErrors, ServiceProductInput, ServiceProductOption, ServiceProductRecord } from '@/types/adminServices'
const props=withDefaults(defineProps<{ modelValue: ServiceProductInput[]; products: ServiceProductOption[]; previous?: ServiceProductRecord[]; disabled?: boolean; errors?: ServiceErrors; serviceDate?: string }>(),{ previous:()=>[],disabled:false,errors:()=>({}),serviceDate:'' })
const emit=defineEmits<{ 'update:modelValue': [value: ServiceProductInput[]]; blur: [field: string] }>()
const options=computed(()=>{
  const all=new Map(props.products.map(product=>[product.id,{ id:product.id,label:product.nombre,description:product.principioActivo }]))
  for(const product of props.previous) if(!all.has(product.productoId)) all.set(product.productoId,{ id:product.productoId,label:product.nombre,description:'Producto inactivo; se conserva el registro.' })
  return [...all.values()]
})
function select(ids: string[]): void {
  emit('update:modelValue',ids.map(productoId=>props.modelValue.find(product=>product.productoId===productoId) ?? { productoId,lote:'',fechaFabricacion:null,fechaVencimiento:null,dosis:'',metodoAplicacionCodigo:'' }))
  emit('blur','productos')
}
function change<K extends keyof ServiceProductInput>(index: number, key: K, value: ServiceProductInput[K]): void {
  emit('update:modelValue',props.modelValue.map((product,position)=>position===index ? { ...product,[key]:value } : product))
  emit('blur',`productos.${index}.${key}`)
}
function label(id: string): string { return options.value.find(option=>option.id===id)?.label ?? 'Producto registrado' }
function option(id: string): ServiceProductOption | undefined { return props.products.find(product=>product.id===id) }
function methods(id: string) {
  const values=[...(option(id)?.metodos ?? [])]
  const previous=props.previous.find(product=>product.productoId===id)
  if(previous?.metodoAplicacionCodigo && !values.some(method=>method.codigo===previous.metodoAplicacionCodigo)) values.push({ codigo:previous.metodoAplicacionCodigo,nombre:previous.metodoAplicacionNombre || previous.metodoAplicacionCodigo })
  return values
}
function applied(id: string): boolean { return Boolean(props.previous.find(product=>product.productoId===id)?.aplicado) }
</script>
<template>
  <div>
    <BaseMultiSelect :model-value="modelValue.map(product=>product.productoId)" :options="options" label="Productos a utilizar" name="servicio-productos" item-label="producto" items-label="productos" placeholder="Agregar productos" empty-text="No hay productos activos en el catálogo." :disabled="disabled || previous.some(product=>product.aplicado)" :error="errors.productos" @update:model-value="select" />
    <div class="svc-product-list">
      <div v-for="(product,index) in modelValue" :key="product.productoId" class="svc-product-row">
        <div><strong>{{ label(product.productoId) }}</strong><small v-if="applied(product.productoId)" class="svc-muted">Aplicación registrada</small><small v-else-if="product.fechaVencimiento && serviceDate && product.fechaVencimiento < serviceDate" class="svc-error">Vence antes de la visita</small></div>
        <BaseInput :model-value="product.lote" :name="`producto-${index}-lote`" label="Lote" maxlength="120" :disabled="disabled || applied(product.productoId)" :error="errors[`productos.${index}.lote`]" @update:model-value="change(index,'lote',$event)" @blur="emit('blur',`productos.${index}.lote`)" />
        <BaseInput :model-value="product.dosis" :name="`producto-${index}-dosis`" label="Dosis prevista" maxlength="240" :hint="option(product.productoId)?.dosisAplicacion ? `Referencia: ${option(product.productoId)?.dosisAplicacion}` : undefined" :disabled="disabled || applied(product.productoId)" :error="errors[`productos.${index}.dosis`]" @update:model-value="change(index,'dosis',$event)" @blur="emit('blur',`productos.${index}.dosis`)" />
        <BaseSelect :model-value="product.metodoAplicacionCodigo" :name="`producto-${index}-metodo`" label="Método de aplicación" required :disabled="disabled || applied(product.productoId)" :error="errors[`productos.${index}.metodoAplicacionCodigo`]" @update:model-value="change(index,'metodoAplicacionCodigo',$event)" @blur="emit('blur',`productos.${index}.metodoAplicacionCodigo`)">
          <option value="">Seleccionar método</option>
          <option v-for="method in methods(product.productoId)" :key="method.codigo" :value="method.codigo">{{ method.nombre }}</option>
        </BaseSelect>
        <BaseDateTimePicker :model-value="product.fechaFabricacion" mode="date" :name="`producto-${index}-fabricacion`" label="Fabricación" clearable :disabled="disabled || applied(product.productoId)" :error="errors[`productos.${index}.fechaFabricacion`]" @update:model-value="change(index,'fechaFabricacion',$event)" />
        <BaseDateTimePicker :model-value="product.fechaVencimiento" mode="date" :name="`producto-${index}-vencimiento`" label="Vencimiento" clearable :min="product.fechaFabricacion || undefined" :disabled="disabled || applied(product.productoId)" :error="errors[`productos.${index}.fechaVencimiento`]" @update:model-value="change(index,'fechaVencimiento',$event)" />
        <BaseIconButton :label="`Quitar ${label(product.productoId)}`" size="small" :disabled="disabled || applied(product.productoId)" @click="select(modelValue.filter(item=>item.productoId!==product.productoId).map(item=>item.productoId))"><X :size="16" /></BaseIconButton>
      </div>
    </div>
  </div>
</template>
