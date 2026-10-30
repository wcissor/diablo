// Render a handful of frames as PNG stills with one bundle (fast iteration and QA).
// Usage: npx tsx scripts/stills.ts <outPrefix> <frame...> [--comp=IntroReel]
import path from 'node:path';
import fs from 'node:fs';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

const BROWSER =
  process.env.REMOTION_BROWSER ?? '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';

const main = async () => {
  const args = process.argv.slice(2);
  const comp = (args.find((a) => a.startsWith('--comp=')) ?? '--comp=IntroReel').slice(7);
  const rest = args.filter((a) => !a.startsWith('--'));
  const prefix = rest[0];
  const frames = rest.slice(1).map(Number);
  if (!prefix || frames.length === 0) throw new Error('usage: stills.ts <outPrefix> <frame...> [--comp=Id]');
  fs.mkdirSync(path.dirname(prefix), { recursive: true });
  const serveUrl = await bundle({ entryPoint: path.join(__dirname, '..', 'src', 'index.ts') });
  const composition = await selectComposition({ serveUrl, id: comp, browserExecutable: BROWSER });
  for (const frame of frames) {
    const output = `${prefix}-${String(frame).padStart(3, '0')}.png`;
    await renderStill({ serveUrl, composition, frame, output, browserExecutable: BROWSER, overwrite: true, chromiumOptions: { gl: (process.env.REMOTION_GL === 'default' ? null : (process.env.REMOTION_GL ?? 'swiftshader')) as never } });
    console.log(output);
  }
};
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
