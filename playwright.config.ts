import { defineConfig } from '@playwright/test';

const PORT = 5199;

/**
 * The browser tests (npm run e2e). They drive the installed Google Chrome (channel 'chrome'), so no browser has to be downloaded,
 * against the development server, which is started here on its own port. Each test gets a fresh browser profile, and so the example project.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/OctavaPlot/`,
    channel: 'chrome',
    viewport: { width: 1280, height: 720 },
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/OctavaPlot/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
