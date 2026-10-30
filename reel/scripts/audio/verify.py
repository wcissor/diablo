#!/usr/bin/env python3
"""Checks the main mix: exact length, loudness, true peak, the silent black
tail, and a transient on every colour-beat cut. --strict exits 1 on a FAIL."""

import sys

import numpy as np

from dsp import AUDIO_BUILD, SR, integrated_lufs, load_config, onset_envelope, read_wav, true_peak_db

cfg = load_config()
x = read_wav(AUDIO_BUILD / 'mix-main.wav')
rows = []


def check(name, ok, detail):
    rows.append((name, ok, detail))


check('length', len(x) == cfg.n, f'{len(x)} samples (want {cfg.n})')
lufs = integrated_lufs(x)
check('loudness', abs(lufs + 18) <= 0.5, f'{lufs:.2f} LUFS (-18 ±0.5)')
tp = true_peak_db(x)
check('true peak', tp <= -2.4, f'{tp:.2f} dBTP (≤ -2.4 before AAC)')
tail = x[cfg.s(cfg['EVENTS']['irisClose']['to']):]
check('black tail silent', np.abs(tail).max() < 1e-4, f'max {np.abs(tail).max():.2e} from frame {cfg["EVENTS"]["irisClose"]["to"]}')
times, flux = onset_envelope(x)
for c in cfg['CUTS']:
    t = c / cfg.fps
    near = (times > t - 2 / cfg.fps) & (times < t + 2 / cfg.fps)
    base = np.median(flux)
    peak = flux[near].max() if near.any() else 0
    check(f'cut {c} transient', peak > 4 * base, f'flux {peak / (base + 1e-12):.1f}× median within ±2 frames')

bad = [r for r in rows if not r[1]]
for name, ok, detail in rows:
    print(f"{'PASS' if ok else 'FAIL'}  {name}: {detail}")
if bad and '--strict' in sys.argv:
    sys.exit(1)
