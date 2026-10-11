/** One-tab, short-lived authorization to finish changing a Google identity after OAuth. */
const STORAGE_KEY = 'sr:google-profile-handoff'
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const MAX_LIFETIME_MS = 10 * 60_000

type PendingHandoff = { token: string; expiresAt: number }

export function savePendingGoogleHandoff(token: string, expiresInSeconds: number): void {
  if (!TOKEN_PATTERN.test(token) || !Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new Error('No fue posible preparar el cambio de cuenta')
  }
  const record: PendingHandoff = {
    token,
    expiresAt: Date.now() + Math.min(MAX_LIFETIME_MS, expiresInSeconds * 1000),
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record))
}

export function readPendingGoogleHandoff(): string | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed && typeof parsed === 'object' &&
      'token' in parsed && typeof parsed.token === 'string' && TOKEN_PATTERN.test(parsed.token) &&
      'expiresAt' in parsed && typeof parsed.expiresAt === 'number' &&
      parsed.expiresAt > Date.now() && parsed.expiresAt <= Date.now() + MAX_LIFETIME_MS
    ) return parsed.token
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    sessionStorage.removeItem(STORAGE_KEY)
  }
  return null
}

export function clearPendingGoogleHandoff(): void {
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(STORAGE_KEY)
}
