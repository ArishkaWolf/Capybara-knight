import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import jsQR from 'jsqr';

const root = new URL('../', import.meta.url);
const links = JSON.parse(await readFile(new URL('assets/distribution/links.json', root), 'utf8'));
test('Published QR codes can be decoded and open their declared destination', async () => {
  for (const [name, url] of Object.entries({ browser: links.web, expo: links.expoGo })) {
    if (!url) continue;
    const svg = await readFile(new URL(`assets/distribution/${name}-qr.svg`, root));
    const { data, info } = await sharp(svg).resize(440, 440).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);
    assert.equal(decoded?.data, url, `${name} QR must scan correctly`);
    assert.ok(new URL(url).hostname);
  }
});
