// What stops anyone, and the floors raised off the ground, from the game's own to data/solids.json, for the town everyone shares
// (CHUNKY-153), which loads it with src/solids.js. On its own it checks that what's there is still what the game has, then that
// src/solids.js answers as the game does all round everything in it: where it stops anyone and where it doesn't, with a building's wall
// and post and two props knocked down and healed in both, where the floors are raised and the bridges' rails are, and, where the ground's
// level, whether it stops someone standing there and hides their head. A point within 2 mm of an edge is the file's millimetres to say.
// data/solids.md has what's in it.
//
//   npm i && npm run solids            checks it
//   npm run solids -- --write          writes it again, after anything that stops anyone has changed
import { readFile, writeFile } from 'node:fs/promises';
import { serveAndOpen } from './browser.mjs';

const FILE = new URL('../data/solids.json', import.meta.url), write = process.argv.includes('--write');
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };

// one thing to a line, so that a change to one of them is a change to one line
const line = JSON.stringify, list = (a) => (a.length ? `[\n${a.map(line).join(',\n')}]` : '[]');
const obj = (o) => { const e = Object.entries(o); return e.length ? `{\n${e.map(([k, v]) => `${line(k)}:${line(v)}`).join(',\n')}}` : '{}'; };
const text = (d) => `{"fixed":{"boxes":${list(d.fixed.boxes)},\n"walls":${list(d.fixed.walls)}},\n"props":${obj(d.props)},\n"buildings":${obj(d.buildings)},\n"cast":${obj(d.cast)},\n"bar":${line(d.bar)},\n"floors":{"rects":${list(d.floors.rects)},\n"trestles":${list(d.floors.trestles)},\n"bridges":${list(d.floors.bridges)}}}\n`;

const { page, errors, close } = await serveAndOpen();
const now = await page.evaluate(() => __game.solids.now()), { cells, ...data } = now;
const props = Object.values(data.props), buildings = Object.values(data.buildings);
const boxes = data.fixed.boxes.length + props.reduce((n, p) => n + p.boxes.length, 0) + Object.keys(data.cast).length;
const walls = data.fixed.walls.length + props.reduce((n, p) => n + p.walls.length, 0) + buildings.reduce((n, b) => n + b.walls.length, 0) + 1;
check(`it has everything in the game that stops anyone: ${boxes} boxes and ${walls} walls, the bar across the gas station's door with them`, boxes === cells.boxes && walls === cells.walls, { boxes, walls, cells });
check('every wall and post of every building is one of its parts, as src/damage.js counts them', buildings.every((b) => b.walls.every(([part]) => part >= 0 && part < b.n)), buildings.flatMap((b) => b.walls.filter(([part]) => part < 0 || part >= b.n)).slice(0, 5));

const want = text(data);
if (write) { await writeFile(FILE, want); console.log(`wrote data/solids.json, ${(want.length / 1e6).toFixed(2)} MB`); }
else {
  const had = await readFile(FILE, 'utf8').catch(() => '');
  let what = null;
  if (had !== want) {
    // what's changed, so it's clear whether to write it again
    const was = (() => { try { return JSON.parse(had); } catch { return null; } })();
    if (!was) what = 'there isn\'t a data/solids.json, or it isn\'t JSON';
    else {
      const changed = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => line(a[k]) !== line(b[k]));
      what = { props: changed(was.props, data.props).slice(0, 5), buildings: changed(was.buildings, data.buildings).slice(0, 5), fixed: changed(was.fixed, data.fixed), cast: changed(was.cast, data.cast), bar: line(was.bar) !== line(data.bar), floors: changed(was.floors, data.floors), then: 'npm run solids -- --write' };
    }
  }
  check(`data/solids.json is what the game has now, ${(want.length / 1e6).toFixed(2)} MB`, had === want, what);
}

const r = await page.evaluate(async (d) => {
  const G = __game, { createSolids } = await import('./src/solids.js'), { encodeParts, keyOf, propKeys } = await import('./src/wrecks.js');
  const S = createSolids(d), DEEP = -1e6, EDGE = .002, out = {};
  const off = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9; let t = ((x - ax) * dx + (z - az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(x - ax - dx * t, z - az - dz * t); };
  const props = Object.values(d.props), houses = Object.values(d.buildings);
  const walls = [...d.fixed.walls, ...props.flatMap((p) => p.walls), ...houses.flatMap((b) => b.walls.map((w) => w.slice(1)))], boxes = [...d.fixed.boxes, ...props.flatMap((p) => p.boxes), ...Object.values(d.cast)];
  // across a wall at its ends and middle, on it and either side just in and just out of its reach, and off its ends; round a box's sides and corners
  const aroundWall = ([ax, az, bx, bz, , r], pts, reach = [0, r + .25, -(r + .25), r + .35, -(r + .35)]) => {
    const l = Math.hypot(bx - ax, bz - az) || 1e-9, ex = (bx - ax) / l, ez = (bz - az) / l;
    for (const t of [0, .5, 1]) for (const o of reach) pts.push([ax + (bx - ax) * t - ez * o, az + (bz - az) * t + ex * o]);
    for (const o of reach.filter((o) => o > 0)) pts.push([ax - ex * o, az - ez * o], [bx + ex * o, bz + ez * o]);
    return pts;
  };
  const aroundBox = ([x0, x1, z0, z1], pts, at = [-.35, -.25, 0, .25, .35]) => {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, xs = at.map((o) => (o < 0 ? x0 + o : o > 0 ? x1 + o : cx)), zs = at.map((o) => (o < 0 ? z0 + o : o > 0 ? z1 + o : cz));
    for (const x of xs) for (const z of zs) pts.push([x, z]);
    return pts;
  };
  // within 2 mm of where something starts stopping anyone, across or, given a height, up
  const nearEdge = (x, z, y = null) => boxes.some(([x0, x1, z0, z1, top]) => x > x0 - .3 - EDGE && x < x1 + .3 + EDGE && z > z0 - .3 - EDGE && z < z1 + .3 + EDGE
      && (Math.min(Math.abs(x - x0 + .3), Math.abs(x - x1 - .3), Math.abs(z - z0 + .3), Math.abs(z - z1 - .3)) < EDGE || (y !== null && Math.abs(y - top + .25) < .03)))
    || walls.some(([ax, az, bx, bz, top, r]) => { const o = off(x, z, ax, az, bx, bz); return o < r + .3 + EDGE && (Math.abs(o - r - .3) < EDGE || (y !== null && Math.abs(y - top + .25) < .03)); });
  const compare = (pts, game, here, edge) => {
    const res = { n: 0, edge: 0, bad: 0, first: [] };
    for (const [x, z, i] of pts) {
      res.n++;
      const a = game(x, z, i), b = here(x, z, i);
      if (a === b) continue;
      if (edge(x, z)) { res.edge++; continue; }
      res.bad++; if (res.first.length < 5) res.first.push({ x: +x.toFixed(3), z: +z.toFixed(3), game: a, here: b });
    }
    return res;
  };
  const stopsAt = (pts) => compare(pts, (x, z) => G.solids.blocks(x, z, DEEP), (x, z) => S.stops(x, z, DEEP), (x, z) => nearEdge(x, z));
  const all = [];
  for (const w of walls) aroundWall(w, all);
  for (const b of boxes) aroundBox(b, all);
  out.all = stopsAt(all);

  // the floors: where the game has one raised, here's raised too
  const floorPts = [], fe = [];
  for (const { rect: [cx, cz, ux, uz, hl, hw] } of d.floors.rects) {
    for (const u of [-hl - .05, -hl + .05, 0, hl - .05, hl + .05]) for (const v of [-hw - .05, -hw + .05, 0, hw - .05, hw + .05]) floorPts.push([cx + ux * u - uz * v, cz + uz * u + ux * v]);
    fe.push((x, z) => { const dx = x - cx, dz = z - cz, u = dx * ux + dz * uz, v = dz * ux - dx * uz; return (Math.abs(Math.abs(u) - hl) < EDGE && Math.abs(v) < hw + EDGE) || (Math.abs(Math.abs(v) - hw) < EDGE && Math.abs(u) < hl + EDGE); });
  }
  for (const t of d.floors.trestles) {
    for (const g of t.rail) for (const k of [0, .25, .5, .75, 1]) {
      const [ax, az, bx, bz] = g, l = Math.hypot(bx - ax, bz - az) || 1e-9, x = ax + (bx - ax) * k, z = az + (bz - az) * k;
      for (const o of [0, t.half - .05, t.half + .05, -(t.half - .05), -(t.half + .05)]) floorPts.push([x - (bz - az) / l * o, z + (bx - ax) / l * o]);
    }
    const [rx, rz, rr] = t.refuge;
    for (let a = 0; a < 8; a++) for (const o of [0, rr - .05, rr + .05]) floorPts.push([rx + Math.cos(a * .785) * o, rz + Math.sin(a * .785) * o]);
    fe.push((x, z) => Math.abs(Math.hypot(x - t.at[0], z - t.at[1]) - t.at[2]) < EDGE || Math.abs(Math.hypot(x - rx, z - rz) - rr) < EDGE || t.rail.some((g) => Math.abs(off(x, z, ...g) - t.half) < EDGE));
  }
  const grid = (b) => { const [cx, cz, r] = b.at, pts = []; for (let x = cx - r; x <= cx + r; x += .5) for (let z = cz - r; z <= cz + r; z += .5) pts.push([x, z]); return pts; };
  for (const b of d.floors.bridges) {
    floorPts.push(...grid(b));
    fe.push((x, z) => Math.abs(Math.hypot(x - b.at[0], z - b.at[1]) - b.at[2]) < EDGE || b.roads.some(([ax, az, bx, bz, half]) => Math.abs(off(x, z, ax, az, bx, bz) - half) < EDGE));
  }
  const floorEdge = (x, z) => fe.some((f) => f(x, z));
  out.floors = compare(floorPts, (x, z) => !!G.solids.raised(x, z), (x, z) => S.raised(x, z) !== null, floorEdge);

  // the bridges' rails, from on the deck, which is how high the road is where it crosses
  out.rails = { n: 0, edge: 0, bad: 0, first: [] };
  for (const b of d.floors.bridges) {
    const deck = G.floorAt(b.at[0], b.at[1]);
    const res = compare(grid(b), (x, z) => G.solids.rails(x, z, deck), (x, z) => S.rails(x, z, b.deck), (x, z) => Math.abs(Math.hypot(x - b.at[0], z - b.at[1]) - b.at[2]) < EDGE
      || b.roads.some(([ax, az, bx, bz]) => { const o = off(x, z, ax, az, bx, bz); return Math.abs(o - b.half) < EDGE || Math.abs(o - b.half - 1) < EDGE; }));
    for (const k of ['n', 'edge', 'bad']) out.rails[k] += res[k];
    out.rails.first.push(...res.first);
  }

  // Where the ground's level, someone standing beside anything, and their head, is stopped here and hidden here as they are in the game,
  // with the game's floor under them in the game and the town's here.
  const level = (x, z) => { const f = G.floorAt(x, z), t = S.floorAt(x, z); return [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => Math.abs(G.floorAt(x + a, z + b) - f) < .02 && S.floorAt(x + a, z + b) === t); };
  // (every third wall, since each point asks the game for its floor five times)
  const standing = [];
  walls.forEach((w, i) => { if (i % 3 === 0) aroundWall(w, standing, [0, w[5] + .25, -(w[5] + .25)]); });
  for (const b of boxes) aroundBox(b, standing, [-.25, 0, .25]);
  const flat = standing.filter(([x, z]) => level(x, z));
  out.flat = { of: standing.length };
  for (const [name, h] of [['feet', 0], ['head', 1.5]]) {
    out.flat[name] = compare(flat, (x, z) => { const y = G.floorAt(x, z) + h; return G.solids.blocks(x, z, y) || G.solids.rails(x, z, y); }, (x, z) => S.stops(x, z, S.floorAt(x, z) + h), (x, z) => nearEdge(x, z, S.floorAt(x, z) + h));
  }

  // and what some of it stands at, in the town's terms
  out.heights = {
    building: [Math.min(...houses.flatMap((b) => b.walls.map((w) => w[5]))), Math.max(...houses.flatMap((b) => b.walls.map((w) => w[5])))],
    cast: Object.values(d.cast).map((b) => b[4]), bar: d.bar[4],
    dock: d.floors.rects[0].top, decks: d.floors.rects.slice(2).map((f) => f.top), trestles: d.floors.trestles.map((t) => t.top), bridges: d.floors.bridges.map((b) => b.deck),
  };

  // Last, since on its own the game heals a building but puts nothing else back, which it only does in a town everyone shares: a building
  // near the middle of town with a post as well as walls loses a wall and a post, as another phone would say it, and two props go over, a
  // fence and something with a box to it, and so does the dock. Broken, they're the same here as in the game. Healed here, everything's as
  // the game had it before anything broke, and the building's back in the game as well.
  const [ox, oz] = G.map.fromTrue(0, 0), isPost = (w) => Math.hypot(w[3] - w[1], w[4] - w[2]) < .01, mid = (w) => [(w[1] + w[3]) / 2, (w[2] + w[4]) / 2];
  const s = G.structures.filter((s) => { const b = d.buildings[s.id]; return b && b.walls.some(isPost) && b.walls.some((w) => !isPost(w)); }).sort((a, b) => Math.hypot(a.wx - ox, a.wz - oz) - Math.hypot(b.wx - ox, b.wz - oz))[0];
  const B = d.buildings[s.id], panel = B.walls.find((w) => !isPost(w)), post = B.walls.find(isPost), gone = [panel[0], post[0]], house = keyOf.building(s.id);
  const keys = propKeys(G.wreck.props), byKey = new Map([...keys].map(([p, k]) => [k, p])), dockKey = d.floors.rects[0].k, dockAt = d.floors.rects[0].rect;
  const fenceKey = Object.keys(d.props).find((k) => k.startsWith('pfence:') && d.props[k].walls.length), boxKey = Object.keys(d.props).find((k) => !k.startsWith('pfence:') && !k.startsWith('pdock:') && d.props[k].boxes.length);
  const atHouse = B.walls.flatMap((w) => aroundWall(w.slice(1), [])), near = [...atHouse, ...[fenceKey, boxKey].flatMap((k) => [...d.props[k].walls.flatMap((w) => aroundWall(w, [])), ...d.props[k].boxes.flatMap((b) => aroundBox(b, []))])];
  const opens = (k) => { const w = d.props[k].walls[0], b = d.props[k].boxes[0], [x, z] = w ? [(w[0] + w[2]) / 2, (w[1] + w[3]) / 2] : [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2]; return [!G.solids.blocks(x, z, DEEP), !S.stops(x, z, DEEP)]; };
  const wallOpens = () => { const [x, z] = mid(panel); return [!G.solids.blocks(x, z, DEEP), !S.stops(x, z, DEEP)]; };
  const dockUp = () => [!!G.solids.raised(dockAt[0], dockAt[1]), S.raised(dockAt[0], dockAt[1]) !== null];
  const was = near.map(([x, z]) => G.solids.blocks(x, z, DEEP)), floorsWere = floorPts.map(([x, z]) => !!G.solids.raised(x, z)), houseWas = was.slice(0, atHouse.length);
  out.picked = { building: s.id, parts: gone, props: [fenceKey, boxKey], dock: dockKey };
  out.before = [wallOpens(), opens(fenceKey), opens(boxKey), dockUp()];
  G.wreck.damage.take(s, gone.map((part) => ({ part, gone: true, cracked: false, burning: false, dirx: 1, dirz: 0, hp: 0, shade: 1 })), { live: false });
  S.take({ k: house, n: B.n, p: encodeParts(gone.map((part) => ({ part, gone: true, cracked: false, burning: false, dir: 0, hp: 0, shade: 255 }))) });
  for (const k of [fenceKey, boxKey, dockKey]) { G.wreck.breakProp(byKey.get(k), 1, 0); S.take({ k, x: 0, z: 0, d: 0 }); }
  out.broken = stopsAt(near); out.floorsBroken = compare(floorPts, (x, z) => !!G.solids.raised(x, z), (x, z) => S.raised(x, z) !== null, floorEdge);
  out.down = [wallOpens(), opens(fenceKey), opens(boxKey), dockUp()];
  // and one that says it's in a different number of parts is some other game's, and nothing comes of it
  S.take({ k: house, n: B.n + 1, p: encodeParts([{ part: (B.walls.find((w) => w !== panel && w !== post) ?? panel)[0], gone: true, cracked: false, burning: false, dir: 0, hp: 0, shade: 255 }]) });
  out.otherGame = stopsAt(near);
  G.wreck.mendHouse(s);
  for (const k of [house, fenceKey, boxKey, dockKey]) S.heal(k);
  out.healed = compare(near.map(([x, z], i) => [x, z, i]), (x, z, i) => was[i], (x, z) => S.stops(x, z, DEEP), (x, z) => nearEdge(x, z));
  out.floorsHealed = compare(floorPts.map(([x, z], i) => [x, z, i]), (x, z, i) => floorsWere[i], (x, z) => S.raised(x, z) !== null, floorEdge);
  out.houseBack = compare(atHouse.map(([x, z], i) => [x, z, i]), (x, z, i) => houseWas[i], (x, z) => G.solids.blocks(x, z, DEEP), () => false);
  out.up = [wallOpens(), [opens(fenceKey)[1]], [opens(boxKey)[1]], [dockUp()[1]]];
  return out;
}, data);

const said = (c) => `${c.n} points, ${c.edge} on an edge`, closed = (pairs) => pairs.flat().every((o) => !o);
check(`it stops anyone where the game does and nowhere else, all round everything: ${said(r.all)}`, r.all.bad === 0, r.all.first);
check(`the floors are raised where the game has them, the dock, the cabin's decks, the trestles and the road bridges: ${said(r.floors)}`, r.floors.bad === 0, r.floors.first);
check(`the road bridges' rails are where the game has them, from the deck: ${said(r.rails)}`, r.rails.bad === 0 && r.rails.n > 0, r.rails.first);
check(`where the ground's level, someone standing beside anything is stopped as they are in the game: ${said(r.flat.feet)} of ${r.flat.of}`, r.flat.feet.bad === 0 && r.flat.feet.n > r.flat.of / 2, r.flat.feet.first);
check(`and their head's hidden as it is in the game: ${said(r.flat.head)}`, r.flat.head.bad === 0, r.flat.head.first);
const H = r.heights, near = (a, b, by) => Math.abs(a - b) <= by;
check(`in the town's terms buildings stand ${H.building[0]} to ${H.building[1]} m, the cast ${H.cast.join(', ')} and the bar ${H.bar}`, H.building[0] > 1 && H.building[1] < 12 && H.cast.every((t) => near(t, 2, .06)) && near(H.bar, 2.6, .06), H);
check(`and the floors are steps anyone can take: the dock ${H.dock} m, the cabin's decks ${[...new Set(H.decks)].join(', ')}, the trestles ${[...new Set(H.trestles)].join(', ')} and the bridges ${[...new Set(H.bridges)].join(', ')}`, H.dock >= 0 && H.dock < .7 && H.decks.every((t) => near(t, .3, .01)) && H.trestles.every((t) => t >= 0 && t < .7) && H.bridges.every((t) => near(t, 0, .06)), H);
check(`a wall and a post of building ${r.picked.building}, two props, ${r.picked.props.join(' and ')}, and the dock, standing, in both`, closed(r.before.slice(0, 3)) && r.before[3].every((o) => o), r.before);
check(`knocked down as another phone would say it, they're the same here as in the game: ${said(r.broken)}, and the floors ${said(r.floorsBroken)}`, r.broken.bad === 0 && r.floorsBroken.bad === 0, { stops: r.broken.first, floors: r.floorsBroken.first });
check('and where they stood is open, and the dock\'s gone, in both', r.down.slice(0, 3).flat().every((o) => o) && r.down[3].every((o) => !o), r.down);
check('a building in some other game\'s number of parts changes nothing', r.otherGame.bad === 0, r.otherGame.first);
check(`healed, everything's as the game had it before anything broke: ${said(r.healed)}, and the floors ${said(r.floorsHealed)}`, r.healed.bad === 0 && r.floorsHealed.bad === 0 && closed(r.up.slice(0, 3)) && r.up[3][0], { up: r.up, stops: r.healed.first, floors: r.floorsHealed.first });
check(`and the building's back in the game as well: ${said(r.houseBack)}`, r.houseBack.bad === 0, r.houseBack.first);
check('no errors in the console', errors.length === 0, errors);
await close();
process.exit(failed ? 1 : 0);
