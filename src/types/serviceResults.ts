export interface ServiceCriterionResult{nombre:string;evaluacion:'C'|'CP'|'NC'|'NA'|null;observacion:string|null;fotos:string[]}
export interface ServicePointResult{numero:string;ubicacion:string;tipo:string;estado:string|null;capturas:Array<{plagaNombreSnapshot:string;cantidad:number}>;observaciones:string|null;foto:string|null}
export interface ServiceFindingFollowupResult{solicitud:string;fecha:string;resultado:'SIN_CAMBIOS'|'EN_PROCESO'|'CERRADO';observacion:string|null;fotos:string[]}
export interface ServiceFindingResult{descripcion:string;recomendacion:string;estado:'ABIERTO'|'EN_PROCESO'|'CERRADO';responsable:string;fotos:string[];fechaApertura:string;solicitudApertura:string;anterior:boolean;visitasDesdeApertura:number;seguimientos:ServiceFindingFollowupResult[]}
export interface ServiceAreaResult{id:string;nombre:string;sinAcceso:boolean;motivo:string|null;fotos:string[];criterios:ServiceCriterionResult[];puntos:ServicePointResult[];hallazgos:ServiceFindingResult[]}
export type ReportPestClassification = 'VOLADORES' | 'RASTREROS'
export interface HistoricalSpeciesCapture {
  plagaCodigo:string;plagaNombreSnapshot:string;clasificacion:ReportPestClassification;cantidad:number
}
export interface ReportCaptureLocation {
  clasificacion:ReportPestClassification;plagaCodigo:string;plagaNombreSnapshot:string;
  cantidad:number;area:string;puesto:string;ubicacion:string
}
export interface ReportHistoricalVisit {
  solicitud:string;fecha:string;cumplimiento:number|null;capturas:number
  especies?:HistoricalSpeciesCapture[]
  puestosRevisados?:{voladores:number;rastreros:number}
  detallesCapturas?:ReportCaptureLocation[]
}
export interface ServiceResultsData{
  id:string;solicitud:string;cliente:string;nit:string;sede:string;direccion:string;tecnico:string;firmanteCliente:string;firmaTecnico:string;firmaCliente:string;
  firmaTecnicoVencida?:boolean;firmaClienteVencida?:boolean;
  inicioProgramado:string;inicioReal:string;finReal:string;productos:Array<{nombre:string;principio:string;registro:string;lote:string;dosis:string;metodos:string;fichaTecnicaDisponible?:boolean}>;
  areas:ServiceAreaResult[];vehiclesEnabled?:boolean;attendedVehicles?:string[]|null;historico:ReportHistoricalVisit[]
}
export interface ServiceResultsResponse{data:ServiceResultsData}
