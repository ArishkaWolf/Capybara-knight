export const EVIDENCE_IDS = ['fur', 'paws', 'quill', 'wolfDisguise', 'falsePaw', 'tavernTag', 'marketInvoice', 'martaLedger', 'stolenBox', 'gangLedger'];
export const FLAG_IDS = ['sharedClues', 'wolvesTrusted', 'witnessVisited', 'marketVisited', 'millVisited', 'witnessSounds', 'marketWarned', 'helpedTikhon', 'tikhonTrusted', 'martaAccused', 'martaTrusted', 'recordsCompared', 'planWatch', 'planTikhon', 'planAudit', 'tikhonCooperating', 'caseProved', 'stayedToHelp', 'marketDeliveryKnown', 'salesRecordsRecovered', 'cargoSecured', 'cargoLost'];
export const initialState = () => ({ drink: null, courage: 0, clues: 0, helping: false, evidence: [], talkedToPorcupine: false, flags: [] });
const continuationEnding = () => ({ title: 'Продолжение следует', text: 'На этом пока всё.' });
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
const words = (value) => typeof value === 'string' && value.trim().length > 0;
const validEvidence = (items) => Array.isArray(items) && new Set(items).size === items.length && items.every((id) => EVIDENCE_IDS.includes(id));
const validFlags = (items) => Array.isArray(items) && new Set(items).size === items.length && items.every((id) => FLAG_IDS.includes(id));
const validState = (state) => record(state) && Object.keys(state).every((key) => key in initialState()) && (state.drink === null || words(state.drink)) && Number.isInteger(state.courage) && state.courage >= 0 && Number.isInteger(state.clues) && state.clues >= 0 && typeof state.helping === 'boolean' && (state.evidence === undefined || validEvidence(state.evidence)) && (state.talkedToPorcupine === undefined || typeof state.talkedToPorcupine === 'boolean') && (state.flags === undefined || validFlags(state.flags));
const validEnding = (ending) => record(ending) && words(ending.title) && words(ending.text);
const validCondition = (condition, depth = 0) => condition === undefined || (depth < 8 && record(condition) && Object.keys(condition).every((key) => ['drink', 'found', 'missing', 'talkedToPorcupine', 'flags', 'notFlags', 'atLeast', 'any', 'not'].includes(key)) && (condition.drink === undefined || words(condition.drink)) && (condition.found === undefined || validEvidence(condition.found)) && (condition.missing === undefined || validEvidence(condition.missing)) && (condition.talkedToPorcupine === undefined || typeof condition.talkedToPorcupine === 'boolean') && !(condition.found ?? []).some((id) => (condition.missing ?? []).includes(id)) && (condition.flags === undefined || validFlags(condition.flags)) && (condition.notFlags === undefined || validFlags(condition.notFlags)) && !(condition.flags ?? []).some((id) => (condition.notFlags ?? []).includes(id)) && (condition.atLeast === undefined || (record(condition.atLeast) && Object.keys(condition.atLeast).every((key) => ['flags', 'count'].includes(key)) && validFlags(condition.atLeast.flags) && Number.isInteger(condition.atLeast.count) && condition.atLeast.count > 0 && condition.atLeast.count <= condition.atLeast.flags.length)) && (condition.any === undefined || (Array.isArray(condition.any) && condition.any.length > 0 && condition.any.every((part) => record(part) && validCondition(part, depth + 1)))) && (condition.not === undefined || (record(condition.not) && validCondition(condition.not, depth + 1))));
const usesInvestigation = (condition) => condition && (['flags', 'notFlags', 'atLeast', 'any', 'not'].some((key) => condition[key] !== undefined) || [...(condition.found ?? []), ...(condition.missing ?? [])].some((id) => !['fur', 'paws', 'quill'].includes(id)));
const usesDrink = condition => condition && (condition.drink !== undefined || condition.any?.some(usesDrink) || usesDrink(condition.not));
const validLine = (line) => record(line) && words(line.speaker) && words(line.text) && validCondition(line.condition);
const validImageSize = (size) => record(size) && Number.isFinite(size.width) && size.width > 0 && Number.isFinite(size.height) && size.height > 0;
const validRect = (rect) => record(rect) && ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(rect[key])) && rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0 && rect.x + rect.width <= 1 && rect.y + rect.height <= 1;
const validOutline = (points, rect) => points === undefined || (Array.isArray(points) && points.length >= 3 && points.length <= 80 && points.every((point) => record(point) && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= rect.x - 1e-8 && point.y >= rect.y - 1e-8 && point.x <= rect.x + rect.width + 1e-8 && point.y <= rect.y + rect.height + 1e-8));

export function matchesCondition(condition, state) {
  const found = state.evidence ?? [];
  const flags = state.flags ?? [];
  return !condition || ((condition.drink === undefined || condition.drink === state.drink) && (condition.found ?? []).every((id) => found.includes(id)) && (condition.missing ?? []).every((id) => !found.includes(id)) && (condition.talkedToPorcupine === undefined || condition.talkedToPorcupine === (state.talkedToPorcupine ?? false)) && (condition.flags ?? []).every((id) => flags.includes(id)) && (condition.notFlags ?? []).every((id) => !flags.includes(id)) && (!condition.atLeast || condition.atLeast.flags.filter((id) => flags.includes(id)).length >= condition.atLeast.count) && (!condition.any || condition.any.some((part) => matchesCondition(part, state))) && (!condition.not || !matchesCondition(condition.not, state)));
}

export function sceneLines(scene, state) {
  return scene.dialogues.filter((line) => matchesCondition(line.condition, state));
}

export function sceneChoices(scene, state) {
  return (scene.choices ?? []).filter((choice) => matchesCondition(choice.condition, state));
}

export function nextScene(scene, state) {
  return scene.routes?.find((route) => matchesCondition(route.condition, state))?.next ?? scene.next;
}

export function validateStory(value) {
  if (!record(value) || ![1, 2, 3, 4, 5, 6].includes(value.schemaVersion) || !words(value.version) || !words(value.title) || !Array.isArray(value.scenes) || !value.scenes.length) throw new Error('Неподдерживаемый формат сюжета');
  const ids = new Set(value.scenes.map((scene) => scene?.id));
  if (ids.size !== value.scenes.length || !ids.has(value.startScene)) throw new Error('Некорректные идентификаторы сцен');
  const target = (id) => id === null || ids.has(id);
  for (const scene of value.scenes) {
    if (!record(scene) || !words(scene.id) || !words(scene.chapter) || !words(scene.image) || !/^photo\/[\p{L}\p{N}_-]+\.(png|jpe?g|webp)$/u.test(scene.image) || !target(scene.next) || !Array.isArray(scene.dialogues)) throw new Error('Некорректная сцена');
    if (scene.dialogues.some((line) => !validLine(line))) throw new Error('Некорректный диалог');
    if (value.schemaVersion < 4 && scene.dialogues.some((line) => line.condition?.talkedToPorcupine !== undefined)) throw new Error('Формат не поддерживает условия разговора');
    if (value.schemaVersion < 5 && (scene.routes !== undefined || scene.dialogues.some((line) => usesInvestigation(line.condition)))) throw new Error('Формат не поддерживает условия расследования');
    if (scene.routes !== undefined && (!Array.isArray(scene.routes) || !scene.routes.length || scene.routes.some((route) => !record(route) || !record(route.condition) || !validCondition(route.condition) || !words(route.next) || !ids.has(route.next)))) throw new Error('Некорректный условный маршрут');
    if (scene.search !== undefined) {
      const search = scene.search;
      if (value.schemaVersion < 2 || !record(search) || scene.choices || !words(search.finishLabel) || !validImageSize(search.imageSize) || !Array.isArray(search.hotspots) || !search.hotspots.length || new Set(search.hotspots.map((item) => item?.id)).size !== search.hotspots.length) throw new Error('Некорректная сцена осмотра');
      for (const hotspot of search.hotspots) {
        const rect = hotspot?.rect;
        if (!record(hotspot) || !EVIDENCE_IDS.includes(hotspot.id) || !words(hotspot.label) || !validRect(rect) || !validOutline(hotspot.outline, rect) || (hotspot.alwaysHighlight !== undefined && typeof hotspot.alwaysHighlight !== 'boolean') || !Array.isArray(hotspot.dialogues) || !hotspot.dialogues.length || hotspot.dialogues.some((line) => !validLine(line) || line.condition)) throw new Error('Некорректная область поиска');
        if (value.schemaVersion < 5 && !['fur', 'paws', 'quill'].includes(hotspot.id)) throw new Error('Формат не поддерживает новые улики');
      }
      if (search.title !== undefined && !words(search.title)) throw new Error('Некорректное название осмотра');
    }
    if (scene.interaction !== undefined) {
      const interaction = scene.interaction;
      if (value.schemaVersion < 3 || scene.search || scene.choices || scene.next === null || !record(interaction) || !words(interaction.id) || !words(interaction.label) || !validImageSize(interaction.imageSize) || !validRect(interaction.rect)) throw new Error('Некорректный обязательный предмет');
      if (['title', 'hint'].some((key) => interaction[key] !== undefined && !words(interaction[key]))) throw new Error('Некорректная подсказка предмета');
    }
    if (scene.choices !== undefined) {
      if (!Array.isArray(scene.choices) || !scene.choices.length || new Set(scene.choices.map((c) => c?.id)).size !== scene.choices.length) throw new Error('Некорректные варианты выбора');
      for (const choice of scene.choices) {
        if (!record(choice) || !words(choice.id) || !words(choice.label) || !target(choice.next) || !record(choice.effects) || !validState({ ...initialState(), ...choice.effects }) || Object.keys(choice.effects).some((key) => !(key in initialState())) || !validCondition(choice.condition) || (choice.ending !== undefined && (!validEnding(choice.ending) || choice.next !== null))) throw new Error('Некорректный вариант выбора');
        if (value.schemaVersion < 4 && choice.effects.talkedToPorcupine !== undefined) throw new Error('Формат не поддерживает состояние разговора');
        if (value.schemaVersion < 5 && (choice.condition !== undefined || choice.effects.flags !== undefined || (choice.effects.evidence ?? []).some((id) => !['fur', 'paws', 'quill'].includes(id)))) throw new Error('Формат не поддерживает выборы расследования');
      }
    }
    if (scene.board !== undefined) {
      const board = scene.board;
      if (value.schemaVersion < 6 || scene.search || scene.interaction || !record(board) || !words(board.id) || !words(board.title) || !words(board.hint) || !['notices', 'drinks'].includes(board.kind) || !validImageSize(board.imageSize) || !validRect(board.rect) || !Array.isArray(board.items) || !board.items.length || board.items.length > 12 || new Set(board.items.map(item => item?.id)).size !== board.items.length) throw new Error('Некорректная интерактивная доска');
      for (const item of board.items) {
        if (!record(item) || !words(item.id) || !words(item.title) || !words(item.text) || !validRect(item.rect) || item.rect.x < board.rect.x || item.rect.y < board.rect.y || item.rect.x + item.rect.width > board.rect.x + board.rect.width + 1e-8 || item.rect.y + item.rect.height > board.rect.y + board.rect.height + 1e-8) throw new Error('Некорректный пункт доски');
      }
      if (board.kind === 'drinks' && (!scene.choices || scene.choices.length !== board.items.length || board.items.some(item => !scene.choices.some(choice => choice.id === item.id && words(choice.effects.drink) && !choice.condition)))) throw new Error('Напитки на доске не совпадают с выбором');
      if (board.kind === 'notices' && scene.choices) throw new Error('Объявления не могут заменять сюжетный выбор');
    }
    if (value.schemaVersion < 6 && [...scene.dialogues, ...(scene.choices ?? []), ...(scene.routes ?? [])].some(item => usesDrink(item.condition))) throw new Error('Формат не поддерживает условия напитков');
  }
  if (value.chapters !== undefined) {
    if (value.schemaVersion < 6 || !Array.isArray(value.chapters) || !value.chapters.length || new Set(value.chapters.map(chapter => chapter?.id)).size !== value.chapters.length) throw new Error('Некорректный список глав');
    const assigned = new Set();
    for (const chapter of value.chapters) {
      if (!record(chapter) || !words(chapter.id) || !words(chapter.title) || !Array.isArray(chapter.scenes) || !chapter.scenes.length) throw new Error('Некорректная глава');
      for (const id of chapter.scenes) {
        if (!ids.has(id) || assigned.has(id)) throw new Error('Сцена отсутствует или относится к нескольким главам');
        assigned.add(id);
      }
    }
    if (assigned.size !== ids.size) throw new Error('Не все сцены отнесены к главам');
  }
  return value;
}

const copyState = state => ({ ...initialState(), ...state, evidence: [...(state.evidence ?? [])], flags: [...(state.flags ?? [])] });

function checkpoint(story, progress, partial = false) {
  const chapter = story.chapters?.find(item => item.scenes.includes(progress.sceneId));
  if (!chapter || progress.history?.some(item => item.chapterId === chapter.id)) return progress;
  const saved = { chapterId: chapter.id, sceneId: progress.sceneId, state: copyState(progress.state), ...(partial ? { partial: true } : {}) };
  return { ...progress, history: [...(progress.history ?? []), saved] };
}

export function rewindChapter(story, progress, chapterId) {
  const index = progress.history?.findIndex(item => item.chapterId === chapterId) ?? -1;
  if (index < 0) return progress;
  const saved = progress.history[index];
  if (!validState(saved.state) || !story.chapters?.some(item => item.id === chapterId && item.scenes.includes(saved.sceneId))) return progress;
  return { version: story.version, sceneId: saved.sceneId, line: -1, state: copyState(saved.state), ending: null, history: progress.history.slice(0, index + 1).map(item => ({ ...item, state: copyState(item.state) })) };
}

export function dialogueForPlayer(line, name) {
  const player = name || 'Путник';
  return { ...line, speaker: line.speaker.replace(/^Капибара(?=$| · )/u, () => player), text: line.text.split('{playerName}').join(player) };
}

export function newProgress(story) {
  return checkpoint(story, { version: story.version, sceneId: story.startScene, line: -1, state: initialState(), ending: null });
}

export function reconcileProgress(story, saved) {
  if (!record(saved) || !validState(saved.state) || !Number.isInteger(saved.line) || saved.line < -1 || (saved.ending !== null && !validEnding(saved.ending))) return { progress: newProgress(story), reset: Boolean(saved) };
  const scene = story.scenes.find((item) => item.id === saved.sceneId);
  if (!scene) return { progress: newProgress(story), reset: true };
  const changed = saved.version !== story.version;
  const state = { ...initialState(), ...saved.state };
  const legacyNightResolved = ['2026-10-11.1', '2026-10-12.1'].includes(saved.version) && ['scen23-2', 'scen24', 'scen24-1', 'scen24-2', 'scen24-3', 'scen24-4', 'scen24-5', 'scen25', 'scen26', 'scen27', 'scen27-1', 'scen28'].includes(scene.id);
  if (changed && legacyNightResolved) state.flags = [...new Set([...state.flags, 'cargoSecured', ...(state.flags.includes('tikhonCooperating') && state.evidence.includes('gangLedger') ? ['salesRecordsRecovered'] : [])])];
  const ending = changed ? null : saved.ending && scene.next === null && !scene.choices ? continuationEnding() : saved.ending;
  const progress = { version: story.version, sceneId: scene.id, line: changed ? -1 : Math.min(saved.line, sceneLines(scene, state).length - 1), state, ending };
  if (story.chapters) {
    const history = [];
    const seen = new Set();
    for (const item of Array.isArray(saved.history) ? saved.history.slice(0, story.chapters.length) : []) {
      if (!record(item) || !validState(item.state) || seen.has(item.chapterId) || (item.partial !== undefined && typeof item.partial !== 'boolean') || !story.chapters.some(chapter => chapter.id === item.chapterId && chapter.scenes.includes(item.sceneId))) break;
      seen.add(item.chapterId);
      history.push({ chapterId: item.chapterId, sceneId: item.sceneId, state: copyState(item.state), ...(item.partial ? { partial: true } : {}) });
    }
    progress.history = history.length ? history : checkpoint(story, progress, true).history;
  }
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
  if (sceneChoices(scene, progress.state).length) return progress;
  return goTo(story, progress, nextScene(scene, progress.state));
}

function goTo(story, progress, next, ending) {
  if (next === null) return { ...progress, ending: ending ?? continuationEnding() };
  if (!story.scenes.some((scene) => scene.id === next)) throw new Error('Следующая сцена отсутствует');
  return checkpoint(story, { ...progress, sceneId: next, line: -1, ending: null, ...(progress.searching !== undefined ? { searching: false } : {}), ...(progress.interacting !== undefined ? { interacting: false } : {}) });
}

export function choose(story, progress, choiceId) {
  if (progress.ending) return progress;
  const scene = story.scenes.find((item) => item.id === progress.sceneId);
  if (!scene || progress.searching || progress.interacting || progress.line < sceneLines(scene, progress.state).length - 1) return progress;
  const choice = sceneChoices(scene, progress.state).find((item) => item.id === choiceId);
  if (!choice) return progress;
  const state = { ...progress.state };
  for (const [key, value] of Object.entries(choice.effects)) {
    state[key] = Array.isArray(value) ? [...new Set([...(state[key] ?? []), ...value])] : typeof value === 'number' ? state[key] + value : value;
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
  return scene?.search ? goTo(story, progress, nextScene(scene, progress.state)) : progress;
}

export function interact(story, progress, itemId) {
  if (progress.ending || !progress.interacting || progress.searching) return progress;
  const scene = story.scenes.find((item) => item.id === progress.sceneId);
  if (scene?.interaction?.id !== itemId) return progress;
  const opened = goTo(story, progress, scene.next);
  const target = story.scenes.find((item) => item.id === opened.sceneId);
  return { ...opened, line: sceneLines(target, opened.state).length ? 0 : -1 };
}
