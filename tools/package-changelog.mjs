// Packages the public changelog site (CHUNKY-198, child of CHUNKY-181) from one commit, offline, into a new directory.
//
//   node tools/package-changelog.mjs --ref <commit> --out <new-directory>
//
// The repository used is the one that contains this script (not the current directory), so the answer never depends on where it is
// run from. --ref is resolved there, to a full 40-hex SHA, from local objects only: nothing is fetched. The commit's own
// tools/changelog.mjs (plus the index.html it reads its tab icon from, and changelog/) is exported with `git archive` into a private
// temp directory and run from there, so the worktree, untracked files and the checked-out branch are never read. A commit with that
// generator but no changelog/entries.json gives the generator's empty changelog; one without the generator is refused.
//
// Only an allowlist reaches --out: index.html, feed.xml, the png/jpg/jpeg/webp files in img/ that index.html shows, and version.txt
// (the full SHA and a newline). Anything else the generator made, a symlink, or a picture that is missing or isn't in img/ is an
// error. --out must not exist in any form; it's assembled in a temp sibling of it and renamed into place, so a failed run leaves
// nothing at --out. Only the temp directories this run made are removed. It publishes nothing and calls nothing but git and node.
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const USAGE = 'usage: node tools/package-changelog.mjs --ref <commit> --out <new-directory>';
const PICTURE = /^[\w.-]+\.(png|jpe?g|webp)$/i;
const made = [];

class Refused extends Error {}
const refuse = (m) => { throw new Refused(m); };
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
const exists = (p) => { try { lstatSync(p); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

export function parseArgs(argv) {
  const got = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i], v = argv[i + 1];
    if (flag !== '--ref' && flag !== '--out') return { error: `unknown argument ${JSON.stringify(flag)}` };
    if (flag.slice(2) in got) return { error: `${flag} given twice` };
    if (typeof v !== 'string' || !v.trim() || v.startsWith('-')) return { error: `${flag} needs a value that isn't empty or a flag` };
    got[flag.slice(2)] = v;
  }
  for (const k of ['ref', 'out']) if (!(k in got)) return { error: `--${k} is required` };
  return got;
}

// a minimal reader for git archive's tar (ustar and pax path headers), into dir; links and anything odd are refused
function untar(buf, dir) {
  let pos = 0, longPath = null;
  const str = (a, b) => buf.toString('utf8', a, b).replace(/\0[\s\S]*$/, '');
  while (pos + 512 <= buf.length) {
    if (buf.subarray(pos, pos + 512).every((x) => x === 0)) break;
    const size = parseInt(str(pos + 124, pos + 136).trim() || '0', 8), type = String.fromCharCode(buf[pos + 156] || 48);
    let name = str(pos, pos + 100);
    if (str(pos + 257, pos + 262) === 'ustar' && str(pos + 345, pos + 500)) name = `${str(pos + 345, pos + 500)}/${name}`;
    const body = buf.subarray(pos + 512, pos + 512 + size);
    pos += 512 + Math.ceil(size / 512) * 512;
    if (type === 'g') continue;
    if (type === 'x') {
      for (let i = 0; i < body.length;) {
        const sp = body.indexOf(32, i), len = parseInt(body.toString('utf8', i, sp), 10), rec = body.toString('utf8', sp + 1, i + len - 1);
        if (rec.startsWith('path=')) longPath = rec.slice(5);
        i += len;
      }
      continue;
    }
    if (longPath != null) { name = longPath; longPath = null; }
    const parts = name.split('/').filter(Boolean);
    if (!parts.length || name.startsWith('/') || parts.includes('..') || parts.includes('.')) refuse(`the commit has an unsafe path ${JSON.stringify(name)}`);
    const to = join(dir, ...parts);
    if (type === '5') mkdirSync(to, { recursive: true });
    else if (type === '0') { mkdirSync(dirname(to), { recursive: true }); writeFileSync(to, body, { flag: 'wx' }); }
    else refuse(`the commit has ${JSON.stringify(name)}, a link or special file, which isn't packaged`);
  }
}

// what the generator made has to be exactly the allowlist; returns the names to copy, relative to gen
function audit(gen) {
  const names = [], kind = (p) => lstatSync(join(gen, p)), top = readdirSync(gen).sort();
  for (const n of top) {
    const st = kind(n);
    if (n === 'index.html' || n === 'feed.xml') { if (!st.isFile()) refuse(`${n} isn't a plain file`); names.push(n); }
    else if (n === 'img') { if (!st.isDirectory()) refuse('img isn\'t a directory'); }
    else refuse(`the generator made ${n}, which isn't on the public list`);
  }
  for (const n of ['index.html', 'feed.xml']) if (!names.includes(n)) refuse(`the generator didn't make ${n}`);
  const html = readFileSync(join(gen, 'index.html'), 'utf8'), shown = new Set();
  for (const m of html.matchAll(/\bsrcset\s*=|\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const v = m[1] ?? m[2] ?? m[3], name = v?.match(/^img\/([^/]+)$/)?.[1];
    if (!name || !PICTURE.test(name)) refuse(`index.html shows ${JSON.stringify(v ?? 'a srcset')}, which isn't a picture in img/`);
    shown.add(name);
  }
  const have = top.includes('img') ? readdirSync(join(gen, 'img')).sort() : [];
  for (const n of have) {
    if (!PICTURE.test(n)) refuse(`img/${n} isn't a png, jpg, jpeg or webp`);
    if (!kind(`img/${n}`).isFile()) refuse(`img/${n} isn't a plain file`);
    if (!shown.has(n)) refuse(`img/${n} isn't shown by index.html`);
  }
  for (const n of shown) if (!have.includes(n)) refuse(`index.html shows img/${n}, which the generator didn't make`);
  return [...names, ...have.map((n) => `img/${n}`)];
}

function run({ ref, out: outArg }) {
  const out = resolve(outArg), parent = dirname(out);
  if (exists(out)) refuse(`${out} already exists; --out has to be a new path`);
  if (!isDir(parent)) refuse(`${parent} isn't an existing directory to make --out in`);
  let sha;
  try { sha = git('rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`).trim(); } catch { refuse(`${JSON.stringify(ref)} isn't a commit in this repository (local objects only)`); }
  if (!/^[0-9a-f]{40}$/.test(sha)) refuse(`git gave ${JSON.stringify(sha)}, not a full SHA`);
  const tmp = (prefix, where) => { const d = realpathSync(mkdtempSync(join(where, prefix))); made.push(d); return d; };
  const src = tmp('package-changelog-src-', tmpdir()), genRoot = tmp('package-changelog-gen-', tmpdir()), gen = join(genRoot, 'site');

  const listed = git('ls-tree', '-r', '--name-only', '-z', sha, '--', 'tools/changelog.mjs', 'index.html', 'changelog').split('\0').filter(Boolean);
  if (!listed.includes('tools/changelog.mjs')) refuse(`commit ${sha} has no tools/changelog.mjs, so there is no changelog to package`);
  if (!listed.includes('index.html')) refuse(`commit ${sha} has no index.html for the generator's tab icon`);
  untar(execFileSync('git', ['-C', ROOT, 'archive', '--format=tar', sha, '--', ...listed], { maxBuffer: 1 << 30 }), src);

  try { execFileSync(process.execPath, [join(src, 'tools', 'changelog.mjs'), '--out', gen], { cwd: src, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH } }); }
  catch (e) { refuse(`the commit's own generator failed:\n${(e.stderr || e.message).trim()}`); }
  const files = audit(gen);

  const stage = tmp(`.${basename(out)}.tmp-`, parent);
  if (files.some((f) => f.startsWith('img/'))) mkdirSync(join(stage, 'img'), { mode: 0o755 });
  for (const f of files) writeFileSync(join(stage, f), readFileSync(join(gen, f)), { mode: 0o644 });
  writeFileSync(join(stage, 'version.txt'), `${sha}\n`, { mode: 0o644 });
  if (exists(out)) refuse(`${out} appeared while packaging; leaving it alone`);
  renameSync(stage, out);
  made.splice(made.indexOf(stage), 1);
  return { sha, files: [...files, 'version.txt'].sort() };
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) { console.error(`${args.error}\n${USAGE}`); process.exit(2); }
  let code = 0;
  try {
    const { sha, files } = run(args);
    console.log(`commit ${sha}\n${files.map((f) => `  ${f}`).join('\n')}\npackaged into ${resolve(args.out)}`);
  } catch (e) {
    console.error(e instanceof Refused ? e.message : `package-changelog failed: ${e.message}`);
    code = 1;
  } finally {
    for (const d of made) rmSync(d, { recursive: true, force: true });
  }
  process.exit(code);
}
