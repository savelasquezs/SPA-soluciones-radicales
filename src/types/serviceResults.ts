export interface ServiceCriterionResult{nombre:string;evaluacion:'C'|'CP'|'NC'|'NA'|null;observacion:string|null;fotos:string[]}
export interface ServicePointResult{numero:string;ubicacion:string;tipo:string;estado:string|null;capturas:Array<{plagaNombreSnapshot:string;cantidad:number}>;observaciones:string|null;foto:string|null}
export interface ServiceFindingResult{descripcion:string;recomendacion:string;estado:string;responsable:string;fotos:string[]}
export interface ServiceAreaResult{id:string;nombre:string;sinAcceso:boolean;motivo:string|null;fotos:string[];criterios:ServiceCriterionResult[];puntos:ServicePointResult[];hallazgos:ServiceFindingResult[]}
export interface ServiceResultsData{
  id:string;solicitud:string;cliente:string;nit:string;sede:string;direccion:string;tecnico:string;firmanteCliente:string;firmaTecnico:string;firmaCliente:string;
  inicioProgramado:string;inicioReal:string;finReal:string;productos:Array<{nombre:string;principio:string;registro:string;lote:string;dosis:string;metodos:string;fichaTecnicaDisponible?:boolean}>;
  areas:ServiceAreaResult[];historico:Array<{solicitud:string;fecha:string;cumplimiento:number|null;capturas:number}>
}
export interface ServiceResultsResponse{data:ServiceResultsData}
