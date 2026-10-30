// The facet bots' colours: only the reel's palette (C) and mixes between them.
import { C } from '../../theme';

const hex = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
export const mix = (a: string, b: string, t: number) => {
  const A = hex(a);
  const B = hex(b);
  return `#${A.map((x, i) => Math.round(x + (B[i] - x) * t)
    .toString(16)
    .padStart(2, '0')).join('')}`;
};

export const K = {
  ink: C.night, // outlines, ink features
  white: C.white,
  body: C.porcelain,
  light: mix(C.porcelain, C.white, 0.7), // lit planes (the cube's top)
  shade: mix(C.porcelain, C.porcelainShade, 0.62), // the one flat shade
  deep: mix(C.porcelainShade, C.night, 0.12), // feet, fins: a step darker
  screen: mix(C.night, C.maroon, 0.32),
  mouth: mix(C.night, C.maroon, 0.55),
  tongue: mix(C.ember, C.porcelain, 0.38),
  blush: mix(C.porcelain, C.ember, 0.3),
  core: C.night, // the dark inside a lifted facet
  ember: C.ember,
};
