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
