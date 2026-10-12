import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { imageFrame, hotspotBox, outlineSegments } from '../src/geometry.mjs';
import { validateStory } from '../src/engine.mjs';

const root = new URL('../', import.meta.url);
const story = validateStory(JSON.parse(await readFile(new URL('public/story.json', root), 'utf8')));
const byId = id => story.scenes.find(scene => scene.id === id);
const newFrames = ['scen15-1', 'scen16-1', 'scen16-3', 'scen18-1', 'scen18-2', 'scen18-3', 'scen20-1', 'scen21-3', 'scen21-5', 'scen21-7', 'scen22-1', 'scen23-1', 'scen23-2', 'scen24-2', 'scen24-3', 'scen24-5', 'scen27-1'];

test('Every intermediate frame is connected; search geometry uses actual image dimensions', async () => {
  for (const id of newFrames) assert.equal(byId(id).image, `photo/${id}.png`);
  for (const scene of story.scenes.filter(scene => scene.search)) {
    const metadata = await sharp(await readFile(new URL(scene.image, root))).metadata();
    assert.deepEqual(scene.search.imageSize, { width: metadata.width, height: metadata.height });
  }
  assert.equal(byId('scen16-4').image, 'photo/scen16-3.png');
});

test('The quill and new document contours remain inside clickable mobile targets without mouse hover', () => {
  for (const viewport of [{ width: 568, height: 320 }, { width: 844, height: 390 }, { width: 932, height: 430 }, { width: 1920, height: 1080 }]) {
    for (const insets of [{ left: 0, right: 0, top: 0, bottom: 0 }, { left: 44, right: 0, top: 0, bottom: 21 }, { left: 0, right: 44, top: 0, bottom: 21 }]) {
      for (const id of ['scen8-2', 'scen16-1', 'scen21-3', 'scen22-1']) {
        const search = byId(id).search;
        const frame = imageFrame(search.imageSize, viewport, 'contain', insets);
        const boxes = search.hotspots.map(item => hotspotBox(item.rect, frame, viewport, 48, insets));
        for (const [index, item] of search.hotspots.entries()) {
          const box = boxes[index];
          assert.ok(box.width >= 48 && box.height >= 48);
          for (const point of item.outline ?? []) {
            const x = frame.x + point.x * frame.width, y = frame.y + point.y * frame.height;
            assert.ok(x >= box.left - 1e-6 && x <= box.left + box.width + 1e-6, `${id}: contour outside touch width`);
            assert.ok(y >= box.top - 1e-6 && y <= box.top + box.height + 1e-6, `${id}: contour outside touch height`);
          }
          for (const other of boxes.slice(index + 1)) {
            const overlapX = Math.min(box.left + box.width, other.left + other.width) - Math.max(box.left, other.left);
            const overlapY = Math.min(box.top + box.height, other.top + other.height) - Math.max(box.top, other.top);
            assert.ok(overlapX <= 0 || overlapY <= 0, `${id}: adjacent clues intercept each other`);
          }
        }
      }
    }
  }
  const quill = byId('scen8-2').search.hotspots.find(item => item.id === 'quill');
  assert.equal(quill.alwaysHighlight, true);
  assert.ok(quill.outline.length >= 3);
  for (const id of ['scen16-1', 'scen21-3', 'scen22-1']) for (const item of byId(id).search.hotspots) assert.equal(item.alwaysHighlight, true);
});

test('Contour segments reconstruct the artwork coordinates after letterboxing and safe-area scaling', () => {
  const search = byId('scen22-1').search;
  const points = search.hotspots[0].outline;
  const frame = imageFrame(search.imageSize, { width: 844, height: 390 }, 'contain', { left: 44, right: 0, top: 0, bottom: 21 });
  const segments = outlineSegments(points, frame);
  assert.equal(segments.length, points.length);
  for (const [index, segment] of segments.entries()) {
    const angle = segment.angle * Math.PI / 180;
    const centerX = segment.left + segment.width / 2;
    const centerY = segment.top;
    const dx = Math.cos(angle) * segment.width / 2, dy = Math.sin(angle) * segment.width / 2;
    const start = points[index], end = points[(index + 1) % points.length];
    assert.ok(Math.abs(centerX - dx - (frame.x + start.x * frame.width)) < 1e-6);
    assert.ok(Math.abs(centerY - dy - (frame.y + start.y * frame.height)) < 1e-6);
    assert.ok(Math.abs(centerX + dx - (frame.x + end.x * frame.width)) < 1e-6);
    assert.ok(Math.abs(centerY + dy - (frame.y + end.y * frame.height)) < 1e-6);
  }
});

test('Broken contour coordinates and invalid highlight options cannot replace the playable story', () => {
  for (const mutate of [
    item => item.outline = [],
    item => item.outline = [{ x: 0, y: 0 }, { x: 0, y: 0.1 }, { x: 0.1, y: 0 }],
    item => item.outline[0].x = '0.8',
    item => item.outline[0].y = 2,
    item => item.alwaysHighlight = 'yes',
  ]) {
    const copy = structuredClone(story);
    mutate(copy.scenes.find(scene => scene.id === 'scen8-2').search.hotspots.find(item => item.id === 'quill'));
    assert.throws(() => validateStory(copy), /область поиска/);
  }
});
