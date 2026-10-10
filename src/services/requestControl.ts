export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: Record<string, unknown>,
  ) { super(message) }
}

export class RequestTimeoutError extends ApiClientError {
  constructor() {
    super('La solicitud tardó demasiado. Tus datos se conservan; vuelve a intentarlo.', 408, 'REQUEST_TIMEOUT')
    this.name = 'RequestTimeoutError'
  }
}

/** Bounds the entire operation, including auth and response-body consumption.
 * Aborting fetch alone is insufficient when an SDK promise does not settle. */
export async function withRequestDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal | null,
): Promise<T> {
  parentSignal?.throwIfAborted()
  const controller = new AbortController()
  const cancel = () => controller.abort(parentSignal?.reason)
  let onAbort: () => void = () => undefined
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(controller.signal.reason)
    controller.signal.addEventListener('abort', onAbort, { once: true })
  })
  parentSignal?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => controller.abort(new RequestTimeoutError()), timeoutMs)
  try {
    return await Promise.race([
      Promise.resolve().then(() => {
        controller.signal.throwIfAborted()
        return work(controller.signal)
      }),
      aborted,
    ])
  } finally {
    clearTimeout(timer)
    parentSignal?.removeEventListener('abort', cancel)
    controller.signal.removeEventListener('abort', onAbort)
  }
}

export function waitForRetry(signal?: AbortSignal | null): Promise<void> {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const finish = () => { signal?.removeEventListener('abort', cancel); resolve() }
    const timer = setTimeout(finish, 750)
    const cancel = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', cancel, { once: true })
  })
}
