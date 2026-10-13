const RECOVERY_KEY = 'sr:stale-chunk-recovery'
const RECOVERY_WINDOW_MS = 60_000

type RecoveryLocation = Pick<Location, 'href' | 'reload'>
type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem'>

type RecoveryOptions = {
  location?: RecoveryLocation
  storage?: RecoveryStorage
  now?: () => number
}

const staleChunkPatterns = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /loading chunk [\w-]+ failed/i,
  /chunkloaderror/i,
  /unable to preload css/i,
]

function errorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return typeof error === 'string' ? error : ''
}

export function isStaleChunkError(error: unknown): boolean {
  const message = errorMessage(error)
  return staleChunkPatterns.some(pattern => pattern.test(message))
}

export function recoverStaleChunk(error: unknown, options: RecoveryOptions = {}): boolean {
  if (!isStaleChunkError(error)) return false
  const location = options.location ?? window.location
  const storage = options.storage ?? window.sessionStorage
  const now = (options.now ?? Date.now)()

  try {
    const previous = JSON.parse(storage.getItem(RECOVERY_KEY) ?? 'null') as { href?: unknown; at?: unknown } | null
    if (previous?.href === location.href && typeof previous.at === 'number' && now - previous.at < RECOVERY_WINDOW_MS) {
      return false
    }
    storage.setItem(RECOVERY_KEY, JSON.stringify({ href: location.href, at: now }))
  } catch {
    return false
  }

  location.reload()
  return true
}

export function handleVitePreloadError(event: Event, options: RecoveryOptions = {}): void {
  const error = (event as Event & { payload?: unknown }).payload
  if (recoverStaleChunk(error, options)) event.preventDefault()
}
