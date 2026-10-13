/** A reusable client-safe HTML email. The secure report link and QR are always included. */
export type ReportEmailContent = {
  message: string
  solicitud: string
  cliente: string
  sede: string
  link: string
  expiresOn: string
  certificateCount: number
  qrContentId: string
}

export function escapeEmailHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export function buildReportEmailContent(input: ReportEmailContent): { text: string; html: string } {
  const { solicitud, cliente, sede, message, link, expiresOn, certificateCount, qrContentId } = input
  const safe = {
    solicitud:escapeEmailHtml(solicitud), cliente:escapeEmailHtml(cliente),
    sede:escapeEmailHtml(sede), link:escapeEmailHtml(link),
    expiresOn:escapeEmailHtml(expiresOn), qrContentId:escapeEmailHtml(qrContentId),
  }
  const attachmentsNote = certificateCount > 0
    ? 'Se adjunta' + (certificateCount === 1 ? ' el certificado correspondiente' : 'n los certificados correspondientes') + ' a este servicio.'
    : ''
  const paragraphs = escapeEmailHtml(message).replace(/\r\n?/g, '\n').replace(/\n/g, '<br>')
  const html = [
    '<!doctype html><html lang="es"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head>',
    '<body style="margin:0;padding:22px 12px;background:#f4f7f9;color:#17324d;font-family:Arial,Helvetica,sans-serif">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;border:1px solid #dce6eb;border-radius:10px;background:#ffffff">',
    '<tr><td style="padding:25px 28px 17px;border-bottom:3px solid #206b89">',
    '<div style="font-size:18px;font-weight:700;color:#17324d">Soluciones Radicales</div>',
    '<div style="font-size:10px;letter-spacing:1.5px;color:#637780;margin-top:4px">MANEJO INTEGRADO DE PLAGAS</div></td></tr>',
    '<tr><td style="padding:28px">',
    '<p style="margin:0 0 9px;font-size:11px;font-weight:700;letter-spacing:1px;color:#206b89">INFORME DE SERVICIO</p>',
    '<h1 style="margin:0 0 19px;font-size:22px;line-height:1.3;color:#17324d">Informe técnico disponible</h1>',
    '<div style="font-size:14px;line-height:1.75;overflow-wrap:break-word;color:#344958">', paragraphs, '</div>',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0;background:#f4f8fa;border-radius:6px">',
    '<tr><td style="padding:13px 16px;font-size:13px;line-height:1.9;color:#344958">',
    '<strong style="color:#17324d">Servicio:</strong> ',safe.solicitud,'<br>',
    '<strong style="color:#17324d">Cliente:</strong> ',safe.cliente,'<br>',
    '<strong style="color:#17324d">Sede:</strong> ',safe.sede,'</td></tr></table>',
    '<p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:#526773">Consulta los resultados, las fotografías y las firmas de conformidad.</p>',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td style="border-radius:6px;background:#206b89;text-align:center">',
    '<a href="',safe.link,'" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 27px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700">Abrir aquí</a>',
    '</td></tr></table>',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin-top:24px">',
    '<tr><td style="text-align:center;font-size:12px;color:#637780;padding-bottom:9px">También puedes escanear el código QR:</td></tr>',
    '<tr><td style="text-align:center"><img src="cid:',safe.qrContentId,'" alt="Código QR para abrir el informe" width="164" height="164" style="display:block;width:164px;height:164px;margin:0 auto;border:0"></td></tr>',
    '</table>',
    attachmentsNote ? '<p style="font-size:12px;line-height:1.7;color:#536978;margin:18px 0 0">'+escapeEmailHtml(attachmentsNote)+'</p>' : '',
    '<p style="font-size:11px;line-height:1.6;color:#697b86;margin:23px 0 0;border-top:1px solid #e4ebee;padding-top:14px">Enlace de solo lectura válido hasta el ',
    safe.expiresOn,'. No compartas este correo con personas no autorizadas.</p>',
    '</td></tr><tr><td style="padding:14px 28px;background:#f8fafb;font-size:11px;color:#657984">Soluciones Radicales · Manejo Integrado de Plagas</td></tr>',
    '</table></body></html>',
  ].join('')
  const text = [
    message,'',
    'Servicio: '+solicitud,'Cliente: '+cliente,'Sede: '+sede,'',
    'Consulta el informe técnico en:',link,'',
    'También puedes escanear el código QR incluido en el correo.','',
    attachmentsNote,'Enlace válido hasta el '+expiresOn,'',
    'Soluciones Radicales · Manejo Integrado de Plagas',
  ].filter(Boolean).join('\n')
  return { text, html }
}
