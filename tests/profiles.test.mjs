import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { newProgress, validateStory } from '../src/engine.mjs';
import { addPlayer, createProfileStorage, emptyProfiles, LEGACY_SAVE_KEY, normalizePlayerName, PROFILE_KEY, reconcilePlayers, renamePlayer, restoreProfileLibrary, updatePlayerProgress } from '../src/profiles.mjs';

const story = validateStory(JSON.parse(await readFile(new URL('../public/story.json', import.meta.url), 'utf8')));
const saved = (sceneId, line = 0) => ({ ...newProgress(story), sceneId, line });
function twoPlayers() {
  const first = addPlayer(emptyProfiles(), 'Арина', 1000);
  const second = addPlayer(first.library, 'Саша', 1001);
  return { library: second.library, arina: first.player.id, sasha: second.player.id };
}
function memoryStorage(entries = []) {
  const data = new Map(entries);
  return { data, getItem: async (key) => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, value); } };
}

test('Names are normalized; empty, overly long and duplicate names cannot create players', () => {
  assert.equal(normalizePlayerName('  Арина   Иванова  '), 'Арина Иванова');
  const { library, arina } = twoPlayers();
  for (const name of ['', ' \n ', 'x'.repeat(41), '\u0000Арина', ' АРИНА ']) assert.throws(() => addPlayer(library, name));
  assert.throws(() => renamePlayer(library, arina, 'саша'));
  assert.equal(renamePlayer(library, arina, 'АРИНА').players[0].name, 'АРИНА');
  assert.equal(library.players.length, 2);
});

test('Each player retains independent dialogue, decisions, clues, interactions and last-played date', () => {
  const { library, arina, sasha } = twoPlayers();
  const room = { ...saved('scen8-2', -1), searching: true, state: { ...newProgress(story).state, drink: 'Травяной чай', evidence: ['fur', 'quill'], clues: 2, helping: true } };
  const note = { ...saved('scen9', -1), interacting: true };
  const updated = updatePlayerProgress(updatePlayerProgress(library, arina, room, 2000), sasha, note, 3000);
  const restored = restoreProfileLibrary(JSON.stringify(updated), null, story).library;
  assert.deepEqual(restored.players.find((player) => player.id === arina).progress, room);
  assert.deepEqual(restored.players.find((player) => player.id === sasha).progress, note);
  assert.equal(restored.players[0].lastPlayedAt, 2000);
  assert.equal(restored.players[1].lastPlayedAt, 3000);
  assert.equal(library.players[0].progress, null);
});

test('Renaming preserves identity, creation date and all progress; restarting affects only one player', () => {
  const { library, arina, sasha } = twoPlayers();
  const played = updatePlayerProgress(updatePlayerProgress(library, arina, saved('scen8-2'), 2000), sasha, saved('scen4-2'), 3000);
  const renamed = renamePlayer(played, arina, 'Арина Иванова');
  assert.deepEqual(renamed.players[0], { ...played.players[0], name: 'Арина Иванова' });
  const restarted = updatePlayerProgress(renamed, arina, newProgress(story), 4000);
  assert.deepEqual(restarted.players[1], played.players[1]);
  assert.equal(restarted.players[0].id, arina);
  assert.equal(restarted.players[0].createdAt, 1000);
  assert.equal(restarted.players[0].progress.sceneId, story.startScene);
  assert.throws(() => updatePlayerProgress(library, 'unknown-player', saved('scen1')));
});

test('Legacy progress migrates once and is kept as a backup through rename and new players', async () => {
  const legacy = JSON.stringify(saved('scen7-6', 0));
  const storage = memoryStorage([[LEGACY_SAVE_KEY, legacy]]);
  const repository = createProfileStorage(storage);
  const migrated = await repository.load(story);
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.library.players.length, 1);
  assert.equal(migrated.library.players[0].name, 'Игрок 1');
  assert.deepEqual(migrated.library.players[0].progress, JSON.parse(legacy));
  const renamed = renamePlayer(migrated.library, 'legacy-player', 'Арина');
  const second = addPlayer(renamed, 'Саша');
  await repository.save(second.library);
  const reloaded = await createProfileStorage(storage).load(story);
  assert.equal(reloaded.migrated, false);
  assert.deepEqual(reloaded.library, second.library);
  assert.equal(storage.data.get(LEGACY_SAVE_KEY), legacy);
});

test('Updates reconcile every player independently without changing last-played dates or fresh profiles', () => {
  const { library, arina, sasha } = twoPlayers();
  const played = updatePlayerProgress(updatePlayerProgress(library, arina, saved('scen8-2', 1), 2000), sasha, saved('scen4-2', 0), 3000);
  const fresh = addPlayer(played, 'Новый игрок', 4000);
  const nextStory = { ...story, version: 'updated', scenes: [...story.scenes].reverse() };
  const updated = reconcilePlayers(fresh.library, nextStory);
  assert.deepEqual(updated.resetIds, []);
  for (const player of updated.library.players.slice(0, 2)) {
    const previous = played.players.find((item) => item.id === player.id);
    assert.equal(player.progress.sceneId, previous.progress.sceneId);
    assert.equal(player.progress.line, -1);
    assert.equal(player.progress.version, 'updated');
    assert.deepEqual(player.progress.state, previous.progress.state);
    assert.equal(player.lastPlayedAt, previous.lastPlayedAt);
  }
  assert.deepEqual(updated.library.players[2], fresh.player);
  const removedScene = { ...nextStory, scenes: nextStory.scenes.filter((scene) => scene.id !== 'scen8-2') };
  const removed = reconcilePlayers(played, removedScene);
  assert.deepEqual(removed.resetIds, [arina]);
  assert.equal(removed.library.players[0].progress, null);
  assert.equal(removed.library.players[1].progress.sceneId, 'scen4-2');
});

test('One damaged save or malformed profile cannot erase another player or remigrate the legacy save', () => {
  const { library, arina, sasha } = twoPlayers();
  const played = updatePlayerProgress(updatePlayerProgress(library, arina, saved('scen8-2'), 2000), sasha, saved('scen4-2'), 3000);
  const damaged = structuredClone(played);
  damaged.players[0].progress.state = {};
  damaged.players.push({ id: sasha, name: 'Дубликат', createdAt: 4000, lastPlayedAt: null, progress: null });
  damaged.players.push({ id: 'bad', name: '', createdAt: 4000, lastPlayedAt: null, progress: null });
  const restored = restoreProfileLibrary(JSON.stringify(damaged), JSON.stringify(saved('scen1')), story);
  assert.equal(restored.damaged, true);
  assert.equal(restored.migrated, false);
  assert.equal(restored.library.players.length, 2);
  assert.deepEqual(restored.resetIds, [arina]);
  assert.equal(restored.library.players[0].progress, null);
  assert.deepEqual(restored.library.players[1], played.players[1]);
  const empty = restoreProfileLibrary(JSON.stringify(emptyProfiles()), JSON.stringify(saved('scen1')), story);
  assert.equal(empty.library.players.length, 0);
  assert.equal(empty.migrated, false);
});

test('Unreadable storage and failed migrations keep saves available without touching the legacy key', async () => {
  const unavailable = createProfileStorage({ getItem: async () => { throw new Error('Storage disabled'); }, setItem: async () => { throw new Error('Storage disabled'); } });
  const failedRead = await unavailable.load(story);
  assert.equal(failedRead.storageAvailable, false);
  assert.equal(failedRead.library.players.length, 0);
  const legacy = JSON.stringify(saved('scen7-6'));
  const storage = memoryStorage([[LEGACY_SAVE_KEY, legacy]]);
  storage.setItem = async () => { throw new Error('Quota exceeded'); };
  const failedMigration = await createProfileStorage(storage).load(story);
  assert.equal(failedMigration.storageAvailable, false);
  assert.deepEqual(failedMigration.library.players[0].progress, JSON.parse(legacy));
  assert.equal(storage.data.get(LEGACY_SAVE_KEY), legacy);
  assert.equal(storage.data.has(PROFILE_KEY), false);
  for (const raw of ['{broken', '{"schemaVersion":99,"players":[]}']) assert.equal(restoreProfileLibrary(raw, null, story).damaged, true);
});

test('Slow writes remain ordered during rapid player switching and capture their own snapshots', async () => {
  const { library, arina, sasha } = twoPlayers();
  const storage = memoryStorage();
  const writes = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  storage.setItem = async (key, value) => {
    writes.push(JSON.parse(value));
    if (writes.length === 1) await gate;
    storage.data.set(key, value);
  };
  const repository = createProfileStorage(storage);
  const first = updatePlayerProgress(library, arina, saved('scen8-2'), 2000);
  const second = updatePlayerProgress(first, sasha, saved('scen4-2'), 3000);
  const third = renamePlayer(second, arina, 'Арина Иванова');
  const pending = [repository.save(first), repository.save(second), repository.save(third)];
  await Promise.resolve(); await Promise.resolve();
  assert.equal(writes.length, 1);
  release();
  await Promise.all(pending);
  assert.deepEqual(writes, [first, second, third]);
  assert.deepEqual(JSON.parse(storage.data.get(PROFILE_KEY)), third);
});

test('A failed write cannot poison later profile saves', async () => {
  const { library, arina, sasha } = twoPlayers();
  const storage = memoryStorage();
  let fail = true;
  storage.setItem = async (key, value) => {
    if (fail) { fail = false; throw new Error('Temporary storage failure'); }
    storage.data.set(key, value);
  };
  const repository = createProfileStorage(storage);
  const first = updatePlayerProgress(library, arina, saved('scen8-2'), 2000);
  await assert.rejects(repository.save(first));
  const second = updatePlayerProgress(first, sasha, saved('scen4-2'), 3000);
  await repository.save(second);
  assert.deepEqual((await repository.load(story)).library, second);
});
