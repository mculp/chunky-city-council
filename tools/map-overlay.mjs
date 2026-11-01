// The proof that the game map lines up with real Chunky: a top-down capture with TIGER's centerlines drawn
// over it, and a report of how far each intersection and line is from TIGER's. data/roads.md says what it
// checks and why. Everything goes to data/raw/, which is gitignored, because rendered images don't go in the
// repo. Exits non-zero if anything's outside the tolerance.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serveAndOpen } from './browser.mjs';

const TOLERANCE_M = 1;
const ROOT = fileURLToPath(new URL('..', import.meta.url)), OUT = `${ROOT}data/raw/`;

const py = spawnSync(`${ROOT}.venv/bin/python`, [`${ROOT}tools/tiger_lines.py`], { encoding: 'utf8', maxBuffer: 1 << 29 });
if (py.status !== 0) {
  console.error(py.error ? `${py.error.message}\n` : py.stderr);
  console.error('This reads the raw TIGER zips. See "Regenerating" in data/roads.md for the venv and tools/fetch_tiger.py.');
  process.exit(1);
}
const tiger = JSON.parse(py.stdout);

// Runs in the page. Measures the game against TIGER. Nothing here draws.
function measure({ tiger, tolerance }) {
  const g = __game, M = g.map, [tcx, tcz] = M.fromTrue(0, 0);
  const toWorld = ([lon, lat]) => M.fromLonLat(lon, lat);
  const roadName = (id) => M.roadById.get(id).name;
  // Right at Stuckey's the opening scene bends its road and the river, on purpose. data/roads.md says how.
  const { road: OPENING, joinWest, joinEast } = M.opening;
  const bentRoad = ([x, z]) => x > joinWest[0] && x < joinEast[0] && z > joinEast[1] && z < joinWest[1];
  const bentRiver = ([x, z]) => Math.abs(z) < 200 && Math.abs(x) < 300;

  const nodes = M.nodes.map((n) => {
    const roads = n.roads, candidates = roads.length > 1
      ? tiger.intersections.filter((i) => roads.every((r) => i.roads.includes(r))).map((i) => [i.lon, i.lat])
      : tiger.roads[roads[0]].flat();
    let best = null;
    for (const c of candidates) { const [x, z] = toWorld(c), off = Math.hypot(x - n.x, z - n.z); if (!best || off < best.off) best = { c, off }; }
    if (!best) return { id: n.id, kind: n.kind, what: roads.map(roadName).join(' × '), missing: true };
    return { id: n.id, kind: n.kind, what: roads.map(roadName).join(' × '), lon: best.c[0], lat: best.c[1], world: [n.x, n.z], fromCenter: [n.x - tcx, n.z - tcz], tigerFromCenter: M.trueOf(...best.c), off: best.off };
  });

  // the railroad and river are only kept this far past the roads
  const inArea = ([x, z]) => x >= tiger.area.xMinM && x <= tiger.area.xMaxM && z >= tiger.area.zMinM && z <= tiger.area.zMaxM;
  const lineRow = (name, lines, grid, opts = {}) => {
    const row = { name, map: 0, mapMax: 0, off: 0, skipped: 0 };
    for (const line of lines) for (const p of line) {
      if (opts.inside && !opts.inside(M.trueOf(...p))) continue;
      const w = toWorld(p);
      if (opts.skip && opts.skip(w)) { row.skipped++; continue; }
      const d = grid.nearest(...w);
      if (d === Infinity) row.off++; else { row.map++; row.mapMax = Math.max(row.mapMax, d); }
    }
    return row;
  };
  // A road's raw features can run past where the map clips it, so it's measured inside its own extent
  const extent = (id) => {
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [wx, wz] of M.roadById.get(id).pts) { const x = wx - tcx, z = wz - tcz; box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], z); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], z); }
    return ([x, z]) => x >= box[0] - 1 && x <= box[2] + 1 && z >= box[1] - 1 && z <= box[3] + 1;
  };
  const lines = [
    ...M.roads.map((r) => lineRow(r.name, tiger.roads[r.id], M.roadGrid, { inside: extent(r.id), skip: r.id === OPENING ? bentRoad : null })),
    lineRow('Railroad', tiger.railroad, M.railGrid, { inside: inArea }),
    lineRow('River', tiger.river, M.riverGrid, { inside: inArea, skip: bentRiver }),
  ];

  // what standing there in the game gets you, not just where the data says the line is
  const sample = (lines, step, keep, test) => {
    let n = 0, hit = 0;
    for (const line of lines) for (let i = 1; i < line.length; i++) {
      const a = M.trueOf(...line[i - 1]), b = M.trueOf(...line[i]), k = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step);
      for (let j = 0; j < k; j++) {
        const t = [a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k], w = [t[0] + tcx, t[1] + tcz];
        if (!keep(t, w)) continue;
        n++; if (test(...w)) hit++;
      }
    }
    return { n, hit };
  };
  const surface = [
    ...M.roads.map((r) => { const inside = extent(r.id); return { what: `${r.name} is road`, ...sample(tiger.roads[r.id], 5, (t, w) => inside(t) && !(r.id === OPENING && bentRoad(w)), (x, z) => g.onRoad(x, z)) }; }),
    { what: 'River is water', ...sample(tiger.river, 5, (t, w) => inArea(t) && !bentRiver(w), (x, z) => g.groundH(x, z) < 0) },
  ];
  const failures = [
    ...nodes.filter((n) => n.missing).map((n) => `${n.id} (${n.what}): TIGER has no matching point`),
    ...nodes.filter((n) => !n.missing && n.off > tolerance).map((n) => `${n.id} (${n.what}) is ${n.off.toFixed(3)} m from TIGER`),
    ...lines.filter((l) => l.mapMax > tolerance).map((l) => `${l.name} is ${l.mapMax.toFixed(3)} m from TIGER`),
    ...surface.filter((s) => s.hit < s.n).map((s) => `${s.what}: ${s.hit} of ${s.n} samples`),
  ];
  return { nodes, lines, surface, failures, center: [tcx, tcz] };
}

// Runs in the page. Draws one view: { box in world metres, scale in px per metre }
function drawView({ tiger, view, result, tolerance }) {
  const G = __game, M = G.map, { box, scale } = view, [tcx, tcz] = result.center;
  const cv = G.topDown({ ...box, scale, everywhere: view.trueScale }), g = cv.getContext('2d'), W = cv.width, H = cv.height, font = Math.round(Math.max(20, W / 170));
  const px = (x, z) => [(x - box.x0) * scale, (z - box.z0) * scale];
  const label = (text, x, y, color = '#fff', size = font, align = 'left') => { g.font = `600 ${size}px "IBM Plex Mono", monospace`; g.textAlign = align; g.lineJoin = 'round'; g.lineWidth = size / 4; g.strokeStyle = 'rgba(0,0,0,.9)'; g.strokeText(text, x, y); g.fillStyle = color; g.fillText(text, x, y); };

  const stroke = (lines, color, width, dash = []) => {
    g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash); g.lineJoin = 'round'; g.lineCap = 'round';
    for (const line of lines) {
      g.beginPath();
      line.forEach((p, i) => { const [x, z] = M.trueOf(...p), [u, v] = px(x + tcx, z + tcz); if (i) g.lineTo(u, v); else g.moveTo(u, v); });
      g.stroke();
    }
    g.setLineDash([]);
  };
  const lw = view.trueScale ? 2 : 1.25;
  stroke(tiger.river, '#4fe3ff', lw); stroke(tiger.railroad, '#ffffff', lw, [lw * 6, lw * 4]);
  for (const r of M.roads) stroke(tiger.roads[r.id], '#ffe14d', lw);

  for (const r of M.roads) for (const f of view.labels[r.id] || [.5]) { const p = M.along(r.id, r.length * f), [u, v] = px(p.x, p.z); if (u > 0 && u < W && v > 0 && v < H) label(r.name, u + font * .7, v - font * .6, '#ffe14d', font * 1.15); }
  for (const n of result.nodes) {
    if (n.missing) continue;
    const [u, v] = px(...n.world); if (u < 0 || u > W || v < 0 || v > H) continue;
    g.strokeStyle = '#ff5a7a'; g.lineWidth = lw * 1.5; g.beginPath(); g.arc(u, v, font * .55, 0, 7); g.stroke();
    label(`${n.id} ${n.off.toFixed(3)} m`, u + font * .8, v + font * 1.3, '#ff9fb2', font * .8);
  }
  const [cu, cv2] = px(tcx, tcz); g.strokeStyle = '#fff'; g.lineWidth = lw; g.beginPath(); g.moveTo(cu - font, cv2); g.lineTo(cu + font, cv2); g.moveTo(cu, cv2 - font); g.lineTo(cu, cv2 + font); g.stroke();
  label('town center', cu + font * .7, cv2 - font * .5, '#fff', font * .8);

  // legend, north arrow and scale bar
  const rows = [[view.title, '#fff'], ['Game ground, roads and tracks, top-down. TIGER/Line 2025 drawn over it.', '#ddd'], [view.frame, '#ddd'], ['TIGER roads, which run on past where the map stops', '#ffe14d'], ['TIGER railroad (dashed)', '#fff'], ['TIGER river', '#4fe3ff'], [`Graph nodes, with distance to TIGER (tolerance ${tolerance} m)`, '#ff9fb2']];
  g.font = `600 ${font}px "IBM Plex Mono", monospace`;
  const panelW = Math.max(...rows.map(([t]) => g.measureText(t).width)) + font * 2, panelH = rows.length * font * 1.4 + font * 4.6;
  const left = view.legendAt[0] * W, top = view.legendAt[1] * H;
  g.fillStyle = 'rgba(10,8,14,.86)'; g.fillRect(left, top, panelW, panelH);
  rows.forEach(([t, c], i) => label(t, left + font, top + font * 1.6 + i * font * 1.4, c));
  const barM = view.trueScale ? 500 : 2000, barPx = barM * scale, bx = left + font, by = top + panelH - font * 1.4;
  g.fillStyle = '#fff'; g.fillRect(bx, by, barPx, font * .3); label(`${barM >= 1000 ? barM / 1000 + ' km' : barM + ' m'}, north up`, bx, by - font * .4, '#fff', font * .85);
  const ax = left + panelW - font * 1.6, ay = by - font * .2; g.fillStyle = '#fff'; g.beginPath(); g.moveTo(ax, ay - font * 2.1); g.lineTo(ax - font * .55, ay); g.lineTo(ax + font * .55, ay); g.closePath(); g.fill(); label('N', ax - font * .36, ay - font * 2.4, '#fff', font);
  return cv.toDataURL('image/png');
}

const { page, errors, close } = await serveAndOpen({ viewport: { width: 800, height: 600 } });
await page.evaluate(() => { __game.pause(); __game.jump('town'); __game.step(.1); });
const result = await page.evaluate(measure, { tiger, tolerance: TOLERANCE_M });
const [tcx, tcz] = result.center;
const bounds = await page.evaluate(() => { const M = __game.map, pts = [...M.roads.flatMap((r) => r.pts)]; return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))]; });
const views = [
  {
    file: 'map-overlay-town.png', trueScale: true, scale: 1.5, legendAt: [.01, .01], box: { x0: tcx - 1150, x1: tcx + 1300, z0: tcz - 1750, z1: tcz + 350 },
    title: 'Chunky, Mississippi: town at true scale', frame: 'Aligned on town center 32.32583, -88.92806, with the graph\'s lat/long conversion.', labels: { us_80: [.17, .3], adams_st: [.4], church_st: [.35] },
  },
  {
    file: 'map-overlay-whole.png', trueScale: false, scale: .25, legendAt: [.01, .62], box: { x0: bounds[0] - 400, x1: bounds[2] + 400, z0: bounds[1] - 400, z1: bounds[3] + 400 },
    title: 'The whole game map', frame: 'The true map moved over. Only the road and river right at Stuckey\'s Bridge are bent, for the opening.', labels: { us_80: [.55], adams_st: [.6], church_st: [.2], meehan_savoy_rd: [.5], stuckey_bridge_rd: [.5] },
  },
];
for (const view of views) {
  const url = await page.evaluate(drawView, { tiger, view, result, tolerance: TOLERANCE_M });
  writeFileSync(OUT + view.file, Buffer.from(url.split(',')[1], 'base64'));
  console.log(`wrote data/raw/${view.file}`);
}
await close();

const f = (v, n = 1) => v.toFixed(n), xz = ([x, z]) => `${f(x)}, ${f(z)}`;
const report = [
  '# Game map against TIGER/Line 2025', '',
  `Tolerance: ${TOLERANCE_M} m. Town center is world ${xz(result.center)}.`,
  '',
  '## Intersections and road ends', '',
  'From TIGER through the graph\'s conversion and the world frame, against where the game has it.', '',
  '| Node | Kind | Roads | TIGER lon, lat | Game, from town center | TIGER, from town center | Off (m) |',
  '|---|---|---|---|---|---|---|',
  ...result.nodes.map((n) => (n.missing ? `| ${n.id} | ${n.kind} | ${n.what} | none | | | |` : `| ${n.id} | ${n.kind} | ${n.what} | ${n.lon}, ${n.lat} | ${xz(n.fromCenter)} | ${xz(n.tigerFromCenter)} | ${f(n.off, 3)} |`)), '',
  '## Lines', '',
  'Each TIGER vertex against the game\'s line. "Past the map" is TIGER running on beyond where the map stops. "Bent at Stuckey\'s" is what the opening scene moves on purpose.', '',
  '| Line | Vertices on the map | Furthest (m) | Past the map | Bent at Stuckey\'s |',
  '|---|---|---|---|---|',
  ...result.lines.map((l) => `| ${l.name} | ${l.map} | ${f(l.mapMax, 3)} | ${l.off} | ${l.skipped} |`), '',
  '## In the game', '',
  'TIGER sampled every 5 m, all the way out, and asked of the running game.', '',
  '| Check | Samples | Passed |', '|---|---|---|',
  ...result.surface.map((s) => `| ${s.what} | ${s.n} | ${s.hit} |`), '',
  '## Result', '',
  ...(result.failures.length ? result.failures.map((x) => `- FAIL: ${x}`) : [`Everything is within ${TOLERANCE_M} m.`]), '',
];
writeFileSync(`${OUT}map-overlay-report.md`, report.join('\n'));
console.log(report.join('\n'));
if (errors.length) console.log('console errors', errors.slice(0, 5));
process.exit(result.failures.length || errors.length ? 1 : 0);
