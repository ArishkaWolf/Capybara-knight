import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { advance, choose, finishSearch, inspect, interact, newProgress, reconcileProgress, sceneLines, validateStory } from '../src/engine.mjs';
import { imageFrame, hotspotBox } from '../src/geometry.mjs';

const story = validateStory(JSON.parse(await readFile(new URL('../public/story.json', import.meta.url), 'utf8')));
const sceneById = id => story.scenes.find(scene => scene.id === id);
const entry = sceneId => ({ ...newProgress(story), sceneId });
const gateScenes = ['scen9', 'scen9-1'];

function revealGate(progress) {
  const lines = sceneLines(sceneById(progress.sceneId), progress.state);
  for (let i = 0; i <= lines.length; i++) progress = advance(story, progress);
  assert.equal(progress.interacting, true);
  return progress;
}

test('Both notes require clicking the paper; ordinary advancement and unrelated actions cannot bypass it', () => {
  for (const sceneId of gateScenes) {
    const intro = entry(sceneId);
    assert.equal(interact(story, intro, 'note'), intro);
    const gate = revealGate(intro);
    assert.equal(gate.sceneId, sceneId);
    for (let i = 0; i < 10; i++) assert.equal(advance(story, gate), gate);
    assert.equal(choose(story, gate, 'note'), gate);
    assert.equal(finishSearch(story, gate), gate);
    assert.equal(inspect(story, gate, 'quill'), gate);
    assert.equal(interact(story, gate, 'key'), gate);
    const reading = interact(story, gate, 'note');
    assert.equal(reading.sceneId, sceneId === 'scen9' ? 'scen9-2_2' : 'scen9-2');
    assert.equal(reading.line, 0);
    assert.equal(reading.interacting, false);
    assert.deepEqual(reading.state, gate.state);
    assert.equal(interact(story, reading, 'note'), reading);
    const lines = sceneLines(sceneById(reading.sceneId), reading.state);
    let progress = reading;
    for (let i = 1; i < lines.length; i++) {
      progress = advance(story, progress);
      assert.equal(progress.sceneId, reading.sceneId);
      assert.equal(progress.line, i);
    }
    assert.equal(advance(story, progress).sceneId, 'scen10');
  }
});

test('The exact same note welcomes the guest, explains the key, and requests care until lunch', () => {
  const day = sceneById('scen9-2_2').dialogues;
  const night = sceneById('scen9-2').dialogues;
  assert.deepEqual(day, night);
  const text = day.map(line => line.text).join('\n');
  for (const phrase of ['Привет, путник', 'Я ждал тебя', 'уехать по делам', 'Извини', 'не раньше обеда', 'отдохни', 'Ключ', 'комнаты наверху', 'присмотришь за таверной']) assert.ok(text.includes(phrase));
});

test('Saved note gates stay locked, and previous chapter endings reopen into the continuation', () => {
  for (const sceneId of gateScenes) {
    const gate = revealGate(entry(sceneId));
    const restored = reconcileProgress(story, JSON.parse(JSON.stringify(gate))).progress;
    assert.deepEqual(restored, gate);
    assert.equal(advance(story, restored), restored);
    const reading = advance(story, interact(story, restored, 'note'));
    const resumed = reconcileProgress(story, reading).progress;
    assert.equal(resumed.sceneId, reading.sceneId);
    assert.equal(resumed.line, 1);
    const updated = reconcileProgress({ ...story, version: 'next' }, restored).progress;
    assert.equal(updated.interacting, undefined);
    assert.equal(updated.line, -1);
    assert.equal(interact(story, updated, 'note'), updated);
  }
  for (const sceneId of ['scen8-4', 'scen8-5']) {
    const oldEnding = { ...entry(sceneId), version: '2026-10-05.4', state: { ...entry(sceneId).state, evidence: ['quill'], clues: 1 }, ending: { title: 'Продолжение следует', text: 'Старая граница сюжета' } };
    const migrated = reconcileProgress(story, oldEnding);
    assert.equal(migrated.reset, false);
    assert.equal(migrated.progress.ending, null);
    assert.equal(migrated.progress.sceneId, sceneId);
    assert.deepEqual(migrated.progress.state.evidence, ['quill']);
  }
});

test('Both branches converge after their notes for all eight evidence combinations', () => {
  const routes = {
    stay: ['scen8-4', 'scen8-6', 'scen8-7', 'scen8-9', 'scen9', 'scen9-2_2', 'scen10', 'scen10-1', 'scen10-2'],
    'return-tavern': ['scen8-5', 'scen8-8', 'scen9-1', 'scen9-2', 'scen10', 'scen10-1', 'scen10-2'],
  };
  for (let mask = 0; mask < 8; mask++) {
    const evidence = ['fur', 'paws', 'quill'].filter((_, bit) => mask & (1 << bit));
    for (const [choice, expected] of Object.entries(routes)) {
      const start = entry('scen8-3');
      start.state.evidence = evidence; start.state.clues = evidence.length;
      start.line = sceneLines(sceneById(start.sceneId), start.state).length - 1;
      let progress = choose(story, start, choice);
      const visited = [];
      for (let i = 0; i < 100; i++) {
        if (visited.at(-1) !== progress.sceneId) visited.push(progress.sceneId);
        if (progress.sceneId === 'scen10-2' && progress.line === sceneLines(sceneById(progress.sceneId), progress.state).length - 1) break;
        progress = progress.interacting ? interact(story, progress, 'note') : advance(story, progress);
      }
      assert.deepEqual(visited, expected);
      assert.equal(progress.ending, null);
      assert.equal(advance(story, progress).sceneId, 'scen10-3');
      assert.deepEqual(progress.state.evidence, evidence);
      assert.equal(progress.state.clues, evidence.length);
    }
  }
});

test('Both paper targets stay aligned with the artwork on phones and tablets', () => {
  for (const sceneId of gateScenes) {
    const { imageSize, rect } = sceneById(sceneId).interaction;
    for (const viewport of [{ width: 844, height: 390 }, { width: 1920, height: 1080 }, { width: 2560, height: 1080 }, { width: 1024, height: 768 }]) {
      const frame = imageFrame(imageSize, viewport);
      const box = hotspotBox(rect, frame, viewport);
      const x = frame.x + (rect.x + rect.width / 2) * frame.width;
      const y = frame.y + (rect.y + rect.height / 2) * frame.height;
      assert.ok(box.width >= 44 && box.height >= 44);
      assert.ok(x >= box.left && x <= box.left + box.width);
      assert.ok(y >= box.top && y <= box.top + box.height);
      assert.ok(box.left >= 0 && box.top >= 0 && box.left + box.width <= viewport.width && box.top + box.height <= viewport.height);
    }
  }
});

test('Invalid mandatory objects and old-client note formats are rejected', () => {
  for (const mutate of [
    s => s.schemaVersion = 2,
    s => s.scenes.find(scene => scene.interaction).interaction.id = '',
    s => s.scenes.find(scene => scene.interaction).interaction.imageSize.height = 0,
    s => s.scenes.find(scene => scene.interaction).interaction.rect.x = -1,
    s => s.scenes.find(scene => scene.interaction).interaction.rect.width = 1,
    s => s.scenes.find(scene => scene.interaction).next = null,
    s => s.scenes.find(scene => scene.search).interaction = structuredClone(sceneById('scen9').interaction),
  ]) {
    const broken = structuredClone(story); mutate(broken);
    assert.throws(() => validateStory(broken));
  }
  for (const schemaVersion of [1, 2, 3]) {
    const compatible = { ...story, schemaVersion, scenes: [{ ...story.scenes[0], next: null }] };
    assert.equal(validateStory(compatible), compatible);
  }
});
