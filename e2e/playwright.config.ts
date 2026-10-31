import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const PORT = 5199;
/** The project root: the servers below run there, not in this folder. */
const root = fileURLToPath(new URL('..', import.meta.url));
/**
 * The measurements (npm run perf, which sets PERF=1) are taken on the production build, not the development server (React is much slower in
 * development), one test at a time, and only from performance.spec.ts, which is skipped otherwise.
 */
const perf = process.env.PERF === '1';

/**
 * The browser tests (npm run e2e). They drive the installed Google Chrome (channel 'chrome'), so no browser has to be downloaded,
 * against the development server, which is started here on its own port. Each test gets a fresh browser profile, and so the example project.
 * What a run writes (traces of failed tests) goes under node_modules/.cache, not into the project folder.
 */
export default defineConfig({
  testDir: '.',
  testMatch: perf ? '**/performance.spec.ts' : '**/*.spec.ts',
  outputDir: '../node_modules/.cache/playwright',
  fullyParallel: !perf,
  ...(perf ? { workers: 1 } : {}),
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
    command: perf ? `npm run build && npx vite preview --port ${PORT} --strictPort` : `npx vite --port ${PORT} --strictPort`,
    cwd: root,
    url: `http://localhost:${PORT}/OctavaPlot/`,
    reuseExistingServer: false,
    timeout: perf ? 240_000 : 60_000,
  },
});
