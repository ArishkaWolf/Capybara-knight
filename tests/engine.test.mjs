import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { advance, choose, newProgress, reconcileProgress, validateStory, sceneLines, finishSearch, interact } from '../src/engine.mjs';
const story = validateStory(JSON.parse(await readFile(new URL('../public/story.json', import.meta.url), 'utf8')));
const sceneProgress = (id, line = -1) => ({ ...newProgress(story), sceneId: id, line });
const lastLine = (id) => story.scenes.find((scene) => scene.id === id).dialogues.length - 1;

test('All scenes load the current images, including the continuation and renamed files', async () => {
  assert.equal(story.scenes.length, 96);
  for (const scene of story.scenes) assert.ok((await readFile(new URL(`../${scene.image}`, import.meta.url))).length > 0);
  assert.equal(story.scenes[1].image, 'photo/scen2.png');
  assert.equal(story.scenes.find((scene) => scene.id === 'scen7-5').image, 'photo/сцена7-5.png');
  assert.ok(story.scenes.every((scene) => scene.dialogues.length > 0));
});

test('The ninth scene repeats scen4-3 before payment, and the decision follows the farewell', () => {
  assert.deepEqual(story.scenes.slice(0, 22).map((scene) => scene.image), [
    'photo/scen1.png', 'photo/scen2.png', 'photo/scen3.png', 'photo/scen4.png',
    'photo/scen4-1.png', 'photo/scen4-2.png', 'photo/scen4-3.png', 'photo/scen4-4.png',
    'photo/scen4-3.png', 'photo/scen4-5.png', 'photo/scen5.png', 'photo/scen6.png',
    'photo/scen6-1.png', 'photo/scen7.png', 'photo/scen7-1.png', 'photo/scen7-2.png',
    'photo/scen7-3.png', 'photo/scen7-4.png', 'photo/сцена7-5.png', 'photo/scen7-6.png',
    'photo/scen7-7.png', 'photo/scen8.png',
  ]);
  const first = sceneProgress('scen4-3', lastLine('scen4-3'));
  const scared = advance(story, first);
  assert.equal(scared.sceneId, 'scen4-4');
  const witness = advance(story, { ...scared, line: lastLine(scared.sceneId) });
  assert.equal(witness.sceneId, 'scen4-3-witness');
  assert.equal(advance(story, { ...witness, line: lastLine(witness.sceneId) }).sceneId, 'scen4-5');
  const farewell = sceneProgress('scen7-6', lastLine('scen7-6'));
  assert.equal(advance(story, farewell).sceneId, 'scen7-7');
});

test('Right tap reveals each dialogue before changing the image', () => {
  let progress = newProgress(story);
  progress = advance(story, progress);
  assert.equal(progress.sceneId, 'scen1'); assert.equal(progress.line, 0);
  progress = advance(story, progress);
  assert.equal(progress.sceneId, 'scen1'); assert.equal(progress.line, 1);
  while (progress.line < lastLine('scen1')) progress = advance(story, progress);
  progress = advance(story, progress);
  assert.equal(progress.sceneId, 'scen2'); assert.equal(progress.line, -1);
});

test('Drink choice blocks advancement; all drinks rejoin scen4-2 and are saved', () => {
  const intro = sceneProgress('scen4-1');
  assert.equal(choose(story, intro, 'drink-0'), intro);
  const progress = advance(story, intro);
  assert.equal(advance(story, progress), progress);
  for (const choice of story.scenes.find((s) => s.id === 'scen4-1').choices) {
    const result = choose(story, progress, choice.id);
    assert.equal(result.sceneId, 'scen4-2'); assert.equal(result.state.drink, choice.label);
  }
});

test('Refusal ends game and cannot advance; investigation continues', () => {
  const progress = sceneProgress('scen7-7', lastLine('scen7-7'));
  const unread = sceneProgress('scen7-7');
  assert.equal(choose(story, unread, 'investigate'), unread);
  assert.equal(choose(story, unread, 'refuse'), unread);
  assert.equal(advance(story, progress), progress);
  const refused = choose(story, progress, 'refuse');
  assert.equal(refused.ending.title, 'Другая дорога'); assert.equal(refused.state.helping, false);
  assert.equal(advance(story, refused), refused);
  const accepted = choose(story, progress, 'investigate');
  assert.equal(accepted.sceneId, 'scen8'); assert.equal(accepted.state.helping, true); assert.equal(accepted.state.courage, 1);
});

test('Playable night route reads the note and reaches the continuation without an ending', () => {
  let progress = newProgress(story);
  const visited = new Set();
  for (let i = 0; i < 200 && !progress.ending; i++) {
    visited.add(progress.sceneId);
    if (progress.sceneId === 'scen12-2' && progress.line === lastLine('scen12-2')) break;
    const scene = story.scenes.find((s) => s.id === progress.sceneId);
    progress = progress.interacting ? interact(story, progress, 'note') : progress.searching ? finishSearch(story, progress) : scene.choices?.length && progress.line === sceneLines(scene, progress.state).length - 1 ? choose(story, progress, scene.choices.at(-1).id) : advance(story, progress);
  }
  assert.equal(visited.size, 36); assert.equal(progress.sceneId, 'scen12-2'); assert.equal(progress.ending, null);
  assert.equal(advance(story, progress).sceneId, 'scen12-3');
  assert.ok(visited.has('scen9-1')); assert.ok(visited.has('scen9-2')); assert.ok(!visited.has('scen9-2_2'));
});

test('New versions preserve state and scene ID, reopen dialogue after reordering', () => {
  const updated = { ...story, version: 'new-version', scenes: [...story.scenes].reverse() };
  const saved = { ...sceneProgress('scen7-6', 0), state: { ...newProgress(story).state, drink: 'Травяной чай', courage: 1, clues: 2, helping: true } };
  const result = reconcileProgress(updated, saved);
  assert.equal(result.reset, false); assert.equal(result.progress.sceneId, 'scen7-6');
  assert.equal(result.progress.line, -1); assert.deepEqual(result.progress.state, saved.state);
});

test('Deleted scenes and corrupt saves safely restart', () => {
  assert.equal(reconcileProgress(story, { ...sceneProgress('removed') }).reset, true);
  for (const saved of [{}, { ...newProgress(story), line: -9 }, { ...newProgress(story), state: { drink: null } }, { ...newProgress(story), ending: { title: 'x' } }]) {
    assert.deepEqual(reconcileProgress(story, saved).progress, newProgress(story));
  }
});

test('Same-version saves restore current line and ending', () => {
  const saved = choose(story, sceneProgress('scen7-7', lastLine('scen7-7')), 'refuse');
  assert.deepEqual(reconcileProgress(story, saved).progress, saved);
});

test('Bad deployments are rejected: schema, missing targets, duplicate IDs, unsafe paths, invalid effects', () => {
  for (const mutate of [
    (s) => s.schemaVersion = 99,
    (s) => s.scenes[0].next = 'missing',
    (s) => s.scenes[1].id = s.scenes[0].id,
    (s) => s.scenes[0].image = '../secret.png',
    (s) => s.scenes[4].choices[0].effects.courage = 'bad',
    (s) => s.scenes[4].choices[0].effects.unknown = 1,
  ]) {
    const broken = structuredClone(story); mutate(broken);
    assert.throws(() => validateStory(broken));
  }
});
