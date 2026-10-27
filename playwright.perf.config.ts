import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const PORT = 5199;

/** The measurements (npm run perf) are taken on the production build, not the development server: React is much slower in development. */
export default defineConfig({
  ...base,
  testMatch: '**/performance.spec.ts',
  fullyParallel: false,
  workers: 1,
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/OctavaPlot/`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
