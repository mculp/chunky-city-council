// Makes music and sounds with ElevenLabs on fal, from what tools/sound_prompts.json asks for, and puts each file's one line into data/sound-new.json, a sheet of its own.
// That's what the game plays. data/sound.json is the sounds worked out from code, which the owner wants kept for #sounds and #old, and nothing here ever writes to it.
// It spends money, so by itself it only says what it would make and what that comes to, and it won't start anything that could go over the budget.
// Anything already made stays made, unless it's named with --again. data/sound.md has the rest.
//
//   npm run sound:make                                what it would make, and the cost
//   npm run sound:make -- --go                        makes it
//   npm run sound:make -- --go --only town,step.road  just those
//   npm run sound:make -- --go --only town --again    those again, over what's there
//   npm run sound:make -- --go --only step.wood.2 --again  one take of one sound
//   npm run sound:make -- --go --budget 30            a different limit, in dollars, for all that's ever been spent
//
// The key comes from FAL_KEY or from what tools/set-fal-key.sh saved, and goes nowhere but fal.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const QUEUE = 'https://queue.fal.run';
export const MUSIC_MODEL = 'fal-ai/elevenlabs/music', SOUND_MODEL = 'fal-ai/elevenlabs/sound-effects/v2';
// From fal's pricing API on 2026-11-01. Its page said .8 a minute for music. Music might be rounded up to the whole minute, which neither settles, so the budget's held against that.
export const MUSIC_PER_MINUTE = .6, SOUND_PER_SECOND = .002;
const BUDGET = 20, AT_ONCE = 3, MOST_WAIT = 10 * 60 * 1000;

// Everything the sheet asks for, one file to an item, with what it'd cost
export function planOf(sheet, root = ROOT) {
  const items = [], { styles = [], avoid = [] } = sheet.music;
  for (const [name, track] of Object.entries(sheet.music.tracks)) {
    const takes = track.takes ?? [{ sections: track.sections }];
    takes.forEach((take, i) => {
      const seconds = take.sections.reduce((n, s) => n + s.seconds, 0);
      items.push({
        kind: 'music', name, take: `${name}.${i + 1}`, path: `audio/music/${name}.${i + 1}.mp3`, model: MUSIC_MODEL, seconds, cost: seconds / 60 * MUSIC_PER_MINUTE, most: Math.ceil(seconds / 60) * MUSIC_PER_MINUTE,
        body: {
          composition_plan: {
            positive_global_styles: [...styles, ...(track.styles ?? [])], negative_global_styles: [...avoid, ...(track.avoid ?? [])],
            sections: take.sections.map((s) => ({ section_name: s.name, positive_local_styles: s.styles, negative_local_styles: s.avoid ?? [], duration_ms: Math.round(s.seconds * 1000), lines: [] })),
          },
          output_format: 'mp3_44100_192',
        },
      });
    });
  }
  for (const [name, cue] of Object.entries(sheet.cues)) {
    for (let i = 0; i < (cue.takes ?? 1); i++) {
      const body = { text: cue.prompt, duration_seconds: cue.seconds, prompt_influence: cue.influence ?? .6, output_format: 'mp3_44100_128' };
      if (cue.loop) body.loop = true;
      items.push({ kind: 'sound', name, take: `${name}.${i + 1}`, path: `audio/sfx/${name}.${i + 1}.mp3`, model: SOUND_MODEL, seconds: cue.seconds, cost: cue.seconds * SOUND_PER_SECOND, most: cue.seconds * SOUND_PER_SECOND, body });
    }
  }
  return items.map((it) => ({ ...it, made: existsSync(join(root, it.path)) }));
}

// --only takes a whole sound or one take of it
export const toMake = (items, { only = null, again = false } = {}) => items.filter((it) => (!only || only.includes(it.name) || only.includes(it.take)) && (again || !it.made));
export const spentOf = (book) => ({ likely: book?.spent?.likely ?? 0, most: book?.spent?.most ?? 0 });
export const costOf = (items) => ({ likely: items.reduce((n, it) => n + it.cost, 0), most: items.reduce((n, it) => n + it.most, 0), seconds: items.reduce((n, it) => n + it.seconds, 0) });

// data/sound.json, the way it's kept: one line to a sound, so that swapping one is a one-line change
export function formatSound(d) {
  const line = (v) => { const s = JSON.stringify(v); return s === '{}' ? s : s.replace(/^\{/, '{ ').replace(/\}$/, ' }').replace(/":/g, '": ').replace(/,"/g, ', "'); };
  const block = (o, pad) => Object.entries(o).map(([k, v]) => `${pad}${JSON.stringify(k)}: ${line(v)}`).join(',\n');
  const part = (key, o) => (Object.keys(o).length ? `  "${key}": {\n${block(o, '    ')}\n  }` : `  "${key}": {}`);
  return `{\n  "version": ${d.version},\n  "levels": ${line(d.levels)},\n  "duck": ${line(d.duck)},\n  "defaults": ${line(d.defaults)},\n${part('cues', d.cues)},\n${part('music', d.music)},\n${part('voice', d.voice ?? {})}\n}\n`;
}

// Points a sheet at whatever's been made for one name. Only the file lines change, and the level lines that are the prompt sheet's to say.
export function applyTo(data, sheet, name, root = ROOT) {
  const made = (dir, n) => { const out = []; for (let i = 1; i <= n; i++) { const p = `audio/${dir}/${name}.${i}.mp3`; if (existsSync(join(root, p))) out.push(p); } return out; };
  const one = (list) => (list.length === 1 ? list[0] : list);
  const track = sheet.music.tracks[name];
  if (track) {
    const files = made('music', (track.takes ?? [0]).length);
    if (files.length) for (const [state, opts] of Object.entries(track.states)) data.music[state] = { ...data.music[state], ...opts, file: one(files) };
  } else {
    const cue = sheet.cues[name], files = made('sfx', cue.takes ?? 1);
    if (files.length) { data.cues[name] = { ...data.cues[name], file: one(files) }; if (cue.stereo) data.cues[name].stereo = true; }
  }
  return data;
}

// FAL_KEY if it's set, or else the file tools/set-fal-key.sh keeps it in
export function findKey(env = process.env) {
  if (env.FAL_KEY) return env.FAL_KEY;
  const file = join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'chunky/fal-key');
  return existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function askFal(url, key, init = {}, doFetch = fetch) {
  for (let tries = 0; ; tries++) {
    const res = await doFetch(url, { ...init, headers: { ...init.headers, Authorization: `Key ${key}` } });
    if (res.ok || res.status === 202) return res.json();
    const said = (await res.text()).slice(0, 300);
    if ((res.status === 429 || res.status >= 500) && tries < 4) { await pause(1000 * 2 ** tries); continue; }
    const err = new Error(`fal said ${res.status}: ${said}`); err.status = res.status; throw err;
  }
}

// One file: into fal's queue, wait, and fetch what it made. fal says where to look, because for a model with a path in its name that isn't the address it was sent to.
export async function makeOne(item, { key, base = QUEUE, doFetch = fetch, poll = 2000 } = {}) {
  const post = (body) => askFal(`${base}/${item.model}`, key, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, doFetch);
  // 192 is only on some of ElevenLabs' plans, so if fal won't have it the next one down will do
  let job;
  try { job = await post(item.body); }
  catch (e) { if (e.status !== 422 && e.status !== 400 && e.status !== 403 || item.body.output_format !== 'mp3_44100_192') throw e; job = await post({ ...item.body, output_format: 'mp3_44100_128' }); }
  const until = Date.now() + MOST_WAIT;
  for (;;) {
    const st = await askFal(job.status_url, key, {}, doFetch);
    if (st.status === 'COMPLETED') break;
    if (Date.now() > until) throw new Error(`gave up waiting on ${item.path}, request ${job.request_id}`);
    await pause(poll);
  }
  const result = await askFal(job.response_url, key, {}, doFetch), url = result.audio?.url;
  if (!url) throw new Error(`no audio came back for ${item.path}, request ${job.request_id}`);
  const res = await doFetch(url);
  if (!res.ok) throw new Error(`couldn't fetch ${item.path}: ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  // whatever's said to be audio, only audio goes in the repo
  const isMp3 = bytes.length > 256 && (bytes.subarray(0, 3).toString('latin1') === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
  if (!isMp3) throw new Error(`what came back for ${item.path} isn't an mp3`);
  return { bytes, request: job.request_id };
}

function writeAtomically(path, data) { mkdirSync(dirname(path), { recursive: true }); const tmp = `${path}.tmp`; writeFileSync(tmp, data); renameSync(tmp, path); }

// Makes them, a few at a time, keeping everything that worked whatever else fails. Each one is written down as it lands, so that stopping halfway loses nothing.
export async function makeAll(items, sheet, { key, root = ROOT, base, doFetch = fetch, poll, log = console.log, now = () => new Date().toISOString() } = {}) {
  const oldPath = join(root, 'data/sound.json'), newPath = join(root, 'data/sound-new.json'), bookPath = join(root, 'audio/manifest.json');
  const book = existsSync(bookPath) ? JSON.parse(readFileSync(bookPath, 'utf8')) : { note: 'Made with tools/make-sound.mjs. The prompts are in tools/sound_prompts.json.', made: {} };
  const waiting = [...items], failed = [];
  const worker = async () => {
    for (let item = waiting.shift(); item; item = waiting.shift()) {
      try {
        const { bytes, request } = await makeOne(item, { key, base, doFetch, poll });
        writeAtomically(join(root, item.path), bytes);
        book.made[item.path] = { model: item.model, seconds: item.seconds, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), request, date: now() };
        book.made = Object.fromEntries(Object.entries(book.made).sort(([a], [b]) => a.localeCompare(b)));
        // what's been spent stays spent, whatever gets made over it
        const spent = spentOf(book), cents = (n) => Math.round(n * 1e4) / 1e4;
        book.spent = { likely: cents(spent.likely + item.cost), most: cents(spent.most + item.most) };
        writeAtomically(bookPath, `${JSON.stringify(book, null, 2)}\n`);
        // it starts as a copy of the old sheet, and from then on it's its own
        const data = applyTo(JSON.parse(readFileSync(existsSync(newPath) ? newPath : oldPath, 'utf8')), sheet, item.name, root);
        writeAtomically(newPath, formatSound(data));
        log(`made ${item.path} (${(bytes.length / 1024).toFixed(0)} KB)`);
      } catch (e) { failed.push(item); log(`FAILED ${item.path}: ${e.message}`); }
    }
  };
  await Promise.all(Array.from({ length: AT_ONCE }, worker));
  return { failed };
}

async function main() {
  const args = process.argv.slice(2), value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
  const only = value('--only')?.split(',') ?? null, again = args.includes('--again'), budget = Number(value('--budget') ?? BUDGET);
  const sheet = JSON.parse(readFileSync(join(ROOT, 'tools/sound_prompts.json'), 'utf8')), items = planOf(sheet), list = toMake(items, { only, again });
  if (only) for (const name of only) if (!items.some((it) => it.name === name || it.take === name)) throw new Error(`Nothing called ${name} in tools/sound_prompts.json`);
  const music = list.filter((it) => it.kind === 'music'), sounds = list.filter((it) => it.kind === 'sound'), total = costOf(list);
  const money = (n) => `$${n.toFixed(2)}`;
  console.log(`${music.length} music tracks, ${costOf(music).seconds.toFixed(0)} s: about ${money(costOf(music).likely)}, at most ${money(costOf(music).most)} if fal rounds up to the minute`);
  console.log(`${sounds.length} sounds, ${costOf(sounds).seconds.toFixed(0)} s: about ${money(costOf(sounds).likely)}`);
  console.log(`together: about ${money(total.likely)}, at most ${money(total.most)}. ${items.filter((it) => it.made && !list.includes(it)).length} already made and left alone.`);
  const bookPath = join(ROOT, 'audio/manifest.json'), spent = spentOf(existsSync(bookPath) ? JSON.parse(readFileSync(bookPath, 'utf8')) : null);
  console.log(`spent so far: about ${money(spent.likely)}, at most ${money(spent.most)}, of the ${money(budget)} budget.`);
  if (!list.length) return;
  if (!args.includes('--go')) { console.log('Nothing has been spent. --go makes them.'); return; }
  if (spent.most + total.most > budget) { console.error(`That could bring it to ${money(spent.most + total.most)}, over the ${money(budget)} budget, so nothing was started. --budget changes it.`); process.exitCode = 1; return; }
  const key = findKey();
  if (!key) { console.error('There\'s no fal key. Run bash tools/set-fal-key.sh in a real terminal to save one.'); process.exitCode = 1; return; }
  const { failed } = await makeAll(list, sheet, { key });
  console.log(failed.length ? `${failed.length} failed, and running this again picks up where it stopped: ${failed.map((it) => it.path).join(', ')}` : 'all made');
  if (failed.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
