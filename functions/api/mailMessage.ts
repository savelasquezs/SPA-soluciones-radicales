import { randomUUID } from 'node:crypto'
import { ApiError } from './auth'

export type MailInput = {
  to: string | string[]; subject: string; text: string
  attachments?: { name: string; bytes: Uint8Array }[]
  messageId?: string
  onDispatch?: () => Promise<void>
}
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/
const base64Lines = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? ''

export function buildMailMessage(input: MailInput, from: string): string {
  const recipients = typeof input.to === 'string' ? [input.to] : input.to
  if (!recipients.length || recipients.length > 20 || !recipients.every((value) => EMAIL.test(value)) || !EMAIL.test(from)) {
    throw new ApiError(422, 'Selecciona entre 1 y 20 correos válidos')
  }
  if (!input.subject.trim() || input.subject.length > 200 || /[\r\n]/.test(input.subject) || !input.text.trim() || input.text.length > 10_000) {
    throw new ApiError(422, 'Revisa el asunto y el mensaje del correo')
  }
  const attachments = input.attachments ?? []
  if (attachments.length > 10 || attachments.reduce((sum, item) => sum + item.bytes.length, 0) > 15 * 1024 * 1024) {
    throw new ApiError(422, 'Los adjuntos superan el tamaño permitido. Envía menos certificados a la vez.')
  }
  const boundary = `sr-${randomUUID()}`
  const messageId = input.messageId ?? `${randomUUID()}@certificados.solucionesradicales.invalid`
  if (!/^[A-Za-z0-9.@-]+$/.test(messageId)) throw new ApiError(422, 'El identificador del mensaje no es válido')
  const parts = [
    `From: Soluciones Radicales <${from}>`, `To: ${recipients.join(', ')}`,
    `Subject: =?UTF-8?B?${Buffer.from(input.subject).toString('base64')}?=`,
    `Message-ID: <${messageId}>`, 'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', base64Lines(Buffer.from(input.text)),
  ]
  for (const attachment of attachments) {
    const name = attachment.name.replace(/[^A-Za-z0-9._-]/g, '-').slice(-120) || 'certificado.pdf'
    parts.push(`--${boundary}`, 'Content-Type: application/pdf', `Content-Disposition: attachment; filename="${name}"`, 'Content-Transfer-Encoding: base64', '', base64Lines(attachment.bytes))
  }
  parts.push(`--${boundary}--`, '')
  return parts.join('\r\n')
}
