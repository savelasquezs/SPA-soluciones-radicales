// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildMailMessage } from './mailMessage'
const message = { to: ['uno@example.test', 'dos@example.test'], subject: 'Certificación técnica', text: 'Se adjuntan los certificados. Gracias.', attachments: [{ name: 'certificado.pdf', bytes: Buffer.from('%PDF-example') }], messageId: 'attempt-1@certificados.solucionesradicales.invalid' }
describe('certificate email MIME', () => {
  it('contains selected recipients, UTF-8 text, subject and base64 PDF', () => {
    const mime = buildMailMessage(message, 'business@example.test')
    expect(mime).toContain('To: uno@example.test, dos@example.test')
    expect(mime).toContain(Buffer.from(message.subject).toString('base64'))
    expect(mime).toContain(Buffer.from(message.text).toString('base64'))
    expect(mime).toContain('filename="certificado.pdf"')
    expect(mime).toContain(message.attachments[0]!.bytes.toString('base64'))
    expect(mime).toContain(`Message-ID: <${message.messageId}>`)
  })
  it('supports the existing plain message use without attachments', () => {
    expect(buildMailMessage({ to: 'a@example.test', subject: 'Prueba', text: 'Texto' }, 'b@example.test')).not.toContain('Content-Disposition')
  })
  it.each([{ subject: 'Hello\r\nBcc:bad@example.test' }, { to: ['a@example.test\r\nBcc:b@example.test'] }, { messageId: 'abc\r\nInjected' }, { to: [] }, { text: '' }])('rejects unsafe or missing headers/body %j', (input) => {
    expect(() => buildMailMessage({ ...message, ...input }, 'sender@example.test')).toThrow(/Selecciona|Revisa|identificador/)
  })
  it('enforces attachment limits and sanitizes filenames', () => {
    expect(() => buildMailMessage({ ...message, attachments: [{ name: 'big.pdf', bytes: new Uint8Array(15 * 1024 * 1024 + 1) }] }, 'a@example.test')).toThrow('adjuntos')
    expect(buildMailMessage({ ...message, attachments: [{ name: 'a"\r\nBcc.pdf', bytes: new Uint8Array(1) }] }, 'a@example.test')).toContain('filename="a---Bcc.pdf"')
  })
})

describe('rich report email MIME', () => {
  const png = Buffer.from([137,80,78,71,13,10,26,10,1,2,3])
  const qr = { contentId:'report-qr@solucionesradicales.invalid',name:'codigo-qr.png',bytes:png }
  it('builds a multipart alternative email with an inline QR and preserves certificate attachments', () => {
    const html = '<html><a href="https://example.test/secure">Abrir aquí</a><img src="cid:report-qr@solucionesradicales.invalid"></html>'
    const mime = buildMailMessage({
      to:'cliente@example.test',subject:'Informe de servicio',text:'Enlace: https://example.test/secure',
      html,inlineImages:[qr],attachments:[{name:'certificado.pdf',bytes:Buffer.from('%PDF-') }],
    },'empresa@example.test')
    expect(mime).toContain('Content-Type: multipart/related')
    expect(mime).toContain('Content-Type: multipart/alternative')
    expect(mime).toContain('Content-Type: text/html; charset=UTF-8')
    expect(mime).toContain('Content-Type: text/plain; charset=UTF-8')
    expect(mime.replace(/\r\n/g, '')).toContain(Buffer.from(html).toString('base64'))
    expect(mime).toContain('Content-ID: <report-qr@solucionesradicales.invalid>')
    expect(mime).toContain('Content-Disposition: inline; filename="codigo-qr.png"')
    expect(mime).toContain('Content-Disposition: attachment; filename="certificado.pdf"')
  })
  it('rejects unsafe CID values and inline QR images without HTML', () => {
    expect(() => buildMailMessage({
      to:'cliente@example.test',subject:'Test',text:'Body',html:'<p>Ok</p>',
      inlineImages:[{...qr,contentId:'evil\\r\\nBcc:bad@example.com'}],
    },'sender@example.test')).toThrow('imágenes')
    expect(() => buildMailMessage({
      to:'cliente@example.test',subject:'Test',text:'Body',inlineImages:[qr],
    },'sender@example.test')).toThrow('imágenes')
  })
})
