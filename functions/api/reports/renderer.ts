import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from 'pdf-lib'
import type { ReportData } from './data'

export interface ReportPhoto { area:string; caption:string; bytes:Uint8Array }
const NAVY=rgb(.10,.18,.29), INK=rgb(.17,.24,.31), MUTED=rgb(.42,.48,.55)
const BLUE=rgb(.15,.39,.66), BORDER=rgb(.84,.88,.91), PALE=rgb(.96,.975,.985), WHITE=rgb(1,1,1)
const PW=595.28, PH=841.89, M=45, CW=PW-M*2, FLOOR=60
const safe=(text:unknown):string=>String(text??'').replace(/[^\x20-\x7E\u00A0-\u00FF]/g,' ').replace(/\s+/g,' ').trim()
const date=(value:string):string=>new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value))
const hour=(value:string):string=>new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',hour:'2-digit',minute:'2-digit',hour12:true}).format(new Date(value))
const num=(value:number):string=>new Intl.NumberFormat('es-CO').format(value)
const pct=(value:number|null):string=>value==null?'Sin datos':(value.toLocaleString('es-CO',{maximumFractionDigits:1})+' %')

export async function renderMipReport(input:ReportData,photos:ReportPhoto[],signatures:{tecnico:Uint8Array;cliente:Uint8Array}):Promise<Uint8Array>{
  const pdf=await PDFDocument.create()
  pdf.setTitle('Informe tecnico MIP - '+input.solicitud)
  pdf.setSubject('Soluciones Radicales - Servicio finalizado')
  pdf.setAuthor('Soluciones Radicales')
  const normal=await pdf.embedFont(StandardFonts.Helvetica)
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold)
  let page!:PDFPage
  let y=0

  function fresh():void{
    page=pdf.addPage([PW,PH]);y=PH-86
    page.drawText('SOLUCIONES RADICALES',{x:M,y:PH-42,size:13,font:bold,color:NAVY})
    page.drawText('MANEJO INTEGRADO DE PLAGAS',{x:M,y:PH-56,size:7.5,font:normal,color:BLUE})
    page.drawLine({start:{x:M,y:PH-69},end:{x:PW-M,y:PH-69},thickness:1,color:BORDER})
  }
  function ensure(height:number):void{if(y-height<FLOOR)fresh()}
  function wrapped(text:string,font:PDFFont,size:number,width:number):string[]{
    const words=safe(text).split(' ').filter(Boolean),lines:string[]=[]
    let line=''
    for(const word of words){
      const next=line?line+' '+word:word
      if(font.widthOfTextAtSize(next,size)<=width){line=next;continue}
      if(line)lines.push(line)
      line=''
      for(const letter of word){
        if(font.widthOfTextAtSize(line+letter,size)>width&&line){lines.push(line);line=''}
        line+=letter
      }
    }
    if(line)lines.push(line)
    return lines.length?lines:['-']
  }
  function text(value:string,options:{size?:number;font?:PDFFont;color?:ReturnType<typeof rgb>;x?:number;width?:number;leading?:number;gap?:number}={}):void{
    const size=options.size??9, f=options.font??normal, width=options.width??CW,x=options.x??M
    const lines=wrapped(value,f,size,width),leading=options.leading??size*1.45
    for(const line of lines){ensure(leading);page.drawText(line,{x,y,size,font:f,color:options.color??INK});y-=leading}
    y-=options.gap??3
  }
  function heading(title:string):void{
    ensure(38);y-=12
    page.drawText(safe(title).toUpperCase(),{x:M,y,size:10,font:bold,color:NAVY});y-=9
    page.drawLine({start:{x:M,y},end:{x:PW-M,y},thickness:.6,color:BORDER});y-=16
  }
  function kv(label:string,value:string,x:number,width:number):void{
    page.drawText(safe(label).toUpperCase(),{x,y,size:7.3,font:bold,color:MUTED})
    const lines=wrapped(value,normal,9,width)
    for(let i=0;i<Math.min(lines.length,2);i++){
      page.drawText(lines[i]!,{x,y:y-15-i*13,size:9,font:normal,color:INK})
    }
  }
  function row(label:string,value:string):void{
    const values=wrapped(value,normal,8.7,CW*.65)
    const h=Math.max(23,values.length*12+9);ensure(h)
    page.drawLine({start:{x:M,y:y-4},end:{x:PW-M,y:y-4},thickness:.35,color:BORDER})
    page.drawText(safe(label),{x:M+6,y:y-18,font:bold,size:8.3,color:INK})
    for(let i=0;i<values.length;i++)page.drawText(values[i]!,{x:M+CW*.36,y:y-18-i*12,font:normal,size:8.5,color:INK})
    y-=h
  }
  function gridBoxes(entries:Array<{label:string;value:string}>):void{
    ensure(84)
    const gap=9,w=(CW-gap*(entries.length-1))/entries.length
    entries.forEach((e,i)=>{
      const x=M+i*(w+gap)
      page.drawRectangle({x,y:y-65,width:w,height:65,borderWidth:.6,borderColor:BORDER,color:PALE})
      page.drawText(safe(e.label).slice(0,27),{x:x+9,y:y-17,size:7.6,font:normal,color:MUTED})
      const size=e.value.length>9?13:18
      page.drawText(safe(e.value),{x:x+9,y:y-44,size,font:bold,color:NAVY})
    })
    y-=80
  }
  function chart():void{
    heading('Evolucion de cumplimiento - misma sede')
    if(!input.historico.length){text('Sin visitas comparables.');return}
    ensure(194)
    const height=125,w=CW-24,ox=M+12,oy=y-140
    for(const line of [0,25,50,75,100]){
      const yy=oy+(line/100)*height
      page.drawLine({start:{x:ox,y:yy},end:{x:ox+w,y:yy},color:BORDER,thickness:.4})
      page.drawText(String(line)+'%',{x:ox-3,y:yy+2,size:6,font:normal,color:MUTED})
    }
    const records=input.historico
    const spacing=w/records.length
    for(let i=0;i<records.length;i++){
      const r=records[i]!,v=r.cumplimiento
      const bw=Math.min(48,spacing*.45),x=ox+spacing*i+spacing*.5-bw*.5
      if(v!==null){
        const bh=Math.max(2,v*height/100)
        page.drawRectangle({x,y:oy,width:bw,height:bh,color:i===records.length-1?BLUE:rgb(.63,.77,.87)})
        page.drawText(pct(v),{x:x-3,y:oy+bh+7,size:8,font:bold,color:NAVY})
      }else page.drawText('N/D',{x,y:oy+8,size:8,font:normal,color:MUTED})
      const lab=safe(r.solicitud).replace('SR-','')
      page.drawText(lab,{x:x-2,y:oy-16,font:normal,size:7.5,color:INK})
      page.drawText(date(r.fecha).slice(0,5),{x:x-2,y:oy-27,font:normal,size:7,color:MUTED})
    }
    y=oy-42
    text('Porcentaje promedio de areas evaluadas. Se excluyen las areas sin acceso y los criterios No aplica.',{size:7.8,color:MUTED})
  }
  fresh()
  y-=13
  text('INFORME TECNICO DEL SERVICIO',{size:19,font:bold,color:NAVY,leading:27,gap:4})
  text(input.solicitud,{size:12,color:BLUE,gap:18})
  ensure(83)
  const top=y
  kv('Cliente',input.cliente,M,CW*.55)
  kv('Sede',input.sede,M+CW*.56,CW*.42)
  y=top-43
  kv('NIT',input.nit,M,CW*.55)
  kv('Fecha programada',date(input.inicioProgramado),M+CW*.56,CW*.42)
  y=top-92
  row('Direccion',input.direccion)
  row('Tecnico responsable',input.tecnico)
  row('Ejecucion real',date(input.inicioReal)+'  '+hour(input.inicioReal)+' - '+hour(input.finReal))
  y-=15
  const accessible=input.areas.filter(a=>!a.sinAcceso)
  const findings=input.areas.reduce((n,a)=>n+a.hallazgos.length,0)
  const points=input.areas.reduce((n,a)=>n+a.puntos.length,0)
  const captures=input.areas.flatMap(a=>a.puntos).flatMap(p=>p.capturas).reduce((n,c)=>n+c.cantidad,0)
  const current=input.historico.find(h=>h.solicitud===input.solicitud)
  gridBoxes([{label:'Cumplimiento',value:pct(current?.cumplimiento??null)},
    {label:'Areas evaluadas',value:String(accessible.length)+' / '+input.areas.length},
    {label:'Puestos revisados',value:String(points)},
    {label:'Hallazgos',value:String(findings)}])
  chart()
  heading('Resultados generales')
  text('Capturas registradas en esta visita: '+num(captures)+'. Los conteos pertenecen a los puestos revisados y no representan por si solos una tendencia uniforme entre tipos de dispositivo.')
  if(input.areas.some(a=>a.sinAcceso))text('Areas sin acceso: '+input.areas.filter(a=>a.sinAcceso).map(a=>a.nombre).join(', ')+'. No participan en el porcentaje de cumplimiento.',{size:8.5,color:MUTED})

  heading('Productos aplicados')
  if(!input.productos.length)text('No se registraron productos aplicados.')
  for(const p of input.productos){
    ensure(62)
    text(p.nombre,{size:9.5,font:bold,color:NAVY,gap:0})
    text('Principio activo: '+p.principio+'  |  Registro: '+(p.registro||'No registrado'),{size:8,gap:0})
    text('Lote: '+p.lote+'  |  Dosis: '+p.dosis+'  |  Metodo(s): '+p.metodos,{size:8,gap:7})
  }
  heading('Evaluacion de condiciones locativas')
  for(const a of input.areas){
    ensure(52)
    text(a.nombre,{size:10,font:bold,color:NAVY,gap:2})
    if(a.sinAcceso){
      text('Sin acceso. Motivo: '+(a.motivo||'No registrado')+'. Los criterios historicos asociados no se utilizan para calcular cumplimiento.',{size:8,color:MUTED,gap:7})
      continue
    }
    for(const c of a.criterios){
      row(c.nombre,({C:'Cumple',CP:'Cumple parcialmente',NC:'No cumple',NA:'No aplica'} as Record<string,string>)[c.evaluacion??'']||'Sin evaluacion')
      if(c.observacion)text('Observacion: '+c.observacion,{size:8,color:MUTED})
    }
    y-=12
  }
  heading('Puestos de monitoreo')
  const pests=new Map<string,number>()
  for(const a of input.areas)for(const point of a.puntos)for(const cap of point.capturas){
    pests.set(cap.plagaNombreSnapshot,(pests.get(cap.plagaNombreSnapshot)||0)+cap.cantidad)
  }
  if(points===0)text('No hay puestos registrados para esta visita.')
  for(const a of input.areas)for(const p of a.puntos){
    ensure(64)
    text(a.nombre+'  /  Puesto '+p.numero+' - '+p.tipo,{font:bold,size:9.2,color:NAVY,gap:1})
    text('Ubicacion: '+p.ubicacion+'  |  Estado: '+(p.estado||'No registrado'),{size:8.4,gap:1})
    text('Capturas: '+(p.capturas.length?p.capturas.map(c=>safe(c.plagaNombreSnapshot)+': '+num(c.cantidad)).join('  |  '):'Sin capturas registradas'),{size:8.4,gap:5})
    if(p.observaciones)text('Observacion: '+p.observaciones,{size:8})
  }
  if(pests.size){
    heading('Capturas por plaga - esta visita')
    for(const [name,count] of [...pests].sort((a,b)=>b[1]-a[1])){
      ensure(22);const bar=Math.max(3,(CW-185)*count/Math.max(...pests.values()))
      page.drawText(safe(name),{x:M,y,size:8.3,font:normal,color:INK})
      page.drawRectangle({x:M+165,y:y-1,width:bar,height:9,color:BLUE})
      page.drawText(num(count),{x:M+170+bar,y:y,size:8,font:bold,color:NAVY});y-=22
    }
  }
  heading('Hallazgos y recomendaciones')
  if(!findings)text('No se registraron hallazgos nuevos ni cierres de hallazgos durante esta visita.')
  for(const a of input.areas)for(const h of a.hallazgos){
    ensure(70)
    text(a.nombre+'  -  '+h.estado,{size:9.2,font:bold,color:NAVY,gap:2})
    text('Hallazgo: '+h.descripcion,{size:8.7,gap:2})
    text('Accion recomendada: '+h.recomendacion,{size:8.7,gap:2})
    text('Responsable: '+h.responsable,{size:8,color:MUTED,gap:9})
  }

  // Images are positioned in uniform cells; the original aspect ratio is preserved.
  heading('Registro fotografico')
  if(!photos.length)text('No se asociaron evidencias fotograficas a esta visita.')
  let lastArea=''
  const iw=(CW-20)/3, ih=118,gap=10
  for(let i=0;i<photos.length;){
    const area=photos[i]!.area
    if(area!==lastArea){ensure(25);text(area,{size:9.4,font:bold,color:NAVY,gap:5});lastArea=area}
    const rowPhotos=photos.slice(i,i+3)
    ensure(ih+22)
    for(let j=0;j<rowPhotos.length;j++){
      const item=rowPhotos[j]!,x=M+j*(iw+gap)
      page.drawRectangle({x,y:y-ih,width:iw,height:ih,borderWidth:.5,borderColor:BORDER,color:PALE})
      const img:PDFImage=await pdf.embedJpg(item.bytes)
      const dims=img.scale(Math.min((iw-8)/img.width,(ih-31)/img.height))
      page.drawImage(img,{x:x+(iw-dims.width)/2,y:y-6-(ih-31)/2-dims.height/2,width:dims.width,height:dims.height})
      const name=wrapped(item.caption,normal,7.1,iw-10).slice(0,2)
      for(let k=0;k<name.length;k++)page.drawText(name[k]!,{x:x+5,y:y-ih+18-k*9,size:7.1,font:normal,color:INK})
    }
    y-=ih+22;i+=rowPhotos.length
  }
  heading('Firmas y conformidad')
  ensure(130)
  const sigs=[{title:'Tecnico responsable',name:input.tecnico,bytes:signatures.tecnico},
    {title:'Responsable del cliente',name:input.firmanteCliente,bytes:signatures.cliente}]
  for(let i=0;i<2;i++){
    const x=M+i*(CW/2+5),w=CW/2-5,s=sigs[i]!
    page.drawRectangle({x,y:y-110,width:w,height:110,borderWidth:.5,borderColor:BORDER,color:WHITE})
    const img=await pdf.embedJpg(s.bytes),scaled=img.scale(Math.min((w-20)/img.width,57/img.height))
    page.drawImage(img,{x:x+(w-scaled.width)/2,y:y-72+(57-scaled.height)/2,width:scaled.width,height:scaled.height})
    page.drawText(s.title,{x:x+9,y:y-86,size:7.5,font:bold,color:NAVY})
    const name=wrapped(s.name,normal,8,w-18)[0]||'-'
    page.drawText(name,{x:x+9,y:y-100,size:8,font:normal,color:INK})
  }
  y-=133
  text('Informe generado con datos historicos registrados al finalizar el servicio. Los resultados de monitoreo corresponden a observaciones de campo; no sustituyen una evaluacion sanitaria independiente.',{size:7.5,color:MUTED})

  const pages=pdf.getPages()
  pages.forEach((p,index)=>{
    p.drawLine({start:{x:M,y:43},end:{x:PW-M,y:43},color:BORDER,thickness:.5})
    p.drawText('SOLUCIONES RADICALES  /  '+safe(input.solicitud),{x:M,y:28,size:7,font:normal,color:MUTED})
    p.drawText(String(index+1)+' / '+pages.length,{x:PW-M-30,y:28,size:7,font:bold,color:MUTED})
  })
  return pdf.save({useObjectStreams:true})
}
