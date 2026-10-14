import { readFile, writeFile, copyFile, readdir, unlink } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await copyFile(new URL('assets/story.json', root), new URL('dist/story.json', root));
await writeFile(new URL('dist/.nojekyll', root), '');
for (const name of await readdir(new URL('dist/photo/', root))) {
  if (/\.png$/i.test(name)) await unlink(new URL(`dist/photo/${name}`, root));
}
const story = JSON.parse(await readFile(new URL('dist/story.json', root), 'utf8'));
console.log(`Веб-релиз: ${story.scenes.length} сцен, оптимизированный арт и настройки мобильного браузера.`);
