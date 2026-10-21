import { apiRequest } from '@/services/apiService'
import { optimizeFileForStorage } from '@/services/fileOptimizationService'
import type { DetalleCartera, EntregaEfectivo, MetodoPago, ModalidadCobro, Pago, RegistrarPago, ResumenFinanzas, TecnicoCaja } from '@/types/finance'

const root='api/finance'
const post=(value:unknown):RequestInit=>({method:'POST',body:JSON.stringify(value)})
export const getFinanceOverview=()=>apiRequest<ResumenFinanzas>(`${root}/overview`)
export const getFinanceAccount=(id:string)=>apiRequest<DetalleCartera>(`${root}/clients/${id}`)
export const saveClientTerms=(id:string,modalidadCobro:ModalidadCobro,plazoPagoDias:number)=>
  apiRequest<{ok:boolean}>(`${root}/clients/${id}/terms`,post({modalidadCobro,plazoPagoDias}))
export const registerFinancePayment=(input:RegistrarPago)=>
  apiRequest<Pago>(`${root}/payments`,post(input))
export const getFinancePaymentRequest=(requestId:string)=>
  apiRequest<{payment:Pago|null}>(`${root}/payments/request/${requestId}`)
export const decideFinancePayment=(id:string,estado:'CONFIRMADO'|'RECHAZADO'|'ANULADO',motivo:string)=>
  apiRequest<Pago>(`${root}/payments/${id}/decision`,post({estado,motivo}))
export const registerCashDelivery=(input:{requestId:string;tecnicoId:string;monto:number;observacion:string})=>
  apiRequest<EntregaEfectivo>(`${root}/deliveries`,post(input))
export const annulCashDelivery=(id:string,motivo:string)=>
  apiRequest<{ok:boolean}>(`${root}/deliveries/${id}/void`,post({motivo}))
export const myCashBalance=()=>apiRequest<{balance:TecnicoCaja;pagos:Pago[]}>(`${root}/me`)
export const getTechnicianServiceBalance=(serviceId:string)=>apiRequest<{disponible:number;estado:string}>(`${root}/technician/services/${serviceId}/balance`)
export const reportTechnicianPayment=(serviceId:string,requestId:string,monto:number,metodo:MetodoPago,observacion:string)=>
  apiRequest<Pago>(`${root}/technician/services/${serviceId}/payments`,post({requestId,monto,metodo,observacion}))
export async function uploadPaymentProof(paymentId:string,original:File):Promise<void> {
  const file=await optimizeFileForStorage('SERVICE_PHOTO',original)
  const auth=await apiRequest<{url:string;storagePath:string;contentType:string}>(`${root}/payments/${paymentId}/proof/upload-url`,
    post({fileName:file.name,contentType:file.type,size:file.size}))
  const saved=await fetch(auth.url,{method:'PUT',headers:{'Content-Type':auth.contentType},body:file})
  if(!saved.ok)throw new Error('No fue posible subir el comprobante. Vuelve a intentarlo desde Mi caja.')
  await apiRequest(`${root}/payments/${paymentId}/proof`,post({storagePath:auth.storagePath}))
}
export const getPaymentProofUrl=async(id:string)=>(
  await apiRequest<{url:string}>(`${root}/payments/${id}/proof`)).url
