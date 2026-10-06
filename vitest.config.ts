import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      env: {
        NEON_AUTH_BASE_URL: 'https://auth.example.test',
        NEON_AUTH_JWKS_URL: 'https://auth.example.test/.well-known/jwks.json',
        VITE_NEON_AUTH_URL: 'https://auth.example.test',
        VITE_NEON_DATA_API_URL: 'https://data.example.test',
        VITE_NEON_FUNCTION_URL: 'https://api.example.test',
      },
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
    },
  }),
)
