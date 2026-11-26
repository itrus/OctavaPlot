import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// The app shows "v0.2 (build #91)": major.minor from package.json (bump with `npm version minor|major`; its patch is
// not shown) and the build number, which is the number of commits on HEAD, so every pushed build gets a higher number
// without a manual bump. Without git (a source archive) or in a shallow clone, where the count would be wrong, the
// build number is left out.
const git = (args: string) => {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};
const packageVersion: string = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
const version = packageVersion.split('.').slice(0, 2).join('.');
const build = git('rev-parse --is-shallow-repository') === 'false' ? git('rev-list --count HEAD') : '';

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version), __APP_BUILD__: JSON.stringify(build) },
  // Served from the root of https://octava.be/ (Caddy on the VPS; .github/workflows/deploy.yml).
  base: '/',
  // The statistics API: the browser calls /api/stats/<route> on its own origin. In development Vite forwards it to R
  // (plumber2) on 127.0.0.1:12501 with the prefix removed, as Caddy's handle_path does on the VPS; R decides which
  // routes exist (server/plumber2.R).
  server: {
    proxy: {
      '/api/stats/': { target: 'http://127.0.0.1:12501', rewrite: (path) => path.replace(/^\/api\/stats/, '') },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'd3', test: /node_modules[\\/](d3|d3-[^\\/]+|internmap|delaunator|robust-predicates)[\\/]/ },
            // Client React only; react-dom/server stays out so it can load lazily with export.
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/](?!.*server)/ },
          ],
        },
      },
    },
  },
  // The default 5 s is too short for the heaviest tests (the source scan, a fit, the gallery round trip) when the machine is busy.
  // The files share one process (see src/testing/isolation.ts, which resets the module-level state between tests).
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'], testTimeout: 30_000, isolate: false, pool: 'vmThreads', setupFiles: ['src/testing/isolation.ts'] },
});
