import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { advance, choose, finishSearch, inspect, matchesCondition, newProgress, reconcileProgress, sceneChoices, sceneLines, validateStory } from '../src/engine.mjs';

const story = validateStory(JSON.parse(await readFile(new URL('../public/story.json', import.meta.url), 'utf8')));
const byId = id => story.scenes.find(scene => scene.id === id);
const branchIds = { witness: 'visit-witness', market: 'visit-market', mill: 'visit-mill' };
const permutations = [['witness', 'market', 'mill'], ['witness', 'mill', 'market'], ['market', 'witness', 'mill']];

function play(order, options = {}) {
  let progress = { ...newProgress(story), sceneId: 'scen12-2' };
  const remaining = [...order];
  const visited = new Set();
  const transcript = new Map();
  let checkedReceipts = false;
  for (let step = 0; step < 1000 && !progress.ending; step++) {
    const scene = byId(progress.sceneId);
    visited.add(scene.id);
    transcript.set(scene.id, sceneLines(scene, progress.state).map(line => line.text).join('\n'));
    if (progress.searching) {
      if (options.collect !== false) for (const item of scene.search.hotspots) if (!options.skipEvidence?.includes(item.id)) progress = inspect(story, progress, item.id);
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
    progress = reconcileProgress(story, JSON.parse(JSON.stringify(progress))).progress;
  }
  assert.ok(progress.ending, 'route must end in fewer than 1000 steps');
  return { progress, visited, transcript };
}

test('Every available investigation order reaches the complete ending and uses every supplied new illustration', () => {
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

test('Each available pair of directions suffices even when all searches are skipped', () => {
  for (const order of [['witness', 'market'], ['market', 'witness'], ['witness', 'mill']]) {
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
          const { progress, visited } = play(['market', 'witness', 'mill'], { 'scen13-1': 'check-wolves', 'scen15': 'ask-faces', 'scen15-2': 'keep-description', 'scen16': market, 'scen18': mill, 'scen20': 'suspect-marta', 'scen21': 'demand-marta-proof', restore: true, 'scen23-1': plan, 'scen23-audit': 'audit-sales-books', 'scen24-1': evidence, 'scen27': 'leave-after-opening' });
          assert.ok(visited.has('scen21-6'));
          assert.ok(progress.state.flags.includes('martaTrusted'));
          assert.equal(progress.state.flags.includes('marketWarned'), market === 'accuse-agata');
          assert.equal(progress.ending.title, mill === 'help-wheel' ? 'Дом, которому верят' : 'Первый честный вечер');
        }
      }
    }
  }
  const declined = play(['witness', 'mill', 'market'], { 'scen20': 'check-old-accounts', 'scen22': 'decline-tikhon' });
  assert.equal(declined.progress.ending.title, 'Первый честный вечер');
  assert.ok(declined.visited.has('scen20-1'));
  assert.ok(!declined.progress.state.flags.includes('tikhonCooperating'));
});

test('The mill unlocks only after Savely, completed directions disappear and repeatable hubs contain no monologue', () => {
  let progress = { ...newProgress(story), sceneId: 'scen14', line: -1 };
  assert.deepEqual(sceneLines(byId('scen14'), progress.state), []);
  assert.deepEqual(sceneLines(byId('scen21-4'), progress.state), []);
  assert.deepEqual(sceneChoices(byId('scen14'), progress.state).map(choice => choice.id), ['visit-witness', 'visit-market']);
  assert.equal(choose(story, progress, 'return-to-inn'), progress);
  assert.equal(choose(story, progress, 'visit-mill'), progress);
  progress.state.flags = ['marketVisited'];
  assert.deepEqual(sceneChoices(byId('scen14'), progress.state).map(choice => choice.id), ['visit-witness']);
  progress.state.flags = ['witnessVisited', 'marketVisited'];
  progress.line = sceneLines(byId('scen14'), progress.state).length - 1;
  assert.deepEqual(sceneChoices(byId('scen14'), progress.state).map(choice => choice.id), ['visit-mill', 'return-to-inn']);
  assert.equal(choose(story, progress, 'visit-witness'), progress);
  progress.state.flags.push('millVisited');
  assert.deepEqual(sceneChoices(byId('scen14'), progress.state).map(choice => choice.id), ['return-to-inn']);
  assert.equal(choose(story, progress, 'revisit-store'), progress);
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

test('The three plans perform distinct actions; retaining sales records changes the ending', () => {
  const cases = [
    ['plan-watch', {}, 'scen23-watch-stop', true],
    ['plan-tikhon', { 'scen23-tikhon': 'tikhon-secure-register' }, 'scen23-tikhon-register', true],
    ['plan-tikhon', { 'scen23-tikhon': 'tikhon-signal-first' }, 'scen23-tikhon-signal', false],
    ['plan-audit', { 'scen23-audit': 'audit-sales-books' }, 'scen23-audit-records', true],
    ['plan-audit', { 'scen23-audit': 'audit-seal-cargo' }, 'scen23-audit-cargo', false],
  ];
  for (const [plan, options, branch, recovered] of cases) {
    const result = play(['witness', 'market', 'mill'], { 'scen23-1': plan, ...options });
    assert.ok(result.visited.has(branch));
    assert.equal(result.progress.state.flags.includes('salesRecordsRecovered'), recovered);
    assert.ok(result.progress.state.flags.includes('cargoSecured'));
    assert.equal(result.progress.ending.title, recovered ? 'Дом, которому верят' : 'Первый честный вечер');
    if (plan === 'plan-audit') {
      assert.ok(!result.visited.has('scen23-watch'));
      assert.doesNotMatch(result.transcript.get('scen24-2'), /мы слышали/);
      assert.match(result.transcript.get('scen24-1'), /передавал нам адреса/);
    }
  }
});

test('An unwarned surveillance can preserve both; warned delay introduces a real cargo tradeoff', () => {
  const safe = play(['witness', 'market', 'mill'], { 'scen23-watch': 'watch-records-quiet' });
  assert.ok(safe.visited.has('scen23-watch-records'));
  assert.equal(safe.progress.ending.title, 'Дом, которому верят');
  for (const [decision, hasCargo, hasRecords] of [
    ['watch-save-records', false, true],
    ['watch-save-cargo-alone', true, false],
  ]) {
    const result = play(['witness', 'market', 'mill'], { 'scen16': 'accuse-agata', 'scen22': 'decline-tikhon', 'scen23-watch': 'watch-records-risk', 'scen23-watch-risk': decision });
    assert.ok(result.visited.has('scen23-watch-risk'));
    assert.equal(result.progress.state.flags.includes('cargoSecured'), hasCargo);
    assert.equal(result.progress.state.flags.includes('cargoLost'), !hasCargo);
    assert.equal(result.progress.state.flags.includes('salesRecordsRecovered'), hasRecords);
    assert.equal(result.progress.ending.title, 'Первый честный вечер');
    assert.match(result.transcript.get('scen27'), hasCargo ? /записи Агаты оказались неполными/ : /ящики ещё ищут ниже по реке/);
  }
});

test('Tikhon can secure records even after Agata is warned, but his unavailable help cannot be selected', () => {
  const result = play(['witness', 'market', 'mill'], { 'scen16': 'accuse-agata', 'scen23-watch': 'watch-records-risk', 'scen23-watch-risk': 'watch-save-cargo-with-help' });
  assert.equal(result.progress.ending.title, 'Дом, которому верят');
  const state = newProgress(story).state;
  assert.ok(!sceneChoices(byId('scen23-watch-risk'), state).some(choice => choice.id === 'watch-save-cargo-with-help'));
});

test('Conversations refer only to learned expenses, visits and statements', () => {
  const state = newProgress(story).state;
  const text = (id, changes = {}) => sceneLines(byId(id), { ...state, ...changes }).map(l => l.text).join('\n');
  for (const id of ['scen11', 'scen11-1', 'scen11-1-clues', 'scen13', 'scen13-1', 'scen13-2', 'scen13-3']) assert.doesNotMatch(text(id), /мельниц/i);
  assert.match(text('scen15'), /С?старой мельнице/);
  assert.doesNotMatch(text('scen17'), /Савелий говорил/);
  assert.match(text('scen17', { flags: ['witnessVisited'] }), /Савелий говорил/);
  assert.doesNotMatch(text('scen20'), /встретил лиса и шакала/);
  assert.match(text('scen20', { flags: ['witnessVisited', 'millVisited'] }), /встретил лиса и шакала/);
  assert.doesNotMatch(text('scen20'), /показала накладную/);
  assert.match(text('scen20', { flags: ['marketVisited'], evidence: ['marketInvoice'] }), /показала накладную/);
  assert.doesNotMatch(sceneLines(byId('scen21'), state).map(l => l.text).join('\n'), /дорогие вещи проходят как продукты/);
  assert.match(sceneLines(byId('scen21'), { ...state, evidence: ['marketInvoice'] }).map(l => l.text).join('\n'), /дорогие вещи проходят как продукты/);
  assert.match(text('scen21-3'), /Сегодня после заката/);
  assert.match(text('scen21-7'), /На мельнице я ещё не был/);
  assert.doesNotMatch(text('scen21-7'), /С перевозчиками я говорил|Тихон запомнил/);
  assert.doesNotMatch(text('scen22-2', { flags: ['tikhonCooperating'] }), /Я проверил его книгу/);
  assert.match(text('scen22-2', { flags: ['tikhonCooperating'], evidence: ['gangLedger'] }), /Я проверил его книгу/);
  for (const [choice, known] of [['ask-invoice', false], ['pose-buyer', true], ['accuse-agata', false]]) {
    const result = play(['market', 'witness', 'mill'], { 'scen16': choice, 'scen16-4': 'back-from-market' });
    assert.equal(result.progress.state.flags.includes('marketDeliveryKnown'), known);
  }
  assert.ok(play(['market', 'witness', 'mill'], { 'scen16': 'ask-invoice', 'scen16-4': 'follow-agata' }).progress.state.flags.includes('marketDeliveryKnown'));
});

test('The fox is introduced as Tikhon, Savely attends verification and the guard reads the council decision', () => {
  const result = play(['witness', 'market', 'mill']);
  assert.match(result.transcript.get('scen18'), /лиса зовут Тихон, а шакала — Роган/);
  assert.doesNotMatch(result.transcript.get('scen18-2') ?? '', /Шакалы/);
  assert.match(result.transcript.get('scen21-7'), /Позову хозяйку дома и Савелия/);
  assert.ok(byId('scen23-2').dialogues.some(line => line.speaker === 'Савелий'));
  assert.ok(byId('scen25').dialogues.some(line => line.speaker === 'Стражник' && /Совет решил/.test(line.text)));
  for (const scene of story.scenes.filter(s => Number(s.id.match(/scen(\d+)/)?.[1]) >= 24)) assert.ok(scene.dialogues.every(line => line.speaker !== 'Глава волков'));
  const cautious = play(['market', 'witness'], { collect: false, 'scen16': 'pose-buyer', 'scen16-4': 'back-from-market' });
  assert.match(cautious.transcript.get('scen21-7'), /На мельнице я ещё не был/);
  assert.match(cautious.transcript.get('scen25'), /Тихон также вернёт свою долю/);
});

test('Existing saves reopen the revised menu immediately while retaining completed directions and evidence', () => {
  const old = { ...newProgress(story), version: '2026-10-12.2', sceneId: 'scen14', line: 4 };
  old.state.flags = ['witnessVisited', 'marketVisited'];
  old.state.evidence = ['quill', 'marketInvoice']; old.state.clues = 2;
  const restored = reconcileProgress(story, old).progress;
  assert.equal(restored.line, -1);
  assert.deepEqual(restored.state.evidence, old.state.evidence);
  assert.deepEqual(sceneChoices(byId('scen14'), restored.state).map(c => c.id), ['visit-mill', 'return-to-inn']);
  assert.equal(choose(story, restored, 'visit-witness'), restored);
  assert.equal(choose(story, restored, 'visit-mill').sceneId, 'scen18');
});

test('Empty tavern, Ignat absence and both accomplices receive explicit resolutions on every plan', () => {
  for (const plan of ['plan-watch', 'plan-tikhon', 'plan-audit']) {
    const result = play(['witness', 'market', 'mill'], { 'scen23-1': plan });
    assert.match(result.transcript.get('scen21'), /гости разошлись по домам/);
    assert.match(result.transcript.get('scen24-5'), /делил вещи после прежней поездки/);
    assert.match(result.transcript.get('scen25'), /Роган вернёт свою долю/);
    assert.match(result.transcript.get('scen25'), /Агата прекратит продажу/);
  }
});

test('Already resolved old saves retain cargo and archive outcomes without inventing them before the night', () => {
  for (const version of ['2026-10-11.1', '2026-10-12.1']) {
    const saved = { ...newProgress(story), version, sceneId: 'scen24-5' };
    saved.state.flags = ['tikhonCooperating']; saved.state.evidence = ['gangLedger']; saved.state.clues = 1;
    const migrated = reconcileProgress(story, saved).progress;
    assert.ok(migrated.state.flags.includes('cargoSecured'));
    assert.ok(migrated.state.flags.includes('salesRecordsRecovered'));
    const beforeNight = reconcileProgress(story, { ...saved, sceneId: 'scen23' }).progress;
    assert.ok(!beforeNight.state.flags.includes('cargoSecured'));
    const noHelp = reconcileProgress(story, { ...saved, state: { ...saved.state, flags: [] } }).progress;
    assert.ok(noHelp.state.flags.includes('cargoSecured'));
    assert.ok(!noHelp.state.flags.includes('salesRecordsRecovered'));
  }
});
