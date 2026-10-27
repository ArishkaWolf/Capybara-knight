import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { newProgress } from '../src/engine.mjs';
import { reconcilePlayers } from '../src/profiles.mjs';
import { olderRelease, restoreStoryCache } from '../src/story-cache.mjs';

const story = JSON.parse(await readFile(new URL('../public/story.json', import.meta.url), 'utf8'));
const bundled = { story: { ...story, version: '2026-10-14.2' }, baseUrl: null };
const cache = (version, baseUrl = 'https://example.com/game/') => JSON.stringify({ story: { ...story, version }, baseUrl });

test('An older server release cannot be offered as an update over a newer embedded story', () => {
  assert.equal(olderRelease('2026-10-14.1', '2026-10-27.1'), true);
  assert.equal(olderRelease('2026-10-27.1', '2026-10-14.1'), false);
  assert.equal(olderRelease('2026-10-27.1', '2026-10-27.1'), false);
  assert.equal(olderRelease('2026-10-27.2', '2026-10-27.10'), true);
  assert.equal(olderRelease('preview', '2026-10-27.1'), false);
});

test('An older cache cannot replace the updated APK story; saved scenes and evidence survive the upgrade', () => {
  for (const version of ['2026-10-12.2', '2026-10-14.1']) assert.equal(restoreStoryCache(cache(version), bundled), bundled);
  const oldStory = { ...story, version: '2026-10-12.2' };
  const progress = { ...newProgress(oldStory), sceneId: 'scen14', line: 4 };
  progress.state.evidence = ['quill', 'marketInvoice']; progress.state.clues = 2;
  progress.state.flags = ['witnessVisited', 'marketVisited'];
  const library = { schemaVersion: 1, players: [{ id: 'player-1', name: 'Игрок', createdAt: 1, lastPlayedAt: 2, progress }] };
  const restored = reconcilePlayers(library, restoreStoryCache(cache(oldStory.version), bundled).story);
  assert.deepEqual(restored.resetIds, []);
  assert.equal(restored.library.players[0].progress.sceneId, progress.sceneId);
  assert.deepEqual(restored.library.players[0].progress.state, progress.state);
  assert.equal(restored.library.players[0].progress.line, -1);
});

test('A same-version or newer downloaded release survives reopening, including revisions above nine', () => {
  for (const version of ['2026-10-14.2', '2026-10-14.10', '2026-10-15.1']) {
    const restored = restoreStoryCache(cache(version), bundled);
    assert.equal(restored.story.version, version);
    assert.equal(restored.baseUrl, 'https://example.com/game/');
  }
  const nextBundle = { ...bundled, story: { ...bundled.story, version: '2026-10-14.10' } };
  assert.equal(restoreStoryCache(cache('2026-10-14.2'), nextBundle), nextBundle);
});

test('Damaged caches, unsupported data and invalid image origins fall back to the bundled package', () => {
  for (const raw of [null, '', '{', 'null', '{}', cache('2026-10-15.1', null), cache('2026-10-15.1', 'https://'), cache('2026-10-15.1', 'javascript:alert(1)'), cache('2026-10-15.1', 'file:///tmp/game/')]) assert.equal(restoreStoryCache(raw, bundled), bundled);
  const damaged = JSON.parse(cache('2026-10-15.1')); damaged.story.scenes[0].next = 'missing';
  assert.equal(restoreStoryCache(JSON.stringify(damaged), bundled), bundled);
});

test('Custom version names remain compatible without assuming their release order', () => {
  assert.equal(restoreStoryCache(cache('custom'), bundled).story.version, 'custom');
  const customBundle = { ...bundled, story: { ...bundled.story, version: 'custom' } };
  assert.equal(restoreStoryCache(cache('2026-10-15.1'), customBundle).story.version, '2026-10-15.1');
});
