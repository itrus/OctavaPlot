// The measurements of the performance table of the ROADMAP, taken in the browser on the production build: node scripts/perf.mjs (npm run perf).
// They are written to test-results/perf.json and printed with the machine they were taken on; they are not pass or fail checks.
import { spawnSync } from 'node:child_process';

const run = spawnSync('npx', ['playwright', 'test', '--config', 'playwright.perf.config.ts'], { stdio: 'inherit', shell: true, env: { ...process.env, PERF: '1' } });
process.exit(run.status ?? 1);
