import { ApiClientError } from '@/services/apiService'
import type { CertificateContext, CertificateType, GenerateCertificateInput } from '@/types/certificates'

export function validateCertificateTemplateFile(file: File | null): string | undefined {
  if (!file) return undefined
  if (!/\.docx$/i.test(file.name)) return 'Selecciona una plantilla Word (.docx).'
  if (!file.size || file.size > 10 * 1024 * 1024) return 'La plantilla debe contener datos y no superar 10 MB.'
}
export const certificateTypeLabel = (type: CertificateType) => type === 'ESTABLECIMIENTO' ? 'Establecimiento' : 'Vehículo'
export function certificateError(error: unknown): string {
  return error instanceof ApiClientError ? error.message : 'No fue posible completar la operación. Conservamos tus datos; vuelve a intentarlo.'
}
export function generationSelection(context: CertificateContext, type: CertificateType, vehicleIds: string[]) {
  const targets = type === 'ESTABLECIMIENTO' ? [null] : [...vehicleIds].sort()
  const previousPaths: GenerateCertificateInput['previousPaths'] = {}
  for (const id of targets) {
    const previous = context.documents.find((document) => document.type === type && document.vehicleId === id)
    previousPaths[id ?? 'ESTABLECIMIENTO'] = previous?.storagePath ?? null
  }
  return {
    previousPaths,
    replacing: targets.filter(id => context.documents.some(document =>
      document.type === type && document.vehicleId === id && document.pdfAvailable !== false)).length,
    expired: targets.filter(id => context.documents.some(document =>
      document.type === type && document.vehicleId === id && document.pdfAvailable === false)).length,
  }
}
export function defaultCertificateMail(context: CertificateContext) {
  return {
    subject: `Certificados ${context.solicitud} · ${context.siteName}`,
    text: `Buen día,\n\nAdjuntamos los certificados correspondientes al servicio ${context.solicitud}, realizado en ${context.siteName}.\n\nCordialmente,\nSoluciones Radicales`,
  }
}
export function downloadLink(url: string, fileName?: string): void {
  const link = document.createElement('a')
  link.href = url
  if (fileName) link.download = fileName
  link.rel = 'noopener noreferrer'
  // Signed attachment URLs work without a cross-origin fetch/CORS dependency.
  if (!url.startsWith('blob:')) link.target = '_blank'
  document.body.append(link)
  link.click()
  link.remove()
}
