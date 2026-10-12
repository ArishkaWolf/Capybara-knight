import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const cwd = fileURLToPath(root);
const app = JSON.parse(await readFile(new URL('app.json', root), 'utf8')).expo;
const projectId = app.extra?.eas?.projectId;
if (!projectId) throw new Error('Link this project to Expo with eas project:init first.');
const prepared = spawnSync(process.execPath, ['scripts/prepare-story.mjs'], { cwd, stdio: 'inherit' });
if (prepared.status !== 0) process.exit(prepared.status ?? 1);
const cli = JSON.parse(await readFile(new URL('node_modules/eas-cli/package.json', root), 'utf8'));
const executable = fileURLToPath(new URL(`node_modules/eas-cli/${cli.bin.eas}`, root));
const published = spawnSync(process.execPath, [executable, 'update', '--branch', 'preview', '--environment', 'preview', '--platform', 'all', '--input-dir', 'artifacts/expo-update', '--message', process.argv[2] ?? 'Обновление игры для iOS и Android', '--json'], {
  cwd, encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'], maxBuffer: 10 * 1024 * 1024,
  env: { ...process.env, EXPO_PUBLIC_STORY_URL: process.env.EXPO_PUBLIC_STORY_URL ?? 'https://arishkawolf.github.io/Capybara-knight/story.json' },
});
if (published.status !== 0) process.exit(published.status ?? 1);
const updates = JSON.parse(published.stdout);
if (!updates.some(update => update.platform === 'ios') || !updates.some(update => update.platform === 'android')) throw new Error('Both platforms must be published.');
await mkdir(new URL('artifacts/', root), { recursive: true });
await writeFile(new URL('artifacts/expo-publication.json', root), published.stdout);
const update = updates[0];
const query = new URLSearchParams({ projectId, groupId: update.group, format: 'url' });
const response = await fetch(`https://qr.expo.dev/eas-update?${query}`);
if (!response.ok) throw new Error(`Expo QR service: ${response.status}`);
const expoGo = (await response.text()).trim();
if (!/^exps?:\/\/u\.expo\.dev\//.test(expoGo)) throw new Error('Expected an official Expo Go link.');
const preview = new URL('https://expo.dev/preview/update/expo-go');
preview.search = new URLSearchParams({ projectId, group: update.group, slug: 'exp', updateRuntimeVersion: update.runtimeVersion });
const links = { web: 'https://arishkawolf.github.io/Capybara-knight/', expoGo, expoPreview: preview.toString(), expoProject: projectId, expoGroup: update.group };
await writeFile(new URL('assets/distribution/links.json', root), JSON.stringify(links, null, 2) + '\n');
let readme = await readFile(new URL('README.md', root), 'utf8');
readme = readme.replace(/\*\*\[Открыть в Expo Go →\]\([^\n]+?\)\*\*/, `**[Открыть в Expo Go →](${links.expoPreview})**`);
await writeFile(new URL('README.md', root), readme);
await import('./prepare-links.mjs');
console.log('Expo preview published for both platforms; README links and QR updated.');
