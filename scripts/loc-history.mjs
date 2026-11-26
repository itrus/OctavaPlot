// Lines of code per commit, stored in docs/loc-history.csv (ignored by git: it is made from the history and can be made again):
// date, commit, source, tests, kloc (the size after the commit), added, deleted (lines changed by the commit itself).
// Incremental: a commit already in the file is never counted again; rows of commits that are no longer in the history
// (after a rebase or amend) are dropped; a file with another header is counted again from the start.
// Source = .ts .tsx .css .html .rs; tests = the same files named *.test.*. added/deleted cover both, against the first parent.
// Usage: node scripts/loc-history.mjs [--chart]   (npm run loc)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const FILE = 'docs/loc-history.csv';
const HEADER = 'date,commit,source,tests,kloc,added,deleted';
const PATTERNS = ['*.ts', '*.tsx', '*.css', '*.html', '*.rs'];
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });

const commits = git('log', '--reverse', '--format=%h %cI %p').trim().split('\n').map((l) => l.split(' '));
const known = new Map();
if (existsSync(FILE)) {
  const [head, ...lines] = readFileSync(FILE, 'utf8').split(/\r?\n/);
  if (head === HEADER) for (const line of lines) if (line) known.set(line.split(',')[1], line);
}

const count = (hash) => {
  let source = 0;
  let tests = 0;
  for (const line of git('grep', '-c', '', hash, '--', ...PATTERNS).split('\n')) {
    if (!line) continue;
    const cut = line.lastIndexOf(':');
    const n = Number(line.slice(cut + 1));
    if (line.slice(0, cut).includes('.test.')) tests += n;
    else source += n;
  }
  return { source, tests };
};

const changed = (hash, parent) => {
  let added = 0;
  let deleted = 0;
  for (const line of git('diff', '--numstat', parent || EMPTY_TREE, hash, '--', ...PATTERNS).split('\n')) {
    const [a, d] = line.split('\t');
    if (a && a !== '-') added += Number(a);
    if (d && d !== '-') deleted += Number(d);
  }
  return { added, deleted };
};

const rows = commits.map(([hash, date, parent]) => {
  const old = known.get(hash);
  if (old) return old;
  const { source, tests } = count(hash);
  const { added, deleted } = changed(hash, parent);
  return [date, hash, source, tests, ((source + tests) / 1000).toFixed(1), added, deleted].join(',');
});
const added = rows.filter((r) => !known.has(r.split(',')[1])).length;
writeFileSync(FILE, [HEADER, ...rows].join('\n') + '\n');
console.log(`${rows.length} commits, ${added} counted now, ${known.size - (rows.length - added)} dropped`);

if (process.argv.includes('--chart')) {
  // One line per day (the CSV keeps every commit): the size after the day's last commit, source and tests in kLoC in their own
  // columns and their total; the bar shows the same split (1 character = 2k lines). +/- adds up the lines added and deleted by all the commits of the day.
  const k = (n) => (Number(n) / 1000).toFixed(1);
  const days = new Map();
  for (const [date, hash, source, tests, kloc, add, del] of rows.map((r) => r.split(','))) {
    const day = days.get(date.slice(0, 10)) ?? { commits: 0, added: 0, deleted: 0 };
    days.set(date.slice(0, 10), { ...day, hash, source, tests, kloc, commits: day.commits + 1, added: day.added + Number(add), deleted: day.deleted + Number(del) });
  }
  const list = [...days].map(([day, d]) => ({ day, ...d, bar: '█'.repeat(Math.round(d.source / 2000)) + '░'.repeat(Math.round(d.tests / 2000)) }));
  const width = Math.max(...list.map((d) => d.bar.length));
  console.log('\n█ source   ░ tests   (1 character = 2k lines; one line per day, at its last commit)\n');
  console.log(`${'day'.padEnd(10)} ${'commit'.padEnd(7)} ${'n'.padStart(3)} ${''.padEnd(width)} ${'source'.padStart(6)} ${'tests'.padStart(6)} ${'total'.padStart(6)}  +/- lines`);
  for (const d of list) {
    console.log(`${d.day} ${d.hash.padEnd(7)} ${String(d.commits).padStart(3)} ${d.bar.padEnd(width)} ${k(d.source).padStart(6)} ${k(d.tests).padStart(6)} ${d.kloc.padStart(6)}  +${d.added} -${d.deleted}`);
  }
  const last = list.at(-1);
  console.log(`\n${rows.length} commits on ${list.length} days. At ${last.hash}: source ${k(last.source)} kLoC, tests ${k(last.tests)} kLoC, total ${last.kloc} kLoC (tests ${Math.round((100 * last.tests) / (Number(last.source) + Number(last.tests)))} %).`);
}
