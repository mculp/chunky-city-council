// tools/make-sound.mjs against a stand-in for fal on this machine. Nothing here reaches fal or spends anything.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { applyTo, costOf, findKey, formatSound, makeAll, makeOne, MUSIC_MODEL, planOf, SOUND_MODEL, toMake } from './make-sound.mjs';

const REAL = JSON.parse(readFileSync(new URL('../data/sound.json', import.meta.url), 'utf8'));
const SHEET = JSON.parse(readFileSync(new URL('./sound_prompts.json', import.meta.url), 'utf8'));
const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(1000, 7)]);

const sheet = {
  music: { styles: ['slow'], avoid: ['vocals'], tracks: {
    hang: { states: { title: {}, hang: {} }, sections: [{ name: 'A', seconds: 40, styles: ['drone'] }, { name: 'B', seconds: 35, styles: ['more'] }] },
    town: { states: { town: { next: ['chase'] } }, takes: [{ sections: [{ name: 'A', seconds: 30, styles: ['one'] }] }, { sections: [{ name: 'B', seconds: 30, styles: ['two'] }] }] },
  } },
  cues: { 'step.road': { takes: 2, seconds: .5, prompt: 'a step' }, 'amb.wind': { seconds: 20, loop: true, influence: .4, prompt: 'wind' }, explosion: { seconds: 4, stereo: true, prompt: 'boom' } },
};
function freshRoot() {
  const root = mkdtempSync(join(tmpdir(), 'make-sound-'));
  mkdirSync(join(root, 'data'), { recursive: true });
  writeFileSync(join(root, 'data/sound.json'), formatSound({ version: 1, levels: { master: 1 }, duck: { music: .25 }, defaults: { gain: .6 }, cues: { 'step.road': { gain: .3 }, 'amb.wind': { gain: .34 }, explosion: { gain: 1 } }, music: { title: { bed: .5 }, hang: { bed: .7 }, town: { bed: .4 } }, voice: {} }));
  return root;
}
// fal's queue, as its docs have it, with the status and result somewhere other than where the job was sent
async function fakeFal({ audio = MP3, refuse = () => null } = {}) {
  const seen = [], polls = new Map();
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const url = new URL(req.url, 'http://x'), send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.method === 'POST') {
      const body = JSON.parse(Buffer.concat(chunks)), id = `r${seen.length}`; seen.push({ path: url.pathname, auth: req.headers.authorization, body });
      const no = refuse(body); if (no) return send(no, { detail: 'not on this plan' });
      const at = `http://localhost:${server.address().port}/q/${id}`;
      return send(200, { request_id: id, status_url: `${at}/status`, response_url: `${at}/response` });
    }
    if (req.headers.authorization !== 'Key secret-key' && url.pathname.startsWith('/q/')) return send(401, {});
    if (url.pathname.endsWith('/status')) { const n = (polls.get(url.pathname) ?? 0) + 1; polls.set(url.pathname, n); return send(200, { status: n < 2 ? 'IN_PROGRESS' : 'COMPLETED' }); }
    if (url.pathname.endsWith('/response')) return send(200, { audio: { url: `http://localhost:${server.address().port}/file.mp3` } });
    if (url.pathname === '/file.mp3') { assert.equal(req.headers.authorization, undefined, 'the key only goes to the queue'); res.writeHead(200); return res.end(audio); }
    return send(404, {});
  });
  await new Promise((r) => server.listen(0, r));
  return { base: `http://localhost:${server.address().port}`, seen, close: () => server.close() };
}

test('the sheet asks for one file a take, of the right kind and cost', () => {
  const items = planOf(sheet, freshRoot());
  assert.deepEqual(items.map((i) => i.path), ['audio/music/hang.1.mp3', 'audio/music/town.1.mp3', 'audio/music/town.2.mp3', 'audio/sfx/step.road.1.mp3', 'audio/sfx/step.road.2.mp3', 'audio/sfx/amb.wind.1.mp3', 'audio/sfx/explosion.1.mp3']);
  const hang = items[0], wind = items[5];
  assert.equal(hang.model, MUSIC_MODEL); assert.equal(hang.seconds, 75);
  assert.ok(Math.abs(hang.cost - 1) < 1e-9); assert.equal(hang.most, 1.6);
  assert.deepEqual(hang.body.composition_plan.positive_global_styles, ['slow']);
  assert.deepEqual(hang.body.composition_plan.sections[0], { section_name: 'A', positive_local_styles: ['drone'], negative_local_styles: [], duration_ms: 40000, lines: [] });
  assert.equal(wind.model, SOUND_MODEL); assert.equal(wind.body.loop, true); assert.equal(wind.body.prompt_influence, .4); assert.equal(wind.body.duration_seconds, 20);
  assert.ok(Math.abs(wind.cost - .04) < 1e-9);
  assert.equal(items[3].body.loop, undefined);
});

test('what it makes leaves alone what is there, unless it is named again', () => {
  const root = freshRoot(); mkdirSync(join(root, 'audio/sfx'), { recursive: true }); writeFileSync(join(root, 'audio/sfx/explosion.1.mp3'), MP3);
  const items = planOf(sheet, root);
  assert.ok(!toMake(items).some((i) => i.name === 'explosion'));
  assert.deepEqual(toMake(items, { only: ['explosion'] }), []);
  assert.deepEqual(toMake(items, { only: ['explosion'], again: true }).map((i) => i.name), ['explosion']);
  assert.ok(costOf(toMake(items)).most < costOf(items).most);
});

test('the real sheet covers every sound in the game, within the limits of the models and with no words in the score', () => {
  const items = planOf(SHEET);
  for (const name of Object.keys(REAL.cues)) assert.ok(SHEET.cues[name]?.prompt, `${name} has a prompt`);
  for (const name of Object.keys(SHEET.cues)) assert.ok(REAL.cues[name], `${name} is a sound in the game`);
  for (const [name, c] of Object.entries(SHEET.cues)) assert.ok(c.seconds >= .5 && c.seconds <= 22, `${name} is ${c.seconds} s`);
  for (const t of Object.values(SHEET.music.tracks)) {
    for (const state of Object.keys(t.states)) assert.ok(REAL.music[state], `${state} is part of the score`);
    for (const take of t.takes ?? [t]) for (const s of take.sections) { assert.ok(s.seconds >= 3 && s.seconds <= 120 && s.name.length <= 100); }
  }
  for (const it of items) if (it.kind === 'music') for (const s of it.body.composition_plan.sections) assert.deepEqual(s.lines, []);
  assert.ok(SHEET.music.avoid.includes('vocals'));
  const all = costOf(items);
  assert.ok(all.most < 20, `the whole sheet could come to $${all.most}, over the budget`);
});

test('data/sound.json keeps its one line to a sound', () => {
  const back = formatSound(REAL);
  assert.deepEqual(JSON.parse(back), REAL);
  assert.equal(back, readFileSync(new URL('../data/sound.json', import.meta.url), 'utf8'), 'and writes it exactly as it is');
});

test('one take: it sends the key to fal, waits and keeps what comes back', async () => {
  const fal = await fakeFal();
  const [item] = planOf(sheet, freshRoot()), got = await makeOne(item, { key: 'secret-key', base: fal.base, poll: 1 });
  assert.equal(fal.seen[0].path, `/${MUSIC_MODEL}`);
  assert.equal(fal.seen[0].auth, 'Key secret-key');
  assert.equal(fal.seen[0].body.output_format, 'mp3_44100_192');
  assert.deepEqual(got.bytes, MP3);
  fal.close();
});

test('if 192 is not on the plan, it takes 128 rather than failing', async () => {
  const fal = await fakeFal({ refuse: (b) => (b.output_format === 'mp3_44100_192' ? 403 : null) });
  const [item] = planOf(sheet, freshRoot());
  await makeOne(item, { key: 'secret-key', base: fal.base, poll: 1 });
  assert.deepEqual(fal.seen.map((s) => s.body.output_format), ['mp3_44100_192', 'mp3_44100_128']);
  fal.close();
});

test('whatever comes back has to be an mp3 to go in the repo', async () => {
  const fal = await fakeFal({ audio: Buffer.from('<html>not audio</html>'.repeat(40)) });
  const [item] = planOf(sheet, freshRoot());
  await assert.rejects(makeOne(item, { key: 'secret-key', base: fal.base, poll: 1 }), /isn't an mp3/);
  fal.close();
});

test('a run writes the files, the record and one line each, and a failure keeps the rest', async () => {
  const root = freshRoot();
  const fal = await fakeFal({ refuse: (b) => (b.text === 'boom' ? 400 : null) }), lines = [];
  const items = toMake(planOf(sheet, root));
  const { failed } = await makeAll(items, sheet, { key: 'secret-key', root, base: fal.base, poll: 1, log: (s) => lines.push(s), now: () => 'then' });
  fal.close();
  assert.deepEqual(failed.map((i) => i.name), ['explosion']);
  assert.ok(existsSync(join(root, 'audio/music/town.2.mp3')));
  const data = JSON.parse(readFileSync(join(root, 'data/sound.json'), 'utf8'));
  assert.deepEqual(data.music.town.file, ['audio/music/town.1.mp3', 'audio/music/town.2.mp3']);
  assert.deepEqual(data.music.town.next, ['chase']);
  assert.equal(data.music.title.file, 'audio/music/hang.1.mp3'); assert.equal(data.music.hang.file, 'audio/music/hang.1.mp3');
  assert.equal(data.music.title.bed, .5, 'the drone stays, for if a file does not come');
  assert.deepEqual(data.cues['step.road'].file, ['audio/sfx/step.road.1.mp3', 'audio/sfx/step.road.2.mp3']);
  assert.equal(data.cues['amb.wind'].file, 'audio/sfx/amb.wind.1.mp3'); assert.equal(data.cues['amb.wind'].gain, .34);
  assert.equal(data.cues.explosion.file, undefined, 'one that failed still has its own');
  const book = JSON.parse(readFileSync(join(root, 'audio/manifest.json'), 'utf8')).made['audio/sfx/amb.wind.1.mp3'];
  assert.equal(book.model, SOUND_MODEL); assert.equal(book.bytes, MP3.length); assert.equal(book.date, 'then'); assert.match(book.sha256, /^[0-9a-f]{64}$/);
  assert.ok(!lines.join().includes('secret-key'), 'the key is never printed');
  assert.ok(!readFileSync(join(root, 'audio/manifest.json'), 'utf8').includes('secret-key'), 'or written down');
});

test('applying a name with no file made changes nothing', () => {
  const root = freshRoot(), data = JSON.parse(readFileSync(join(root, 'data/sound.json'), 'utf8')), before = JSON.stringify(data);
  applyTo(data, sheet, 'explosion', root); applyTo(data, sheet, 'hang', root);
  assert.equal(JSON.stringify(data), before);
});

test('the key comes from FAL_KEY, or else from the file that keeps it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'make-sound-key-'));
  assert.equal(findKey({ FAL_KEY: 'from-env', XDG_CONFIG_HOME: dir }), 'from-env');
  assert.equal(findKey({ XDG_CONFIG_HOME: dir }), '');
  mkdirSync(join(dir, 'chunky')); writeFileSync(join(dir, 'chunky/fal-key'), 'from-file\n');
  assert.equal(findKey({ XDG_CONFIG_HOME: dir }), 'from-file');
  assert.equal(findKey({ FAL_KEY: '', XDG_CONFIG_HOME: dir }), 'from-file', 'a blank one counts as none');
});

test('the script that saves the key will not save a blank one when there is no terminal', () => {
  const dir = mkdtempSync(join(tmpdir(), 'make-sound-key-')), script = new URL('./set-fal-key.sh', import.meta.url).pathname;
  let code = 0; try { execFileSync('bash', [script], { env: { ...process.env, XDG_CONFIG_HOME: dir }, input: '\n', stdio: 'pipe' }); } catch (e) { code = e.status; }
  assert.equal(code, 1);
  assert.ok(!existsSync(join(dir, 'chunky/fal-key')));
});

test('run by hand it spends nothing without --go, or over the budget, or with no key', () => {
  // its own empty config folder, or a key saved on this machine would make the --go below real
  const tool = new URL('./make-sound.mjs', import.meta.url).pathname, noKeyHere = mkdtempSync(join(tmpdir(), 'make-sound-key-')), run = (...args) => { const env = { ...process.env, XDG_CONFIG_HOME: noKeyHere }; delete env.FAL_KEY; try { return { out: execFileSync('node', [tool, ...args], { env, encoding: 'utf8', stdio: 'pipe' }), code: 0 }; } catch (e) { return { out: e.stdout + e.stderr, code: e.status }; } };
  const dry = run();
  assert.equal(dry.code, 0); assert.match(dry.out, /Nothing has been spent/);
  const over = run('--go', '--budget', '0.01');
  assert.equal(over.code, 1); assert.match(over.out, /over the \$0\.01 budget, so nothing was started/);
  const noKey = run('--go');
  assert.equal(noKey.code, 1); assert.match(noKey.out, /no fal key/);
  assert.equal(run('--only', 'not-a-sound').code, 1);
});
