import { defineConfig } from 'vitest/config'

const url=process.env.TEST_DATABASE_URL
if(process.env.CI!=='true' || !url) throw new Error('Services integration tests require the isolated CI database.')
const target=new URL(url)
if(!['localhost','127.0.0.1'].includes(target.hostname) || target.pathname!=='/sr_certificates_test') throw new Error('Refusing to run services integration tests outside ephemeral CI PostgreSQL.')

export default defineConfig({
  test:{
    environment:'node',include:['tests/integration/admin-services.pg.ts','tests/integration/technician-service-execution.pg.ts','tests/integration/site-insights.pg.ts'],fileParallelism:false,maxWorkers:1,
    testTimeout:30_000,hookTimeout:30_000,
    env:{ DATABASE_URL:url,NEON_AUTH_JWKS_URL:'https://auth.invalid/.well-known/jwks.json',NEON_AUTH_BASE_URL:'https://auth.invalid',
      GOOGLE_CLIENT_ID:'ci-client',GOOGLE_CLIENT_SECRET:'ci-not-a-real-secret',GOOGLE_OAUTH_REDIRECT_URI:'https://api.invalid/callback' },
  },
})
