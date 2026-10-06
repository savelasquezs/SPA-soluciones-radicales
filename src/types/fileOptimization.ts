export const MAX_OPTIMIZATION_SOURCE_BYTES = 64 * 1024 * 1024
export const MAX_CERTIFICATE_BYTES = 10 * 1024 * 1024

export type OptimizationRequest = {
  file: File
  profile: 'standard' | 'plan'
}

export type OptimizationResponse =
  | { ok: true; file: File }
  | { ok: false; error: string }
