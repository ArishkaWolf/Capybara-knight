import { readFile, copyFile, readdir, unlink } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
// public/story.json remains the editable source. The published copy uses WebP.
await copyFile(new URL('assets/story.json', root), new URL('dist/story.json', root));
for (const name of await readdir(new URL('dist/photo/', root))) {
  if (/\.png$/i.test(name)) await unlink(new URL(`dist/photo/${name}`, root));
}
const story = JSON.parse(await readFile(new URL('dist/story.json', root), 'utf8'));
console.log(`Веб-релиз: ${story.scenes.length} сцен, оптимизированный арт и настройки мобильного браузера.`);
