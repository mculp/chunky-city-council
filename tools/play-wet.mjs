// Checks that the town everyone shares has its water where the game has it (CHUNKY-153): src/wet.js, with the town's raised floors from
// data/solids.json, against the game's own floor and water in town, all along the river and across its banks, round every pond and pool,
// over every bridge and trestle and at Stuckey's Bridge. Where one has water and the other hasn't has to be at the water's edge, and where
// both have it, it has to be as deep in both. Wherever they differ by more, it says where.
//
// The town's ground is flat, and the game's has the land's rise and fall in it, and the pads its buildings stand on. So where a building's
// pad or a road's bed meets a pond, the game's ground can stand over its water where the town's doesn't, and the other way round. That's a
// few places in a pond's corner, not a pond's worth, so it's allowed in 1 place in 10,000, and they're listed.
//
//   npm i && npm run wet
import { readFileSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';
import { buildMap } from '../src/map.js';
import { buildWater } from '../src/water.js';
import { createSolids } from '../src/solids.js';
import { TOWN_Y, channel, createWet } from '../src/wet.js';

let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const json = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));
const map = buildMap(json('data/roads.json'), { riverAtBridge: channel, lanes: json('data/lanes.json') });
const ponds = buildWater(json('data/water.json'), map), solids = createSolids(json('data/solids.json'));
const wet = createWet({ map, ponds, raised: solids.raised });

// ---------------- where to look: [x, z, what's there]
const spots = [];
const along = (pts, every, fn) => {
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], len = Math.hypot(bx - ax, bz - az);
    if (!len) continue;
    for (let s = 0; s < len; s += every) fn(ax + (bx - ax) * s / len, az + (bz - az) * s / len, -(bz - az) / len, (bx - ax) / len);
  }
};
// across the river every 4 m along it, and closer in by the edge of the water, out past the top of its banks
const ACROSS = [0, 6, 12, 14, 15, 15.5, 16, 16.25, 16.5, 16.75, 17, 17.5, 18, 20, 23, 26];
for (const line of map.river) along(line, 4, (x, z, nx, nz) => { for (const d of ACROSS) for (const k of d ? [1, -1] : [1]) spots.push([x + nx * d * k, z + nz * d * k, 'river']); });
// in from every pond's shore and out from it, every 2 m round it
const IN = [-4, -2, -1.2, -1, -.9, -.8, -.7, -.6, -.4, 0, .5, 2, 5, 9];
for (const p of ponds.ponds) {
  const ring = p.ring.concat([p.ring[0]]), mid = (a, b) => (a + b) / 2;
  // which way's in: the side of the first edge's middle that's in the pond
  const [[ax, az], [bx, bz]] = ring, len = Math.hypot(bx - ax, bz - az) || 1, inward = ponds.in(mid(ax, bx) - (bz - az) / len * .3, mid(az, bz) + (bx - ax) / len * .3) === p ? 1 : -1;
  along(ring, 2, (x, z, nx, nz) => { for (const d of IN) spots.push([x - nx * inward * d, z - nz * inward * d, p.pool ? 'pool' : 'pond']); });
}
// on a metre's grid over every bridge and trestle, and Stuckey's Bridge
const grid = (cx, cz, r, what) => { for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) spots.push([cx + x, cz + z, what]); };
for (const c of map.crossings.filter((c) => c.with === 'river')) grid(c.x, c.z, 40, c.road === map.opening.road ? 'Stuckey\'s' : 'bridge');
for (const t of map.trestles) grid(t.x, t.z, 50, 'trestle');
console.log(`     ${spots.length} places, ${new Set(spots.map((s) => s[2])).size} kinds`);

// ---------------- the game's own, in town, where Stuckey's is a ruin by now
const { page, errors, close } = await serveAndOpen({ viewport: { width: 390, height: 844 } });
const g = (fn, arg) => page.evaluate(fn, arg);
await g(() => { const G = __game; G.pause(); G.jump('town'); G.S.flags.town = true; G.step(.1); window.G = G; });
const game = [];
for (let i = 0; i < spots.length; i += 20000) {
  game.push(...await g((list) => list.map(([x, z]) => { const f = G.floorAt(x, z), l = G.water.level(x, z); return [f, l, G.water.in(x, z) ? 1 : 0]; }), spots.slice(i, i + 20000)));
}

// ---------------- what differs
const ours = (x, z) => wet.water(x, z);
const kinds = {}, far = [], deep = [];
spots.forEach(([x, z, what], i) => {
  const [f, l, inPond] = game[i], theirs = f < l - .1, mine = ours(x, z), k = kinds[what] ??= { n: 0, wet: 0, differ: 0, edge: 0, both: 0, off: 0 };
  k.n++; if (theirs) k.wet++;
  if (theirs !== mine) {
    k.differ++;
    // at the edge if ours goes the game's way within half a metre
    if ([[.5, 0], [-.5, 0], [0, .5], [0, -.5]].some(([dx, dz]) => ours(x + dx, z + dz) === theirs)) k.edge++;
    else far.push({ what, x: Math.round(x), z: Math.round(z), game: theirs ? 'wet' : 'dry', floor: +(f - TOWN_Y).toFixed(2), ours: +wet.floorAt(x, z).toFixed(2), pond: inPond });
  } else if (theirs) {
    k.both++;
    const d = (l - f) - wet.depth(x, z);
    if (Math.abs(d) > .15) { k.off++; deep.push({ what, x: Math.round(x), z: Math.round(z), game: +(l - f).toFixed(2), ours: +wet.depth(x, z).toFixed(2) }); }
  }
});
for (const [what, k] of Object.entries(kinds)) console.log(`     ${what}: ${k.n} places, ${k.wet} wet in the game, ${k.differ} differ (${k.edge} at the edge), ${k.both} wet in both and ${k.off} of those deeper or shallower`);
for (const f of far) console.log(`     away from the edge at ${f.x}, ${f.z} (${f.what}): ${f.game} in the game, with its floor at ${f.floor} and ours at ${f.ours}`);
const n = spots.length, differ = Object.values(kinds).reduce((a, k) => a + k.differ, 0);
check('the town has the water where the game has it, all but at its edge, in all but 1 place in 10,000', far.length <= n / 1e4, { n: far.length, of: n });
check('and edge and all, in all but 1 place in 1,000', differ <= n / 1e3, { differ, of: n });
check('and where both have water it\'s as deep in both, in all but 1 place in 10,000', deep.length <= n / 1e4, { n: deep.length, some: deep.slice(0, 12) });
check('nothing went wrong in the page', errors.length === 0, errors);
await close();
if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall ok');
