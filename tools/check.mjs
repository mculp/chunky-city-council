// Runs every check, the node tests and the browser suites, a few at once and longest first, and says how long each took.
//
//   node tools/check.mjs [--jobs 3] [--only a,b] [--skip a,b] [--changed [base]] [--dry] [--at <commit>] [--timeout 600] [--no-retry] [--shots]
//
// The checks are package.json's scripts, plus the variants below, less what spends money or writes files.
// --changed runs only what a change could break: the uncommitted changes, or the last commit when there are none, or
// everything since base. With --at it's that commit, or everything from base to it. The node tests and smoke always run, and then:
// - the checks whose tool changed, or whose script in package.json did
// - for a src/ or data/ file, the check named for it, and the checks that mention its name if three or fewer do
//   (horde and map are in nearly every tool, so they'd pick everything)
// - the sound checks, for anything under audio/ or with sound in its name
// - talk:host, for the talk server's own files in server/
// - talk, for server/talk.js and server/index.js, whose talk server on this machine it plays against
// - town:host, for the town's own files in server/, its wallets and the chain, their stand-in and the Worker that hosts it
// - net, for the town's own files in server/, the name check in src/names.js and the phone's side of the town, src/together.js
// - wallet, for the wallet's page, the town's wallets and the chain, their stand-in, the town on this machine it plays against, and
//   src/together.js, whose looks have the wallet's rektguys
// - for index.html, the checks named in its changed lines, but for names it uses everywhere, and the sound checks,
//   which are the slowest and come from sound files instead, and the checks that look after what those lines touch,
//   such as fling for the crowd's pose, aura and shoes
// - everything, for a new dependency or a change to tools/browser.mjs
// --dry says what would run, and why, without running it.
// --shots has every check that takes --shots keep its screenshots, under the run's folder in data/raw/check/. It isn't the
// default because some checks step the game on to each screenshot, so with it they play a little differently.
// Other sessions run Chrome on this machine too, and a few suites fail on frame time or a dropped connection when it's
// busy, so anything that fails is run again on its own at the end. Passing then makes it flaky, not failed.
// --at runs a commit from a scratch copy, so the worktree can change underneath it. The last run's times decide what
// starts first, and they and every check's output are kept under data/raw/check/.
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const args = process.argv.slice(2), opt = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : null;
const names = (s) => new Set((s || '').split(',').map((x) => x.trim()).filter(Boolean));
const jobs = Math.max(1, +opt('--jobs') || 3), only = names(opt('--only')), skip = names(opt('--skip'));
const limit = (+opt('--timeout') || 600) * 1000, at = opt('--at');

// never run from here: it spends money, writes the sound sheet, needs a ref, serves rather than checks, or puts the game live
const NEVER = new Set(['check', 'deploy', 'sound:make', 'sound:level', 'frames', 'net:server', 'net:bots']);
// run as well as the plain script, when its tool takes the flag
const VARIANTS = { smoke: '--touch', sound: '--old' };
// for --changed: the checks for a module besides any named after it, the checks that look after parts of index.html by
// other names than their own, and names too common in index.html to mean a check
const ALIASES = { vehicles: ['drive'], damage: ['wreck'], roads: ['walk', 'wet'], mapview: ['net', 'keys', 'water'], fever: ['deaths', 'trains', 'horde'],
  horde: ['fling'], agents: ['fling'], folks: ['fling'], water: ['wet'], lanes: ['wet'], solids: ['wet'] };
const LOOKS_AFTER = { fling: /poseCrowd|aura|shoe|\bhop|\bfl[iu]ng/i, wet: /\b(landH|pondGround|riverDist|groundH|floorAt|roadHalf|onRoad|TOWN_Y|channel)\b/ };
const COMMON = new Set(['play', 'test', 'town', 'water']);

// where it runs: here, or a copy of a commit with this worktree's installs and raw downloads linked in
let dir = ROOT;
const linked = [];
if (at) {
  dir = mkdtempSync(join(tmpdir(), 'chunky-check-'));
  const tar = join(dir, '.source.tar');
  execFileSync('git', ['-C', ROOT, 'archive', '-o', tar, at]);
  execFileSync('tar', ['-xf', tar, '-C', dir]); rmSync(tar);
  for (const d of ['node_modules', '.venv', 'data/raw']) {
    if (existsSync(join(ROOT, d)) && !existsSync(join(dir, d))) { symlinkSync(join(ROOT, d), join(dir, d)); linked.push(join(dir, d)); }
  }
}
// the copy goes however this ends: done, failed, stopped with ^C, or stopped by whatever started it. The links go first, so
// removing it can never reach through them into this worktree
process.on('exit', () => {
  if (dir === ROOT) return;
  try { for (const l of linked) unlinkSync(l); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  catch (e) { console.error(`left ${dir}: ${e.message}`); }
});
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();
const what = at ? `${at} (${git('rev-parse', '--short', at)})` : `${git('rev-parse', '--short', 'HEAD')}${git('status', '--porcelain') ? ' with uncommitted changes' : ''}`;

const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')), checks = [];
for (const [name, cmd] of Object.entries(pkg.scripts)) {
  if (NEVER.has(name)) continue;
  checks.push({ name, argv: ['run', name] });
  const flag = VARIANTS[name], tool = cmd.match(/tools\/[\w.-]+\.mjs/)?.[0];
  if (flag && tool && readFileSync(join(dir, tool), 'utf8').includes(`'${flag}'`)) checks.push({ name: `${name} ${flag}`, argv: ['run', name, '--', flag] });
}
// --changed: which checks a change could break, and why
const why = new Map();
if (args.includes('--changed')) {
  const given = opt('--changed'), base = given && !given.startsWith('--') ? given : null;
  // a commit from a copy is that commit, whatever the worktree's doing meanwhile
  const dirty = !at && git('status', '--porcelain') !== '';
  const range = at ? [base ?? `${at}~1`, at] : base ? [base] : dirty ? ['HEAD'] : ['HEAD~1', 'HEAD'], from = range[0];
  const files = git('diff', '--name-only', ...range).split('\n').filter(Boolean);
  if (!at && (base || dirty)) files.push(...git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean));
  const script = (c) => c.name.split(' ')[0], toolOf = (c) => pkg.scripts[script(c)]?.match(/tools\/[\w.-]+\.mjs/)?.[0];
  const sources = new Map(), word = (w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  const mentions = (c, w) => {
    const tool = toolOf(c);
    if (!tool) return false;
    if (!sources.has(tool)) sources.set(tool, readFileSync(join(dir, tool), 'utf8'));
    return word(w).test(sources.get(tool));
  };
  const add = (c, reason) => { if (!why.has(c.name)) why.set(c.name, reason); };
  for (const c of checks) if (c.name === 'test' || script(c) === 'smoke') add(c, 'always');
  for (const f of files) {
    if (f === 'tools/browser.mjs') for (const c of checks) add(c, f);
    if (f === 'package.json') {
      const was = JSON.parse(git('show', `${from}:package.json`)), is = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      const deps = (p) => JSON.stringify([p.dependencies, p.devDependencies]);
      for (const c of checks) {
        if (deps(was) !== deps(is)) add(c, 'a dependency changed');
        else if (was.scripts?.[script(c)] !== is.scripts?.[script(c)]) add(c, 'its script changed');
      }
    }
    for (const c of checks) {
      if (toolOf(c) === f) add(c, f);
      if ((f.startsWith('audio/') || /sound/.test(f)) && c.name.startsWith('sound')) add(c, f);
      if ((/^server\/(talk|worker|wrangler)\b/.test(f) || f === 'tools/wrangler-dev.mjs') && c.name === 'talk:host') add(c, f);
      if (/^server\/(talk|index)\b/.test(f) && c.name === 'talk') add(c, f);
      if ((/^server\/(town|host|worker|wrangler|wallet|chain)\b/.test(f) || /^tools\/(wrangler-dev|chain-stand-in)\.mjs$/.test(f)) && c.name === 'town:host') add(c, f);
      if ((/^server\/(town|index|host)\b/.test(f) || f === 'src/names.js' || f === 'src/together.js') && c.name === 'net') add(c, f);
      if ((/^server\/(town|index|host|wallet|chain)\b/.test(f) || ['wallet.html', 'tools/chain-stand-in.mjs', 'src/together.js'].includes(f)) && c.name === 'wallet') add(c, f);
    }
  }
  const stems = new Set(files.filter((f) => /^(src|data)\//.test(f)).map((f) => f.split('/').pop().replace(/(\.test)?\.[^.]+$/, '')));
  for (const s of stems) {
    for (const c of checks) if (script(c) === s || ALIASES[s]?.includes(script(c))) add(c, `named for ${s}`);
    const by = checks.filter((c) => mentions(c, s));
    if (new Set(by.map(toolOf)).size <= 3) for (const c of by) add(c, `mentions ${s}`);
  }
  if (files.includes('index.html')) {
    const lines = git('diff', '-U0', ...range, '--', 'index.html').split('\n').filter((l) => /^[+-](?![+-])/.test(l)).join('\n');
    for (const c of checks) {
      const name = script(c).split(':')[0];
      if (name.length > 3 && !COMMON.has(name) && name !== 'sound' && word(name).test(lines)) add(c, `index.html's changes mention ${name}`);
      const touched = LOOKS_AFTER[script(c)]?.exec(lines)?.[0];
      if (touched) add(c, `index.html's changes touch ${touched}`);
    }
  }
  console.log(`${files.length} files changed${base ? ` since ${base}` : at ? ` in ${at}` : dirty ? ', not committed yet' : ' in the last commit'}`);
}
let chosen = checks.filter((c) => (!only.size || only.has(c.name) || only.has(c.name.split(' ')[0])) && !skip.has(c.name) && (!why.size || why.has(c.name)));
// a check whose tool runs Python can't run without the venv; data/roads.md says how to make one
const sourceOf = (c) => { const tool = pkg.scripts[c.name.split(' ')[0]].match(/tools\/[\w.-]+\.mjs/)?.[0]; return tool ? readFileSync(join(dir, tool), 'utf8') : ''; };
const shooting = (c) => args.includes('--shots') && sourceOf(c).includes("'--shots'");
const noVenv = existsSync(join(dir, '.venv')) ? [] : chosen.filter((c) => sourceOf(c).includes('.venv'));
chosen = chosen.filter((c) => !noVenv.includes(c));
if (noVenv.length) console.log(`skipping ${noVenv.map((c) => c.name).join(', ')}: there's no .venv here (data/roads.md says how to make one)`);
// nor can one that reads TIGER's own downloads, in a worktree that's never fetched them
const zips = [...new Set(readFileSync(join(dir, 'tools', 'build_roads.py'), 'utf8').match(/tl_\d+_\w+\.zip/g) ?? [])].filter((z) => !existsSync(join(dir, 'data', 'raw', z)));
const noTiger = zips.length ? chosen.filter((c) => sourceOf(c).includes('tiger_lines.py')) : [];
chosen = chosen.filter((c) => !noTiger.includes(c));
if (noTiger.length) console.log(`skipping ${noTiger.map((c) => c.name).join(', ')}: data/raw/ hasn't got TIGER's ${zips[0]}${zips.length > 1 ? ` or ${zips.length - 1} more` : ''} (tools/fetch_tiger.py fetches them)`);
if (!chosen.length) { console.log('nothing to run'); process.exit(1); }
if (args.includes('--dry')) {
  for (const c of chosen) console.log(`${c.name}${why.has(c.name) ? `  (${why.get(c.name)})` : ''}${shooting(c) ? ', keeping its screenshots' : ''}`);
  process.exit(0);
}

const out = join(ROOT, 'data', 'raw', 'check'), timesFile = join(out, 'times.json');
const logs = join(out, new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
mkdirSync(logs, { recursive: true });
const times = existsSync(timesFile) ? JSON.parse(readFileSync(timesFile, 'utf8')) : {};
// longest first, and anything not timed yet before that, so the long poles don't start last
chosen.sort((a, b) => (times[b.name] ?? 1e9) - (times[a.name] ?? 1e9));

// each check runs in its own process group, so a hung browser can be stopped along with the script that opened it
const running = new Set();
const stop = (child, signal) => { try { process.kill(-child.pid, signal); } catch {} };
const run = (c, alone) => new Promise((done) => {
  const log = join(logs, c.name.replace(/[^\w.-]+/g, '_') + (alone ? '.alone' : '') + '.log'), fd = openSync(log, 'w'), t0 = Date.now();
  const argv = shooting(c) ? [...c.argv, ...(c.argv.includes('--') ? [] : ['--']), '--shots', join(logs, 'shots', c.name.replace(/[^\w.-]+/g, '_'))] : c.argv;
  const child = spawn('npm', argv, { cwd: dir, stdio: ['ignore', fd, fd], detached: true, env: { ...process.env, FORCE_COLOR: '0' } });
  running.add(child);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; stop(child, 'SIGTERM'); setTimeout(() => stop(child, 'SIGKILL'), 5000); }, limit);
  child.on('exit', (code) => {
    clearTimeout(timer); running.delete(child); closeSync(fd);
    stop(child, 'SIGKILL'); // anything it left running, such as a Chrome that wouldn't close
    const ok = code === 0 && !timedOut;
    done({ ...c, ok, alone, secs: (Date.now() - t0) / 1000, log, why: timedOut ? `stopped after ${limit / 1000} s` : `exit ${code}` });
  });
});
const report = (r) => console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.secs.toFixed(1).padStart(6)} s  ${r.name}${r.alone ? ', alone' : ''}${r.ok ? '' : `  (${r.why}: ${r.log})`}`);
let stopping = false;
const pool = async (list, n, alone) => {
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (next < list.length && !stopping) { const r = await run(list[next++], alone); results.push(r); report(r); }
  }));
  return results;
};
// stopped from outside, it stops the checks the way a timeout does, so each closes its own browsers and servers, and then makes
// sure after 5 s. Playwright starts Chrome in a process group of its own and closes it on SIGTERM, so a SIGKILL straight away
// would leave Chrome running with nobody to close it. A second ^C doesn't wait.
for (const [signal, n] of [['SIGINT', 2], ['SIGTERM', 15], ['SIGHUP', 1]]) process.on(signal, async () => {
  if (stopping) { for (const child of running) stop(child, 'SIGKILL'); process.exit(128 + n); }
  stopping = true;
  const gone = Promise.all([...running].map((child) => new Promise((r) => child.once('exit', r))));
  for (const child of running) stop(child, 'SIGTERM');
  await Promise.race([gone, new Promise((r) => setTimeout(r, 5000))]);
  for (const child of running) stop(child, 'SIGKILL');
  process.exit(128 + n);
});

console.log(`${chosen.length} checks of ${what}, ${jobs} at a time, longest first`);
const t0 = Date.now();
// while it's being stopped, what's stopped isn't a failure to run again or report, and the signal's handler ends it
const unlessStopping = () => stopping && new Promise(() => {});
const first = await pool(chosen, jobs, false);
await unlessStopping();
const failed = first.filter((r) => !r.ok);
let again = [];
if (failed.length && !args.includes('--no-retry')) {
  console.log(`\nrunning the ${failed.length} that failed again, one at a time`);
  again = await pool(failed, 1, true);
  await unlessStopping();
}

const passed = (r) => r.ok || again.some((a) => a.name === r.name && a.ok);
for (const r of [...first, ...again]) if (r.ok && (!r.alone || !times[r.name])) times[r.name] = Math.round(r.secs * 10) / 10;
writeFileSync(timesFile, JSON.stringify(times, null, 1) + '\n');

const wall = (Date.now() - t0) / 1000, total = first.reduce((s, r) => s + r.secs, 0);
const flaky = failed.filter(passed), broken = failed.filter((r) => !passed(r));
console.log(`\n${Math.round(wall)} s in all, against ${Math.round(total)} s one after another`);
console.log('slowest: ' + [...first].sort((a, b) => b.secs - a.secs).slice(0, 5).map((r) => `${r.name} ${Math.round(r.secs)} s`).join(', '));
if (flaky.length) console.log(`flaky, passed on their own: ${flaky.map((r) => r.name).join(', ')}`);
for (const r of broken) {
  const last = again.find((a) => a.name === r.name) || r;
  console.log(`\nFAIL ${r.name} (${last.log}):\n` + readFileSync(last.log, 'utf8').trimEnd().split('\n').slice(-25).join('\n'));
}
console.log(broken.length ? `\n${broken.length} failed: ${broken.map((r) => r.name).join(', ')}` : '\nall passed');
console.log(`output: ${logs}`);

process.exit(broken.length ? 1 : 0);
