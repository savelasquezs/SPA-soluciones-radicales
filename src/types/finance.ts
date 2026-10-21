export type MetodoPago = 'EFECTIVO' | 'TRANSFERENCIA'
export type EstadoCobro = 'PENDIENTE' | 'CONFIRMADO' | 'RECHAZADO' | 'ANULADO'
export type ModalidadCobro = 'POR_SERVICIO' | 'CREDITO'

export interface AplicacionPago {
  servicioId: string
  solicitud: string
  monto: number
}
export interface Pago {
  id: string
  clienteId: string
  clienteNombre: string
  metodo: MetodoPago
  estado: EstadoCobro
  monto: number
  recaudadoPorId: string | null
  recaudadoPorNombre: string | null
  registradoPorNombre: string
  observacion: string
  motivoRevision: string | null
  fechaPago: string
  comprobanteDisponible: boolean
  aplicaciones: AplicacionPago[]
}
export interface ClienteCartera {
  id: string
  nombre: string
  modalidadCobro: ModalidadCobro
  plazoPagoDias: number
  realizado: number
  pagado: number
  saldo: number
  anticipos: number
}
export interface TecnicoCaja {
  id: string
  nombre: string
  recaudado: number
  recaudadoHoy: number
  entregado: number
  entregadoHoy: number
  saldo: number
}
export interface EntregaEfectivo {
  id: string
  tecnicoId: string
  monto: number
  fechaHora: string
  registradoPorNombre: string
  observacion: string
  anuladoAt: string | null
}
export interface ServicioCartera {
  id: string
  solicitud: string
  sedeNombre: string
  fecha: string
  estado: string
  valor: number
  abonado: number
  porConfirmar: number
  saldo: number
  disponible: number
  vencimiento: string | null
}
export interface ResumenFinanzas {
  cajaCentral: number
  clientes: ClienteCartera[]
  tecnicos: TecnicoCaja[]
  pagosRevision: Pago[]
  movimientos: Pago[]
  entregas: EntregaEfectivo[]
}
export interface DetalleCartera {
  cliente: ClienteCartera
  servicios: ServicioCartera[]
  pagos: Pago[]
}
export interface RegistrarPago {
  requestId: string
  clienteId: string
  metodo: MetodoPago
  recaudadoPorId: string | null
  observacion: string
  aplicaciones: Array<{ servicioId: string; monto: number }>
}
