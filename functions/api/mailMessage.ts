import { randomUUID } from 'node:crypto'
import { ApiError } from './auth'

export type InlineMailImage = {
  name: string
  contentId: string
  bytes: Uint8Array
}
export type MailInput = {
  to: string | string[]; subject: string; text: string
  /** Optional rich variant. Plain-text alternative is always present. */
  html?: string
  /** PNG images referenced by cid: in the HTML; not external tracking URLs. */
  inlineImages?: InlineMailImage[]
  attachments?: { name: string; bytes: Uint8Array }[]
  messageId?: string
  onDispatch?: () => Promise<void>
}
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/
const CID = /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/
const base64Lines = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? ''
const fileName = (raw: string) => raw.replace(/[^A-Za-z0-9._-]/g, '-').slice(-120) || 'certificado.pdf'

export function buildMailMessage(input: MailInput, from: string): string {
  const recipients = typeof input.to === 'string' ? [input.to] : input.to
  if (!recipients.length || recipients.length > 20 || !recipients.every((value) => EMAIL.test(value)) || !EMAIL.test(from)) {
    throw new ApiError(422, 'Selecciona entre 1 y 20 correos válidos')
  }
  if (!input.subject.trim() || input.subject.length > 200 || /[\r\n]/.test(input.subject) || !input.text.trim() || input.text.length > 10_000) {
    throw new ApiError(422, 'Revisa el asunto y el mensaje del correo')
  }
  if (input.html !== undefined && (!input.html.trim() || input.html.length > 30_000)) {
    throw new ApiError(422, 'El contenido HTML del correo no es válido')
  }
  const attachments = input.attachments ?? []
  if (attachments.length > 2001 || attachments.reduce((sum, item) => sum + item.bytes.length, 0) > 15 * 1024 * 1024) {
    throw new ApiError(422, 'Los adjuntos superan el tamaño permitido. Revisa los certificados antes de enviar.')
  }
  const inlineImages = input.inlineImages ?? []
  if ((inlineImages.length && !input.html) || inlineImages.length > 3 ||
    inlineImages.reduce((sum, img) => sum + img.bytes.length, 0) > 1024 * 1024 ||
    !inlineImages.every(img => CID.test(img.contentId) && img.name.length <= 120 && img.bytes.length > 0) ||
    new Set(inlineImages.map(img => img.contentId)).size !== inlineImages.length) {
    throw new ApiError(422, 'Las imágenes incluidas en el mensaje no son válidas')
  }
  const boundary = 'sr-' + randomUUID()
  const related = 'related-' + randomUUID()
  const alternative = 'alternative-' + randomUUID()
  const messageId = input.messageId ?? randomUUID() + '@certificados.solucionesradicales.invalid'
  if (!/^[A-Za-z0-9.@-]+$/.test(messageId)) throw new ApiError(422, 'El identificador del mensaje no es válido')
  const parts = [
    'From: Soluciones Radicales <' + from + '>', 'To: ' + recipients.join(', '),
    'Subject: =?UTF-8?B?' + Buffer.from(input.subject).toString('base64') + '?=',
    'Message-ID: <' + messageId + '>', 'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="' + boundary + '"', '',
  ]
  if (input.html) {
    parts.push(
      '--' + boundary, 'Content-Type: multipart/related; boundary="' + related + '"', '',
      '--' + related, 'Content-Type: multipart/alternative; boundary="' + alternative + '"', '',
      '--' + alternative, 'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64', '', base64Lines(Buffer.from(input.text)),
      '--' + alternative, 'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64', '', base64Lines(Buffer.from(input.html)),
      '--' + alternative + '--',
    )
    for (const image of inlineImages) {
      parts.push('--' + related, 'Content-Type: image/png; name="' + fileName(image.name) + '"',
        'Content-ID: <' + image.contentId + '>',
        'Content-Disposition: inline; filename="' + fileName(image.name) + '"',
        'Content-Transfer-Encoding: base64', '', base64Lines(image.bytes))
    }
    parts.push('--' + related + '--')
  } else {
    // Preserve the previously supported certificate and calendar plain emails.
    parts.push('--' + boundary, 'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64', '', base64Lines(Buffer.from(input.text)))
  }
  for (const attachment of attachments) {
    const name = fileName(attachment.name)
    parts.push('--' + boundary, 'Content-Type: application/pdf',
      'Content-Disposition: attachment; filename="' + name + '"',
      'Content-Transfer-Encoding: base64', '', base64Lines(attachment.bytes))
  }
  parts.push('--' + boundary + '--', '')
  return parts.join('\r\n')
}
