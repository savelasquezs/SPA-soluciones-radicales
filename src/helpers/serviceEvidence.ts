export function criterionPhotoOwner(path: string): { serviceId: string; criterionId: string } | null {
  const match = /^services\/([0-9a-f-]{36})\/criteria\/([0-9a-f-]{36})\/evidence\/[^/]+\.(?:png|jpe?g|webp)$/i.exec(path)
  return match && !path.includes('..') ? { serviceId: match[1]!, criterionId: match[2]! } : null
}
