import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateStory } from '../src/engine.mjs';
import { prepareImages, prepareBranding } from './prepare-images.mjs';
const root = new URL('../', import.meta.url);
const story = validateStory(JSON.parse(await readFile(new URL('public/story.json', root), 'utf8')));
await prepareImages(story);
await prepareBranding();
// A readable review copy, regenerated from the canonical JSON on every build.
const clueNames = { fur: 'шерсть', paws: 'отпечатки лап', quill: 'игла дикобраза' };
const describeCondition = (condition) => condition ? ' *(' + [
  ...(condition.found?.length ? [`найдено: ${condition.found.map((id) => clueNames[id]).join(', ')}`] : []),
  ...(condition.missing?.length ? [`не найдено: ${condition.missing.map((id) => clueNames[id]).join(', ')}`] : []),
  ...(condition.talkedToPorcupine === undefined ? [] : [condition.talkedToPorcupine ? 'после разговора с Дикобразом' : 'сразу к волкам']),
].join('; ') + ')*' : '';
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
      `Нажать на предмет «${scene.interaction.label}» → ${scene.next}. До нажатия обычный переход заблокирован. В следующем кадре нужно прочитать все реплики записки.`, '',
    ] : []),
    ...(scene.choices ? ['**Выбор игрока**', '', ...scene.choices.flatMap((choice) => [
      `- ${choice.label} → ${choice.next ?? 'конец игры'}`, '',
      ...(choice.ending ? [`  **${choice.ending.title}.** ${choice.ending.text}`, ''] : []),
    ])] : []),
  ]),
];
await writeFile(new URL('Сценарий.md', root), manuscript.join('\n') + '\n', 'utf8');
console.log(`Сюжет ${story.version}: ${story.scenes.length} сцен. Фото подготовлены для статического хостинга: ${fileURLToPath(new URL('public/photo/', root))}`);
