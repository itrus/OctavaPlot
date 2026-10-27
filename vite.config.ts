import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// One source for the version: package.json (bump it with `npm version patch|minor|major`). The git commit is added
// to the tooltip so any build can be traced; it is omitted when git is not available (for example a source archive).
const version: string = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
})();

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version), __APP_COMMIT__: JSON.stringify(commit) },
  // Served from https://itrus.github.io/OctavaPlot/ on GitHub Pages.
  base: '/OctavaPlot/',
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
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'] },
});
