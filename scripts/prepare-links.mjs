import { readFile, writeFile } from 'node:fs/promises';
import QRCode from 'qrcode';

const root = new URL('../', import.meta.url);
const links = JSON.parse(await readFile(new URL('assets/distribution/links.json', root), 'utf8'));
for (const [name, url] of Object.entries({ browser: links.web, expo: links.expoGo })) {
  if (!url) continue;
  if (!/^(https|exp|exps):\/\//.test(url)) throw new Error(`Invalid ${name} link`);
  const svg = await QRCode.toString(url, { type: 'svg', width: 220, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#201a13', light: '#ffffff' } });
  await writeFile(new URL(`assets/distribution/${name}-qr.svg`, root), svg);
  console.log(`QR: ${name}`);
}
