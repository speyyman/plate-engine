import { defineConfig, devices } from '@playwright/test'

// Runs against the production build, so the service worker and relative base are exercised too.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://localhost:4317/', acceptDownloads: true },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx vite build && npx vite preview --port 4317 --strictPort',
    url: 'http://localhost:4317/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
