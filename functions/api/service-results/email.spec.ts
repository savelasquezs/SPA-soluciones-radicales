// @vitest-environment node
import { describe, expect, it } from 'vitest'
import QRCode from 'qrcode'
import { buildReportEmailContent } from './email'

const base = {
  message:'Buenas tardes,\n\nCompartimos su informe.',
  solicitud:'SR-0016',
  cliente:'Cliente de prueba',
  sede:'Santander',
  link:'https://develop.example.com/informe/consulta/' + 'X'.repeat(43),
  expiresOn:'07 de enero de 2027',
  certificateCount:1,
  qrContentId:'report-qr@solucionesradicales.invalid',
}

describe('Correo HTML del informe', () => {
  it('muestra solo Abrir aquí como hipervínculo visible, QR, vencimiento y certificado', () => {
    const { html,text } = buildReportEmailContent(base)
    expect(html).toContain('>Abrir aquí</a>')
    expect(html).toContain('href="' + base.link + '"')
    expect(html).toContain('src="cid:report-qr@solucionesradicales.invalid"')
    expect(html).toContain('Se adjunta el certificado')
    expect(html).toContain('07 de enero de 2027')
    expect(html).not.toContain('>' + base.link + '<')
    expect(text).toContain(base.link)
  })
  it('escapa el mensaje editable y los datos del cliente para impedir inyección HTML', () => {
    const { html } = buildReportEmailContent({...base,message:'Hola <script>alert("x")</script>\nOtra línea',cliente:'<b>Cliente</b>'})
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;b&gt;Cliente&lt;/b&gt;')
    expect(html).toContain('Otra línea')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<b>Cliente</b>')
  })
  it('genera un PNG QR real con codificación y sin dependencias nativas', async () => {
    const image = await QRCode.toBuffer(base.link,{type:'png',errorCorrectionLevel:'M',width:192,margin:2})
    expect(image.length).toBeGreaterThan(150)
    expect(image.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]))
    expect(image.readUInt32BE(16)).toBe(192)
    expect(image.readUInt32BE(20)).toBe(192)
  })
})
