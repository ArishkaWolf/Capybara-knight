import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { advance, choose, finishSearch, inspect, matchesCondition, newProgress, reconcileProgress, sceneChoices, sceneLines, validateStory } from '../src/engine.mjs';

const story = validateStory(JSON.parse(await readFile(new URL('../public/story.json', import.meta.url), 'utf8')));
const byId = id => story.scenes.find(scene => scene.id === id);
const branchIds = { witness: 'visit-witness', market: 'visit-market', mill: 'visit-mill' };
const permutations = [['witness', 'market', 'mill'], ['witness', 'mill', 'market'], ['market', 'witness', 'mill'], ['market', 'mill', 'witness'], ['mill', 'witness', 'market'], ['mill', 'market', 'witness']];

function play(order, options = {}) {
  let progress = { ...newProgress(story), sceneId: 'scen12-2' };
  const remaining = [...order];
  const visited = new Set();
  let checkedReceipts = false;
  for (let step = 0; step < 1000 && !progress.ending; step++) {
    const scene = byId(progress.sceneId);
    visited.add(scene.id);
    if (progress.searching) {
      if (options.collect !== false) for (const item of scene.search.hotspots) progress = inspect(story, progress, item.id);
      progress = finishSearch(story, progress);
      continue;
    }
    const choices = sceneChoices(scene, progress.state);
    if (choices.length && progress.line === sceneLines(scene, progress.state).length - 1) {
      let id = options[scene.id];
      if (scene.id === 'scen14') id = remaining.length ? branchIds[remaining.shift()] : 'return-to-inn';
      if (scene.id === 'scen21-4') {
        id = !checkedReceipts && options.verify !== false && choices.some(choice => choice.id === 'verify-receipts') ? 'verify-receipts' : options.restore && choices.some(choice => choice.id === 'restore-marta-trust') ? 'restore-marta-trust' : 'prepare-with-clues';
        if (id === 'verify-receipts') checkedReceipts = true;
      }
      id ??= choices[0].id;
      assert.ok(choices.some(choice => choice.id === id), `${scene.id}: unavailable choice ${id}`);
      progress = choose(story, progress, id);
    } else {
      const next = advance(story, progress);
      assert.notEqual(next, progress, `${scene.id}: stuck before a choice or search`);
      progress = next;
    }
    // Reload at every transition: flags, evidence and endings must survive saving.
    progress = reconcileProgress(story, JSON.parse(JSON.stringify(progress))).progress;
  }
  assert.ok(progress.ending, 'route must end in fewer than 1000 steps');
  return { progress, visited };
}

test('All six investigation orders reach the complete ending and use every supplied new illustration', () => {
  const allVisited = new Set();
  for (const order of permutations) {
    const { progress, visited } = play(order);
    assert.equal(progress.ending.title, 'Дом, которому верят');
    assert.equal(progress.state.clues, 7);
    assert.equal(new Set(progress.state.flags).size, progress.state.flags.length);
    for (let n = 14; n <= 28; n++) assert.ok([...visited].some(id => byId(id).image === `photo/scen${n}.png`), `scen${n} is missing`);
    for (const id of visited) allVisited.add(id);
  }
  assert.ok(allVisited.has('scen22-1'));
  assert.ok(allVisited.has('scen24-2'));
});

test('Any pair of directions suffices even when all searches are skipped', () => {
  for (const order of permutations.map(order => order.slice(0, 2))) {
    const { progress } = play(order, { collect: false, 'scen18': 'watch-jackals', 'scen24-1': 'present-witnesses' });
    assert.equal(progress.ending.title, 'Первый честный вечер');
    assert.deepEqual(progress.state.evidence, []);
    assert.ok(progress.state.flags.includes('caseProved'));
    assert.ok(!progress.state.flags.includes('tikhonCooperating'));
  }
});

test('Accusations, apologies, three confrontation methods and all plans remain playable', () => {
  for (const mill of ['help-wheel', 'watch-jackals', 'demand-crates']) {
    for (const market of ['ask-invoice', 'pose-buyer', 'accuse-agata']) {
      for (const plan of ['plan-watch', 'plan-audit', ...(mill === 'help-wheel' ? ['plan-tikhon'] : [])]) {
        for (const evidence of ['present-documents', 'present-disguise', 'present-witnesses']) {
          const { progress, visited } = play(['market', 'mill', 'witness'], { 'scen13-1': 'check-wolves', 'scen15': 'ask-faces', 'scen15-2': 'keep-description', 'scen16': market, 'scen18': mill, 'scen20': 'suspect-marta', 'scen21': 'demand-marta-proof', restore: true, 'scen23-1': plan, 'scen24-1': evidence, 'scen27': 'leave-after-opening' });
          assert.ok(visited.has('scen21-6'));
          assert.ok(progress.state.flags.includes('martaTrusted'));
          assert.equal(progress.state.flags.includes('marketWarned'), market === 'accuse-agata');
          assert.equal(progress.ending.title, mill === 'help-wheel' ? 'Дом, которому верят' : 'Первый честный вечер');
        }
      }
    }
  }
  const declined = play(['mill', 'market', 'witness'], { 'scen20': 'check-old-accounts', 'scen22': 'decline-tikhon' });
  assert.equal(declined.progress.ending.title, 'Первый честный вечер');
  assert.ok(declined.visited.has('scen20-1'));
  assert.ok(!declined.progress.state.flags.includes('tikhonCooperating'));
});

test('Hidden choices cannot be executed, paths unlock after two visits and evidence can be revisited once', () => {
  let progress = { ...newProgress(story), sceneId: 'scen14', line: 0 };
  assert.deepEqual(sceneChoices(byId('scen14'), progress.state).map(choice => choice.id), ['visit-witness', 'visit-market', 'visit-mill']);
  assert.equal(choose(story, progress, 'return-to-inn'), progress);
  progress.state.flags = ['witnessVisited', 'marketVisited'];
  progress.line = sceneLines(byId('scen14'), progress.state).length - 1;
  assert.deepEqual(sceneChoices(byId('scen14'), progress.state).map(choice => choice.id), ['visit-mill', 'return-to-inn']);
  assert.equal(choose(story, progress, 'visit-witness'), progress);
  let searching = { ...progress, sceneId: 'scen19', line: -1, searching: true };
  for (const item of byId('scen19').search.hotspots) searching = inspect(story, searching, item.id);
  const revisited = reconcileProgress(story, JSON.parse(JSON.stringify(searching))).progress;
  for (const item of byId('scen19').search.hotspots) assert.equal(inspect(story, revisited, item.id), revisited);
  assert.equal(revisited.state.clues, 3);
});

test('Old completion at the wolf gate reopens, retains clues and defaults the new decisions', () => {
  const old = { ...newProgress(story), version: '2026-10-07.3', sceneId: 'scen12-2', line: 3, ending: { title: 'Продолжение следует', text: 'Старая граница' } };
  old.state.evidence = ['quill']; old.state.clues = 1; delete old.state.flags;
  const { progress, reset } = reconcileProgress(story, old);
  assert.equal(reset, false);
  assert.equal(progress.ending, null);
  assert.deepEqual(progress.state.evidence, ['quill']);
  assert.deepEqual(progress.state.flags, []);
  assert.equal(advance(story, { ...progress, line: sceneLines(byId(progress.sceneId), progress.state).length - 1 }).sceneId, 'scen12-3');
});

test('Nested evidence conditions filter endings, while corrupt flags and routes are rejected', () => {
  const state = newProgress(story).state;
  assert.equal(matchesCondition({ any: [{ flags: ['helpedTikhon'] }, { found: ['quill'] }] }, state), false);
  assert.equal(matchesCondition({ not: { found: ['quill'] } }, state), true);
  for (const mutate of [
    s => byIdCopy(s, 'scen21-7').routes[0].next = 'missing',
    s => byIdCopy(s, 'scen14').choices[0].condition.flags = ['unknown'],
    s => byIdCopy(s, 'scen14').choices.at(-1).condition.atLeast.count = 4,
    s => byIdCopy(s, 'scen28').choices[1].condition.not = { found: ['stolenBox'], missing: ['stolenBox'] },
    s => s.schemaVersion = 4,
  ]) { const copy = structuredClone(story); mutate(copy); assert.throws(() => validateStory(copy)); }
  for (const flags of [['unknown'], ['helpedTikhon', 'helpedTikhon'], 'helpedTikhon']) assert.equal(reconcileProgress(story, { ...newProgress(story), state: { ...state, flags } }).reset, true);
});

function byIdCopy(copy, id) { return copy.scenes.find(scene => scene.id === id); }
