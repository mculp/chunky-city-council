// The proof that the buildings stand where the real ones do: the game drawn from above, half see-through over a
// public-domain aerial of the same ground. It writes to data/raw/structures/, which is gitignored, because rendered
// images don't go in the repo. data/structures.md says what it's for.
//
//   npm run overlay:structures -- [x0 z0 x1 z1] [--scale 4] [--aerial-only]
//
// The corners are in true metres from town center.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serveAndOpen } from './browser.mjs';

const args = process.argv.slice(2), flag = (name, or) => (args.includes(name) ? args[args.indexOf(name) + 1] : or);
const nums = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')).map(Number);
const [x0, z0, x1, z1] = nums.length === 4 ? nums : [-650, -560, 700, 240], scale = +flag('--scale', 4);
const OUT = fileURLToPath(new URL('../data/raw/structures/', import.meta.url));

const { page, errors, close } = await serveAndOpen({ viewport: { width: 512, height: 512 } });
const url = await page.evaluate(async ({ x0, z0, x1, z1, scale }) => {
  const G = __game, M = G.map;
  G.pause();
  const [wx0, wz0] = M.fromTrue(x0, z0), [wx1, wz1] = M.fromTrue(x1, z1);
  const game = G.topDown({ x0: wx0, z0: wz0, x1: wx1, z1: wz1, scale, houses: true });
  const R = 6371000, lat0 = 32.32583, lon0 = -88.92806, lon = (x) => lon0 + x / (R * Math.cos(lat0 * Math.PI / 180)) * 180 / Math.PI, lat = (z) => lat0 - z / R * 180 / Math.PI;
  const w = game.width, h = game.height;
  const aerial = `https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage?bbox=${lon(x0)},${lat(z1)},${lon(x1)},${lat(z0)}&bboxSR=4326&size=${Math.min(w, 4000)},${Math.min(h, 4000)}&format=jpgpng&f=image`;
  const img = new Image(); img.crossOrigin = 'anonymous';
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('no aerial')); img.src = aerial; });
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h); g.globalAlpha = .5; g.drawImage(game, 0, 0);
  return c.toDataURL('image/jpeg', .85);
}, { x0, z0, x1, z1, scale });
mkdirSync(OUT, { recursive: true });
const path = `${OUT}overlay_${x0}_${z0}_${x1}_${z1}.jpg`;
writeFileSync(path, Buffer.from(url.split(',')[1], 'base64'));
console.log('wrote', path);
if (errors.length) { console.error(errors); process.exitCode = 1; }
await close();
