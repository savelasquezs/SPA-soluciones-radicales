// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { addCalendarMonths, certificateSnapshot, effectiveTemplate, type LoadedCertificateContext } from './repository'
import { sampleCertificateData } from './docx'
function loaded(): LoadedCertificateContext {
  return {
    source: { id: 'service', version: '1', solicitud: 'SS-123', state: 'FINALIZADO', serviceType: 'PRINCIPAL', siteType: 'NEGOCIO', clientType: 'NEGOCIO', siteId: 'site', clientName: 'Negocio actual', nit: '900', siteName: 'Sede', address: 'Dirección', technicianName: 'Ana', issuedOn: '2024-01-31', businessMonths: 1, vehicleMonths: 2, vehicleEnabled: true, businessEmails: [], siteEmails: [], contactEmail: null },
    settings: { converterReady: true, templates: [{ type: 'ESTABLECIMIENTO', storagePath: 'global.docx', revision: '1', fileName: 'global.docx' }] },
    context: { serviceId: 'service', solicitud: 'SS-123', clientName: 'Negocio', siteName: 'Sede', recipients: [], vehicles: [{ id: 'attended', placa: 'ABC-123' }], documents: [], availability: { ESTABLECIMIENTO: { available: true, reason: null, templateSource: 'GLOBAL' }, VEHICULO: { available: true, reason: null, templateSource: 'GLOBAL' } } },
    products: [{ nombre: 'Producto', metodo: 'Aspersión' }, { nombre: 'Otro producto', metodo: 'Aspersión' }], historicalData: {},
  }
}
describe('certificate domain and historical snapshots', () => {
  it.each([['2024-01-31', 1, '2024-02-29'], ['2025-01-31', 1, '2025-02-28'], ['2024-02-29', 12, '2025-02-28'], ['2025-12-31', 2, '2026-02-28']])('clamps calendar months %s + %i', (date, months, result) => { expect(addCalendarMonths(date, months)).toBe(result) })
  it('uses only the global template and honors unavailable type', () => {
    const value = loaded()
    expect(effectiveTemplate(value, 'ESTABLECIMIENTO')).toBe('global.docx')
    value.context.availability.ESTABLECIMIENTO.available = false
    expect(() => effectiveTemplate(value, 'ESTABLECIMIENTO')).toThrow("El certificado no está habilitado")
  })
  it('rejects all vehicles not explicitly attended, even when a site owns them', () => {
    expect(() => certificateSnapshot(loaded(), 'VEHICULO', 'not-attended')).toThrow('no fue atendido')
    expect(certificateSnapshot(loaded(), 'VEHICULO', 'attended').data.vehiculo_placa).toBe('ABC-123')
  })
  it('groups products/methods from applied rows without duplicate methods', () => {
    const result = certificateSnapshot(loaded(), 'ESTABLECIMIENTO', null)
    expect(result.expiresOn).toBe('2024-02-29')
    expect(result.data.metodos).toEqual([{ nombre: 'Aspersión' }])
    expect(result.data.productos).toHaveLength(2)
  })
  it('regeneration preserves identifier, both dates, and first persisted business/product snapshot', () => {
    const value = loaded()
    value.context.documents.push({ id: 'old-id', type: 'ESTABLECIMIENTO', vehicleId: null, label: 'Establecimiento', storagePath: 'old.pdf', issuedOn: '2023-03-15', expiresOn: '2023-05-15' })
    value.historicalData['old-id'] = { ...sampleCertificateData('ESTABLECIMIENTO'), negocio_nombre: 'Negocio histórico' }
    const result = certificateSnapshot(value, 'ESTABLECIMIENTO', null)
    expect(result).toMatchObject({ id: 'old-id', issuedOn: '2023-03-15', expiresOn: '2023-05-15', data: { negocio_nombre: 'Negocio histórico', fecha_expedicion: '15/03/2023', fecha_vencimiento: '15/05/2023' } })
  })
})
