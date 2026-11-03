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
  const g = __game, M = g.map, [tcx, tcz] = M.fromTrue(0, 0), bands = M.compression;
  const toWorld = ([lon, lat]) => M.fromLonLat(lon, lat), aligned = ([lon, lat]) => { const [x, z] = M.trueOf(lon, lat); return [x + tcx, z + tcz]; };
  const roadName = (id) => M.roadById.get(id).name;
  // the stretch with no compression and no lean, where the world is the true map moved over
  const townEdges = { west: bands.filter((b) => b.trueTo <= 0).at(-1).trueTo, east: bands.filter((b) => b.trueFrom >= 0)[0].trueFrom };

  const nodes = M.nodes.map((n) => {
    const roads = n.roads, candidates = roads.length > 1
      ? tiger.intersections.filter((i) => roads.every((r) => i.roads.includes(r))).map((i) => [i.lon, i.lat])
      : tiger.roads[roads[0]].flat();
    let best = null;
    for (const c of candidates) { const [x, z] = toWorld(c), off = Math.hypot(x - n.x, z - n.z); if (!best || off < best.off) best = { c, off }; }
    if (!best) return { id: n.id, kind: n.kind, what: roads.map(roadName).join(' × '), missing: true };
    const [ax, az] = aligned(best.c), [tx] = M.trueOf(...best.c);
    const between = bands.filter((b) => (tx < 0 ? b.trueTo <= 0 && tx < b.trueTo : b.trueFrom >= 0 && tx > b.trueFrom));
    return {
      id: n.id, kind: n.kind, what: roads.map(roadName).join(' × '), lon: best.c[0], lat: best.c[1], world: [n.x, n.z], fromCenter: [n.x - tcx, n.z - tcz], tigerFromCenter: M.trueOf(...best.c),
      offMapped: best.off, offTrue: Math.hypot(ax - n.x, az - n.z), bands: between.map((b) => `${b.trueFrom}..${b.trueTo} ×${b.factor}`),
    };
  });

  const inTown = ([x]) => x > townEdges.west && x < townEdges.east;
  // the railroad and river are only kept this far past the roads
  const inArea = ([x, z]) => x >= tiger.area.xMinM && x <= tiger.area.xMaxM && z >= tiger.area.zMinM && z <= tiger.area.zMaxM;
  const lineRow = (name, lines, grid, opts = {}) => {
    const row = { name, town: 0, townMax: 0, map: 0, mapMax: 0, off: 0, skipped: 0 };
    for (const line of lines) for (const p of line) {
      const t = M.trueOf(...p);
      if (opts.inside && !opts.inside(t)) continue;
      if (inTown(t)) { const d = grid.nearest(...aligned(p)); row.town++; row.townMax = Math.max(row.townMax, d); }
      const w = toWorld(p);
      if (opts.skip && opts.skip(w)) { row.skipped++; continue; }
      const d = grid.nearest(...w);
      if (d === Infinity) row.off++; else { row.map++; row.mapMax = Math.max(row.mapMax, d); }
    }
    return row;
  };
  // A road's raw features can run past where the map clips it, so it's measured inside its own extent
  const extent = (id) => {
    const r = M.roadById.get(id), box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const n of r.nodes) { const node = M.nodes.find((x) => x.id === n), [x, z] = M.trueOf(node.lon, node.lat); box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], z); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], z); }
    return ([x, z]) => x >= box[0] - 1 && x <= box[2] + 1 && z >= box[1] - 1 && z <= box[3] + 1;
  };
  const lines = [
    ...M.roads.map((r) => lineRow(r.name, tiger.roads[r.id], M.roadGrid, { inside: extent(r.id) })),
    lineRow('Railroad', tiger.railroad, M.railGrid, { inside: inArea }),
    // the river is bent onto the opening scene's channel at the bridge, on purpose
    lineRow('River', tiger.river, M.riverGrid, { inside: inArea, skip: ([x, z]) => Math.abs(z) < 200 && Math.abs(x) < 300 }),
  ];

  // what standing there in the game gets you, not just where the data says the line is
  const sample = (lines, step, keep, test) => {
    let n = 0, hit = 0;
    for (const line of lines) for (let i = 1; i < line.length; i++) {
      const a = M.trueOf(...line[i - 1]), b = M.trueOf(...line[i]), k = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step);
      for (let j = 0; j < k; j++) {
        const t = [a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k];
        if (!keep(t)) continue;
        n++; if (test(t[0] + tcx, t[1] + tcz)) hit++;
      }
    }
    return { n, hit };
  };
  const surface = [
    ...M.roads.filter((r) => r.id !== 'meehan_savoy_rd').map((r) => { const inside = extent(r.id); return { what: `${r.name} is road`, ...sample(tiger.roads[r.id], 5, (t) => inTown(t) && inside(t), (x, z) => g.onRoad(x, z)) }; }),
    { what: 'River is water', ...sample(tiger.river, 5, (t) => inTown(t) && inArea(t), (x, z) => g.groundH(x, z) < 0) },
  ];
  const failures = [
    ...nodes.filter((n) => n.missing).map((n) => `${n.id} (${n.what}): TIGER has no matching point`),
    ...nodes.filter((n) => !n.missing && n.offMapped > tolerance).map((n) => `${n.id} (${n.what}) is ${n.offMapped.toFixed(3)} m from TIGER`),
    ...nodes.filter((n) => !n.missing && n.offTrue > tolerance && !n.bands.length).map((n) => `${n.id} (${n.what}) is ${n.offTrue.toFixed(1)} m out with no compressed stretch to explain it`),
    ...lines.filter((l) => l.townMax > tolerance).map((l) => `${l.name} is ${l.townMax.toFixed(3)} m from TIGER in town`),
    ...lines.filter((l) => l.mapMax > tolerance).map((l) => `${l.name} is ${l.mapMax.toFixed(3)} m from TIGER on the map`),
    ...surface.filter((s) => s.hit < s.n).map((s) => `${s.what}: ${s.hit} of ${s.n} samples`),
  ];
  return { nodes, lines, surface, failures, townEdges, center: [tcx, tcz] };
}

// Runs in the page. Draws one view: { box in world metres, scale in px per metre, and whether TIGER goes on true or through the map }
function drawView({ tiger, view, result, tolerance }) {
  const G = __game, M = G.map, { box, scale } = view, [tcx, tcz] = result.center;
  const cv = G.topDown({ ...box, scale, everywhere: view.trueScale }), g = cv.getContext('2d'), W = cv.width, H = cv.height, font = Math.round(Math.max(20, W / 170));
  const px = (x, z) => [(x - box.x0) * scale, (z - box.z0) * scale];
  const place = view.trueScale ? ([x, z]) => [x + tcx, z + tcz] : ([x, z]) => M.fromTrue(x, z);
  const label = (text, x, y, color = '#fff', size = font, align = 'left') => { g.font = `600 ${size}px "IBM Plex Mono", monospace`; g.textAlign = align; g.lineJoin = 'round'; g.lineWidth = size / 4; g.strokeStyle = 'rgba(0,0,0,.9)'; g.strokeText(text, x, y); g.fillStyle = color; g.fillText(text, x, y); };

  // what isn't to scale in this picture
  const shade = (x0, x1, text, row = 0) => {
    const a = (x0 - box.x0) * scale, b = (x1 - box.x0) * scale; if (b < 0 || a > W) return;
    g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(a, 0, b - a, H); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.strokeRect(a, -9, b - a, H + 18);
    label(text, a > W * .7 ? a - 10 : Math.max(a, 0) + 10, H - font * 1.2 * (row + 1), '#ddd', font * .8, a > W * .7 ? 'right' : 'left');
  };
  if (view.trueScale) { shade(-1e5, tcx + result.townEdges.west, 'compressed from here west: not to scale'); shade(tcx + result.townEdges.east, 1e5, 'compressed from here east: not to scale'); }
  else M.compression.forEach((b, i) => { const [a] = M.fromTrue(b.trueFrom, 0), [c] = M.fromTrue(b.trueTo, 0); shade(a, c, `x ${b.trueFrom}..${b.trueTo} at ×${b.factor}`, i); });

  const stroke = (lines, color, width, dash = []) => {
    g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash); g.lineJoin = 'round'; g.lineCap = 'round';
    for (const line of lines) {
      g.beginPath();
      for (let i = 1; i < line.length; i++) {
        const a = M.trueOf(...line[i - 1]), b = M.trueOf(...line[i]), k = view.trueScale ? 1 : Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 20);
        for (let j = i === 1 ? 0 : 1; j <= k; j++) { const [x, z] = place([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]), [u, v] = px(x, z); if (j === 0) g.moveTo(u, v); else g.lineTo(u, v); }
      }
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
    label(`${n.id} ${n.offMapped.toFixed(3)} m`, u + font * .8, v + font * 1.3, '#ff9fb2', font * .8);
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
    file: 'map-overlay-whole.png', trueScale: false, scale: .5, legendAt: [.58, .3], box: { x0: bounds[0] - 400, x1: bounds[2] + 400, z0: bounds[1] - 400, z1: bounds[3] + 400 },
    title: 'The whole game map', frame: 'TIGER through the map\'s conversion: bands compress x, and the world lays US 80 straight from the bridge.', labels: { us_80: [.55], adams_st: [.6], church_st: [.2], meehan_savoy_rd: [.5] },
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
  `The town stretch, with no compression or lean, is true x ${result.townEdges.west} to ${result.townEdges.east}.`, '',
  '## Intersections and road ends', '',
  '"Through the map" goes from TIGER through the graph\'s conversion, the compression bands and the world frame. "True scale" compares both as metres from town center, so it shows what compression moved.', '',
  '| Node | Kind | Roads | TIGER lon, lat | Game, from town center | TIGER, from town center | Off, through the map (m) | Off, true scale (m) | Compressed stretches on the way |',
  '|---|---|---|---|---|---|---|---|---|',
  ...result.nodes.map((n) => (n.missing ? `| ${n.id} | ${n.kind} | ${n.what} | none | | | | | |` : `| ${n.id} | ${n.kind} | ${n.what} | ${n.lon}, ${n.lat} | ${xz(n.fromCenter)} | ${xz(n.tigerFromCenter)} | ${f(n.offMapped, 3)} | ${f(n.offTrue, n.offTrue < 1 ? 3 : 1)} | ${n.bands.join(', ') || 'none'} |`)), '',
  '## Lines', '',
  'Each TIGER vertex against the game\'s line. Town is at true scale, aligned on town center. Map is through the conversion. "Past the map" is TIGER running on beyond where the map stops.', '',
  '| Line | Vertices in town | Furthest in town (m) | Vertices on the map | Furthest on the map (m) | Past the map | Left out at the bridge |',
  '|---|---|---|---|---|---|---|',
  ...result.lines.map((l) => `| ${l.name} | ${l.town} | ${f(l.townMax, 3)} | ${l.map} | ${f(l.mapMax, 3)} | ${l.off} | ${l.skipped} |`), '',
  '## In the game', '',
  'TIGER sampled every 5 m in town and asked of the running game.', '',
  '| Check | Samples | Passed |', '|---|---|---|',
  ...result.surface.map((s) => `| ${s.what} | ${s.n} | ${s.hit} |`), '',
  '## Result', '',
  ...(result.failures.length ? result.failures.map((x) => `- FAIL: ${x}`) : [`Everything is within ${TOLERANCE_M} m or in a documented compressed stretch.`]), '',
];
writeFileSync(`${OUT}map-overlay-report.md`, report.join('\n'));
console.log(report.join('\n'));
if (errors.length) console.log('console errors', errors.slice(0, 5));
process.exit(result.failures.length || errors.length ? 1 : 0);
