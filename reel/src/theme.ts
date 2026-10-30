// The reel's style: flat motion graphics on white and maroon, one bold sans.
// White replaces gold everywhere. Nothing else in the reel holds a colour or a font.

export const C = {
  night: '#120309',
  maroon: '#56021A',
  cream: '#FDF9F0',
  white: '#FFFFFF',
  gold: '#FFFFFF', // the seams' colour, white now (the key stays so the cast reads one palette)
  porcelain: '#EFEAE4',
  porcelainShade: '#B9C1CB',
  ember: '#E8392E',
  poolCentre: '#2B0B16',
} as const;

// The 9° slit: Diablo's eyes lean 9° from vertical, top to the right.
export const SLANT = 9;
export const SLANT_RAD = (SLANT * Math.PI) / 180;

// Engraved hatching (the bots' shading).
export const HATCH = { width: 1.5, gap: 7, angle: SLANT };

// Seams: 6 px white with a 2 px core.
export const SEAM = { width: 6, core: 2 };

export const FONT = {
  sans: '"Geist", sans-serif',
  mono: '"Geist Mono", monospace',
};
