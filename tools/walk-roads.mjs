// Walks US 80, Adams Street, Church St and Meehan-Savoy Rd end to end with the game's own movement code,
// and fails if the player leaves the road, sinks through it or gets stuck.
//
//   npm i && npm run walk
import { serveAndOpen } from './browser.mjs';

const { page, errors, close } = await serveAndOpen();
await page.evaluate(() => { __game.pause(); __game.jump('town'); __game.S.flags.town = true; });
let failed = 0;
const roads = await page.evaluate(() => __game.map.roads.map((r) => ({ id: r.id, name: r.name, length: r.length, width: r.width })));

// each road is as wide as the graph says, on either side, away from where US 80 narrows into the bridge
const widths = await page.evaluate(() => __game.map.roads.map((r) => {
  const m = __game.map; let bad = 0, n = 0;
  for (let s = 5; s < r.length - 5; s += 25) {
    const p = m.along(r.id, s); if (Math.abs(p.x) < 70) continue;
    // a junction or a bend widens what counts as on the road, so only look where nothing else is near
    for (const side of [-1, 1]) {
      const w = r.width / 2, ix = p.x + p.nx * side * (w - .1), iz = p.z + p.nz * side * (w - .1), ox = p.x + p.nx * side * (w + .4), oz = p.z + p.nz * side * (w + .4);
      m.roadGrid.nearest(ox, oz); const clear = m.roadGrid.d > w + .2 && m.roadGrid.seg.owner === r;
      n++; if (!__game.onRoad(ix, iz) || (clear && __game.onRoad(ox, oz))) bad++;
    }
  }
  return { name: r.name, width: r.width, surface: r.surface, n, bad };
}));
for (const w of widths) { const ok = w.bad === 0 && w.n > 0; console.log(`${ok ? 'ok  ' : 'FAIL'} ${w.name} is ${w.width} m of ${w.surface}, ${w.n} points checked${ok ? '' : `, ${w.bad} wrong`}`); if (!ok) failed++; }

for (const road of roads) {
  const t0 = Date.now();
  // both ways, because a road can be blocked in one direction only by the way collisions slide
  for (const dir of [1, -1]) {
    const report = await page.evaluate(({ id, length, dir }) => {
      const m = __game.map, r = m.roadById.get(id), g = __game;
      const at = (s) => m.along(id, s), start = dir > 0 ? 1 : length - 1, end = dir > 0 ? length - 1 : 1;
      const p0 = at(start); g.place(p0.x, p0.z); g.key('w', true);
      let worst = 0, low = Infinity, stuck = 0, last = start, s = start, ticks = 0;
      const half = (x, z) => { m.roadGrid.nearest(x, z); return m.roadGrid.d; };
      while ((dir > 0 ? s < end - 1 : s > end + 1) && ticks < 200000) {
        // steer at a point a little way ahead on the centreline, as a thumb would
        const q = at(s + dir * 6), P = g.player.pos, dx = q.x - P.x, dz = q.z - P.z;
        g.look(Math.atan2(-dx, -dz)); g.sim(1 / 10, 1 / 30); ticks += 3;
        s = m.sOn(id, P.x, P.z);
        const off = half(P.x, P.z);
        if (off > worst) worst = off;
        if (P.y < low && Math.abs(P.x) > 21) low = P.y;
        if (g.S.mode !== 'town') return { fail: `mode ${g.S.mode} at ${P.x},${P.z}` };
        if (Math.abs(s - last) < .1) { if (++stuck > 30) return { fail: `stuck at ${P.x.toFixed(1)},${P.z.toFixed(1)} s ${s.toFixed(0)}` }; } else stuck = 0;
        last = s;
      }
      g.key('w', false);
      return { worst, low, ticks, s };
    }, { id: road.id, length: road.length, dir });
    const halfWidth = road.width / 2;
    const ok = !report.fail && report.worst < halfWidth && report.low > 6.1;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${road.name} ${dir > 0 ? 'forward' : 'back'} ${road.length.toFixed(0)} m, furthest off the centre ${report.worst?.toFixed(2)} of ${halfWidth}, lowest ${report.low?.toFixed(2)} ${report.fail || ''}`);
    if (!ok) failed++;
  }
  console.log(`     (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
// from the end of the bridge into town: the road the whole way, no stops, to Adams Street
const entry = await page.evaluate(() => {
  const m = __game.map, g = __game, adams = m.nodes.find((n) => n.id === 'n2'); g.place(24, 0);
  const start = m.sOn('us_80', 24, 0), goal = m.sOn('us_80', adams.x, adams.z); let s = start, t = 0, off = 0; g.key('w', true);
  while (s < goal - 2 && t < 300) {
    const q = m.along('us_80', s + 6), P = g.player.pos; g.look(Math.atan2(-(q.x - P.x), -(q.z - P.z))); g.sim(.1, 1 / 30); t += .1;
    s = m.sOn('us_80', P.x, P.z); if (!g.onRoad(P.x, P.z)) off++;
  }
  g.key('w', false);
  return { t, off, s, goal, metres: goal - start };
});
{
  const ok = entry.off === 0 && entry.s >= entry.goal - 2.5;
  console.log(`${ok ? 'ok  ' : 'FAIL'} bridge to Adams Street on US 80: ${entry.metres.toFixed(0)} m in ${entry.t.toFixed(0)} s, ${entry.off} samples off the road`);
  if (!ok) failed++;
}
// every road has signs with its real name, close beside it
const signs = await page.evaluate(() => __game.map.roads.map((r) => {
  const m = __game.map, own = __game.signs.filter((s) => s.road === r.id), far = own.filter((s) => { m.roadGrid.nearest(s.x, s.z); return m.roadGrid.d > 8; });
  return { name: r.name, count: own.length, junctions: own.filter((s) => s.kind === 'junction').length, names: [...new Set(own.map((s) => s.name))], far: far.length };
}));
for (const s of signs) {
  const ok = s.count >= 2 && s.junctions >= 1 && s.names.length === 1 && s.names[0] === s.name && !s.far;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${s.name} has ${s.count} signs, ${s.junctions} at junctions, reading ${JSON.stringify(s.names)}`);
  if (!ok) failed++;
}
// an objective naming a street reads the graph's name and points at the street until you're on it
const obj = await page.evaluate(() => {
  const g = __game, m = g.map, c = m.roadById.get('church_st'); g.place(300, 0); g.look(0, .2); g.objective('Meet David on {street}', 'church_st'); const a = g.step(.2);
  const start = { text: a.obj, on: g.pointer.on, dist: g.pointer.dist, deg: g.pointer.deg, arrow: document.getElementById('objArrow').style.transform };
  // walk the way the arrow says, however the camera's turned
  let t = 0; g.key('w', true);
  while (g.pointer.on && t < 240) { const yaw = g.cam.yaw + (-g.pointer.deg * Math.PI / 180); g.look(yaw); g.sim(.25, 1 / 30); t += .25; g.step(1 / 12, 1 / 60); }
  g.key('w', false);
  const P = g.player.pos, end = { on: g.pointer.on, onChurch: (m.roadGrid.nearest(P.x, P.z), m.roadGrid.seg && m.roadGrid.seg.owner.id), t };
  g.place(300, 0); return { start, end };
});
{
  const ok = obj.start.text === 'Meet David on Church St' && obj.start.on && obj.start.dist > 50 && /rotate/.test(obj.start.arrow) && !obj.end.on && obj.end.onChurch === 'church_st';
  console.log(`${ok ? 'ok  ' : 'FAIL'} "${obj.start.text}" points ${obj.start.dist.toFixed(0)} m to the street and following it arrives in ${obj.end.t.toFixed(0)} s`);
  if (!ok) { console.log(JSON.stringify(obj)); failed++; }
}
if (errors.length) { console.log('console errors', errors.slice(0, 5)); failed++; }
await close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
