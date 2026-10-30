// The Gold Seam style: palette, light, line, type. Nothing else in the reel
// holds a colour or a font.

export const C = {
  night: '#120309',
  maroon: '#56021A',
  cream: '#FDF9F0',
  gold: '#E9B44C',
  porcelain: '#EFEAE4',
  porcelainShade: '#B9C1CB',
  ember: '#E8392E',
  poolCentre: '#2B0B16', // the key light's pool, fading to night at its edge
} as const;

// The 9° slit: Diablo's eyes lean 9° from vertical, top to the right. Every
// slanted thing in the reel uses it.
export const SLANT = 9;
export const SLANT_RAD = (SLANT * Math.PI) / 180;

// Engraved hatching.
export const HATCH = { width: 1.5, gap: 7, angle: SLANT };

// Gold seams: 6 px gold with a 2 px cream core.
export const SEAM = { width: 6, core: 2 };

export const GRAIN_OPACITY = 0.04;

export const FONT = {
  serif: '"Bodoni Moda", serif',
  serifWeight: 600,
  mono: '"IBM Plex Mono", monospace',
  monoWeight: 500,
};

export const TYPE = {
  oneLine: { size: 104, lineHeight: 104 },
  twoLines: { size: 88, lineHeight: 96 },
  endName: { size: 120 },
  url: { size: 40 },
  fadeFrames: 8,
  risePx: 12,
};
