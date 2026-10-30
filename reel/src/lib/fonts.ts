import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';

// Geist and Geist Mono (the app's own type, OFL), served locally so the render
// never reaches the network.
let loaded: Promise<unknown> | null = null;
export const ensureFonts = () => {
  if (!loaded) {
    loaded = Promise.all([
      loadFont({ family: 'Geist', url: staticFile('fonts/Geist-Variable.woff2'), weight: '100 900' }),
      loadFont({ family: 'Geist Mono', url: staticFile('fonts/GeistMono-Variable.woff2'), weight: '100 900' }),
    ]);
  }
  return loaded;
};
