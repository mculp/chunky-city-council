// What the people in the town everyone shares start from that only the game knows (CHUNKY-153b), from the game's own to data/crowd.json,
// for the town, which runs them in server/world.js: who's at home where, every vehicle where it's parked, and the lights that draw them at
// night, with the prop that puts each one out. On its own it checks that what's there is still what the game has, and then that the town's
// world has the places nobody goes where the game has them, and every house's door where the game brings its people out of it. data/crowd.md
// has what's in it.
//
//   npm i && npm run crowd            checks it
//   npm run crowd -- --write          writes it again, after who lives where, what's parked where or a light has changed
import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';
import { createWorld, HOME_ID } from '../server/world.js';

const FILE = new URL('../data/crowd.json', import.meta.url), write = process.argv.includes('--write');
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const json = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));

// to the millimetre, and which way a vehicle's pointing to a ten-thousandth of a radian, which is a quarter of a millimetre at its nose
const mm = (v) => Math.round(v * 1000) / 1000, rad = (v) => Math.round(v * 1e4) / 1e4;
// one thing to a line, and the homes ten to a line, so that a change to one of them is a change to one line
const line = JSON.stringify, list = (a) => (a.length ? `[\n${a.map(line).join(',\n')}]` : '[]');
const tens = (a) => `[\n${Array.from({ length: Math.ceil(a.length / 10) }, (_, i) => a.slice(i * 10, i * 10 + 10).join(',')).join(',\n')}]`;
const text = (d) => `{"homes":${tens(d.homes)},\n"parked":${list(d.parked)},\n"lights":${list(d.lights)}}\n`;

// The town with its crowd out, as it is as soon as he's in it, before anything's moved or broken
const { page, errors, close } = await serveAndOpen({ query: '?test&horde' });
const now = await page.evaluate(() => {
  const g = __game; g.jump('town'); g.step(.1);
  return { homes: g.homes.map((h) => h.s.id), parked: g.vehicles.map((v) => [v.kind, v.home.x, v.home.z, v.home.yaw]), zones: g.horde.zones.map(({ on, ...z }) => z) };
});
const homes = (await import('../src/structures.js')).placeStructures(json('data/structures.json'), (await import('../src/map.js')).buildMap(json('data/roads.json')));

// Every house's door, where the game brings whoever lives there out of it: round the county from house to house, every house within 150 m of
// somewhere he's stood, with its people brought out, and the ones put back as he goes on still with theirs. A house whose door is somewhere
// nobody can stand has nobody out of it. He's let be meanwhile, since it's the houses that are being looked at.
const where = new Map(homes.map((s) => [s.id, s.pts[0]])), spots = [], left = new Set(now.homes.keys());
while (left.size) {
  const [x, z] = where.get(now.homes[left.values().next().value]);
  spots.push([x, z]);
  for (const j of left) { const [hx, hz] = where.get(now.homes[j]); if (Math.hypot(hx - x, hz - z) < 150) left.delete(j); }
}
const doors = await page.evaluate((spots) => {
  const g = __game; g.fillTown();
  for (const [x, z] of spots) { g.S.hp = 3; g.place(x, z); g.sim(1.1); }
  const out = {};
  for (const s of [...g.horde.all, ...g.putBack]) if (s.home) out[s.who.id] = { door: s.home.door, inside: s.home.inside, nx: s.home.nx, nz: s.home.nz };
  return out;
}, spots);

// and last, since it breaks things, the lights, and what puts each one out: every prop near it whose breaking takes it out of the lights,
// each tried on a page of its own, since breaking one thing can bring down more and nothing's mended without a town. It's only ever a prop's
// own broke() that puts a light out, so only those are tried. Nothing might, and then it's on for good.
const fresh = async () => {
  await page.goto(page.url(), { waitUntil: 'load' }); await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
  await page.evaluate(() => { __game.jump('town'); __game.step(.1); });
};
await fresh();
const near = await page.evaluate(async () => {
  const g = __game, { propKeys } = await import('./src/wrecks.js'), keys = propKeys(g.wreck.props);
  return g.horde.lights.map((l) => ({ x: l.x, z: l.z, r: l.r, props: g.wreck.props.flatMap((p, i) => (p.broke && keys.has(p) && Math.hypot(p.cx - l.x, p.cz - l.z) < 12 ? [i] : [])) }));
});
const lights = [];
for (const [n, l] of near.entries()) {
  const k = [];
  for (const i of l.props) {
    await fresh();
    const key = await page.evaluate(async ([n, i]) => {
      const g = __game, { propKeys } = await import('./src/wrecks.js'), light = g.horde.lights[n], p = g.wreck.props[i];
      g.wreck.breakProp(p);
      return g.horde.lights.includes(light) ? null : propKeys(g.wreck.props).get(p);
    }, [n, i]);
    if (key) k.push(key);
  }
  lights.push([l.x, l.z, l.r, k]);
}
const data = {
  homes: now.homes,
  parked: now.parked.map(([kind, x, z, yaw]) => [kind, mm(x), mm(z), rad(yaw)]),
  lights: lights.map(([x, z, r, k]) => [mm(x), mm(z), r, k]),
};
check(`it has everyone at home, ${data.homes.length} of them, in ${new Set(data.homes).size} houses`, data.homes.length > 500 && data.homes.every(Number.isInteger), data.homes.length);
check(`every vehicle where it's parked, ${data.parked.length} of them`, data.parked.length > 100, data.parked.length);
check(`and the lights that draw them at night, ${data.lights.length} of them, with what puts out ${data.lights.filter((l) => l[3].length).length}`, data.lights.length > 0 && data.lights.every((l) => l[3].length), data.lights);

const want = text(data);
if (write) { await writeFile(FILE, want); console.log(`wrote ${FILE.pathname}, ${(want.length / 1024).toFixed(1)} KB`); }
else check('data/crowd.json is what the game has', (await readFile(FILE, 'utf8').catch(() => '')) === want, 'run npm run crowd -- --write');

// ---------------- the town's world, from it
const world = createWorld({ roads: json('data/roads.json'), lanes: json('data/lanes.json'), water: json('data/water.json'), solids: json('data/solids.json'), structures: json('data/structures.json'), crowd: JSON.parse(want) });
const g = now.zones.find((z) => z.x0 !== undefined), c = now.zones.find((z) => z.r !== undefined), same = (a, b) => Math.abs(a - b) < 1e-6;
check('the compound on Pine Forest Rd\'s grounds are where the game has them, with the same way out', !!g && ['x0', 'z0', 'x1', 'z1'].every((k) => same(world.grounds[k], g[k])) && same(world.grounds.out[0], g.out[0]) && same(world.grounds.out[1], g.out[1]), { town: world.grounds, game: g });
check('and so is the church on Church St', !!c && same(world.church.x, c.x) && same(world.church.z, c.z) && world.church.r === c.r, { town: world.church, game: c });
check('and nowhere else', now.zones.length === 2, now.zones);

// and the town's doors are the game's, each by whoever lives there, whose number is the home's on both
let wrong = [], outs = 0;
world.homes.forEach((h) => {
  const town = world.doorOf(h), game = doors[h.id] ?? null;
  if (game) outs++;
  const ok = !town === !game && (!town || (['nx', 'nz'].every((k) => same(town[k], game[k])) && [0, 1].every((k) => same(town.door[k], game.door[k]) && same(town.inside[k], game.inside[k]))));
  if (!ok) wrong.push({ home: h.id, town, game });
});
check(`every house's door is where the game brings its people out, from ${spots.length} places round the county, with ${outs} brought out`, !wrong.length && outs > data.homes.length * .9, wrong.slice(0, 5));

check('no errors in the page', !errors.length, errors);
await close();
console.log(failed ? `\n${failed} failed` : '\nall ok');
process.exit(failed ? 1 : 0);
