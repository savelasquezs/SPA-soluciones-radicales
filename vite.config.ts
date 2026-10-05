import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

const previewEnvironment = {
  VITE_NEON_AUTH_URL: 'https://ep-super-base-b7qaqaz6.neonauth.c-13.us-east-1.aws.neon.tech/neondb/auth',
  VITE_NEON_DATA_API_URL: 'https://ep-super-base-b7qaqaz6.apirest.c-13.us-east-1.aws.neon.tech/neondb/rest/v1',
  VITE_NEON_FUNCTION_URL: 'https://br-nameless-violet-b7y48a5v-api.compute.c-13.us-east-1.aws.neon.tech',
}

const isWorkersPreview = process.env.WORKERS_CI === '1'
  && process.env.WORKERS_CI_BRANCH !== 'main'
const previewDefinitions = isWorkersPreview
  ? Object.fromEntries(
      Object.entries(previewEnvironment)
        .filter(([name]) => !process.env[name])
        .map(([name, value]) => [`import.meta.env.${name}`, JSON.stringify(value)]),
    )
  : undefined

export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  define: previewDefinitions,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
