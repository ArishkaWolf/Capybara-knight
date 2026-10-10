export const EVIDENCE_IDS = ['fur', 'paws', 'quill'];
export const initialState = () => ({ drink: null, courage: 0, clues: 0, helping: false, evidence: [], talkedToPorcupine: false });
const continuationEnding = () => ({ title: 'Продолжение следует', text: 'На этом пока всё.' });
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
const words = (value) => typeof value === 'string' && value.trim().length > 0;
const validEvidence = (items) => Array.isArray(items) && new Set(items).size === items.length && items.every((id) => EVIDENCE_IDS.includes(id));
const validState = (state) => record(state) && Object.keys(state).every((key) => key in initialState()) && (state.drink === null || words(state.drink)) && Number.isInteger(state.courage) && state.courage >= 0 && Number.isInteger(state.clues) && state.clues >= 0 && typeof state.helping === 'boolean' && (state.evidence === undefined || validEvidence(state.evidence)) && (state.talkedToPorcupine === undefined || typeof state.talkedToPorcupine === 'boolean');
const validEnding = (ending) => record(ending) && words(ending.title) && words(ending.text);
const validCondition = (condition) => condition === undefined || (record(condition) && Object.keys(condition).every((key) => ['found', 'missing', 'talkedToPorcupine'].includes(key)) && (condition.found === undefined || validEvidence(condition.found)) && (condition.missing === undefined || validEvidence(condition.missing)) && (condition.talkedToPorcupine === undefined || typeof condition.talkedToPorcupine === 'boolean') && !(condition.found ?? []).some((id) => (condition.missing ?? []).includes(id)));
const validLine = (line) => record(line) && words(line.speaker) && words(line.text) && validCondition(line.condition);
const validImageSize = (size) => record(size) && Number.isFinite(size.width) && size.width > 0 && Number.isFinite(size.height) && size.height > 0;
const validRect = (rect) => record(rect) && ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(rect[key])) && rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0 && rect.x + rect.width <= 1 && rect.y + rect.height <= 1;

export function matchesCondition(condition, state) {
  const found = state.evidence ?? [];
  return !condition || ((condition.found ?? []).every((id) => found.includes(id)) && (condition.missing ?? []).every((id) => !found.includes(id)) && (condition.talkedToPorcupine === undefined || condition.talkedToPorcupine === (state.talkedToPorcupine ?? false)));
}

export function sceneLines(scene, state) {
  return scene.dialogues.filter((line) => matchesCondition(line.condition, state));
}

// Reject broken deployments before replacing the current playable story.
export function validateStory(value) {
  if (!record(value) || ![1, 2, 3, 4].includes(value.schemaVersion) || !words(value.version) || !words(value.title) || !Array.isArray(value.scenes) || !value.scenes.length) throw new Error('Неподдерживаемый формат сюжета');
  const ids = new Set(value.scenes.map((scene) => scene?.id));
  if (ids.size !== value.scenes.length || !ids.has(value.startScene)) throw new Error('Некорректные идентификаторы сцен');
  const target = (id) => id === null || ids.has(id);
  for (const scene of value.scenes) {
    if (!record(scene) || !words(scene.id) || !words(scene.chapter) || !words(scene.image) || !/^photo\/[\p{L}\p{N}_-]+\.(png|jpe?g|webp)$/u.test(scene.image) || !target(scene.next) || !Array.isArray(scene.dialogues)) throw new Error('Некорректная сцена');
    if (scene.dialogues.some((line) => !validLine(line))) throw new Error('Некорректный диалог');
    if (value.schemaVersion < 4 && scene.dialogues.some((line) => line.condition?.talkedToPorcupine !== undefined)) throw new Error('Формат не поддерживает условия разговора');
    if (scene.search !== undefined) {
      const search = scene.search;
      if (value.schemaVersion < 2 || !record(search) || scene.choices || !words(search.finishLabel) || !validImageSize(search.imageSize) || !Array.isArray(search.hotspots) || !search.hotspots.length || new Set(search.hotspots.map((item) => item?.id)).size !== search.hotspots.length) throw new Error('Некорректная сцена осмотра');
      for (const hotspot of search.hotspots) {
        const rect = hotspot?.rect;
        if (!record(hotspot) || !EVIDENCE_IDS.includes(hotspot.id) || !words(hotspot.label) || !validRect(rect) || !Array.isArray(hotspot.dialogues) || !hotspot.dialogues.length || hotspot.dialogues.some((line) => !validLine(line) || line.condition)) throw new Error('Некорректная область поиска');
      }
    }
    if (scene.interaction !== undefined) {
      const interaction = scene.interaction;
      if (value.schemaVersion < 3 || scene.search || scene.choices || scene.next === null || !record(interaction) || !words(interaction.id) || !words(interaction.label) || !validImageSize(interaction.imageSize) || !validRect(interaction.rect)) throw new Error('Некорректный обязательный предмет');
    }
    if (scene.choices !== undefined) {
      if (!Array.isArray(scene.choices) || !scene.choices.length || new Set(scene.choices.map((c) => c?.id)).size !== scene.choices.length) throw new Error('Некорректные варианты выбора');
      for (const choice of scene.choices) {
        if (!record(choice) || !words(choice.id) || !words(choice.label) || !target(choice.next) || !record(choice.effects) || !validState({ ...initialState(), ...choice.effects }) || Object.keys(choice.effects).some((key) => !(key in initialState())) || (choice.ending !== undefined && (!validEnding(choice.ending) || choice.next !== null))) throw new Error('Некорректный вариант выбора');
        if (value.schemaVersion < 4 && choice.effects.talkedToPorcupine !== undefined) throw new Error('Формат не поддерживает состояние разговора');
      }
    }
  }
  return value;
}

export function newProgress(story) {
  return { version: story.version, sceneId: story.startScene, line: -1, state: initialState(), ending: null };
}

// Scene IDs survive reordering. If a scene is removed, restart safely.
// On a new version reopen the scene, so new dialogue or choices cannot be skipped.
export function reconcileProgress(story, saved) {
  if (!record(saved) || !validState(saved.state) || !Number.isInteger(saved.line) || saved.line < -1 || (saved.ending !== null && !validEnding(saved.ending))) return { progress: newProgress(story), reset: Boolean(saved) };
  const scene = story.scenes.find((item) => item.id === saved.sceneId);
  if (!scene) return { progress: newProgress(story), reset: true };
  const changed = saved.version !== story.version;
  const state = { ...initialState(), ...saved.state };
  const ending = changed ? null : saved.ending && scene.next === null && !scene.choices ? continuationEnding() : saved.ending;
  const progress = { version: story.version, sceneId: scene.id, line: changed ? -1 : Math.min(saved.line, sceneLines(scene, state).length - 1), state, ending };
  if (!changed && saved.searching === true && scene.search && !progress.ending) progress.searching = true;
  if (!changed && saved.interacting === true && scene.interaction && !progress.ending) progress.interacting = true;
  return { progress, reset: false };
}

export function advance(story, progress) {
  if (progress.ending) return progress;
  const scene = story.scenes.find((item) => item.id === progress.sceneId);
  if (!scene) return newProgress(story);
  if (progress.searching || progress.interacting) return progress;
  if (progress.line < sceneLines(scene, progress.state).length - 1) return { ...progress, line: progress.line + 1 };
  if (scene.search) return { ...progress, line: -1, searching: true };
  if (scene.interaction) return { ...progress, line: -1, interacting: true };
  if (scene.choices?.length) return progress;
  return goTo(story, progress, scene.next);
}

function goTo(story, progress, next, ending) {
  if (next === null) return { ...progress, ending: ending ?? continuationEnding() };
  if (!story.scenes.some((scene) => scene.id === next)) throw new Error('Следующая сцена отсутствует');
  return { ...progress, sceneId: next, line: -1, ending: null, ...(progress.searching !== undefined ? { searching: false } : {}), ...(progress.interacting !== undefined ? { interacting: false } : {}) };
}

export function choose(story, progress, choiceId) {
  if (progress.ending) return progress;
  const scene = story.scenes.find((item) => item.id === progress.sceneId);
  if (!scene || progress.searching || progress.interacting || progress.line < sceneLines(scene, progress.state).length - 1) return progress;
  const choice = scene.choices?.find((item) => item.id === choiceId);
  if (!choice) return progress;
  const state = { ...progress.state };
  for (const [key, value] of Object.entries(choice.effects)) {
    state[key] = typeof value === 'number' ? state[key] + value : value;
  }
  return goTo(story, { ...progress, state }, choice.next, choice.ending);
}

export function inspect(story, progress, clueId) {
  if (progress.ending || !progress.searching) return progress;
  const scene = story.scenes.find((item) => item.id === progress.sceneId);
  if (!scene?.search?.hotspots.some((item) => item.id === clueId)) return progress;
  const evidence = progress.state.evidence ?? [];
  if (evidence.includes(clueId)) return progress;
  return { ...progress, state: { ...progress.state, evidence: [...evidence, clueId], clues: progress.state.clues + 1 } };
}

export function finishSearch(story, progress) {
  if (progress.ending || !progress.searching) return progress;
  const scene = story.scenes.find((item) => item.id === progress.sceneId);
  return scene?.search ? goTo(story, progress, scene.next) : progress;
}

export function interact(story, progress, itemId) {
  if (progress.ending || !progress.interacting || progress.searching) return progress;
  const scene = story.scenes.find((item) => item.id === progress.sceneId);
  if (scene?.interaction?.id !== itemId) return progress;
  const opened = goTo(story, progress, scene.next);
  const target = story.scenes.find((item) => item.id === opened.sceneId);
  return { ...opened, line: sceneLines(target, opened.state).length ? 0 : -1 };
}
