// The bolt concept's colours: only the reel's palette (src/theme.ts) and mixes of it.
import { C } from '../../theme';

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const mix = (a: string, b: string, t: number) => {
  const A = rgb(a);
  const B = rgb(b);
  return '#' + A.map((x, i) => Math.round(x + (B[i] - x) * t).toString(16).padStart(2, '0')).join('');
};

export const P = {
  ink: C.night, // the sticker outline, cracks, pupils
  white: C.white, // highlights, sticker border, the seam
  body: mix(C.porcelain, C.cream, 0.35), // warm porcelain shell
  top: C.cream, // lit faces (the cube's lid)
  shade: mix(C.porcelain, C.porcelainShade, 0.62), // the one flat shade shape
  cheek: mix(C.porcelain, C.ember, 0.36),
  tongue: mix(C.ember, C.porcelain, 0.28),
  ember: C.ember,
  screen: C.night,
  glare: mix(C.night, C.white, 0.13),
  shadowOnWhite: mix(C.white, C.maroon, 0.12),
  shadowOnMaroon: mix(C.maroon, C.night, 0.62),
};
