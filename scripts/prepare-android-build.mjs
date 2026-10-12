import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const wrapper = new URL('android/gradle/wrapper/gradle-wrapper.properties', root);
let config = await readFile(wrapper, 'utf8');
config = /^networkTimeout=/m.test(config) ? config.replace(/^networkTimeout=.*$/m, 'networkTimeout=120000') : config + '\nnetworkTimeout=120000\n';
await writeFile(wrapper, config);
