// Puts the game up at chunky.ms: main by default, as it is on GitHub rather than as it is in this folder, and then waits until
// chunky.ms is serving that commit: exactly its index.html, and a version.txt that says which commit it is, three times running.
//
//   node tools/deploy.mjs [--ref <commit>] [--dry]
//
// --ref puts up another commit instead, such as an older one to go back to. --dry says what would go up and stops there.
//
// Only what the game loads goes up: index.html and the wallet's page beside it, src/, data/ and audio/, without the tests or the
// notes beside them. A commit from before there was a wallet's page sends what it has. It's a list
// of what goes rather than of what stays, so that something new in the repo, like the notes about real people in docs/, can't
// end up on the web by being forgotten. A favicon.ico goes up beside them, which Chrome asks a real site for whatever icon its
// page names: tools/favicon.mjs makes it from index.html's own tab icon, there and then, so it's always the icon that's going up.
// So does a version.txt, which is the commit and nothing else. A deploy needn't change index.html, and then index.html can't say
// whether chunky.ms has changed over: on 2026-11-04 the new stone.mp3 was a 404 for a moment after index.html said it was live.
// It goes to the game's own Vercel project as its live version, with this Mac's Vercel sign-in. The portfolio that used to be at
// chunky.ms is in the other project, untouched.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { favicon, iconOf } from './favicon.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SITE = 'https://chunky.ms/', VERCEL = 'vercel@65.9.0', TEAM = 'team_ivvZR0r1i3i28k7gFppIlkzc', PROJECT = 'prj_v0aTWXr5ofi5Yzt0os3Lz04c9ntS';
const GOES = ['index.html', 'wallet.html', 'src', 'data', 'audio'], STAYS = [/\.test\.js$/, /\.md$/, /^data\/raw\//];

const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
git('fetch', '-q', 'origin');
const sha = git('rev-parse', `${arg('--ref') || 'origin/main'}^{commit}`), what = git('log', '-1', '--format=%h %s', sha);

const dir = join(ROOT, 'data', 'raw', 'deploy', sha.slice(0, 12)), tar = `${dir}.tar`;
rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
git('archive', '-o', tar, sha, '--', ...git('ls-tree', '--name-only', sha, '--', ...GOES).split('\n').filter(Boolean));
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
const icon = iconOf(readFileSync(join(dir, 'index.html'), 'utf8'));
if (icon) { const made = await favicon(icon); writeFileSync(join(dir, 'favicon.ico'), made); files.push(['favicon.ico', made.length]); }
else console.log('no favicon.ico: index.html\'s icon isn\'t an SVG written into the page');
writeFileSync(join(dir, 'version.txt'), `${sha}\n`); files.push(['version.txt', sha.length + 1]);
const bytes = files.reduce((n, [, size]) => n + size, 0);
console.log(`${what}: ${files.length} files, ${(bytes / 1048576).toFixed(1)} MB`);
if (process.argv.includes('--dry')) { for (const [f] of files) console.log(`  ${f}`); rmSync(dir, { recursive: true, force: true }); process.exit(0); }

// The project's named here rather than linked by hand, so nothing's asked
mkdirSync(join(dir, '.vercel')); writeFileSync(join(dir, '.vercel', 'project.json'), JSON.stringify({ orgId: TEAM, projectId: PROJECT }));
const said = execFileSync('npx', ['--yes', VERCEL, 'deploy', '--prod', '--yes', '--scope', 'mculps-projects'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const url = said.match(/https:\/\/[\w.-]+\.vercel\.app/)?.[0];
console.log(`uploaded: ${url ?? said.trim().split('\n').pop()}`);

// chunky.ms changes over as soon as Vercel says it's ready, but a stale answer's possible for a moment, so it has to be the new
// one three times running
const want = createHash('sha256').update(readFileSync(join(dir, 'index.html'))).digest('hex'), began = Date.now();
rmSync(dir, { recursive: true, force: true });
const ask = (path, as) => fetch(`${SITE}${path}?deploy=${sha.slice(0, 8)}-${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r[as]() : null)).catch(() => null);
for (let running = 0; ;) {
  const [page, version] = await Promise.all([ask('', 'arrayBuffer'), ask('version.txt', 'text')]);
  const now = !!page && createHash('sha256').update(Buffer.from(page)).digest('hex') === want && version?.trim() === sha;
  running = now ? running + 1 : 0;
  if (running === 3) { console.log(`${SITE} is serving ${what} (${((Date.now() - began) / 1000).toFixed(0)} s)`); break; }
  if (Date.now() - began > 120000) { console.error(`${SITE} still isn't serving ${sha.slice(0, 7)} after two minutes`); process.exit(1); }
  await new Promise((r) => setTimeout(r, now ? 1000 : 3000));
}
