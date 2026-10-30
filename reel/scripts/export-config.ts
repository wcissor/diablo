// Writes build/config.json so the audio and QA scripts read the same frames,
// words and beats as the picture.
import fs from 'node:fs';
import path from 'node:path';
import * as cfg from '../src/config';

const out = path.join(__dirname, '..', 'build', 'config.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
const { sec: _sec, ...data } = cfg;
fs.writeFileSync(out, JSON.stringify(data, null, 2));
console.log(`wrote ${path.relative(process.cwd(), out)}`);
