// Serves the repo and opens the game in the system Chrome with the GPU on, so WebGL runs for real.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

export async function serveAndOpen({ touch = false, viewport, query = '?test', reducedMotion } = {}) {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    try {
      const body = await readFile(join(ROOT, path === '/' ? 'index.html' : path));
      res.writeHead(200, { 'content-type': MIME[extname(path) || '.html'] || 'application/octet-stream' }); res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const size = viewport || (touch ? { width: 390, height: 844 } : { width: 513, height: 696 });
  const page = await (await browser.newContext({ viewport: size, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch, reducedMotion })).newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
  return { page, errors, close: async () => { await browser.close(); server.close(); } };
}
