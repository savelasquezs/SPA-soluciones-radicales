import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/documentation',
  timeout: 300_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  reporter: 'line',
  outputDir: 'docs-media/playwright',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: 'off',
    screenshot: 'off',
    video: {
      mode: 'on',
      size: { width: 1920, height: 1080 },
    },
    viewport: { width: 1920, height: 1080 },
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5174',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    env: {
      VITE_NEON_AUTH_URL: 'https://auth.example.test',
      VITE_NEON_DATA_API_URL: 'https://data.example.test',
      VITE_NEON_FUNCTION_URL: 'https://api.example.test',
    },
  },
})
