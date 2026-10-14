import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { advance, choose, newProgress, reconcileProgress, sceneLines, validateStory } from '../src/engine.mjs';

const story = validateStory(JSON.parse(await readFile(new URL('../public/story.json', import.meta.url), 'utf8')));
const sceneById = id => story.scenes.find(scene => scene.id === id);
const entry = (sceneId, evidence = []) => ({ ...newProgress(story), sceneId, state: { ...newProgress(story).state, evidence, clues: evidence.length } });
const lastLine = progress => sceneLines(sceneById(progress.sceneId), progress.state).length - 1;
const combinations = Array.from({ length: 8 }, (_, mask) => ['fur', 'paws', 'quill'].filter((_, bit) => mask & (1 << bit)));

test('All three departure routes reach the guarded wolf village with every evidence combination', () => {
  const routes = [
    { choices: ['go-wolves'], talked: false, path: ['scen10-3', 'scen12', 'scen12-1', 'scen12-2'] },
    { choices: ['talk-porcupine', 'leave-later'], talked: true, path: ['scen10-3', 'scen11', 'scen11-1', 'scen11-1-leave', 'scen12', 'scen12-1', 'scen12-2'] },
    { choices: ['talk-porcupine', 'tell-clues', 'leave'], talked: true, path: ['scen10-3', 'scen11', 'scen11-1', 'scen11-1-clues', 'scen11-1-leave', 'scen12', 'scen12-1', 'scen12-2'] },
  ];
  for (const evidence of combinations) {
    for (const route of routes) {
      let progress = entry('scen10-3', evidence);
      const visited = [], choices = [...route.choices];
      for (let i = 0; i < 150 && !progress.ending; i++) {
        if (visited.at(-1) !== progress.sceneId) visited.push(progress.sceneId);
        const scene = sceneById(progress.sceneId);
        if (progress.sceneId === 'scen12-2' && progress.line === lastLine(progress)) break;
        if (scene.choices && progress.line === lastLine(progress)) {
          assert.equal(advance(story, progress), progress, `${scene.id} must wait for a choice`);
          assert.equal(choose(story, progress, 'unknown'), progress);
          progress = choose(story, progress, choices.shift());
        } else {
          if (scene.choices) for (const choice of scene.choices) assert.equal(choose(story, progress, choice.id), progress, `${scene.id} cannot skip unread dialogue`);
          progress = advance(story, progress);
        }
      }
      assert.deepEqual(visited, route.path);
      assert.deepEqual(choices, []);
      assert.equal(progress.ending, null);
      assert.equal(advance(story, progress).sceneId, 'scen12-3');
      assert.equal(progress.state.talkedToPorcupine, route.talked);
      assert.deepEqual(progress.state.evidence, evidence);
      assert.equal(progress.state.clues, evidence.length);
      assert.equal(progress.state.courage, 0);
    }
  }
});

test('Trying to discuss clues receives an evasive answer and only an explicit Leave choice', () => {
  const attempt = entry('scen11-1-clues', ['fur', 'paws', 'quill']);
  attempt.state.talkedToPorcupine = true;
  const scene = sceneById(attempt.sceneId);
  assert.deepEqual(scene.choices.map(choice => choice.label), ['Уйти']);
  const lines = sceneLines(scene, attempt.state);
  assert.ok(lines.some(line => line.speaker === 'Игнат' && line.text.includes('нет времени')));
  const ready = { ...attempt, line: lines.length - 1 };
  assert.equal(advance(story, ready), ready);
  const leaving = choose(story, ready, 'leave');
  assert.equal(leaving.sceneId, 'scen11-1-leave');
  assert.ok(sceneLines(sceneById(leaving.sceneId), leaving.state).some(line => line.text.includes('вернусь позже')));
  assert.equal(advance(story, { ...leaving, line: lastLine(leaving) }).sceneId, 'scen12');
});

test('Departure remembers the conversation only on the talk route and uses only discovered evidence', () => {
  for (const evidence of combinations) {
    for (const talkedToPorcupine of [false, true]) {
      const state = { ...entry('scen12', evidence).state, talkedToPorcupine };
      const lines = sceneLines(sceneById('scen12'), state);
      const text = lines.map(line => line.text).join('\n');
      assert.equal(text.includes('оборвал разговор'), talkedToPorcupine);
      assert.equal(text.includes('не объяснил, что принимал'), talkedToPorcupine);
      assert.equal(text.includes('та игла'), talkedToPorcupine && evidence.includes('quill'));
      assert.equal(lines.filter(line => line.condition).length, talkedToPorcupine ? 2 + Number(evidence.includes('quill')) : 1);
      for (const id of ['scen10-3', 'scen11-1-clues', 'scen12']) {
        for (const line of sceneLines(sceneById(id), state)) {
          for (const clue of line.condition?.found ?? []) assert.ok(evidence.includes(clue), `${id}: ${clue} not found`);
          for (const clue of line.condition?.missing ?? []) assert.ok(!evidence.includes(clue));
        }
      }
      const wake = sceneLines(sceneById('scen10-3'), state);
      assert.equal(wake.filter(line => line.condition).length, 1);
      if (!evidence.includes('fur') && !evidence.includes('paws')) assert.ok(wake.some(line => line.text.includes('Савелий слышал рычание')));
      const spoken = sceneLines(sceneById('scen11-1-clues'), state).filter(line => line.speaker === 'Капибара');
      assert.equal(spoken.length, evidence.includes('quill') && (evidence.includes('fur') || evidence.includes('paws')) ? 2 : 1);
    }
  }
});

test('Old sleep endings reopen into the new choice without losing evidence or requiring a restart', () => {
  for (const evidence of combinations) {
    const saved = { ...entry('scen10-2', evidence), version: '2026-10-07.1', line: 0, ending: { title: 'Продолжение следует', text: 'Предыдущая граница сюжета' } };
    delete saved.state.talkedToPorcupine;
    const result = reconcileProgress(story, saved);
    assert.equal(result.reset, false);
    assert.equal(result.progress.sceneId, 'scen10-2');
    assert.equal(result.progress.ending, null);
    assert.equal(result.progress.state.talkedToPorcupine, false);
    assert.deepEqual(result.progress.state.evidence, evidence);
    const ready = { ...result.progress, line: lastLine(result.progress) };
    assert.equal(advance(story, ready).sceneId, 'scen10-3');
  }
});

test('Saving after the talk route retains its departure thoughts; corrupt route state restarts safely', () => {
  const saved = { ...entry('scen12', ['quill']), line: 1 };
  saved.state.talkedToPorcupine = true;
  assert.deepEqual(reconcileProgress(story, JSON.parse(JSON.stringify(saved))).progress, saved);
  const updated = reconcileProgress({ ...story, version: 'next' }, saved).progress;
  assert.equal(updated.state.talkedToPorcupine, true);
  assert.ok(sceneLines(sceneById('scen12'), updated.state).some(line => line.text.includes('оборвал разговор')));
  for (const talkedToPorcupine of ['true', 1, null]) assert.equal(reconcileProgress(story, { ...saved, state: { ...saved.state, talkedToPorcupine } }).reset, true);
});

test('Invalid route conditions and old-client formats cannot silently drop the conversation state', () => {
  for (const mutate of [
    s => sceneByIdCopy(s, 'scen12').dialogues[0].condition.talkedToPorcupine = 'yes',
    s => sceneByIdCopy(s, 'scen10-3').choices[0].effects.talkedToPorcupine = 1,
    s => s.schemaVersion = 3,
  ]) {
    const broken = structuredClone(story); mutate(broken);
    assert.throws(() => validateStory(broken));
  }
  const conditionOnly = { ...story, schemaVersion: 3, startScene: 'scen12', scenes: [{ ...sceneById('scen12'), next: null }] };
  assert.throws(() => validateStory(conditionOnly), /условия разговора/);
  const effectOnly = { ...story, schemaVersion: 3, startScene: 'scen10-3', scenes: [{ ...sceneById('scen10-3'), dialogues: [], choices: sceneById('scen10-3').choices.map(choice => ({ ...choice, next: null })) }] };
  assert.throws(() => validateStory(effectOnly), /состояние разговора/);
});

function sceneByIdCopy(copy, id) { return copy.scenes.find(scene => scene.id === id); }
