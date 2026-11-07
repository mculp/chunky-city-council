// CLI tests for tools/prepare-changelog.mjs. Real subprocesses, in disposable git repositories under the OS temp directory; the real
// scripts are copied in. No network, nothing written in the repo.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REAL = path.join(__dirname, '..');
const rd = (n) => fs.readFileSync(path.join(__dirname, n));
const PREPARE = rd('prepare-changelog.mjs'), PACKAGER = rd('package-changelog.mjs'), GENERATOR = rd('changelog.mjs');
const ICON = fs.readFileSync(path.join(REAL, 'index.html'), 'utf8').split('\n').find((l) => l.includes('<link rel="icon"'));
assert.ok(ICON);

const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prepcl-test-')));
after(() => fs.rmSync(base, { recursive: true, force: true }));
let n = 0;
const dir = (name = 'd') => { const d = path.join(base, `${name}-${++n}`); fs.mkdirSync(d); return d; };
const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
const git = (cwd, ...a) => execFileSync('git', a, { cwd, env: GIT_ENV, encoding: 'utf8' }).trim();
const png = (w, h, tag) => { const b = Buffer.alloc(40); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); b.write(tag, 30, 'latin1'); return b; };
const entry = (o = {}) => ({ build: 5, date: '2026-11-05', time: '07:38', ticket: 'CHUNKY-153', title: 'Fishing', text: ['You can fish now.'], image: 'a.png', alt: 'A pond', ...o });
const write = (repo, rel, data) => { const p = path.join(repo, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); };
const commit = (repo) => { git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'c'); return git(repo, 'rev-parse', 'HEAD'); };

function fixture({ generator = true, packager = PACKAGER } = {}) {
  const repo = dir('repo');
  git(repo, 'init', '-q', '-b', 'main');
  if (generator) write(repo, 'tools/changelog.mjs', GENERATOR);
  write(repo, 'tools/package-changelog.mjs', packager);
  write(repo, 'tools/prepare-changelog.mjs', PREPARE);
  write(repo, 'index.html', `<!doctype html>\n${ICON}\n`);
  write(repo, 'notes.md', 'private notes');
  write(repo, 'changelog/entries.json', JSON.stringify([entry()], null, 2));
  write(repo, 'changelog/img/a.png', png(10, 10, 'A'));
  return repo;
}
const cli = (repo, args) => spawnSync(process.execPath, [path.join(repo, 'tools/prepare-changelog.mjs'), ...args], { cwd: dir('cwd'), encoding: 'utf8' });
const walk = (root, rel = '') => fs.readdirSync(path.join(root, rel), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(root, path.join(rel, e.name)) : [path.join(rel, e.name)])).sort();
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const snap = (root) => walk(root).map((f) => [f, fs.lstatSync(path.join(root, f)).mtimeMs, sha256(fs.readFileSync(path.join(root, f)))]);

let prepared;
function fresh() {
  prepared ??= (() => { const repo = fixture(), sha = commit(repo); return { repo, sha }; })();
  const out = path.join(dir('parent'), 'bundle');
  const r = cli(prepared.repo, ['prepare', '--ref', prepared.sha, '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  return { ...prepared, out, r };
}
const manifest = (out) => JSON.parse(fs.readFileSync(path.join(out, 'delivery.json'), 'utf8'));
const setManifest = (out, f) => { const m = manifest(out); f(m); fs.writeFileSync(path.join(out, 'delivery.json'), JSON.stringify(m)); };
const verifyFails = (b, re) => { const r = cli(prepared.repo, ['verify', '--bundle', b.out]); assert.equal(r.status, 1, r.stdout); if (re) assert.match(r.stderr, re); };

test('prepare: site and delivery.json, with the schema, sorted exact entries and no absolute paths', () => {
  const b = fresh();
  assert.deepEqual(fs.readdirSync(b.out).sort(), ['delivery.json', 'site']);
  assert.deepEqual(walk(path.join(b.out, 'site')), ['feed.xml', 'img/a.png', 'index.html', 'version.txt']);
  const raw = fs.readFileSync(path.join(b.out, 'delivery.json'), 'utf8'), m = JSON.parse(raw);
  assert.deepEqual(Object.keys(m).sort(), ['approval_required', 'deployment_performed', 'files', 'fullSHA']);
  assert.equal(m.fullSHA, b.sha);
  assert.equal(m.approval_required, true);
  assert.equal(m.deployment_performed, false);
  assert.deepEqual(m.files.map((f) => f.path), ['feed.xml', 'img/a.png', 'index.html', 'version.txt']);
  for (const f of m.files) {
    const bytes = fs.readFileSync(path.join(b.out, 'site', f.path));
    assert.equal(f.bytes, bytes.length);
    assert.equal(f.sha256, sha256(bytes));
  }
  assert.ok(!raw.includes(base) && !raw.includes(os.tmpdir()) && !raw.includes('/private') && !raw.includes('notes'));
  assert.match(b.r.stdout, /not hosting, not approved imagery, not typed-domain approval and not completion of CHUNKY-181/);
  assert.deepEqual(fs.readdirSync(path.dirname(b.out)), ['bundle'], 'no temp leftovers');
});

test('help states what preparation is not', () => {
  for (const a of [['--help'], ['help']]) {
    const r = cli(prepared?.repo ?? fresh().repo, a);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /not hosting, not approved imagery, not typed-domain approval and not completion of CHUNKY-181/);
  }
});

test('verify: succeeds on a fresh bundle and is read-only', () => {
  const b = fresh(), before = snap(b.out), dirM = fs.statSync(b.out).mtimeMs, siteM = fs.statSync(path.join(b.out, 'site')).mtimeMs;
  const r = cli(b.repo, ['verify', '--bundle', b.out]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /not completion of CHUNKY-181/);
  assert.deepEqual(snap(b.out), before);
  assert.equal(fs.statSync(b.out).mtimeMs, dirM);
  assert.equal(fs.statSync(path.join(b.out, 'site')).mtimeMs, siteM);
});

test('verify: a modified byte, same length', () => {
  const b = fresh(), f = path.join(b.out, 'site/index.html'), d = fs.readFileSync(f);
  d[d.length - 2] ^= 1; fs.writeFileSync(f, d);
  verifyFails(b, /sha256/);
});
test('verify: a changed length', () => {
  const b = fresh(); fs.appendFileSync(path.join(b.out, 'site/feed.xml'), 'x');
  verifyFails(b, /bytes/);
});
test('verify: a missing file', () => {
  const b = fresh(); fs.rmSync(path.join(b.out, 'site/img/a.png'));
  verifyFails(b, /missing/);
});
test('verify: an extra file', () => {
  const b = fresh(); fs.writeFileSync(path.join(b.out, 'site/extra.txt'), 'x');
  verifyFails(b, /not in delivery.json/);
});
test('verify: an extra file at the bundle top', () => {
  const b = fresh(); fs.writeFileSync(path.join(b.out, 'notes.txt'), 'x');
  verifyFails(b, /exactly/);
});
test('verify: wrong SHA in version.txt, even with the manifest rehashed to match', () => {
  const b = fresh(), f = path.join(b.out, 'site/version.txt'), v = Buffer.from(`${'0'.repeat(40)}\n`);
  fs.writeFileSync(f, v);
  setManifest(b.out, (m) => { const e = m.files.find((x) => x.path === 'version.txt'); e.bytes = v.length; e.sha256 = sha256(v); });
  verifyFails(b, /version\.txt/);
});
test('verify: version.txt without its newline', () => {
  const b = fresh(), f = path.join(b.out, 'site/version.txt'), v = Buffer.from(b.sha);
  fs.writeFileSync(f, v);
  setManifest(b.out, (m) => { const e = m.files.find((x) => x.path === 'version.txt'); e.bytes = v.length; e.sha256 = sha256(v); });
  verifyFails(b, /version\.txt/);
});
for (const name of ['index.html', 'feed.xml']) {
  test(`verify: ${name} missing, even when the manifest agrees`, () => {
    const b = fresh(); fs.rmSync(path.join(b.out, 'site', name));
    setManifest(b.out, (m) => { m.files = m.files.filter((x) => x.path !== name); });
    verifyFails(b, new RegExp(`${name.replace('.', '\\.')} is required`));
  });
}
test('verify: a symlink in the site', () => {
  const b = fresh(), f = path.join(b.out, 'site/img/a.png'), outside = path.join(dir('outside'), 'a.png');
  fs.copyFileSync(f, outside); fs.rmSync(f); fs.symlinkSync(outside, f);
  verifyFails(b, /symlink/);
});
test('verify: site itself, or the bundle, a symlink', () => {
  const b = fresh(), real = path.join(dir('moved'), 'site');
  fs.renameSync(path.join(b.out, 'site'), real); fs.symlinkSync(real, path.join(b.out, 'site'));
  verifyFails(b, /site isn't a plain directory/);
  const c = fresh(), link = path.join(dir('links'), 'bundle');
  fs.symlinkSync(c.out, link);
  verifyFails({ out: link }, /plain directory/);
});
for (const bad of ['../escape.txt', '/etc/hosts', 'img/../index.html', './index.html', 'a\\b']) {
  test(`verify: manifest path escape ${JSON.stringify(bad)}`, () => {
    const b = fresh();
    setManifest(b.out, (m) => { m.files[0].path = bad; });
    verifyFails(b, /unsafe path/);
  });
}
const BAD = {
  'not JSON': () => '{nope',
  'array': () => '[]',
  'missing field': (m) => { delete m.fullSHA; return m; },
  'extra field': (m) => { m.extra = 1; return m; },
  'short SHA': (m) => { m.fullSHA = m.fullSHA.slice(0, 12); return m; },
  'uppercase SHA': (m) => { m.fullSHA = m.fullSHA.toUpperCase(); return m; },
  'approval_required false': (m) => { m.approval_required = false; return m; },
  'deployment_performed true': (m) => { m.deployment_performed = true; return m; },
  'empty files': (m) => { m.files = []; return m; },
  'unsorted files': (m) => { m.files.reverse(); return m; },
  'duplicate files': (m) => { m.files.push(m.files.at(-1)); return m; },
  'string bytes': (m) => { m.files[0].bytes = String(m.files[0].bytes); return m; },
  'negative bytes': (m) => { m.files[0].bytes = -1; return m; },
  'bad sha256': (m) => { m.files[0].sha256 = 'abc'; return m; },
  'extra file field': (m) => { m.files[0].mode = 1; return m; },
};
for (const [name, mut] of Object.entries(BAD)) {
  test(`verify: invalid manifest (${name})`, () => {
    const b = fresh(), m = manifest(b.out), r = mut(m);
    fs.writeFileSync(path.join(b.out, 'delivery.json'), typeof r === 'string' ? r : JSON.stringify(r));
    verifyFails(b, /delivery\.json is (invalid|missing)/);
  });
}
test('verify: delivery.json missing, and a missing --bundle', () => {
  const b = fresh(); fs.rmSync(path.join(b.out, 'delivery.json'));
  verifyFails(b, /exactly/);
  assert.equal(cli(b.repo, ['verify']).status, 2);
  assert.equal(cli(b.repo, ['verify', '--bundle', path.join(b.out, 'nope')]).status, 1);
});

// prepare failures: nothing is left and an existing directory is untouched
function prepFails(args, { repo = fresh().repo, parent, want = 1 } = {}) {
  const p = parent ?? dir('parent'), hashes = () => walk(p).map((f) => { const q = path.join(p, f); return [f, fs.lstatSync(q).isSymbolicLink() ? `-> ${fs.readlinkSync(q)}` : sha256(fs.readFileSync(q))]; });
  const before = hashes();
  const names = fs.readdirSync(p).sort();
  const r = cli(repo, typeof args === 'function' ? args(p) : args);
  assert.equal(r.status, want, r.stdout + r.stderr);
  assert.deepEqual(fs.readdirSync(p).sort(), names, 'nothing left behind');
  assert.deepEqual(hashes(), before);
  return r;
}
test('prepare: bad refs', () => {
  const sha = fresh().sha;
  for (const ref of [sha.slice(0, 7), sha.slice(0, 39), sha.toUpperCase(), `${sha.slice(0, 39)}g`, `${sha}0`, 'main', 'HEAD', '', '-x'])
    prepFails((p) => ['prepare', '--ref', ref, '--out', path.join(p, 'o')], { want: ref === '-x' || ref === '' ? 2 : 1 });
});
test('prepare: a full SHA that is not a commit here', () => {
  prepFails((p) => ['prepare', '--ref', 'a'.repeat(40), '--out', path.join(p, 'o')]);
});
test('prepare: malformed or missing flags', () => {
  const sha = fresh().sha, o = (p) => path.join(p, 'o');
  for (const a of [(p) => ['prepare'], (p) => ['prepare', '--ref', sha], (p) => ['prepare', '--out', o(p)], (p) => ['prepare', '--ref', sha, '--out'],
    (p) => ['prepare', '--ref', sha, '--out', o(p), '--ref', sha], (p) => ['prepare', '--ref', sha, '--out', o(p), '--extra', 'x'],
    (p) => ['prepare', '--ref', sha, '--bundle', o(p)], (p) => ['prepare', '--ref', sha, '--out', '--ref'], (p) => [], (p) => ['bogus']])
    prepFails(a, { want: 2 });
});
test('prepare: an existing OUT directory keeps its content', () => {
  const p = dir('parent'), o = path.join(p, 'o'); fs.mkdirSync(o); fs.writeFileSync(path.join(o, 'keep.txt'), 'mine');
  prepFails((q) => ['prepare', '--ref', fresh().sha, '--out', o], { parent: p });
  assert.equal(fs.readFileSync(path.join(o, 'keep.txt'), 'utf8'), 'mine');
});
test('prepare: an existing file, a symlink OUT (dangling or to a directory), and a missing parent', () => {
  const sha = fresh().sha, p = dir('parent');
  fs.writeFileSync(path.join(p, 'f'), 'x');
  const target = dir('target'); fs.writeFileSync(path.join(target, 'keep'), 'k');
  fs.symlinkSync(target, path.join(p, 'linkdir')); fs.symlinkSync(path.join(p, 'gone'), path.join(p, 'dangling'));
  for (const name of ['f', 'linkdir', 'dangling']) prepFails(['prepare', '--ref', sha, '--out', path.join(p, name)], { parent: p });
  assert.deepEqual(fs.readdirSync(target), ['keep']);
  assert.ok(!fs.existsSync(path.join(p, 'gone')));
  prepFails(['prepare', '--ref', sha, '--out', path.join(p, 'no', 'such', 'o')], { parent: p });
});
test('prepare: an incomplete package (commit without the generator) leaves nothing', () => {
  const repo = fixture({ generator: false }), sha = commit(repo);
  const r = prepFails((p) => ['prepare', '--ref', sha, '--out', path.join(p, 'o')], { repo });
  assert.match(r.stderr, /packager refused/);
});
test('prepare: a packager result missing feed.xml is refused after the fact', () => {
  const stub = `import { mkdirSync, writeFileSync } from 'node:fs';
const out = process.argv[process.argv.indexOf('--out') + 1], ref = process.argv[process.argv.indexOf('--ref') + 1];
mkdirSync(out); writeFileSync(out + '/index.html', 'x'); writeFileSync(out + '/version.txt', ref + '\\n');\n`;
  const repo = fixture({ packager: stub }), sha = commit(repo);
  const r = prepFails((p) => ['prepare', '--ref', sha, '--out', path.join(p, 'o')], { repo });
  assert.match(r.stderr, /feed\.xml is required/);
});
test('prepare: never overwrites anything but its own temp directory, and is repeatable byte for byte', () => {
  const a = fresh(), b = fresh();
  assert.equal(fs.readFileSync(path.join(a.out, 'delivery.json'), 'utf8'), fs.readFileSync(path.join(b.out, 'delivery.json'), 'utf8'));
});

test('source: argv-only execFile of process.execPath, no shell, no fetch/npm/network/provider/deploy, no new scripts or dependencies', () => {
  const src = PREPARE.toString('utf8');
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.match(code, /execFileSync\(process\.execPath, \[PACKAGER/);
  assert.equal((code.match(/execFileSync\(/g) || []).length, 1,'exactly one call');
  assert.doesNotMatch(code, /\bexec\(|execSync|spawn|shell|fork\(/);
  assert.doesNotMatch(code, /fetch|npm|https?:|node:(net|http|https|dgram|tls|dns)|wrangler|deploy\.mjs|\bgit\b/i);
  const imports = [...code.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
  assert.ok(imports.every((i) => i.startsWith('node:')), imports.join());
  const pkg = JSON.parse(fs.readFileSync(path.join(REAL, 'package.json'), 'utf8'));
  assert.ok(!JSON.stringify(pkg).includes('prepare-changelog'));
});
