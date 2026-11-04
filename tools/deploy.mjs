// Puts the game up at chunky.ms: main by default, as it is on GitHub rather than as it is in this folder, and then waits until
// chunky.ms is serving exactly that index.html.
//
//   node tools/deploy.mjs [--ref <commit>] [--dry]
//
// --ref puts up another commit instead, such as an older one to go back to. --dry says what would go up and stops there.
//
// Only what the game loads goes up: index.html, src/, data/ and audio/, without the tests or the notes beside them. It's a list
// of what goes rather than of what stays, so that something new in the repo, like the notes about real people in docs/, can't
// end up on the web by being forgotten. It goes to the game's own Vercel project as its live version, with this Mac's Vercel
// sign-in. The portfolio that used to be at chunky.ms is in the other project, untouched.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SITE = 'https://chunky.ms/', VERCEL = 'vercel@65.9.0', TEAM = 'team_ivvZR0r1i3i28k7gFppIlkzc', PROJECT = 'prj_v0aTWXr5ofi5Yzt0os3Lz04c9ntS';
const GOES = ['index.html', 'src', 'data', 'audio'], STAYS = [/\.test\.js$/, /\.md$/, /^data\/raw\//];

const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
git('fetch', '-q', 'origin');
const sha = git('rev-parse', `${arg('--ref') || 'origin/main'}^{commit}`), what = git('log', '-1', '--format=%h %s', sha);

const dir = join(ROOT, 'data', 'raw', 'deploy', sha.slice(0, 12)), tar = `${dir}.tar`;
rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
git('archive', '-o', tar, sha, '--', ...GOES);
execFileSync('tar', ['-xf', tar, '-C', dir]); unlinkSync(tar);
const files = [];
(function walk(at, rel) {
  for (const name of readdirSync(at)) {
    const path = join(at, name), r = rel ? `${rel}/${name}` : name;
    if (statSync(path).isDirectory()) walk(path, r);
    else if (STAYS.some((s) => s.test(r))) unlinkSync(path);
    else files.push([r, statSync(path).size]);
  }
})(dir, '');
const bytes = files.reduce((n, [, size]) => n + size, 0);
console.log(`${what}: ${files.length} files, ${(bytes / 1048576).toFixed(1)} MB`);
if (process.argv.includes('--dry')) { for (const [f] of files) console.log(`  ${f}`); rmSync(dir, { recursive: true, force: true }); process.exit(0); }

// The project's named here rather than linked by hand, so nothing's asked
mkdirSync(join(dir, '.vercel')); writeFileSync(join(dir, '.vercel', 'project.json'), JSON.stringify({ orgId: TEAM, projectId: PROJECT }));
const said = execFileSync('npx', ['--yes', VERCEL, 'deploy', '--prod', '--yes', '--scope', 'mculps-projects'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const url = said.match(/https:\/\/[\w.-]+\.vercel\.app/)?.[0];
console.log(`uploaded: ${url ?? said.trim().split('\n').pop()}`);

// chunky.ms changes over as soon as Vercel says it's ready, but a stale answer's possible for a moment
const want = createHash('sha256').update(readFileSync(join(dir, 'index.html'))).digest('hex'), began = Date.now();
rmSync(dir, { recursive: true, force: true });
for (;;) {
  const page = await fetch(`${SITE}?deploy=${sha.slice(0, 8)}`, { cache: 'no-store' }).then((r) => r.arrayBuffer()).catch(() => null);
  if (page && createHash('sha256').update(Buffer.from(page)).digest('hex') === want) { console.log(`${SITE} is serving ${what} (${((Date.now() - began) / 1000).toFixed(0)} s)`); break; }
  if (Date.now() - began > 120000) { console.error(`${SITE} still isn't serving ${sha.slice(0, 7)} after two minutes`); process.exit(1); }
  await new Promise((r) => setTimeout(r, 3000));
}
