import { reconcileProgress } from './engine.mjs';

export const PROFILE_KEY = 'capybara.players.v1';
export const LEGACY_SAVE_KEY = 'capybara.progress.v1';
export const emptyProfiles = () => ({ schemaVersion: 1, players: [] });
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const timestamp = (value) => Number.isSafeInteger(value) && value >= 0;

export function normalizePlayerName(name) {
  if (typeof name !== 'string') throw new Error('Введи имя игрока.');
  const normalized = name.trim().replace(/\s+/gu, ' ');
  if (!normalized || normalized.length > 40 || /[\u0000-\u001f\u007f]/u.test(normalized)) throw new Error('Имя должно содержать от 1 до 40 символов.');
  return normalized;
}

function checkName(library, name, exceptId = null) {
  const normalized = normalizePlayerName(name);
  if (library.players.some((player) => player.id !== exceptId && player.name.toLocaleLowerCase('ru-RU') === normalized.toLocaleLowerCase('ru-RU'))) {
    throw new Error('Игрок с таким именем уже есть. Выбери другое имя.');
  }
  return normalized;
}

function uniqueId(library, now) {
  let id;
  do { id = `player-${now.toString(36)}-${Math.random().toString(36).slice(2, 12)}`; }
  while (library.players.some((player) => player.id === id));
  return id;
}

export function addPlayer(library, name, now = Date.now()) {
  const player = { id: uniqueId(library, now), name: checkName(library, name), createdAt: now, lastPlayedAt: null, progress: null };
  return { library: { ...library, players: [...library.players, player] }, player };
}

export function renamePlayer(library, id, name) {
  if (!library.players.some((player) => player.id === id)) throw new Error('Игрок не найден.');
  const normalized = checkName(library, name, id);
  return { ...library, players: library.players.map((player) => player.id === id ? { ...player, name: normalized } : player) };
}

export function updatePlayerProgress(library, id, progress, now = Date.now()) {
  if (!library.players.some((player) => player.id === id)) throw new Error('Игрок не найден.');
  return { ...library, players: library.players.map((player) => player.id === id ? { ...player, progress, lastPlayedAt: now } : player) };
}

export function reconcilePlayers(library, story) {
  const resetIds = [];
  const players = library.players.map((player) => {
    if (!player.progress) return player;
    const result = reconcileProgress(story, player.progress);
    if (result.reset) resetIds.push(player.id);
    return { ...player, progress: result.reset ? null : result.progress };
  });
  return { library: { ...library, players }, resetIds };
}

export function restoreProfileLibrary(raw, legacy, story, now = Date.now()) {
  if (raw === null) {
    if (!legacy) return { library: emptyProfiles(), migrated: false, damaged: false, resetIds: [] };
    let saved;
    try { saved = JSON.parse(legacy); } catch { return { library: emptyProfiles(), migrated: false, damaged: true, resetIds: [] }; }
    const result = reconcileProgress(story, saved);
    if (!saved || result.reset) return { library: emptyProfiles(), migrated: false, damaged: Boolean(saved), resetIds: [] };
    const player = { id: 'legacy-player', name: 'Игрок 1', createdAt: now, lastPlayedAt: null, progress: result.progress };
    return { library: { schemaVersion: 1, players: [player] }, migrated: true, damaged: false, resetIds: [] };
  }

  let parsed;
  try { parsed = JSON.parse(raw); } catch { return { library: emptyProfiles(), migrated: false, damaged: true, resetIds: [] }; }
  if (!record(parsed) || parsed.schemaVersion !== 1 || !Array.isArray(parsed.players)) {
    return { library: emptyProfiles(), migrated: false, damaged: true, resetIds: [] };
  }
  let damaged = false;
  const ids = new Set();
  const players = [];
  for (const player of parsed.players) {
    try {
      if (!record(player) || typeof player.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/u.test(player.id) || ids.has(player.id) || !timestamp(player.createdAt) || (player.lastPlayedAt !== null && !timestamp(player.lastPlayedAt))) throw new Error('Invalid profile');
      const name = normalizePlayerName(player.name);
      ids.add(player.id);
      if (player.progress === undefined) damaged = true;
      players.push({ id: player.id, name, createdAt: player.createdAt, lastPlayedAt: player.lastPlayedAt, progress: player.progress ?? null });
    } catch { damaged = true; }
  }
  const reconciled = reconcilePlayers({ schemaVersion: 1, players }, story);
  return { ...reconciled, migrated: false, damaged };
}

export function createProfileStorage(storage) {
  let queue = Promise.resolve();
  function save(library) {
    const serialized = JSON.stringify(library);
    const operation = queue.catch(() => undefined).then(() => storage.setItem(PROFILE_KEY, serialized));
    queue = operation.then(() => undefined);
    return queue;
  }
  async function load(story) {
    let raw, legacy;
    try { [raw, legacy] = await Promise.all([storage.getItem(PROFILE_KEY), storage.getItem(LEGACY_SAVE_KEY)]); }
    catch { return { library: emptyProfiles(), migrated: false, damaged: false, resetIds: [], storageAvailable: false }; }
    const restored = restoreProfileLibrary(raw, legacy, story);
    let storageAvailable = true;
    if (restored.migrated) {
      try { await save(restored.library); } catch { storageAvailable = false; }
    }
    return { ...restored, storageAvailable };
  }
  return { load, save };
}
