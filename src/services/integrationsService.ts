import { apiRequest } from '@/services/apiService'

export type GoogleIntegrationStatus = {
  connected: boolean
  email: string | null
  needsReauthorization: boolean
}

export function getGoogleIntegrationStatus(): Promise<GoogleIntegrationStatus> {
  return apiRequest<GoogleIntegrationStatus>('api/google/status')
}

export async function getGoogleAuthorizationUrl(returnUrl: string): Promise<string> {
  const result = await apiRequest<{ authorizationUrl: string }>('api/google/authorization-url', {
    method: 'POST',
    body: JSON.stringify({ returnUrl }),
  })
  return result.authorizationUrl
}

export function sendTestEmail(input: { to: string; subject: string; text: string }): Promise<{ sent: boolean; messageId: string }> {
  return apiRequest<{ sent: boolean; messageId: string }>('api/email/test', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
