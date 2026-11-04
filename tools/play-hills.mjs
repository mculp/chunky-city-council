// Goes and looks at the hills on a phone-sized page. The first scene is at the bottom of them, with no far land until town. The graphics card draws what src/hills.js says, and
// everything in the scene goes up with them. A pickup goes up US 80's biggest hill with the phone's stick, with the game's flat world under it the whole way. He walks down the
// other side with the camera clear of the land behind him, swims under a bluff, and swims in a pool up on one. Then what a paved lane does where it carries on from a road's end,
// and what it costs.
//
//   npm i && npm run hills [-- --shots dir]
import { mkdirSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';

const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const { page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 } });
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const g = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { if (shots) { await g(() => __game.step(.6, 1 / 24)); await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 82 }); } };

// ---------------- the first scene
const early = await g(() => {
  const G = __game, out = {}; G.pause();
  for (const phase of ['hang', 'swim', 'land', 'bridge', 'bitten', 'dream', 'wake']) { G.jump(phase); G.step(.3, 1 / 30); out[phase] = { here: G.hills.here(), far: G.hills.skyline.visible, off: G.hills.uniforms.uHills.value.image.width === 1, river: G.hills.uniforms.uRiverUp.value, switch: !!document.getElementById('hillsAB') }; }
  return out;
});
check('all through the opening he is at the bottom of the hills', Object.values(early).every((e) => e.here < .005 && e.river < .005), early);
check('and they\'re not there at all, and no far land shows, until he wakes at the edge of town', Object.entries(early).every(([phase, e]) => e.far === (phase === 'wake') && e.off === (phase !== 'wake')), early);
check('and the switch for trying them taller has gone, now the owner\'s chosen', Object.values(early).every((e) => !e.switch), early);

await g(() => {
  const G = __game; G.jump('town'); G.S.flags.town = true; G.step(.3, 1 / 30);
  document.getElementById('card').style.display = 'none';
  window.T = 1 / 30;
  window.true2 = (x, z) => G.map.fromTrue(x, z);
  window.board = (kind) => {
    const v = G.vehicles.find((o) => o.kind === kind && !o.wrecked && !o.drowned), a = v.yaw + Math.PI / 2, off = v.K.width / 2 + 1;
    G.place(v.x + Math.sin(a) * off, v.z + Math.cos(a) * off); G.step(.6);
    G.key('e', true); G.sim(T, T); G.key('e', false); G.sim(T, T);
    return G.driving();
  };
  // where a road climbs the most over about so far, and which way that is
  window.biggestHill = (id, far) => {
    const M = G.map, L = M.roadById.get(id).length; let best = { rise: -1 };
    for (let s = 40; s + far < L - 40; s += 20) {
      const a = M.along(id, s), b = M.along(id, s + far), rise = G.hills.at(b.x, b.z) - G.hills.at(a.x, a.z);
      if (Math.abs(rise) > best.rise) best = { rise: Math.abs(rise), from: rise > 0 ? s : s + far, dir: rise > 0 ? 1 : -1 };
    }
    return best;
  };
});
const inTown = await g(() => ({ far: __game.hills.skyline.visible, here: __game.hills.here() }));
check('in town the far land shows, and the bridge he wakes on is still at the bottom', inTown.far && inTown.here < .1, inTown);

// ---------------- what's drawn is what the code says, twice over, which is how tall the owner chose
await g(() => { window.drawnHills = () => {
  const G = __game, K = G.THREE, R = G.renderer, U = G.hills.uniforms, N = 256, pts = new Float32Array(N * 4), t = G.hills.terraces[0], e = t.edge;
  for (let i = 0; i < N; i++) {
    // all over the map, as a golden-ratio walk so that it's the same every time, and the last 32 across the ground that's been cut flat by the cabin on Pine Forest Rd and its edge
    const [x, z] = i < N - 32 ? true2(-5000 + 20000 * ((i * .6180339887) % 1), -8000 + 17000 * ((i * .7548776662) % 1)) : [t.x0 - e + (t.x1 - t.x0 + 2 * e) * ((i * .6180339887) % 1), t.z0 - e + (t.z1 - t.z0 + 2 * e) * ((i * .7548776662) % 1)];
    pts[i * 4] = x; pts[i * 4 + 1] = z;
  }
  const where = new K.DataTexture(pts, N, 1, K.RGBAFormat, K.FloatType); where.needsUpdate = true;
  const quad = new K.Mesh(new K.PlaneGeometry(2, 2), new K.ShaderMaterial({
    uniforms: { uWhere: { value: where } },
    vertexShader: 'void main(){ gl_Position=vec4(position.xy,0.,1.); }',
    fragmentShader: `#include <hill_pars>
      uniform sampler2D uWhere;
      void main(){ gl_FragColor=vec4(hillOver(texture2D(uWhere,vec2(gl_FragCoord.x/${N}.,.5)).xy),0.,0.,1.); }`,
  }));
  quad.frustumCulled = false;
  const box = new K.Scene(), target = new K.WebGLRenderTarget(N, 1, { type: K.FloatType, format: K.RGBAFormat, minFilter: K.NearestFilter, magFilter: K.NearestFilter, depthBuffer: false }), out = new Float32Array(N * 4), was = U.uHillHere.value;
  box.add(quad); U.uHillHere.value = 0;
  R.setRenderTarget(target); R.render(box, new K.OrthographicCamera(-1, 1, 1, -1, 0, 1)); R.readRenderTargetPixels(target, 0, 0, N, 1, out); R.setRenderTarget(null);
  U.uHillHere.value = was;
  let worst = 0, high = 0; const flat = [];
  for (let i = 0; i < N; i++) {
    const h = G.hills.at(pts[i * 4], pts[i * 4 + 1]) * U.uHillScale.value; worst = Math.max(worst, Math.abs(out[i * 4] - h)); high = Math.max(high, out[i * 4]);
    if (pts[i * 4] > t.x0 && pts[i * 4] < t.x1 && pts[i * 4 + 1] > t.z0 && pts[i * 4 + 1] < t.z1) flat.push(out[i * 4]);
  }
  return { worst, high, k: U.uHillScale.value, flat: flat.length, level: Math.max(...flat) - Math.min(...flat), at: t.at * U.uHillScale.value, drawn: flat[0] };
}; });
const gpu = await g(() => drawnHills());
check(`the graphics card draws the land twice as tall as it really is, and agrees with the code on it: ${(gpu.worst * 100).toFixed(1)} cm out at worst, over land up to ${gpu.high.toFixed(0)} m`, gpu.k === 2 && gpu.worst < .1 && gpu.high > 60, gpu);
check(`and where it's been cut flat by the cabin on Pine Forest Rd, the graphics card draws it flat at ${gpu.at.toFixed(2)} m, ${(gpu.level * 100).toFixed(1)} cm out across ${gpu.flat} points`, gpu.flat >= 8 && gpu.level < .01 && Math.abs(gpu.drawn - gpu.at) < .01, gpu);
await snap('0-twice-as-tall');

// ---------------- everything goes up with them
const programs = await g(() => {
  const G = __game, R = G.renderer, gl = R.getContext(), left = [], seen = new Set(); let n = 0;
  G.bringOutCrowd(); G.step(.5, T);
  G.scene.traverse((o) => {
    for (const m of o.material ? [].concat(o.material) : []) {
      if (seen.has(m)) continue;
      seen.add(m);
      const p = R.properties.get(m).currentProgram;
      if (!p) continue;
      n++;
      const src = gl.getShaderSource(p.vertexShader), uses = (src.match(/hillOver\(/g) ?? []).length > 1 || /uHillHere;/.test(src.replace(/uniform float uHillHere;/, ''));
      if (!uses && !/#define FLAT_WORLD/.test(src) && o.geometry?.parameters?.radius !== 500) left.push(`${o.name || o.type}/${m.type}`);
    }
  });
  return { n, left };
});
check(`all ${programs.n} materials drawn so far go up and down with the land, but for the sky and the moon`, programs.n > 20 && programs.left.length === 0, programs);

// ---------------- up a real hill, with the phone's stick
const hill = await g(() => biggestHill('us_80', 500));
check(`US 80 has a real hill on it: ${hill.rise.toFixed(0)} m in 500 m`, hill.rise > 12, hill);
const drive = await g(({ from, dir }) => {
  const G = __game, M = G.map, v = board('pickup'), p = M.along('us_80', from), yaw = Math.atan2(p.tx * dir, p.tz * dir);
  v.x = p.x; v.z = p.z; v.y = G.floorAt(p.x, p.z); v.yaw = yaw; v.f = v.s = v.steer = 0; v.grounded = true; G.look(yaw + Math.PI); G.step(.2, T);
  const start = G.hills.here(); let top = 0, least = 1e9, most = -1e9, far = 0, hits = 0, hp = v.hp, highest = start, s0 = M.sOn('us_80', v.x, v.z);
  for (let t = 0; t < 40 && Math.abs(M.sOn('us_80', v.x, v.z) - s0) < 500; t += T) {
    const on = M.sOn('us_80', v.x, v.z), q = M.along('us_80', on + dir * (8 + Math.abs(v.f) * .9));
    let d = Math.atan2(q.x - v.x, q.z - v.z) - v.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    G.stick(Math.max(-1, Math.min(1, -d * 2.4)), 1);
    G.sim(T, T);
    top = Math.max(top, Math.abs(v.f)); least = Math.min(least, v.y); most = Math.max(most, v.y); far = Math.max(far, M.roadGrid.nearest(v.x, v.z));
    if (v.hp < hp) { hits++; hp = v.hp; }
    if (Math.round(t / T) % 20 === 0) { G.step(T, T); highest = Math.max(highest, G.hills.here()); }
  }
  G.step(T, T); highest = Math.max(highest, G.hills.here());
  return { start, end: G.hills.here(), highest, top, least, most, far, hits, travelled: Math.abs(M.sOn('us_80', v.x, v.z) - s0), kind: v.K.top, seat: G.heroRoot.position.y, x: v.x, z: v.z };
}, hill);
check(`a pickup goes up it with the stick alone: ${drive.start.toFixed(1)} m to ${drive.highest.toFixed(1)} m`, drive.highest - drive.start > hill.rise * .8 && drive.far < 7 && drive.hits === 0, drive);
check(`and the world it's driving on stays flat the whole way: ${drive.least.toFixed(2)} to ${drive.most.toFixed(2)} m`, drive.most - drive.least < .3, drive);
check(`and it isn't slowed by it, at ${drive.top.toFixed(1)} of ${drive.kind} m/s`, drive.top > drive.kind * .8, drive);
await snap('1-up-the-hill');

// ---------------- down the other side on foot
const down = await g(({ from, dir }) => {
  const G = __game, M = G.map, v = G.driving();
  G.key(' ', false); G.key('s', true); for (let i = 0; i < 400 && Math.abs(v.f) > .4; i++) G.sim(T, T); G.key('s', false); v.f = v.s = 0; G.sim(T, T);
  G.key('e', true); G.sim(T, T); G.key('e', false); G.sim(T, T);
  // from where it's steepest, the way the land falls, with the hill at his back. A little way off the paint, the way anyone would walk it.
  let steepest = from, most = 0;
  for (let s = 0; s < 500; s += 10) { const a = M.along('us_80', from + dir * s), b = M.along('us_80', from + dir * (s + 20)), rise = (G.hills.at(b.x, b.z) - G.hills.at(a.x, a.z)) / 20; if (rise > most) { most = rise; steepest = from + dir * (s + 40); } }
  const p = M.along('us_80', steepest), P = G.player.pos;
  G.place(p.x, p.z); G.step(.2, T);
  let least = 1e9, start = G.hills.here();
  G.key('w', true); G.key('shift', true);
  for (let i = 0; i < 300; i++) {
    const on = M.sOn('us_80', P.x, P.z), q = M.along('us_80', on - dir * 14);
    G.look(Math.atan2(P.x - q.x, P.z - q.z)); G.step(T, T);
    const c = G.camera.position; least = Math.min(least, c.y - (G.groundH(c.x, c.z) + G.hills.at(c.x, c.z) * G.hills.uniforms.uHillScale.value - G.hills.here()));
  }
  G.key('w', false); G.key('shift', false); G.sim(T, T);
  return { start, end: G.hills.here(), least, gone: !G.driving() };
}, hill);
check(`on foot back down it he goes from ${down.start.toFixed(1)} m to ${down.end.toFixed(1)} m`, down.gone && down.start - down.end > 5, down);
check(`and the camera behind him stays above the land, ${down.least.toFixed(2)} m at the least`, down.least > .25, down);
await snap('2-back-down');

// ---------------- water
const swim = await g(() => {
  const G = __game, U = G.hills.uniforms, out = {};
  // the highest the river's lifted anywhere it can be seen, under a bluff
  G.place(...true2(1102, 592), -.3); G.step(.4, T);
  out.under = { mode: G.S.mode, here: G.hills.here(), up: U.uRiverUp.value };
  G.place(...true2(1065, 625)); G.step(.2, T);
  out.onTop = { mode: G.S.mode, here: G.hills.here(), up: U.uRiverUp.value };
  // a swimming pool on top of it
  const pool = G.water.ponds.find((p) => p.id === 'pool-1');
  let x = 0, z = 0; for (const [a, b] of pool.ring) { x += a; z += b; } x /= pool.ring.length; z /= pool.ring.length;
  G.place(x, z, pool.level - .2); G.step(.5, T);
  const hs = pool.ring.map(([a, b]) => G.hills.at(a, b));
  out.pool = { mode: G.S.mode, here: G.hills.here(), up: U.uRiverUp.value, off: Math.max(...hs) - Math.min(...hs) };
  const low = G.water.ponds.filter((p) => p.level <= 0).flatMap((p) => p.ring.map(([a, b]) => G.hills.at(a, b)));
  out.lowPonds = low.length ? Math.max(...low) * U.uHillScale.value : 0;
  return out;
});
check(`where a bluff lifts the river ${swim.under.here.toFixed(1)} m, the water comes up to him`, swim.under.mode === 'swim' && swim.under.here > 1 && Math.abs(swim.under.here - swim.under.up) < .02, swim.under);
check('and on top of the bluff it has gone back down', swim.onTop.mode !== 'swim' && swim.onTop.here > 8 && swim.onTop.up < .01, swim.onTop);
check(`a pool up on the bluff is level to ${(swim.pool.off * 100).toFixed(0)} cm, and he swims in it at ${swim.pool.here.toFixed(1)} m`, swim.pool.mode === 'swim' && swim.pool.here > 10 && swim.pool.off < .1 && swim.pool.up === 0, swim.pool);
check('any pond drawn by the river sheet is on land at its foot', swim.lowPonds < .25, swim.lowPonds);
await snap('3-pool-on-the-bluff');

// ---------------- where a paved lane carries on from a road's end
const joints = await g(() => {
  const G = __game, K = G.THREE, M = G.map, near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1, found = [];
  for (const l of M.lanes) {
    if (l.surface !== 'asphalt') continue;
    for (const [e, next] of [[l.pts[0], l.pts[1]], [l.pts.at(-1), l.pts.at(-2)]]) if (M.roads.some((r) => near(r.pts[0], e) || near(r.pts.at(-1), e))) found.push({ e, next });
  }
  let n = 0, gaps = 0;
  for (const { e, next } of found.slice(0, 6)) {
    G.place(e[0] + 12, e[1] + 12); G.step(.5, T);
    const meshes = []; G.scene.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh) meshes.push(o); });
    const L = Math.hypot(next[0] - e[0], next[1] - e[1]), ux = (next[0] - e[0]) / L, uz = (next[1] - e[1]) / L;
    for (const s of [-3, -1, 1, 3]) {
      const ray = new K.Raycaster(new K.Vector3(e[0] + ux * s, 40, e[1] + uz * s), new K.Vector3(0, -1, 0), 0, 60), hit = ray.intersectObjects(meshes, false).find((h) => h.point.y > 6.17 && h.point.y < 6.25);
      n++; if (!hit) gaps++;
    }
  }
  return { joints: found.length, n, gaps };
});
check(`a paved lane carries on from where a road stops with no gap, at ${joints.joints} of them`, joints.joints > 0 && joints.gaps === 0, joints);

// ---------------- what it costs
const cost = await g(() => {
  const G = __game, out = {};
  const there = (name, x, z) => { G.place(...true2(x, z)); G.step(.5, T); const c = G.calls(); out[name] = `${c.calls} calls, ${Math.round(c.triangles / 1000)}k triangles`; };
  there('town', 0, 0); there('the bluff', 1000, 660); there('US 80 on the hill', 4608, -181);
  return out;
});
console.log('cost', JSON.stringify(cost));
await snap('4-last');

check('no console errors', errors.length === 0, errors);
await close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
