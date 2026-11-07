// CLI tests for tools/package-changelog.mjs. Everything happens in disposable git repositories under the OS temp directory; the
// real script and the real tools/changelog.mjs are copied in and the real CLI is spawned. No network, nothing written in the repo.
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
const SCRIPT = fs.readFileSync(path.join(__dirname, 'package-changelog.mjs'));
const GENERATOR = fs.readFileSync(path.join(__dirname, 'changelog.mjs'));
const ICON = fs.readFileSync(path.join(REAL, 'index.html'), 'utf8').split('\n').find((l) => l.includes('<link rel="icon"'));
assert.ok(ICON, 'index.html has an icon line');

const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pkgcl-test-')));
after(() => fs.rmSync(base, { recursive: true, force: true }));
let n = 0;
const dir = (name = 'd') => { const d = path.join(base, `${name}-${++n}`); fs.mkdirSync(d); return d; };

const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
const git = (cwd, ...a) => execFileSync('git', a, { cwd, env: GIT_ENV, encoding: 'utf8' }).trim();

// a tiny PNG header, which is all the generator reads of a picture
const png = (w, h, tag) => { const b = Buffer.alloc(40); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); b.write(tag, 30, 'latin1'); return b; };
const entry = (o = {}) => ({ build: 5, date: '2026-11-05', time: '07:38', ticket: 'CHUNKY-153', title: 'Fishing', text: ['You can fish now.'], image: 'a.png', alt: 'A pond', ...o });
const write = (repo, rel, data) => { const p = path.join(repo, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); };
const commit = (repo, msg) => { git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', msg); return git(repo, 'rev-parse', 'HEAD'); };

function fixture({ entries = [entry()], imgs = { 'a.png': png(10, 10, 'A') } } = {}) {
  const repo = dir('repo');
  git(repo, 'init', '-q', '-b', 'main');
  write(repo, 'tools/changelog.mjs', GENERATOR);
  write(repo, 'tools/package-changelog.mjs', SCRIPT);
  write(repo, 'index.html', `<!doctype html>\n${ICON}\n`);
  write(repo, 'data/raw/secret.txt', 'private');
  write(repo, 'notes.md', 'private notes');
  if (entries) write(repo, 'changelog/entries.json', JSON.stringify(entries, null, 2));
  for (const [k, v] of Object.entries(imgs ?? {})) write(repo, `changelog/img/${k}`, v);
  return repo;
}

// the script as it sits in a fixture repo, with its own private TMPDIR so leftovers can be seen
function pack(repo, args) {
  const tmp = dir('tmp');
  const r = spawnSync(process.execPath, [path.join(repo, 'tools/package-changelog.mjs'), ...args], { cwd: dir('cwd'), env: { ...process.env, TMPDIR: tmp }, encoding: 'utf8' });
  return { ...r, leftovers: fs.readdirSync(tmp) };
}
const walk = (root, rel = '') => fs.readdirSync(path.join(root, rel), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(root, path.join(rel, e.name)) : [path.join(rel, e.name)])).sort();
const snapshot = (root) => walk(root).map((f) => [f, fs.lstatSync(path.join(root, f)).isSymbolicLink() ? `-> ${fs.readlinkSync(path.join(root, f))}` : crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex')]);
// what that commit's own generator makes, run from a clean checkout of the commit
function expected(repo, sha) {
  const co = dir('co'), out = path.join(dir('exp'), 'site');
  execFileSync('git', ['clone', '-q', '--no-checkout', repo, co], { env: GIT_ENV });
  git(co, 'checkout', '-q', sha);
  execFileSync(process.execPath, [path.join(co, 'tools/changelog.mjs'), '--out', out]);
  return out;
}
const parentOf = () => dir('parent');

test('success: the allowlist, version.txt and the commit\'s own generator\'s bytes', () => {
  const repo = fixture(), sha = commit(repo, 'one'), out = path.join(parentOf(), 'site');
  const r = pack(repo, ['--ref', sha, '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes(sha));
  assert.deepEqual(walk(out), ['feed.xml', 'img/a.png', 'index.html', 'version.txt']);
  assert.equal(fs.readFileSync(path.join(out, 'version.txt'), 'utf8'), `${sha}\n`);
  assert.match(sha, /^[0-9a-f]{40}$/);
  const exp = expected(repo, sha);
  for (const f of walk(exp)) assert.ok(fs.readFileSync(path.join(exp, f)).equals(fs.readFileSync(path.join(out, f))), f);
  assert.ok(fs.readFileSync(path.join(out, 'index.html'), 'utf8').includes('Fishing'));
  assert.deepEqual(r.leftovers, []);
});

test('idempotent: the same ref twice is byte-identical', () => {
  const repo = fixture(), sha = commit(repo, 'one'), p = parentOf();
  assert.equal(pack(repo, ['--ref', sha, '--out', path.join(p, 'a')]).status, 0);
  assert.equal(pack(repo, ['--ref', sha, '--out', path.join(p, 'b')]).status, 0);
  assert.deepEqual(snapshot(path.join(p, 'a')), snapshot(path.join(p, 'b')));
});

test('isolation: a dirty worktree and another branch are never read; short sha, branch and tag agree', () => {
  const repo = fixture(), first = commit(repo, 'one');
  git(repo, 'tag', 'v1');
  git(repo, 'branch', 'old');
  write(repo, 'changelog/entries.json', JSON.stringify([entry({ title: 'Second thing', build: 6, date: '2026-11-06' })]));
  write(repo, 'changelog/img/b.png', png(10, 10, 'B'));
  commit(repo, 'two');
  git(repo, 'checkout', '-q', '-b', 'other');
  write(repo, 'changelog/entries.json', '[ not json');
  write(repo, 'changelog/img/untracked.png', png(5, 5, 'U'));
  const exp = expected(repo, first), p = parentOf();
  for (const [i, ref] of [first.slice(0, 8), 'old', 'v1', first].entries()) {
    const out = path.join(p, `o${i}`), r = pack(repo, ['--ref', ref, '--out', out]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.readFileSync(path.join(out, 'version.txt'), 'utf8'), `${first}\n`);
    assert.deepEqual(walk(out), [...walk(exp), 'version.txt'].sort());
    for (const f of walk(exp)) assert.ok(fs.readFileSync(path.join(exp, f)).equals(fs.readFileSync(path.join(out, f))), f);
    assert.ok(!fs.readFileSync(path.join(out, 'index.html'), 'utf8').includes('Second thing'));
  }
});

test('an older commit with the generator but no entries.json gives the empty changelog', () => {
  const repo = fixture({ entries: null, imgs: null }), sha = commit(repo, 'old'), out = path.join(parentOf(), 'site');
  const r = pack(repo, ['--ref', sha, '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(walk(out), ['feed.xml', 'index.html', 'version.txt']);
  assert.ok(fs.readFileSync(path.join(out, 'index.html'), 'utf8').includes('Nothing yet.'));
  assert.ok(!fs.readFileSync(path.join(out, 'feed.xml'), 'utf8').includes('<entry>'));
});

test('a commit without tools/changelog.mjs is refused clearly, with no output', () => {
  const repo = fixture();
  fs.rmSync(path.join(repo, 'tools/changelog.mjs'));
  const sha = commit(repo, 'no generator'), p = parentOf(), out = path.join(p, 'site');
  const r = pack(repo, ['--ref', sha, '--out', out]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no tools\/changelog\.mjs/);
  assert.deepEqual(fs.readdirSync(p), []);
  assert.deepEqual(r.leftovers, []);
});

// a commit whose own generator is a stand-in that makes what it's told to
function fake(body) {
  const repo = fixture();
  write(repo, 'tools/changelog.mjs', `import fs from 'node:fs'; import path from 'node:path';\nconst out = process.argv[3]; fs.mkdirSync(path.join(out, 'img'), { recursive: true });\nconst W = (f, d) => fs.writeFileSync(path.join(out, f), d);\nW('feed.xml', '<feed/>');\n${body}`);
  return { repo, sha: commit(repo, 'fake') };
}
const refused = (repo, sha, why) => {
  const p = parentOf(), out = path.join(p, 'site'), r = pack(repo, ['--ref', sha, '--out', out]);
  assert.notEqual(r.status, 0);
  if (why) assert.match(r.stderr, why);
  assert.deepEqual(fs.readdirSync(p), [], 'nothing, not even a temp sibling, is left');
  assert.deepEqual(r.leftovers, []);
};

test('privacy allowlist: extra files, symlinks and outside references are refused', () => {
  const html = (src) => `W('index.html', '<img src="${src}">');`;
  for (const [body, why] of [
    [`${html('img/a.png')} W('img/a.png', 'x'); W('notes.md', 'private');`, /notes\.md/],
    [`${html('img/a.png')} W('img/a.png', 'x'); fs.mkdirSync(path.join(out, 'data/raw'), { recursive: true }); W('data/raw/x.json', '{}');`, /data/],
    [`${html('img/a.png')} fs.symlinkSync('/etc/hosts', path.join(out, 'img/a.png'));`, /plain file/],
    [`${html('img/a.png')} W('img/a.png', 'x'); fs.symlinkSync('/etc/hosts', path.join(out, 'link.txt'));`, /link\.txt/],
    [`${html('../notes.png')}`, /isn't a picture in img\//],
    [`${html('/etc/x.png')}`, /isn't a picture in img\//],
    [`${html('img/missing.png')}`, /missing\.png/],
    [`${html('img/a.png')} W('img/a.png', 'x'); W('img/b.png', 'y');`, /b\.png isn't shown/],
    [`${html('img/a.png')} W('img/a.png', 'x'); W('img/a.txt', 'y');`, /a\.txt/],
    [`W('index.html', '<p/>'); W('img/x.svg', '<svg/>');`, /x\.svg/],
  ]) { const { repo, sha } = fake(body); refused(repo, sha, why); }
});

test('a changelog that fails the generator\'s own checks yields no output', () => {
  const repo = fixture({ entries: [entry({ title: '' })] }), sha = commit(repo, 'bad');
  refused(repo, sha, /isn't ready/);
  const repo2 = fixture({ entries: [entry({ image: 'gone.png' })] });
  refused(repo2, commit(repo2, 'bad2'), /isn't ready/);
});

test('bad arguments exit 2 and touch nothing', () => {
  const repo = fixture(), sha = commit(repo, 'one'), p = parentOf(), out = path.join(p, 'site');
  for (const args of [
    [], ['--ref', sha], ['--out', out], ['--ref', '', '--out', out], ['--ref', sha, '--out', ''], ['--ref', '-x', '--out', out],
    ['--ref', sha, '--out', '--ref'], ['--ref', sha, '--out'], ['--ref', sha, '--out', out, '--bogus', '1'], ['--ref', sha, '--ref', sha, '--out', out],
    ['--ref', sha, '--out', out, '--out', out], ['--ref', sha, '--out', out, 'extra'], [`--ref=${sha}`, '--out', out],
  ]) {
    const r = pack(repo, args);
    assert.equal(r.status, 2, JSON.stringify(args));
    assert.match(r.stderr, /usage:/);
  }
  assert.deepEqual(fs.readdirSync(p), []);
});

test('unresolvable and non-commit refs are refused', () => {
  const repo = fixture(), sha = commit(repo, 'one'), tree = git(repo, 'rev-parse', `${sha}^{tree}`), blob = git(repo, 'rev-parse', `${sha}:notes.md`);
  const p = parentOf();
  for (const ref of ['nonesuch', 'deadbeefdeadbeef', blob, 'HEAD:nothing']) {
    const r = pack(repo, ['--ref', ref, '--out', path.join(p, 'site')]);
    assert.equal(r.status, 1, ref);
    assert.match(r.stderr, /isn't a commit/);
  }
  // a tree-ish peels to no commit
  assert.equal(pack(repo, ['--ref', tree, '--out', path.join(p, 'site')]).status, 1);
  assert.deepEqual(fs.readdirSync(p), []);
});

test('--out existing in any form is refused and left byte-identical', () => {
  const repo = fixture(), sha = commit(repo, 'one'), p = parentOf();
  fs.writeFileSync(path.join(p, 'file'), 'keep');
  fs.mkdirSync(path.join(p, 'empty'));
  fs.mkdirSync(path.join(p, 'full/sub'), { recursive: true });
  fs.writeFileSync(path.join(p, 'full/index.html'), 'mine');
  fs.writeFileSync(path.join(p, 'full/sub/x'), 'x');
  fs.symlinkSync(path.join(p, 'empty'), path.join(p, 'link'));
  fs.symlinkSync(path.join(p, 'nowhere'), path.join(p, 'dangling'));
  const before = snapshot(p);
  for (const name of ['file', 'empty', 'full', 'link', 'dangling']) {
    const r = pack(repo, ['--ref', sha, '--out', path.join(p, name)]);
    assert.equal(r.status, 1, name);
    assert.match(r.stderr, /already exists/);
    assert.deepEqual(r.leftovers, []);
  }
  assert.deepEqual(snapshot(p), before);
  assert.deepEqual(fs.readdirSync(path.join(p, 'empty')), []);
  assert.equal(fs.readlinkSync(path.join(p, 'dangling')), path.join(p, 'nowhere'));
  // a missing parent isn't made
  const r = pack(repo, ['--ref', sha, '--out', path.join(p, 'no/such/site')]);
  assert.equal(r.status, 1);
  assert.ok(!fs.existsSync(path.join(p, 'no')));
});

test('static: built-ins only, no network, spawns only git and the commit\'s own generator', () => {
  const src = SCRIPT.toString('utf8');
  const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
  assert.ok(imports.length > 0);
  for (const i of imports) assert.match(i, /^node:/);
  assert.doesNotMatch(src, /\brequire\(|\bimport\(|https?\.|fetch\(|node:(net|http|https|dns|tls)\b|\bshell\b|exec\(|execSync|spawnSync|vercel|wrangler|npx/i);
  const spawns = [...src.matchAll(/execFileSync\(([^,]+),/g)].map((m) => m[1].trim());
  assert.deepEqual(spawns.sort(), ["'git'", "'git'", 'process.execPath'].sort());
  const pj = path.join(REAL, 'package.json');
  if (fs.existsSync(pj)) assert.ok(!/package-changelog/.test(fs.readFileSync(pj, 'utf8')));
});
