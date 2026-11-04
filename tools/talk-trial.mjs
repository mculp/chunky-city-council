// Tries the cheap models side by side on Coop and Miss Bobby, through the talk server, which asks OpenRouter on the owner's key. Each model
// gets three visits with each of them, the way the game has them: what they say when he walks up, then what they say to his first answer,
// with what they've said and what they've kept going with the next. It writes everything each model said, what the checker turned away, how
// long each took and what a hundred lines cost to data/raw/talk-trial.md, for the Creative Director to pick the cheapest that sounds like them.
// It spends the owner's money, a few cents, so nothing runs it but someone asking to, and it asks no faster than the server lets one phone.
//
//   node tools/talk-trial.mjs [--server URL] [--models a,b]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS } from '../server/talk.js';
import { TALK_URL, makeKey } from '../src/net.js';
import { checkReply, messagesFor, LIMITS } from '../src/talk.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const args = process.argv.slice(2), opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const server = opt('--server') ?? TALK_URL, models = opt('--models')?.split(',') ?? Object.keys(MODELS);
const data = JSON.parse(readFileSync(join(ROOT, 'data', 'talk.json'), 'utf8'));
const phone = makeKey(), WHO = ['coop', 'bobby'], VISITS = 3, EVERY = 2200;
// after Chapter 1, with the bag run done and the crowd out, which is where he'll mostly be talking to them
const here = { beans: 7, carrying: ['a gas can', '2 bottles'], happened: [data.happened.flags.delivered, data.happened.flags.paid, data.happened.flags.ended], tonight: data.tonight };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0, asked = 0;
async function ask(model, messages) {
  await pause(Math.max(0, last + EVERY - Date.now())); last = Date.now();
  const res = await fetch(server, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ phone, model, messages }) });
  return res.json();
}

const report = [`# The talk trial, ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`, '', `Asked through ${server}, ${VISITS} visits each with Coop and Miss Bobby, an answer from him each visit.`, ''];
const table = ['| Model | Answered | Turned away | Median ms | Slowest ms | $ for 100 lines |', '|---|---|---|---|---|---|'];
for (const model of models) {
  const lines = [], costs = [], times = [], away = [];
  for (const who of WHO) {
    const mind = { notes: [], said: [], visits: 0 };
    lines.push(`### ${data.people[who].name}`, '');
    for (let v = 1; v <= VISITS; v++) {
      const turns = [];
      let heard = null;
      for (let step = 0; step < 2; step++) {
        const answer = await ask(model, messagesFor({ data, who, here, mind, turns, heard, me: 'trial' })), first = !asked++;
        if (answer.quiet) {
          // Only the run's very first ask says whether the server's answering at all. After that, "off" is OpenRouter turning that model
          // down, which is something to report about it, and the rest of the models still get their turn.
          if (answer.quiet === 'off' && first) { console.error(`The talk server at ${server} isn't answering ("off"): is the owner's key in, and does OpenRouter take ${model}?`); process.exit(1); }
          away.push(`${who} ${v}.${step}: ${answer.quiet}`); lines.push(`- visit ${v}${heard ? ` (he says "${heard}")` : ''}: nothing, ${answer.quiet}`); break;
        }
        costs.push(answer.cost ?? 0); times.push(answer.ms ?? 0);
        const r = checkReply(answer.reply, { data, who, said: mind.said });
        if (!r.say) { away.push(`${who} ${v}.${step}: ${r.bad ?? 'care'}: ${String(answer.reply).slice(0, 160)}`); lines.push(`- visit ${v}${heard ? ` (he says "${heard}")` : ''}: turned away, ${r.bad ?? 'care'}: \`${String(answer.reply).replace(/\s+/g, ' ').slice(0, 200)}\``); break; }
        lines.push(`- visit ${v}${heard ? ` (he says "${heard}")` : ''}: "${r.say}" (${r.mood}${r.remember ? `; keeps "${r.remember}"` : ''}${r.replies.length ? `; his answers: ${r.replies.map((t) => `"${t}"`).join(', ')}` : ''})`);
        mind.said.push(r.say); if (r.remember) mind.notes.push({ about: 'trial', text: r.remember, at: Date.now() });
        if (heard) turns.push({ role: 'user', content: `He says: "${heard}"` });
        turns.push({ role: 'assistant', content: JSON.stringify({ say: r.say }) });
        heard = r.replies[0];
        if (!heard) break;
      }
      mind.visits++;
    }
    lines.push('');
  }
  times.sort((a, b) => a - b);
  const per100 = costs.length ? (costs.reduce((a, b) => a + b, 0) / costs.length) * 100 : 0;
  table.push(`| ${model} | ${costs.length} | ${away.length} | ${times[Math.floor(times.length / 2)] ?? '-'} | ${times.at(-1) ?? '-'} | ${per100.toFixed(4)} |`);
  report.push(`## ${model}`, '', `$${MODELS[model].in} in and $${MODELS[model].out} out a million tokens.`, '', ...lines, ...(away.length ? ['Turned away:', '', ...away.map((a) => `- ${a}`), ''] : []));
  console.log(`${model}: ${costs.length} answered, ${away.length} turned away, median ${times[Math.floor(times.length / 2)] ?? '-'} ms, $${per100.toFixed(4)} for 100 lines`);
}
report.splice(4, 0, ...table, '', `A line is under ${LIMITS.words} words and goes through the game's own checker in src/talk.js, so what's turned away is what a player would have heard as the written line instead.`, '');
mkdirSync(join(ROOT, 'data', 'raw'), { recursive: true });
writeFileSync(join(ROOT, 'data', 'raw', 'talk-trial.md'), report.join('\n'));
console.log('written to data/raw/talk-trial.md');
