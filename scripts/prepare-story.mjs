import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateStory } from '../src/engine.mjs';
import { prepareImages, prepareBranding } from './prepare-images.mjs';
const root = new URL('../', import.meta.url);
const story = validateStory(JSON.parse(await readFile(new URL('public/story.json', root), 'utf8')));
await prepareImages(story);
await prepareBranding();
// A readable review copy, regenerated from the canonical JSON on every build.
const clueNames = { fur: 'шерсть', paws: 'отпечатки лап', quill: 'игла дикобраза', wolfDisguise: 'волчий плащ', falsePaw: 'накладка для следов', tavernTag: 'бирка таверны', marketInvoice: 'накладная Агаты', martaLedger: 'книга закупок Марты', stolenBox: 'шкатулка с тайником', gangLedger: 'книга расчётов сообщников' };
const flagNames = { sharedClues: 'Игнату рассказали об уликах', wolvesTrusted: 'волки доверяют Капибаре', witnessVisited: 'опрошены пострадавшие', marketVisited: 'посещён рынок', millVisited: 'посещена мельница', witnessSounds: 'Савелий вспомнил звуки', marketWarned: 'Агата предупреждена', helpedTikhon: 'Капибара помог Тихону', tikhonTrusted: 'Тихону предложена помощь', martaAccused: 'Марту обвинили', martaTrusted: 'Марта доверяет Капибаре', recordsCompared: 'счета сверены с поставщиком', planWatch: 'выбрано наблюдение', planTikhon: 'выбрана помощь Тихона', planAudit: 'выбрана проверка поставки', tikhonCooperating: 'Тихон сотрудничает', caseProved: 'вина Игната доказана', stayedToHelp: 'Капибара остался помочь', marketDeliveryKnown: 'известно о вечерней партии', salesRecordsRecovered: 'сохранены записи о покупателях', cargoSecured: 'весь груз задержан', cargoLost: 'часть груза скрыта' };
const conditionText = (condition) => [
  ...(condition.found?.length ? [`найдено: ${condition.found.map((id) => clueNames[id]).join(', ')}`] : []),
  ...(condition.missing?.length ? [`не найдено: ${condition.missing.map((id) => clueNames[id]).join(', ')}`] : []),
  ...(condition.talkedToPorcupine === undefined ? [] : [condition.talkedToPorcupine ? 'после разговора с Игнатом' : 'сразу к волкам']),
  ...(condition.flags?.length ? [condition.flags.map((id) => flagNames[id]).join('; ')] : []),
  ...(condition.notFlags?.length ? [`ещё не выполнено: ${condition.notFlags.map((id) => flagNames[id]).join(', ')}`] : []),
  ...(condition.atLeast ? [`не менее ${condition.atLeast.count} из: ${condition.atLeast.flags.map((id) => flagNames[id]).join(', ')}`] : []),
  ...(condition.any ? [`хотя бы одно: ${condition.any.map((part) => `(${conditionText(part)})`).join(' или ')}`] : []),
  ...(condition.not ? [`не выполнено условие (${conditionText(condition.not)})`] : []),
].join('; ');
const describeCondition = (condition) => condition ? ` *(${conditionText(condition)})*` : '';
const manuscript = [
  `# ${story.title}`,
  '',
  `Версия ${story.version}. Просмотровая копия: редактируйте реплики в public/story.json. Этот файл создаётся заново при сборке.`,
  ...story.scenes.flatMap((scene, index) => [
    '', `## ${index + 1}. ${scene.chapter} — ${scene.id}`, '',
    `Картинка: ${scene.image}`, '',
    ...scene.dialogues.flatMap((line) => [`**${line.speaker}**${describeCondition(line.condition)}`, '', line.text, '']),
    ...(scene.search ? [
      '**Интерактивный осмотр**', '',
      'Нажимать на области картинки можно в любом порядке. Каждая улика сохраняется один раз; её мысли можно перечитать. Осмотр разрешено закончить без находок.', '',
      ...scene.search.hotspots.flatMap((hotspot) => [
        `### Улика: ${hotspot.label}`, '',
        ...hotspot.dialogues.flatMap((line) => [`**${line.speaker}**`, '', line.text, '']),
      ]),
      `После кнопки «${scene.search.finishLabel}» → ${scene.next}.`, '',
    ] : []),
    ...(scene.interaction ? [
      '**Обязательный интерактив**', '',
      `Нажать на предмет «${scene.interaction.label}» → ${scene.next}. До нажатия обычный переход заблокирован.`, '',
    ] : []),
    ...(scene.choices ? ['**Выбор игрока**', '', ...scene.choices.flatMap((choice) => [
      `- ${choice.label}${describeCondition(choice.condition)} → ${choice.next ?? 'конец игры'}`, '',
      ...(choice.ending ? [`  **${choice.ending.title}.** ${choice.ending.text}`, ''] : []),
    ])] : []),
    ...(scene.routes ? ['**Условный переход**', '', ...scene.routes.map((route) => `- ${conditionText(route.condition)} → ${route.next}`), `- В остальных случаях → ${scene.next}.`, ''] : []),
  ]),
];
await writeFile(new URL('Сценарий.md', root), manuscript.join('\n') + '\n', 'utf8');
console.log(`Сюжет ${story.version}: ${story.scenes.length} сцен. Фото подготовлены для статического хостинга: ${fileURLToPath(new URL('public/photo/', root))}`);
