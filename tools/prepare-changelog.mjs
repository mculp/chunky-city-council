// Offline prepare/verify for the immutable changelog delivery bundle (CHUNKY-207, child of CHUNKY-201, for CHUNKY-181).
//
//   node tools/prepare-changelog.mjs prepare --ref <full-40-hex-sha> --out <new-directory>
//   node tools/prepare-changelog.mjs verify --bundle <directory>
//
// prepare runs the unchanged tools/package-changelog.mjs (argv-only execFile of this Node, no shell) into <new-directory>/site and
// writes <new-directory>/delivery.json beside it, outside the public site. It is assembled in a temp sibling and renamed into place,
// so a failure leaves nothing at --out. verify only reads: it rehashes every byte in site/ and checks it against delivery.json.
// Nothing here fetches, reaches a network, a provider or an account, or deploys.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGER = join(HERE, 'package-changelog.mjs');
const SHA = /^[0-9a-f]{40}$/;
const HEX = /^[0-9a-f]{64}$/;
const NOTICE = 'Preparing this bundle is not hosting, not approved imagery, not typed-domain approval and not completion of CHUNKY-181.';
const USAGE = `usage:
  node tools/prepare-changelog.mjs prepare --ref <full-40-hex-sha> --out <new-directory>
  node tools/prepare-changelog.mjs verify --bundle <directory>

prepare  packages the public changelog site from that exact commit (offline, via tools/package-changelog.mjs) into
         <new-directory>/site and writes <new-directory>/delivery.json. <new-directory> must not exist.
verify   read-only: rehashes every byte of <directory>/site and checks it against <directory>/delivery.json.

${NOTICE}`;

class Refused extends Error {}
const refuse = (m) => { throw new Refused(m); };
const lstat = (p) => { try { return lstatSync(p); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') return { help: true };
  const allowed = { prepare: ['--ref', '--out'], verify: ['--bundle'] }[cmd];
  if (!allowed) return { error: `unknown or missing command ${JSON.stringify(cmd)}` };
  const got = {};
  if (rest.length % 2) return { error: 'a flag is missing its value' };
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i], v = rest[i + 1];
    if (!allowed.includes(flag)) return { error: `unknown argument ${JSON.stringify(flag)}` };
    if (flag.slice(2) in got) return { error: `${flag} given twice` };
    if (typeof v !== 'string' || !v.trim() || v.startsWith('-')) return { error: `${flag} needs a value that isn't empty or a flag` };
    got[flag.slice(2)] = v;
  }
  for (const k of allowed) if (!(k.slice(2) in got)) return { error: `${k} is required` };
  return { cmd, ...got };
}

// every regular file under root (relative, '/'-separated, sorted); symlinks and anything not a file or directory are refused
function inventory(root, rel = '') {
  const out = [];
  for (const e of readdirSync(join(root, rel)).sort()) {
    const r = rel ? `${rel}/${e}` : e, st = lstatSync(join(root, r));
    if (st.isSymbolicLink()) refuse(`site/${r} is a symlink`);
    if (st.isDirectory()) out.push(...inventory(root, r));
    else if (st.isFile()) out.push(r);
    else refuse(`site/${r} isn't a plain file`);
  }
  return out;
}

const safePath = (p) => typeof p === 'string' && p !== '' && !p.startsWith('/') && !p.includes('\\') && !p.includes('\0')
  && p.split('/').every((s) => s && s !== '.' && s !== '..');

function readManifest(file) {
  let m;
  try { m = JSON.parse(readFileSync(file, 'utf8')); } catch { refuse('delivery.json is missing or isn\'t valid JSON'); }
  const bad = (why) => refuse(`delivery.json is invalid: ${why}`);
  if (!m || typeof m !== 'object' || Array.isArray(m)) bad('not an object');
  const keys = Object.keys(m).sort().join();
  if (keys !== 'approval_required,deployment_performed,files,fullSHA') bad(`unexpected fields ${keys}`);
  if (typeof m.fullSHA !== 'string' || !SHA.test(m.fullSHA)) bad('fullSHA isn\'t a full lowercase 40-hex SHA');
  if (m.approval_required !== true) bad('approval_required must be true');
  if (m.deployment_performed !== false) bad('deployment_performed must be false');
  if (!Array.isArray(m.files) || !m.files.length) bad('files must be a non-empty array');
  let prev = null;
  for (const f of m.files) {
    if (!f || typeof f !== 'object' || Object.keys(f).sort().join() !== 'bytes,path,sha256') bad('a file entry doesn\'t have exactly path, bytes and sha256');
    if (!safePath(f.path)) bad(`unsafe path ${JSON.stringify(f.path)}`);
    if (!Number.isSafeInteger(f.bytes) || f.bytes < 0) bad(`bad byte count for ${f.path}`);
    if (typeof f.sha256 !== 'string' || !HEX.test(f.sha256)) bad(`bad sha256 for ${f.path}`);
    if (prev !== null && !(prev < f.path)) bad('paths must be sorted and unique');
    prev = f.path;
  }
  return m;
}

export function verify(bundleArg) {
  const bundle = resolve(bundleArg), st = lstat(bundle);
  if (!st) refuse(`${bundle} doesn't exist`);
  if (st.isSymbolicLink() || !st.isDirectory()) refuse(`${bundle} isn't a plain directory`);
  const top = readdirSync(bundle).sort().join();
  if (top !== 'delivery.json,site') refuse(`the bundle must hold exactly delivery.json and site, not: ${top}`);
  const jst = lstatSync(join(bundle, 'delivery.json')), site = join(bundle, 'site'), sst = lstatSync(site);
  if (!jst.isFile()) refuse('delivery.json isn\'t a plain file');
  if (sst.isSymbolicLink() || !sst.isDirectory()) refuse('site isn\'t a plain directory');
  const m = readManifest(join(bundle, 'delivery.json'));
  const actual = inventory(site), listed = m.files.map((f) => f.path);
  for (const p of listed) if (!actual.includes(p)) refuse(`site/${p} is listed but missing`);
  for (const p of actual) if (!listed.includes(p)) refuse(`site/${p} is present but not in delivery.json`);
  for (const f of m.files) {
    const b = readFileSync(join(site, f.path));
    if (b.length !== f.bytes) refuse(`site/${f.path} has ${b.length} bytes, not ${f.bytes}`);
    if (sha256(b) !== f.sha256) refuse(`site/${f.path} doesn't match its sha256`);
  }
  for (const p of ['index.html', 'feed.xml', 'version.txt']) if (!actual.includes(p)) refuse(`site/${p} is required`);
  if (readFileSync(join(site, 'version.txt'), 'utf8') !== `${m.fullSHA}\n`) refuse('site/version.txt isn\'t the exact fullSHA and a newline');
  return m;
}

export function prepare({ ref, out: outArg }) {
  if (!SHA.test(ref)) refuse('--ref must be a full lowercase 40-hex SHA');
  const out = resolve(outArg), parent = dirname(out);
  if (lstat(out)) refuse(`${out} already exists (or is a symlink); --out has to be a new path`);
  const pst = lstat(parent);
  if (!pst || !pst.isDirectory()) refuse(`${parent} isn't an existing directory to make --out in`);
  const stage = realpathSync(mkdtempSync(join(parent, `.${basename(out)}.prepare-`)));
  try {
    try {
      execFileSync(process.execPath, [PACKAGER, '--ref', ref, '--out', join(stage, 'site')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH } });
    } catch (e) { refuse(`the packager refused:\n${(e.stderr || e.message).trim()}`); }
    const site = join(stage, 'site');
    const files = inventory(site).map((p) => { const b = readFileSync(join(site, p)); return { path: p, bytes: b.length, sha256: sha256(b) }; });
    writeFileSync(join(stage, 'delivery.json'), `${JSON.stringify({ fullSHA: ref, files, approval_required: true, deployment_performed: false }, null, 2)}\n`, { flag: 'wx', mode: 0o644 });
    verify(stage); // an incomplete or inconsistent package never gets renamed into place
    if (lstat(out)) refuse(`${out} appeared while preparing; leaving it alone`);
    renameSync(stage, out);
    return { fullSHA: ref, files };
  } catch (e) {
    rmSync(stage, { recursive: true, force: true }); // only the temp directory this run made
    throw e;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); process.exit(0); }
  if (args.error) { console.error(`${args.error}\n${USAGE}`); process.exit(2); }
  try {
    if (args.cmd === 'prepare') {
      const { fullSHA, files } = prepare(args);
      console.log(`prepared ${fullSHA}\n${files.map((f) => `  ${f.path}  ${f.bytes} bytes  ${f.sha256}`).join('\n')}\nbundle: ${resolve(args.out)}\nnext: node tools/prepare-changelog.mjs verify --bundle ${resolve(args.out)}\n${NOTICE}`);
    } else {
      const m = verify(args.bundle);
      console.log(`verified ${m.fullSHA}: ${m.files.length} files match delivery.json\n${NOTICE}`);
    }
  } catch (e) {
    console.error(e instanceof Refused ? e.message : `prepare-changelog failed: ${e.message}`);
    process.exit(1);
  }
}
