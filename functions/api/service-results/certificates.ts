import { createHash } from 'node:crypto'
import { ApiError } from '../auth'
import { transaction } from '../db'
import { generateServiceCertificates, type CertificateAuthorization, type CertificateGenerationPlan } from '../certificates/service'
import { loadCertificateContext, targetKey } from '../certificates/repository'
import type { CertificateDocument, CertificateType } from '../../../src/types/certificates'

export async function ensureReportCertificates(
  serviceId: string, actorId: string, authorize: CertificateAuthorization,
): Promise<CertificateDocument[]> {
  const loaded = await transaction(async client => {
    await authorize(client)
    return loadCertificateContext(client, serviceId)
  })
  const groups: { type: CertificateType; targets: (string | null)[] }[] = [
    { type: 'ESTABLECIMIENTO', targets: [null] },
    ...(loaded.source.vehicleEnabled && loaded.context.vehicles.length
      ? [{ type: 'VEHICULO' as const, targets: loaded.context.vehicles.map(vehicle => vehicle.id) }] : []),
  ]
  const documents: CertificateDocument[] = []
  const plans: CertificateGenerationPlan[] = []
  for (const { type, targets } of groups) {
    const missing: (string | null)[] = []
    for (const target of targets) {
      const existing = loaded.context.documents.find(document => document.type === type && document.vehicleId === target)
      if (existing?.storagePath && existing.pdfAvailable !== false) documents.push(existing)
      else missing.push(target)
    }
    if (!missing.length) continue
    const availability = loaded.context.availability[type]
    if (!availability.available) throw new ApiError(422,
      `No se puede enviar el informe sin su certificado. ${availability.reason ?? 'Revisa la configuración.'}`,
      'REPORT_CERTIFICATE_REQUIRED')
    plans.push({
      type, vehicleIds: missing.filter((id): id is string => id !== null), confirmReplace: false,
      previousPaths: Object.fromEntries(missing.map(target => [targetKey(type, target),
        loaded.context.documents.find(document => document.type === type && document.vehicleId === target)?.storagePath ?? null])),
    })
  }
  if (plans.length) {
    const hash = createHash('sha256').update(JSON.stringify([actorId, serviceId, plans])).digest('hex')
    const requestId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
    const result = await generateServiceCertificates({requestId,serviceId,plans},actorId,authorize)
    documents.push(...result.documents)
  }
  return documents
}
