import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { imageFrame, hotspotBox } from '../src/geometry.mjs';
import { validateStory } from '../src/engine.mjs';

const root = new URL('../', import.meta.url);
const story = JSON.parse(await readFile(new URL('public/story.json', root), 'utf8'));

test('mobile search and note hit areas stay aligned and usable inside asymmetric safe areas', () => {
  for (const viewport of [{ width: 568, height: 320 }, { width: 844, height: 390 }, { width: 932, height: 430 }]) {
    for (const insets of [{ left: 44, right: 0, top: 0, bottom: 21 }, { left: 0, right: 44, top: 0, bottom: 21 }]) {
      for (const scene of story.scenes.filter((scene) => scene.search || scene.interaction)) {
        const item = scene.search ?? scene.interaction;
        const frame = imageFrame(item.imageSize, viewport, 'contain', insets);
        assert.ok(frame.x >= insets.left - 0.001 && frame.y >= insets.top - 0.001);
        assert.ok(frame.x + frame.width <= viewport.width - insets.right + 0.001);
        assert.ok(frame.y + frame.height <= viewport.height - insets.bottom + 0.001);
        for (const region of item.hotspots ?? [item]) {
          const box = hotspotBox(region.rect, frame, viewport, 48, insets);
          assert.ok(box.width >= 48 && box.height >= 48);
          assert.ok(box.left >= insets.left && box.top >= insets.top);
          assert.ok(box.left + box.width <= viewport.width - insets.right + 0.001);
          assert.ok(box.top + box.height <= viewport.height - insets.bottom + 0.001);
          const x = frame.x + (region.rect.x + region.rect.width / 2) * frame.width;
          const y = frame.y + (region.rect.y + region.rect.height / 2) * frame.height;
          assert.ok(x >= box.left && x <= box.left + box.width);
          assert.ok(y >= box.top && y <= box.top + box.height);
        }
      }
    }
  }
});

test('optimized story preserves routes, dialogues, coordinates and save identifiers', async () => {
  const optimized = validateStory(JSON.parse(await readFile(new URL('assets/story.json', root), 'utf8')));
  assert.deepEqual({ ...optimized, scenes: optimized.scenes.map((scene) => ({ ...scene, image: scene.image.replace(/\.webp$/, '.png') })) }, story);
});

test('prepared WebP assets decode, reduce size and leave all originals intact', async () => {
  const manifest = JSON.parse(await readFile(new URL('assets/image-manifest.json', root), 'utf8'));
  let originalBytes = 0;
  let optimizedBytes = 0;
  for (const item of manifest.images) {
    const input = await readFile(new URL(item.source, root));
    assert.equal(createHash('sha256').update(input).digest('hex'), item.sourceHash);
    const output = await readFile(new URL(item.output, root));
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, item.width);
    assert.equal(metadata.height, item.height);
    assert.ok(metadata.width <= 1920 && metadata.height <= 1080);
    const original = await sharp(input).metadata();
    assert.ok(Math.abs(original.width / original.height - metadata.width / metadata.height) < 0.002);
    originalBytes += input.length;
    optimizedBytes += output.length;
  }
  assert.ok(optimizedBytes < originalBytes / 3);
});

test('iOS launcher icon is opaque and Android foreground has safe transparent margins', async () => {
  const icon = await sharp(await readFile(new URL('assets/branding/icon.png', root))).metadata();
  assert.equal(icon.width, 1024);
  assert.equal(icon.height, 1024);
  assert.equal(icon.hasAlpha, false);
  const { data, info } = await sharp(await readFile(new URL('assets/branding/adaptive-icon.png', root))).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  assert.equal(data[3], 0);
  assert.equal(data[(512 * info.width + 512) * 4 + 3], 255);
});
