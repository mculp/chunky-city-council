// favicon.ico for chunky.ms, made from index.html's own tab icon. Chrome asks a real site for /favicon.ico whatever icon its page
// names, so tools/deploy.mjs puts one up beside the game, made at the moment it goes up from the index.html that's going, so that
// the two can't come apart. The icon's an SVG written into the page, and Chrome draws it at each size the .ico holds, unchanged.

// The SVG written into the page's icon tag, or null if its icon isn't one
export function iconOf(html) {
  const tag = html.match(/<link\b[^>]*\brel=["']?icon["']?[\s>][^>]*>?/i)?.[0];
  const href = tag?.match(/\bhref=(["'])(.*?)\1/i)?.[2];
  return href?.startsWith('data:image/svg+xml,') ? decodeURIComponent(href.slice('data:image/svg+xml,'.length)) : null;
}

// An .ico of PNGs, one for each size, which every browser reads
export function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let at = head.length;
  images.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i, side = size >= 256 ? 0 : size;
    head[e] = side; head[e + 1] = side; head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8); head.writeUInt32LE(at, e + 12);
    at += png.length;
  });
  return Buffer.concat([head, ...images.map((m) => m.png)]);
}

// The SVG as Chrome draws it at each size, on nothing, as in a tab
export async function favicon(svg, sizes = [16, 32, 48]) {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const images = [];
    for (const size of sizes) {
      const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
      await page.setContent(`<style>html,body{margin:0;background:transparent}img{display:block}</style><img width="${size}" height="${size}" src="data:image/svg+xml,${encodeURIComponent(svg)}">`);
      await page.locator('img').evaluate((img) => img.decode());
      images.push({ size, png: await page.screenshot({ omitBackground: true }) });
      await page.close();
    }
    return ico(images);
  } finally {
    await browser.close();
  }
}
