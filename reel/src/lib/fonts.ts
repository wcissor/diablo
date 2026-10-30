import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';

// Bodoni Moda 600 and IBM Plex Mono 500 (Google Fonts, OFL), served locally so
// the render never reaches the network.
let loaded: Promise<unknown> | null = null;
export const ensureFonts = () => {
  if (!loaded) {
    loaded = Promise.all([
      loadFont({ family: 'Bodoni Moda', url: staticFile('fonts/bodoni-moda-latin-600-normal.woff2'), weight: '600' }),
      loadFont({ family: 'IBM Plex Mono', url: staticFile('fonts/ibm-plex-mono-latin-500-normal.woff2'), weight: '500' }),
    ]);
  }
  return loaded;
};
