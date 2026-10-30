#!/usr/bin/env python3
"""Dev aid: draws the score, effects and main mix as log-frequency
spectrograms (30 Hz - 16 kHz) with the cuts (white), the BEATS (gold ticks),
the silence (red band) and the mix's momentary loudness (cream line) on one
PNG, so the sound can be checked against the picture's timing by eye.

  python3 scripts/audio/plot.py [out.png]      (default out/dev/audio.png)
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import signal

from dsp import AUDIO_BUILD, REEL, SR, load_config, momentary_lufs, read_wav

PX_PER_S = 90
ROW_H = 260
FMIN, FMAX = 30.0, 16000.0


def spectro(x: np.ndarray, width: int) -> np.ndarray:
    mono = x.mean(axis=1)
    f, t, Z = signal.stft(mono, fs=SR, nperseg=4096, noverlap=4096 - SR // PX_PER_S)
    db = 20 * np.log10(np.abs(Z) + 1e-9)
    rows = np.geomspace(FMAX, FMIN, ROW_H)
    img = np.empty((ROW_H, db.shape[1]))
    for i, fr in enumerate(rows):
        img[i] = db[np.argmin(np.abs(f - fr))]
    img = img[:, :width]
    v = np.clip((img + 110) / 90, 0, 1)
    return v


def colour(v: np.ndarray) -> np.ndarray:
    # night → maroon → ember → gold → cream
    stops = np.array([[18, 3, 9], [86, 2, 26], [232, 57, 46], [233, 180, 76], [253, 249, 240]], float)
    pos = np.linspace(0, 1, len(stops))
    out = np.stack([np.interp(v, pos, stops[:, c]) for c in range(3)], axis=-1)
    return out.astype(np.uint8)


def main() -> None:
    cfg = load_config()
    dest = Path(sys.argv[1]) if len(sys.argv) > 1 else REEL / 'out' / 'dev' / 'audio.png'
    width = int(cfg.n / SR * PX_PER_S)
    names = [n for n in ('score', 'sfx', 'mix-main', 'voice', 'mix-vo') if (AUDIO_BUILD / f'{n}.wav').exists()]
    H = len(names) * (ROW_H + 24) + 140
    im = Image.new('RGB', (width + 60, H), (10, 2, 6))
    d = ImageDraw.Draw(im)
    x0 = 50
    fx = lambda frame: x0 + frame / cfg.fps * PX_PER_S
    for r, name in enumerate(names):
        y = r * (ROW_H + 24) + 20
        x = read_wav(AUDIO_BUILD / f'{name}.wav')
        im.paste(Image.fromarray(colour(spectro(x, width))), (x0, y))
        d.text((x0 + 4, y - 16), name, fill=(253, 249, 240))
        for hz in (50, 100, 200, 500, 1000, 2000, 5000, 10000):
            yy = y + ROW_H * np.log(FMAX / hz) / np.log(FMAX / FMIN)
            d.text((2, yy - 5), f'{hz if hz < 1000 else str(hz // 1000) + "k"}', fill=(185, 193, 203))
        sil = cfg['BEATS']['silence']
        d.rectangle([fx(sil['from']), y + ROW_H, fx(sil['to']), y + ROW_H + 4], fill=(232, 57, 46))
        for c in cfg['CUTS']:
            d.line([fx(c), y, fx(c), y + ROW_H], fill=(253, 249, 240), width=1)
        beats = []
        for v in cfg['BEATS'].values():
            beats += v if isinstance(v, list) else ([v] if isinstance(v, (int, float)) else [])
        for b in beats:
            d.line([fx(b), y, fx(b), y + 10], fill=(233, 180, 76), width=2)
    # loudness of the main mix
    y = len(names) * (ROW_H + 24) + 10
    mix = read_wav(AUDIO_BUILD / 'mix-main.wav')
    t, m = momentary_lufs(mix, 0.4, 0.02)
    pts = [(x0 + tt * PX_PER_S, y + 110 - (np.clip(mm, -50, -5) + 50) * 2.4) for tt, mm in zip(t, m)]
    for lv in (-10, -18, -30, -40):
        yy = y + 110 - (lv + 50) * 2.4
        d.line([x0, yy, x0 + width, yy], fill=(60, 20, 30))
        d.text((2, yy - 5), f'{lv}', fill=(185, 193, 203))
    d.line(pts, fill=(253, 249, 240), width=1)
    for s in range(0, int(cfg.n / SR) + 1):
        d.text((x0 + s * PX_PER_S - 4, H - 14), f'{s}s', fill=(185, 193, 203))
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest)
    print(f'wrote {dest.relative_to(REEL) if dest.is_relative_to(REEL) else dest}')


if __name__ == '__main__':
    main()
