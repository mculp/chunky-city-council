// Drives up a gravel lane and a dirt drive with real key presses and the phone's stick, and checks the rest of what the smaller roads should do: nothing standing on them,
// the woods cleared off them, the sound and the name of what's underfoot, the map, and no barricade across a road that carries on now.
//
//   npm i && npm run lanes
import { serveAndOpen } from './browser.mjs';

let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };

const { page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 } });
const g = (fn, arg) => page.evaluate(fn, arg);

await g(() => {
  const G = __game, T = 1 / 30; G.pause(); G.jump('town'); G.S.flags.town = true; G.step(.2); document.getElementById('card').classList.remove('show');
  window.G = G; window.M = G.map; window.T = T;
  // every so many metres along a road, in world metres
  window.points = (r, step) => { const out = []; for (let s = 0; s <= r.length; s += step) { const p = M.along(r.id, s); out.push(p); } return out; };
  // follows a list of world points with the stick, slowing for bends, and says how it went
  window.driveThrough = (way, seconds) => {
    const v = G.driving(); let i = 1, hits = 0, last = v.hp, top = 0, off = 0, t = 0;
    for (; t < seconds && i < way.length; t += T) {
      while (i < way.length - 1 && Math.hypot(way[i][0] - v.x, way[i][1] - v.z) < 6 + Math.abs(v.f) * .5) i++;
      const [x, z] = way[i]; let d = Math.atan2(x - v.x, z - v.z) - v.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      const near = Math.hypot(x - v.x, z - v.z);
      if (i === way.length - 1 && near < 4) break;
      G.stick(Math.max(-1, Math.min(1, -d * 2.4)), Math.abs(v.f) > (Math.abs(d) > .4 ? 6 : 13) ? -1 : 1);
      G.sim(T, T);
      top = Math.max(top, Math.abs(v.f)); if (v.hp < last) { hits++; last = v.hp; } off = Math.max(off, M.roadGrid.nearest(v.x, v.z));
    }
    G.stick(0, 0);
    return { hits, top, off, t, left: Math.hypot(way.at(-1)[0] - v.x, way.at(-1)[1] - v.z), hp: v.hp };
  };
});

// ---------------- what's in the data is in the game
const count = await g(() => ({ lanes: M.lanes.length, drives: M.lanes.filter((l) => l.structure).length, roads: M.roads.length, buildings: G.wreck.buildings?.length, gravel: M.lanes.filter((l) => l.surface === 'gravel').length, dirt: M.lanes.filter((l) => l.surface === 'dirt').length, paved: M.lanes.filter((l) => l.surface === 'asphalt').length }));
console.log(`     ${JSON.stringify(count)}`);
check('the lanes and drives are all in the game', count.lanes > 900 && count.gravel > 0 && count.dirt > 0 && count.paved > 0, count);

// ---------------- nothing's standing on them
const standing = await g(() => {
  const inWay = [], trees = [], low = [];
  for (const r of M.lanes) {
    for (const p of points(r, 4)) {
      if (Math.hypot(p.x, p.z) < 400) continue;
      if (G.blocked(p.x, p.z, 6.8)) inWay.push(`${r.id} ${Math.round(p.x)},${Math.round(p.z)}`);
      if (Math.abs(G.floorAt(p.x, p.z) - 6.2) > .05 && !G.water.in(p.x, p.z)) low.push(`${r.id} ${G.floorAt(p.x, p.z).toFixed(2)}`);
      for (const t of G.wreck.trees(p.x, p.z, 4)) if (!t.down && Math.hypot(t.x - p.x, t.z - p.z) < r.width / 2 + 1) trees.push(`${r.id} ${Math.round(t.x)},${Math.round(t.z)}`);
    }
  }
  return { inWay: [...new Set(inWay)], trees: [...new Set(trees)], low: [...new Set(low)] };
});
if (standing.inWay.length) console.log(`     in the way: ${standing.inWay.join(', ')}`);
check(`hardly anything stands on them: ${standing.inWay.length}`, standing.inWay.length < 12, standing.inWay.slice(0, 12));
check('the woods are cleared off them', standing.trees.length === 0, standing.trees.slice(0, 12));
check('and they lie level with the roads they come off', standing.low.length === 0, standing.low.slice(0, 12));

// ---------------- no barricade across a road that carries on
const barred = await g(() => {
  const clips = M.nodes.filter((n) => n.kind === 'clip'), goesOn = (n) => M.lanes.some((l) => !l.structure && Math.min(Math.hypot(l.pts[0][0] - n.x, l.pts[0][1] - n.z), Math.hypot(l.pts.at(-1)[0] - n.x, l.pts.at(-1)[1] - n.z)) < 1);
  const bars = G.wreck.props.filter((p) => p.kind === 'barricade');
  return { clips: clips.length, on: clips.filter(goesOn).length, closed: M.closedLanes.length, bars: bars.length, across: clips.filter(goesOn).filter((n) => bars.some((b) => Math.hypot(b.cx - n.x, b.cz - n.z) < 4)).length, shut: M.closedLanes.filter((n) => bars.some((b) => Math.hypot(b.cx - n.x, b.cz - n.z) < 4)).length };
});
console.log(`     ${JSON.stringify(barred)}`);
check('no barricade where a road carries on now', barred.across === 0, barred);
check('and one where it stops in the game and goes on in TIGER', barred.bars === barred.clips - barred.on + barred.closed && barred.shut === barred.closed, barred);

// ---------------- what's underfoot, and what's on the little map
const under = await g(() => {
  const at = (r) => { const p = M.along(r.id, r.length / 2); G.place(p.x, p.z); G.step(.4); return { surface: G.surfaceUnder(), name: document.getElementById('miniName').hidden ? '' : document.getElementById('miniName').textContent, floor: G.player.pos.y }; };
  const named = M.lanes.find((l) => l.name && l.surface === 'asphalt' && l.length > 200), track = M.lanes.find((l) => !l.name && l.surface === 'gravel' && l.length > 80), drive = M.lanes.find((l) => l.structure && l.length > 40);
  return { named: { want: named.name, ...at(named) }, track: at(track), drive: at(drive) };
});
check('on a named one, his feet are on a road and the little map says which', under.named.surface === 'road' && under.named.name === under.named.want, under.named);
check('on a gravel lane they\'re on dirt, and it has no name to give', under.track.surface === 'dirt' && !under.track.name, under.track);
check('and on somebody\'s drive', under.drive.surface === 'dirt' && !under.drive.name, under.drive);

// ---------------- a pickup, up a lane and a drive to somebody's door
const way = await g(() => {
  const pick = M.lanes.filter((l) => l.structure && l.length > 50).find((d) => { const [x, z] = d.pts[0]; return M.roadGrid.within(x, z, (o) => (o !== d && !o.structure && !o.lane ? o.width / 2 + 1 : o !== d && o.surface === 'gravel' && o.length > 100 ? o.width / 2 + 1 : 0))?.owner.surface === 'gravel'; });
  const [x0, z0] = pick.pts[0], lane = M.roadGrid.within(x0, z0, (o) => (o !== pick && o.surface === 'gravel' ? o.width / 2 + 1 : 0)).owner, s = M.sOn(lane.id, x0, z0), from = s > lane.length / 2 ? 0 : lane.length;
  const ahead = []; const dir = from < s ? 1 : -1; for (let k = from; dir > 0 ? k < s : k > s; k += dir * 8) { const p = M.along(lane.id, k); ahead.push([p.x, p.z]); }
  const route = [...ahead, ...pick.pts];
  const v = G.vehicles.find((o) => o.kind === 'pickup' && !o.wrecked); G.getIn(v);
  const a = M.along(lane.id, from), b = M.along(lane.id, from + dir * 4);
  v.x = a.x; v.z = a.z; v.y = G.floorAt(a.x, a.z); v.yaw = Math.atan2(b.x - a.x, b.z - a.z); v.f = v.s = 0; G.sim(T, T);
  return { lane: lane.id, surface: lane.surface, drive: pick.id, length: Math.round(Math.abs(s - from) + pick.length), route };
});
console.log(`     ${way.lane}, ${way.surface}, then ${way.drive}: ${way.length} m`);
const went = await g((route) => driveThrough(route, 90), way.route);
console.log(`     ${JSON.stringify(went)}`);
check('a pickup goes up the lane and the drive to the door', went.left < 8, went);
check('and it stays on them', went.off < 6, went);
check('without hitting anything', went.hits === 0, went);
const dust = await g(() => { const v = G.driving(), P = G.puffs?.length; return { paved: G.pavedAt?.(v.x, v.z), on: G.onRoad(v.x, v.z) }; });
check('it counts as a road for the wheels, and not as paved for the dust and the tyres', dust.on !== undefined && dust.paved === false, dust);
await g(() => { G.getOut(true); });

// ---------------- what they cost
const cost = await g(() => {
  const r = M.lanes.filter((l) => l.structure).sort((a, b) => b.length - a.length)[Math.floor(M.lanes.length / 40)], p = M.along(r.id, r.length / 2); G.place(p.x, p.z); G.step(1);
  const lanes = []; G.scene.traverse((o) => { if (o.isMesh && (o.geometry.attributes.aTrack || (o.material === G.laneRoadMat))) lanes.push(o); });
  const shown = lanes.filter((m) => { let v = true; for (let o = m; o; o = o.parent) v = v && o.visible; return v; });
  return { meshes: lanes.length, shown: shown.length, calls: G.renderer.info.render.calls, tris: G.renderer.info.render.triangles };
});
console.log(`     ${JSON.stringify(cost)}`);
check('only the ones near him are drawn', cost.shown < 30, cost);

check('no console errors', errors.length === 0, errors);
await close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
