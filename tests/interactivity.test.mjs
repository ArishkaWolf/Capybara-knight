import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { advance, choose, dialogueForPlayer, finishSearch, inspect, newProgress, reconcileProgress, rewindChapter, sceneChoices, sceneLines, validateStory } from '../src/engine.mjs';
import { addPlayer, emptyProfiles, renamePlayer, restoreProfileLibrary, updatePlayerProgress } from '../src/profiles.mjs';
import { imageFrame, hotspotBox } from '../src/geometry.mjs';

const story = validateStory(JSON.parse(await readFile(new URL('../public/story.json', import.meta.url), 'utf8')));
const scene = id => story.scenes.find(item => item.id === id);
function travel(progress, target, drink = 'drink-0') {
  for (let count = 0; count < 500; count++) {
    if (progress.sceneId === target) return progress;
    const current = scene(progress.sceneId);
    const choices = sceneChoices(current, progress.state);
    if (progress.searching) progress = finishSearch(story, progress);
    else if (choices.length && progress.line === sceneLines(current, progress.state).length - 1) progress = choose(story, progress, current.id === 'scen4-1' ? drink : current.id === 'scen7-7' ? 'investigate' : choices[0].id);
    else progress = advance(story, progress);
  }
  throw new Error(`Cannot reach ${target}`);
}

test('The active profile supplies the hero name, including thoughts, renamed profiles and literal special characters', () => {
  const first = addPlayer(emptyProfiles(), 'Арина', 1);
  const second = addPlayer(first.library, 'Миша', 2);
  const line = { speaker: 'Капибара · мысли', text: 'Добрый вечер, {playerName}.' };
  for (const player of second.library.players) assert.deepEqual(dialogueForPlayer(line, player.name), { speaker: `${player.name} · мысли`, text: `Добрый вечер, ${player.name}.` });
  const renamed = renamePlayer(second.library, first.player.id, '$& Рыцарь');
  assert.equal(dialogueForPlayer({ speaker: 'Капибара', text: '{playerName}' }, renamed.players[0].name).speaker, '$& Рыцарь');
  assert.equal(dialogueForPlayer(line, renamed.players[0].name).text, 'Добрый вечер, $& Рыцарь.');
  assert.equal(dialogueForPlayer({ speaker: 'Игнат', text: 'Капибара-паук' }, 'Арина').text, 'Капибара-паук');
  assert.equal(line.speaker, 'Капибара · мысли');
});

test('All six board drinks persist and produce exactly their own distinct serving dialogue', () => {
  const menu = scene('scen4-1');
  const answers = new Set();
  const ready = { ...newProgress(story), sceneId: menu.id, line: menu.dialogues.length - 1 };
  for (const item of menu.board.items) {
    const served = choose(story, ready, item.id);
    assert.equal(served.state.drink, item.title);
    const lines = sceneLines(scene('scen4-2'), served.state);
    assert.equal(lines.length, 4);
    assert.equal(lines[0].speaker, 'Игнат');
    assert.equal(lines[1].speaker, 'Капибара');
    answers.add(lines[0].text);
    assert.equal(reconcileProgress(story, JSON.parse(JSON.stringify(served))).progress.state.drink, item.title);
  }
  assert.equal(answers.size, 6);
  assert.equal(sceneLines(scene('scen4-2'), ready.state).length, 3);
  assert.equal(sceneLines(scene('scen4-2'), { ...ready.state, drink: 'Старый напиток' }).length, 3);
});

test('Returning to the tavern rolls back evidence, later flags, drink choice and future checkpoints', () => {
  let progress = travel(newProgress(story), 'scen8-2');
  while (!progress.searching) progress = advance(story, progress);
  progress = inspect(story, progress, 'quill');
  progress = { ...progress, state: { ...progress.state, flags: ['sharedClues'] } };
  const before = structuredClone(progress);
  const restored = rewindChapter(story, progress, 'tavern');
  assert.equal(restored.sceneId, 'scen3');
  assert.equal(restored.line, -1);
  assert.deepEqual(restored.state.evidence, []);
  assert.deepEqual(restored.state.flags, []);
  assert.equal(restored.state.drink, null);
  assert.equal(restored.state.helping, false);
  assert.equal(restored.searching, undefined);
  assert.deepEqual(restored.history.map(item => item.chapterId), ['road', 'tavern']);
  assert.deepEqual(progress, before);
  const nextDrink = travel(restored, 'scen4-2', 'drink-4');
  assert.equal(nextDrink.state.drink, 'Какао с зефиром');
  assert.equal(rewindChapter(story, restored, 'epilogue'), restored);
  assert.equal(rewindChapter(story, restored, 'clues'), restored);
});

test('Chapter entry preserves decisions made earlier, without mutating snapshot arrays', () => {
  const progress = travel(newProgress(story), 'scen8');
  const later = { ...progress, state: { ...progress.state, evidence: ['fur'], flags: ['caseProved'], clues: 1 } };
  const restored = rewindChapter(story, later, 'clues');
  assert.equal(restored.sceneId, 'scen8');
  assert.equal(restored.state.drink, 'Травяной чай');
  assert.equal(restored.state.helping, true);
  assert.equal(restored.state.courage, 1);
  assert.deepEqual(restored.state.evidence, []);
  restored.state.evidence.push('quill');
  assert.deepEqual(progress.history.find(item => item.chapterId === 'clues').state.evidence, []);
});

test('Chapter history survives storage and stays independent for each player', () => {
  const first = addPlayer(emptyProfiles(), 'Арина', 1);
  const second = addPlayer(first.library, 'Миша', 2);
  const early = travel(newProgress(story), 'scen4-2', 'drink-1');
  const later = travel(newProgress(story), 'scen8');
  const library = updatePlayerProgress(updatePlayerProgress(second.library, first.player.id, early, 3), second.player.id, later, 4);
  const restored = restoreProfileLibrary(JSON.stringify(library), null, story).library;
  const changed = updatePlayerProgress(restored, second.player.id, rewindChapter(story, later, 'road'), 5);
  assert.deepEqual(changed.players[0], restored.players[0]);
  assert.deepEqual(restored.players[1].progress, later);
  assert.equal(changed.players[1].progress.sceneId, 'scen1');
});

test('Legacy saves preserve progress and only unlock their actual current scene, not fabricated earlier choices', () => {
  const old = { ...newProgress(story), version: '2026-10-14.1', sceneId: 'scen21-3', line: 2, state: { ...newProgress(story).state, evidence: ['quill', 'marketInvoice'], clues: 2, flags: ['marketVisited'] } };
  delete old.history;
  const restored = reconcileProgress(story, old).progress;
  assert.deepEqual(restored.state, old.state);
  assert.equal(restored.history.length, 1);
  assert.equal(restored.history[0].chapterId, 'accounts');
  assert.equal(restored.history[0].partial, true);
  assert.equal(rewindChapter(story, restored, 'accounts').sceneId, 'scen21-3');
  assert.equal(rewindChapter(story, restored, 'tavern'), restored);
});

test('Corrupt chapter records are discarded without erasing a valid current save', () => {
  for (const history of [null, {}, [{ chapterId: 'road', sceneId: 'scen28', state: newProgress(story).state }], [{ chapterId: 'road', sceneId: 'scen1', state: {} }]]) {
    const saved = { ...newProgress(story), sceneId: 'scen8-2', history };
    const result = reconcileProgress(story, saved);
    assert.equal(result.reset, false);
    assert.equal(result.progress.sceneId, saved.sceneId);
    assert.equal(result.progress.history[0].sceneId, saved.sceneId);
  }
});

test('Notice and drink boards keep usable targets inside phone, tablet and desktop safe areas', () => {
  for (const viewport of [{ width: 568, height: 320 }, { width: 844, height: 390 }, { width: 1024, height: 768 }, { width: 1920, height: 1080 }]) {
    const insets = { left: 44, right: 12, top: 0, bottom: 21 };
    for (const current of story.scenes.filter(item => item.board)) {
      const frame = imageFrame(current.board.imageSize, viewport, 'contain', insets);
      const box = hotspotBox(current.board.rect, frame, viewport, 48, insets);
      assert.ok(box.width >= 48 && box.height >= 48);
      assert.ok(box.left >= insets.left && box.left + box.width <= viewport.width - insets.right + 0.001);
      assert.ok(box.top >= insets.top && box.top + box.height <= viewport.height - insets.bottom + 0.001);
    }
  }
  assert.equal(scene('scen3').board.items.length, 4);
  assert.ok(scene('scen3').board.items.every(item => item.text.length > 100));
  assert.equal(advance(story, { ...newProgress(story), sceneId: 'scen3', line: scene('scen3').dialogues.length - 1 }).sceneId, 'scen4');
});

test('Invalid board choices, regions and incomplete chapter assignments cannot replace a playable story', () => {
  for (const mutate of [
    s => s.scenes.find(item => item.board?.kind === 'drinks').board.items[0].id = 'missing',
    s => s.scenes.find(item => item.board).board.items[0].rect.x = -1,
    s => s.scenes.find(item => item.board).board.items[0].rect.width = 0.9,
    s => s.scenes.find(item => item.board).board.items[0].text = '',
    s => s.chapters[0].scenes.push('missing'),
    s => s.chapters[1].scenes.push('scen1'),
    s => s.chapters.pop(),
    s => s.schemaVersion = 5,
    s => s.scenes.find(item => item.id === 'scen4-2').dialogues[0].condition.drink = 42,
  ]) {
    const broken = structuredClone(story); mutate(broken);
    assert.throws(() => validateStory(broken));
  }
  const oldFormat = { schemaVersion: 5, version: 'old', title: 'Legacy', startScene: 'scene', scenes: [{ id: 'scene', chapter: 'Chapter', image: 'photo/scen1.png', next: null, dialogues: [{ speaker: 'Игнат', text: 'Ответ', condition: { not: { any: [{ drink: 'Травяной чай' }] } } }] }] };
  assert.throws(() => validateStory(oldFormat));
  assert.equal(validateStory({ ...oldFormat, schemaVersion: 6 }).schemaVersion, 6);
});
