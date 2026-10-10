import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { advance, choose, inspect, finishSearch, newProgress, reconcileProgress, sceneLines, validateStory } from '../src/engine.mjs';
import { imageFrame, hotspotBox } from '../src/geometry.mjs';
const story = validateStory(JSON.parse(await readFile(new URL('../public/story.json', import.meta.url), 'utf8')));
const room = story.scenes.find((scene) => scene.id === 'scen8-2');
const night = story.scenes.find((scene) => scene.id === 'scen8-3');
const searching = () => ({ ...newProgress(story), sceneId: room.id, searching: true });

test('Search starts only after introductory dialogue and cannot be skipped by right tap', () => {
  const entry = { ...newProgress(story), sceneId: room.id };
  assert.equal(inspect(story, entry, 'fur'), entry);
  assert.equal(finishSearch(story, entry), entry);
  let progress = entry;
  for (let i = 0; i <= room.dialogues.length; i++) progress = advance(story, progress);
  assert.equal(progress.searching, true); assert.equal(progress.sceneId, room.id);
  assert.equal(advance(story, progress), progress);
});

test('Each clue counts once; rereading and unknown objects do not add clues', () => {
  let progress = searching();
  for (const id of ['fur', 'paws', 'quill']) {
    progress = inspect(story, progress, id);
    assert.equal(inspect(story, progress, id), progress);
  }
  assert.deepEqual(progress.state.evidence, ['fur', 'paws', 'quill']); assert.equal(progress.state.clues, 3);
  assert.equal(inspect(story, progress, 'not-a-clue'), progress);
});

test('All eight evidence combinations produce only matching thoughts and allow both night routes', () => {
  for (let mask = 0; mask < 8; mask++) {
    let progress = searching();
    const ids = ['fur', 'paws', 'quill'].filter((id, bit) => mask & (1 << bit));
    for (const id of ids) progress = inspect(story, progress, id);
    progress = finishSearch(story, progress);
    assert.equal(progress.sceneId, night.id); assert.equal(progress.searching, false);
    const lines = sceneLines(night, progress.state);
    const conditional = lines.filter((line) => line.condition);
    assert.equal(conditional.length, mask === 0 || ids.includes('fur') || ids.includes('paws') ? 1 : 0);
    for (const line of conditional) {
      for (const id of line.condition.found ?? []) assert.ok(ids.includes(id));
      for (const id of line.condition.missing ?? []) assert.ok(!ids.includes(id));
    }
    assert.equal(choose(story, progress, 'stay'), progress);
    progress = { ...progress, line: lines.length - 1 };
    assert.equal(advance(story, progress), progress);
    const staying = choose(story, progress, 'stay');
    const leaving = choose(story, progress, 'return-tavern');
    assert.equal(staying.sceneId, 'scen8-4'); assert.equal(leaving.sceneId, 'scen8-5');
    assert.deepEqual(staying.state.evidence, ids); assert.deepEqual(leaving.state.evidence, ids);
    for (const next of [staying, leaving]) {
      const scene = story.scenes.find((scene) => scene.id === next.sceneId);
      const continuation = advance(story, { ...next, line: sceneLines(scene, next.state).length - 1 });
      assert.equal(continuation.sceneId, next.sceneId === 'scen8-4' ? 'scen8-6' : 'scen8-8');
      assert.equal(continuation.ending, null);
    }
  }
});

test('An unfound quill is never mentioned in any route; all quill thoughts require finding it', () => {
  const mentionsQuill = (line) => /игл[ауыое]|игол|щепк/iu.test(line.text);
  for (let mask = 0; mask < 8; mask++) {
    const ids = ['fur', 'paws', 'quill'].filter((id, bit) => mask & (1 << bit));
    let progress = searching();
    for (const id of ids) progress = inspect(story, progress, id);
    const restored = reconcileProgress(story, JSON.parse(JSON.stringify(progress))).progress;
    for (const talkedToPorcupine of [false, true]) {
      for (const scene of story.scenes) {
        const mentions = sceneLines(scene, { ...restored.state, talkedToPorcupine }).filter(mentionsQuill);
        if (!ids.includes('quill')) assert.equal(mentions.length, 0, `${scene.id}: ${ids.join(', ') || 'no evidence'}`);
        for (const line of mentions) assert.ok(line.condition?.found?.includes('quill'), scene.id);
      }
    }
    for (const id of ['scen8-5', 'scen10-1']) assert.equal(sceneLines(story.scenes.find(scene => scene.id === id), restored.state).filter(mentionsQuill).length, ids.includes('quill') ? 1 : 0);
    const returnLines = sceneLines(story.scenes.find((scene) => scene.id === 'scen8-5'), restored.state);
    const opening = returnLines.filter((line) => line.text.startsWith('Вернусь в таверну.'));
    assert.equal(opening.length, 1);
    assert.equal(opening[0].text.includes('о моих находках'), ids.length > 0);
    for (const hotspot of room.search.hotspots) {
      assert.equal(hotspot.dialogues.some(mentionsQuill), hotspot.id === 'quill');
    }
  }
});

test('Search and quill are saved; old four-variable saves remain compatible', () => {
  const progress = inspect(story, searching(), 'quill');
  assert.deepEqual(reconcileProgress(story, JSON.parse(JSON.stringify(progress))).progress, progress);
  const updated = { ...story, version: 'future' };
  const migrated = reconcileProgress(updated, progress).progress;
  assert.deepEqual(migrated.state.evidence, ['quill']); assert.equal(migrated.searching, undefined);
  const legacy = { ...newProgress(story), version: '2026-10-05.2' };
  delete legacy.state.evidence;
  assert.deepEqual(reconcileProgress(story, legacy).progress.state.evidence, []);
  assert.equal(reconcileProgress(story, { ...progress, state: { ...progress.state, evidence: ['quill', 'quill'] } }).reset, true);
});

test('Clickable targets remain aligned and visible on phones, ultrawide screens and tablets', () => {
  for (const viewport of [{ width: 844, height: 390 }, { width: 1920, height: 1080 }, { width: 2560, height: 1080 }, { width: 1024, height: 768 }]) {
    const frame = imageFrame(room.search.imageSize, viewport);
    assert.ok(frame.x >= 0 && frame.y >= 0);
    assert.ok(Math.abs(frame.width / frame.height - room.search.imageSize.width / room.search.imageSize.height) < 0.00001);
    for (const hotspot of room.search.hotspots) {
      const box = hotspotBox(hotspot.rect, frame, viewport);
      const centerX = frame.x + (hotspot.rect.x + hotspot.rect.width / 2) * frame.width;
      const centerY = frame.y + (hotspot.rect.y + hotspot.rect.height / 2) * frame.height;
      assert.ok(box.width >= 44 && box.height >= 44);
      assert.ok(box.left >= 0 && box.top >= 0 && box.left + box.width <= viewport.width && box.top + box.height <= viewport.height);
      assert.ok(centerX >= box.left && centerX <= box.left + box.width && centerY >= box.top && centerY <= box.top + box.height);
    }
  }
});

test('Malformed hotspots, unknown clues and contradictory conditions cannot replace the story', () => {
  for (const mutate of [
    (s) => s.scenes.find((scene) => scene.search).search.hotspots[0].rect.x = -1,
    (s) => s.scenes.find((scene) => scene.search).search.hotspots[0].rect.width = 2,
    (s) => s.scenes.find((scene) => scene.search).search.hotspots[0].id = 'unknown',
    (s) => s.scenes.find((scene) => scene.id === 'scen8-3').dialogues[0].condition = { found: ['fur'], missing: ['fur'] },
    (s) => s.schemaVersion = 1,
  ]) { const broken = structuredClone(story); mutate(broken); assert.throws(() => validateStory(broken)); }
});
