#!/usr/bin/env python3
"""Diablo intro reel: the original score and sound effects, made in code.

No samples: every sound below is synthesised from oscillators, filtered noise
and modal resonators (brief section 7). Every time comes from build/config.json
(src/config.ts): BEATS drive the score, SFX and EVENTS the effects.

Writes 48 kHz stereo 32-bit float, exactly DURATION frames long (960000 samples):
  audio/build/score.wav      score stem   (at mix gain, before the limiter)
  audio/build/sfx.wav        effects stem (at mix gain, before the limiter)
  audio/build/mix-main.wav   the main cut: -18 LUFS integrated, <= -1 dBTP
  audio/build/mix-info.json  gains and measurements
If audio/score.mp3 exists it replaces the synthesised score (the effects stay)
and audio/build/beat-shift.json suggests, for each cut, the nearest detected
beat within 3 frames.

  python3 scripts/audio/synth.py [--score-file PATH] [--out-dir DIR]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from scipy import signal

from dsp import (AUDIO_BUILD, REEL, SR, TAU, Bus, Config, a2db, ar, band, butter, db2a, decode,
                 env_db, fit_length, hp_mag, integrated_lufs, interp, interp_geo, load_config, lp_mag,
                 make_ir, momentary_lufs, normalize_and_limit, onset_envelope, pick_onsets, shaped_noise,
                 shelf, soft_clip, tvec, write_wav)

TARGET_LUFS = -18.0
CEILING_DBTP = -1.0
AAC_HEADROOM_DB = 0.5  # the AAC encode in the render adds a few tenths of a dB of true peak

# Where the three bots stand (brief section 5: centre x on the 1080 canvas) as
# stereo positions, and who gets hit by what (storyboard).
BOT_X = {'bubble': 270, 'cube': 540, 'orb': 800}
PAN = {k: (x - 540) / 540 * 0.9 for k, x in BOT_X.items()}
CRACK_BOT = {'crack1': 'orb', 'crack2': 'cube'}
STRIKE_CLIP_DB = 6.0  # the strike group's peaks are soft-clipped this far down (4x oversampled)
BLINK_REOPEN_FRAMES = 4  # the softer tick as a blinking bot reopens its eyes (frames after the blink)
CRACK_BURST_S = 0.45     # a porcelain crack's micro-cracks thin out over this long
HAIRLINE = (5, 0.009)    # the hairline crack at crack1.at: grains, seconds apart

# Mix levels (dB) — the balance between elements. The whole mix is then
# normalised to -18 LUFS, so these are relative.
LV = {
    # score
    'drone': -23.0, 'tension': -27.0, 'riser': -25.0, 'heart': -9.0, 'strike_score': -11.0, 'strike_stab': -7.0,
    'dark_drone': -21.0, 'slow_pulse': -9.0, 'tense_pulse': -13.0, 'tense_stab': -22.0,
    'swell_pad': -18.0, 'rev_cymbal': -27.0, 'landing_boom': -15.5, 'landing_pluck': -21.5, 'crash': -28.0,
    'calm_pad': -29.0, 'calm_lub': -14.5, 'calm_bass': -18.0, 'calm_bell': -23.0,
    'end_boom': -10.5, 'end_piano': -16.5,
    # effects
    'slit_air': -27.0, 'tick': -30.0, 'shing': -21.0, 'whoosh': -14.0, 'rumble': -17.0,
    'scythe': -25.0, 'scrape': -24.0, 'inhale': -17.0,
    'strike_thump': -7.0, 'strike_burst': -3.5, 'strike_crack': -4.0, 'strike_body': -7.5,
    'slow_rumble': -16.0, 'crackle': -21.0, 'sizzle': -20.0, 'chime': -22.0, 'hairline': -30.0,
    'tink': -21.0, 'snap': -20.0, 'ring_whoosh': -23.0, 'click': -18.0, 'ring_shimmer': -31.0,
    'end_boom_sfx': -11.0, 'wipe_air': -27.0, 'close_air': -17.0,
}


def midi(m: float) -> float:
    return 440.0 * 2.0 ** ((m - 69) / 12.0)


def saw(freq, n: int, fc, rolloff: float = 1.0, phase0: float = 0.0, fmax: float = 16000.0) -> np.ndarray:
    """Band-limited additive sawtooth through a 12 dB/oct low-pass whose cutoff
    (scalar or per sample) can move: each harmonic is weighted by the filter's
    response at its own frequency, so sweeps are exact and alias-free."""
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    fc = np.broadcast_to(np.asarray(fc, dtype=float), (n,))
    ph = TAU * (phase0 + np.cumsum(f) / SR)
    out = np.zeros(n)
    fmin, fcmax = max(float(f.min()), 1.0), float(fc.max())
    for k in range(1, int(min(fmax, 5.0 * fcmax) / fmin) + 1):
        if (k * fmin / fcmax) ** 2 * k ** rolloff > 3e3:
            break
        h = 1.0 / np.sqrt(1.0 + (k * f / fc) ** 4)
        h = np.where(k * f < 19000.0, h, 0.0)
        out += h * np.sin(k * ph) / k ** rolloff
    return out


def ensemble(freq, n, fc, rng, detune_cents=6.0, rolloff=1.0, voices=2, spread=0.6):
    """Detuned saw voices spread across the stereo field → (n, 2)."""
    out = np.zeros((n, 2))
    for v in range(voices):
        d = (v - (voices - 1) / 2) / max(1, (voices - 1) / 2) if voices > 1 else 0.0
        fr = np.asarray(freq) * 2 ** (d * detune_cents / 1200)
        s = saw(fr, n, fc, rolloff, phase0=rng.uniform())
        th = (d * spread + 1) * np.pi / 4
        out[:, 0] += s * np.cos(th)
        out[:, 1] += s * np.sin(th)
    return out / np.sqrt(voices)


# Buffers last this many time constants of their slowest part: e^-8 is -69 dB,
# which leaves room for saturation (tanh lifts a decaying tail by up to ~6 dB
# relative to the normalised peak) and for partials that sum.
TAILS = 8.0


def ring_n(*taus, extra: float = 0.0) -> int:
    """Samples for a sound whose slowest decay is max(taus) to die below -60 dB."""
    return int((extra + TAILS * max(taus)) * SR) + 64


def release(x: np.ndarray, off: float, rel: float) -> np.ndarray:
    """Note-off: from `off` seconds the sound is damped with time constant `rel`
    (a hand on the string, a pedal lifted); the buffer is trimmed to where it
    has died away."""
    n = min(x.shape[0], ring_n(rel, extra=off))
    t = tvec(n)
    g = np.exp(-np.maximum(t - off, 0.0) / rel)
    return x[:n] * (g if x.ndim == 1 else g[:, None])


def modal(n, freqs, amps, taus, rng, attack=0.0006):
    """Struck resonator: a sum of exponentially decaying partials
    (n=None: long enough for the slowest partial to die away)."""
    n = ring_n(*taus) if n is None else n
    t = tvec(n)
    out = np.zeros(n)
    for f, a, tau in zip(freqs, amps, taus):
        if f < 18000:
            out += a * np.exp(-t / tau) * np.sin(TAU * f * t + rng.uniform(0, TAU))
    return out * np.clip(t / attack, 0, 1)


def pluck(f0, n, rng, partials=12, bright=1.6, decay=1.2, inharm=0.0, attack=0.002, off=None, rel=0.12):
    """Plucked string; the fundamental decays with `decay`, upper partials
    faster. n=None sizes the buffer for the full ring (or for the release when
    a note-off `off` is given)."""
    if n is None:
        n = ring_n(rel, extra=off) if off is not None else ring_n(decay)
    t = tvec(n)
    out = np.zeros(n)
    for k in range(1, partials + 1):
        fk = k * f0 * np.sqrt(1.0 + inharm * k * k)
        if fk > 17000:
            break
        out += np.exp(-t / (decay / k ** 0.75)) * np.sin(TAU * fk * t + rng.uniform(0, 0.3)) / k ** bright
    out *= np.sin(0.5 * np.pi * np.clip(t / attack, 0, 1))
    return release(out, off, rel) if off is not None else out


def chime_taus(f0, length=1.0):
    return np.array([1.7, 1.0, 0.55, 0.38, 0.25, 0.15]) * length * (440.0 / f0) ** 0.3


def chime(f0, n, rng, length=1.0):
    """A gold chime: near-harmonic bell partials, the upper ones dying first
    (n=None: the full ring)."""
    ratios = [1.0, 2.0, 2.99, 4.17, 5.43, 6.79]
    amps = [1.0, 0.42, 0.2, 0.13, 0.07, 0.04]
    taus = chime_taus(f0, length)
    n = ring_n(*taus) if n is None else n
    x = modal(n, [f0 * r for r in ratios], amps, taus, rng, attack=0.0012)
    t = tvec(n)
    x += 0.15 * rng.standard_normal(n) * np.exp(-t / 0.0015)  # strike
    return x


def sat(x, drive):
    return np.tanh(drive * x) / np.tanh(drive)


def norm(x):
    p = np.max(np.abs(x))
    return x / p if p > 0 else x


def thump(n, f_end, f_start, tau, rng, drive=2.0, attack=0.0015, sweep_tau=0.022):
    """Sine kick with a falling pitch, saturated for harmonics (n=None: the full ring)."""
    n = ring_n(tau, extra=attack) if n is None else n
    t = tvec(n)
    f = f_end + (f_start - f_end) * np.exp(-t / sweep_tau)
    x = np.sin(TAU * np.cumsum(f) / SR) * ar(n, attack, tau)
    return sat(x, drive)


def heartbeat(rng, strength=1.0, pitch=1.0, tau=0.11, body=1.0, click=1.0, knock=1.0):
    """One heart sound: a low pitched thump (felt), a muffled body and a soft
    knock and click so it still reads as a transient on small speakers. The
    buffer lasts until the slowest part (thump or knock) has died away."""
    n = ring_n(tau, 0.045, extra=0.003)
    t = tvec(n)
    x = thump(n, 46 * pitch, 105 * pitch, tau, rng, drive=1.8, attack=0.003, sweep_tau=0.018)
    nz = butter(rng.standard_normal(n), 'lowpass', 240 * pitch) * np.exp(-t / 0.035) * 0.35 * body
    kn = (np.sin(TAU * 150 * pitch * t) + 0.35 * np.sin(TAU * 300 * pitch * t + 0.5)) * ar(n, 0.002, 0.045) * 0.3 * knock
    clk = butter(rng.standard_normal(n), 'bandpass', [700, 2800]) * np.exp(-t / 0.004) * 0.12 * click
    return strength * (x + nz + kn + clk)


def lub_dub(rng, strength, pitch, gap, with_dub=True, tau=0.11, knock=1.0):
    lub = heartbeat(rng, strength, pitch, tau, knock=knock)
    if not with_dub:
        return lub
    dub = heartbeat(rng, strength * 0.62, pitch * 1.22, tau * 0.75, click=0.6, knock=knock)
    k = int(gap * SR)
    out = np.zeros(max(len(lub), k + len(dub)))
    out[: len(lub)] += lub
    out[k:k + len(dub)] += dub
    return out


def grain(rng, fscale=1.0, tscale=1.0):
    """A porcelain micro-crack: an impulse into a few small high resonances."""
    k = rng.integers(2, 4)
    freqs = rng.uniform(1800, 8800, k) * fscale
    amps = rng.uniform(0.3, 1.0, k)
    taus = rng.uniform(0.003, 0.016, k) * tscale
    x = modal(ring_n(1.15 * taus.max()), freqs, amps, taus, rng, attack=0.0001)  # (up to 3 partials sum)
    x[:24] += rng.standard_normal(24) * np.linspace(1, 0, 24) * 0.8
    return x


def porcelain_crack(rng, size=1.0, burst=CRACK_BURST_S):
    """Sharp crack: a dense burst of micro-cracks thinning out over `burst`
    seconds, over a short porcelain ring (the buffer holds the whole ring)."""
    taus = [0.22, 0.16, 0.12, 0.08, 0.06, 0.04]
    n = max(ring_n(*taus), int((burst + 0.15) * SR))
    out = np.zeros(n)
    tt, i = 0.0, 0
    while tt < burst:
        g = grain(rng) * (0.9 * np.exp(-tt / 0.07) + 0.08) * rng.uniform(0.5, 1.0)
        k = int(tt * SR)
        m = min(len(g), n - k)
        out[k:k + m] += g[:m]
        tt += rng.exponential(0.0015 + 0.05 * (tt / burst) ** 1.5)
        i += 1
    base = rng.uniform(1650, 2050) / size
    ratios = np.array([1.0, 1.53, 2.27, 3.17, 4.12, 5.31]) * (1 + rng.normal(0, 0.012, 6))
    out += 0.7 * modal(n, base * ratios, [1, .8, .6, .45, .3, .2], taus, rng)
    return out


def rumble(n, rng):
    """The pull-up rumble: resonant low noise with a slow, uneven swell, and a sub."""
    x = shaped_noise(n, lambda T, F: (band(F, 55, 0.8) + 0.4 * band(F, 150, 0.9) + 0.14 * band(F, 380, 1.0))
                     * hp_mag(F, 25, 2), rng)
    t = tvec(n)
    am = butter(rng.standard_normal(n), 'lowpass', 4.0)
    am = 0.65 + 0.35 * am / (np.std(am) * 2.5)
    sub = np.sin(TAU * np.cumsum(41 + 1.5 * np.sin(TAU * 0.7 * t)) / SR)
    return x * am[:, None] / (np.std(x) * 3) + 0.25 * sub[:, None]


# ================================================================= score ===

def build_score(cfg: Config, irs: dict) -> np.ndarray:
    B, E, S = cfg['BEATS'], cfg['EVENTS'], cfg.s
    T = cfg.t
    N = cfg.n
    bus = Bus(N, 'score')
    rng = np.random.default_rng(11)
    sil0, strike = B['silence']['from'], B['strike']
    shots = {s['id']: s for s in cfg['SHOTS']}

    # --- A. Drone from 0.0 s, darkening into the pull-up ------------------
    n = S(sil0 + 1)
    t = tvec(n)
    fc = interp_geo(t, [(0, 140), (T(E['flicker']['from']), 210), (T(shots[2]['from']), 320), (T(sil0), 820)])
    amp = env_db(t, [(0, -60), (0.8, 0), (T(E['flicker']['from']), 0), (T(shots[2]['from']), 2.0), (T(sil0), 7.0)])
    amp *= 1 + 0.12 * np.sin(TAU * 0.17 * t)
    drone = (db2a(-2) * ensemble(midi(26), n, fc, rng, 5) + db2a(-7) * ensemble(midi(33), n, fc, rng, 6)
             + db2a(-4) * ensemble(midi(38), n, fc, rng, 7))
    # A breathing mid layer (D3, A3) so the drone still reads on a phone speaker.
    fcm = interp_geo(t, [(0, 650), (T(E['flicker']['from']), 900), (T(shots[2]['from']), 1100), (T(sil0), 2400)])
    breath = 1 + 0.25 * np.sin(TAU * 0.11 * t + 1.0)
    mid = (ensemble(midi(50), n, fcm, rng, 9, rolloff=1.3) + db2a(-4) * ensemble(midi(57), n, fcm, rng, 9, rolloff=1.3))
    drone = norm(drone) + db2a(-4) * norm(mid) * breath[:, None]
    # (cut_ok: the drone, the tension and the riser are choked by the silence mask at BEATS.silence)
    bus.add(norm(drone) * amp[:, None], 0, 0, LV['drone'], hall=0.3, cut_ok=True)

    # Tension: a high minor-second cluster from the moment the eyes open,
    # tremolo quickening and pitch creeping up through the pull-up.
    t0 = E['eyesOpen']['from']
    n = S(sil0 + 1) - S(t0)
    t = tvec(n) + T(t0)
    bend = 2 ** (interp(t, [(T(E['clawsUp']['from']), 0), (T(sil0), 0.7)]) / 12)
    vib = 2 ** (8 / 1200 * np.sin(TAU * 5.2 * t))
    trem_rate = interp(t, [(T(t0), 5.0), (T(sil0), 11.0)])
    trem = 1 - 0.4 * (0.5 + 0.5 * np.sin(TAU * np.cumsum(trem_rate) / SR))
    amp = env_db(t, [(T(t0), -40), (T(E['eyesOpen']['to']), -14), (T(shots[2]['from']), -10), (T(sil0), 0)])
    cl = sum(ensemble(midi(m) * bend * vib, n, 2400, rng, 9, rolloff=1.3) for m in (57, 62, 63))
    bus.add(norm(cl) * (amp * trem)[:, None], S(t0), 0, LV['tension'], hall=0.45, cut_ok=True)

    # Riser under the claws.
    t0 = E['clawsUp']['from']
    n = S(sil0 + 1) - S(t0)
    dur = n / SR
    fcn = lambda tt: interp_geo(tt, [(0, 450), (dur, 5200)])
    riser = shaped_noise(n, lambda TT, F: band(F, fcn(TT), 0.9) * (F / 1000) ** -0.3, rng)
    amp = env_db(tvec(n), [(0, -36), (dur * 0.6, -14), (dur, 0)])
    bus.add(norm(riser) * amp[:, None], S(t0), 0, LV['riser'], hall=0.35, cut_ok=True)

    # Heartbeat: lub-dub on every BEATS.heartbeat, harder and faster through shot 2.
    hb = B['heartbeat']
    for i, b in enumerate(hb):
        nxt = hb[i + 1] if i + 1 < len(hb) else strike
        gap = float(np.clip(0.32 * T(nxt - b), 0.1, 0.24))
        dub = T(b) + gap + 0.06 < T(sil0)
        x = i / max(1, len(hb) - 1)
        s_db = interp(x, [(0, -3.0), (1, 2.0)])
        bus.add(lub_dub(rng, 1.0, 1.0 + 0.1 * x, gap, dub, knock=1.5), S(b), 0, LV['heart'] + s_db,
                room=0.2, hall=0.1, label=f'heartbeat {b}')

    # --- B. The strike: a low orchestral hit, then the slow-motion drone ----
    n = ring_n(0.28, extra=0.003)
    t = tvec(n)
    boom = thump(None, midi(26), midi(38), 0.55, rng, drive=1.6, sweep_tau=0.05)
    bus.add(boom, S(strike), 0, LV['strike_score'], hall=0.2, label='strike boom')
    # The stab carries the hit's weight in the mids (what a phone plays): a
    # sustained, bright chord rather than more peak.
    stab = sum(ensemble(midi(m), n, 3200 * np.exp(-t / 0.14) + 380, rng, 8) for m in (38, 45, 50, 51))
    stab *= ar(n, 0.003, 0.28)[:, None]
    taiko = butter(rng.standard_normal(n), 'lowpass', 260) * ar(n, 0.001, 0.12) * 3
    bus.add(norm(stab + taiko[:, None]), S(strike), 0, LV['strike_stab'], hall=0.35, label='strike stab')

    # Dark drone 138 → swell: low and tense, pitched down an octave in the slow
    # motion (tape slowing), back up on the ramp; warms to major into the swell.
    sm, rb = E['slowMo'], E['rampBack']
    fill0, swell = E['fillAll']['from'], B['swell']
    n = S(swell + 8) - S(strike)
    t = tvec(n) + T(strike)
    ratio = interp_geo(t, [(T(strike), 1.0), (T(sm['from']), 1.0), (T(sm['from'] + 9), 0.5),
                           (T(rb['from']), 0.5), (T(rb['to']), 1.0)])
    fcd = interp_geo(t, [(T(strike), 900), (T(sm['from'] + 9), 230), (T(rb['to']), 300), (T(fill0), 320),
                         (T(swell), 1100)])
    warm = np.clip((t - T(fill0)) / (T(swell) - T(fill0)), 0, 1)
    dd = (ensemble(midi(26) * ratio, n, fcd, rng, 6) + db2a(-3) * ensemble(midi(38) * ratio, n, fcd, rng, 7)
          + db2a(-9) * ensemble(midi(51) * ratio, n, fcd, rng, 9) * (1 - warm)[:, None]
          + db2a(-9) * ensemble(midi(54) * ratio, n, fcd, rng, 9) * warm[:, None])
    trem = 1 - 0.25 * (0.5 + 0.5 * np.sin(TAU * 1.6 * (t - T(strike))))
    amp = env_db(t, [(T(strike), -30), (T(strike + 4), 0), (T(sm['to']), -2), (T(rb['to']), -3),
                     (T(fill0), -3), (T(swell - 4), 1), (T(swell + 7), -40), (T(swell + 8), -90)])
    bus.add(norm(dd) * (amp * trem)[:, None], S(strike), 0, LV['dark_drone'], hall=0.4)

    # Slow pulses: the heartbeat at quarter speed, deep and wet.
    for b in B['slowPulse']:
        x = lub_dub(rng, 1.0, 0.62, T(12), True, tau=0.26)
        bus.add(x, S(b), 0, LV['slow_pulse'], hall=0.5, label=f'slow pulse {b}')

    # Tense pulses: a heartbeat with a short low stab, tense → sus → major.
    for b in B['tensePulse']:
        bus.add(heartbeat(rng, 1.0, 1.1, 0.09), S(b), 0, LV['tense_pulse'], room=0.2)
        rel = (b - fill0) / max(1, swell - fill0)
        top = 51 if rel < 0 else (52 if rel < 0.5 else 54)  # Eb3, E3, F#3
        n = ring_n(0.16, extra=0.002)
        t = tvec(n)
        fcs = 2000 * np.exp(-t / 0.05) + 260
        st = sum(ensemble(midi(m), n, fcs, rng, 8) for m in (38, 45, 50, top))
        bus.add(norm(st) * ar(n, 0.002, 0.16)[:, None], S(b), 0, LV['tense_stab'], hall=0.3, label=f'tense stab {b}')

    # --- C. The warm swell into BEATS.swell, then the calm pad --------------
    calm = B['calmPulse']
    end_hit = B['endHit']
    mid5 = min(calm, key=lambda c: abs(c - (shots[5]['from'] + shots[5]['to'] + 1) / 2))
    dom = calm[-2]
    chords = [  # (from, to, midi notes): I – vi – IV – V, resolving to I on the end hit
        (fill0, mid5, [38, 50, 57, 62, 66, 69]),
        (mid5, shots[6]['from'], [35, 47, 54, 59, 62, 66]),
        (shots[6]['from'], dom, [31, 43, 50, 55, 59, 62, 69]),
        (dom, end_hit, [33, 45, 52, 57, 61, 64]),
    ]
    for ci, (a, b, notes) in enumerate(chords):
        x0 = S(a) - (0 if ci == 0 else int(0.25 * SR))
        n = S(b) + int(0.3 * SR) - x0
        t = tvec(n) + x0 / SR
        if ci == 0:
            rise = np.clip((t - T(a)) / (T(swell) - T(a)), 0, 1)
            after = np.maximum(t - T(swell), 0)
            fcp = np.where(t < T(swell), 300 * (4200 / 300) ** rise, 1400 + 2800 * np.exp(-after / 0.6))
            lvl = np.where(t < T(swell), rise ** 2.5,
                           db2a(LV['calm_pad'] - LV['swell_pad']) + (1 - db2a(LV['calm_pad'] - LV['swell_pad']))
                           * np.exp(-after / 0.45))
        else:
            fcp = interp_geo(t, [(T(a), 1400), (T(b), 2300 if ci >= 2 else 1600)])
            lvl = np.full(n, db2a(LV['calm_pad'] - LV['swell_pad']))
            lvl *= np.clip((t - x0 / SR) / 0.25, 0, 1)
            if ci == 2:
                lvl *= env_db(t, [(T(a), 0), (T(b), 2.0)])
            if ci == 3:
                lvl *= env_db(t, [(T(a), 2.0), (T(b), 4.0)])
        rel_end = (S(b) - x0) / SR
        if b == end_hit:  # the pad clears just before the end hit, so the hit lands in the open
            lvl *= np.clip((rel_end - (t - x0 / SR)) / 0.03, 0, 1)
        else:
            lvl *= np.clip((rel_end + 0.25 - (t - x0 / SR)) / 0.25, 0, 1)
        pad = sum(ensemble(midi(m), n, fcp, rng, 7, rolloff=1.25) for m in notes)
        breath = 1 + 0.08 * np.sin(TAU * 0.23 * t + ci)
        bus.add(pad * (lvl * breath)[:, None] / 3.0, x0, 0, LV['swell_pad'], hall=0.45)

    # Shimmer through shot 6: octave-up sines, slow tremolo.
    a, b = shots[6]['from'], end_hit
    n = S(b) - S(a)
    t = tvec(n)
    shim = sum(np.sin(TAU * midi(m) * t + rng.uniform(0, TAU)) * (1 + 0.5 * np.sin(TAU * (0.5 + 0.13 * i) * t))
               for i, m in enumerate((74, 78, 81, 86)))
    lvl = env_db(t, [(0, -30), (1.2, -6), (T(b - a) - 0.05, 0), (T(b - a) - 0.01, -60), (T(b - a), -90)])
    bus.add(shim * lvl / 4, S(a), 0, LV['calm_pad'] - 6, hall=0.6, cut_ok=True)  # its envelope closes at the end hit

    # Reverse cymbal into the swell, cut dead 30 ms before the beat so the
    # landing hits into a breath of air (and reads as a clean transient).
    n = int(1.3 * SR)
    t = tvec(n)
    rc = shaped_noise(n, lambda TT, F: hp_mag(F, 2500, 2) * (F / 4000) ** 0.2 * lp_mag(F, 14000), rng)
    x = (t / t[-1]) ** 4
    x[-int(0.004 * SR):] *= np.linspace(1, 0, int(0.004 * SR))  # its own 4 ms cut
    bus.add(norm(rc) * x[:, None], S(swell) - n - int(0.03 * SR), 0, LV['rev_cymbal'], hall=0.4, fade_ms=0, cut_ok=True)

    # Landing on the swell: a soft boom and a bright D major strum, rung until
    # the chord changes (then damped, like a lifted pedal).
    bus.add(thump(None, midi(26), midi(38), 0.6, rng, drive=1.3, sweep_tau=0.04),
            S(swell), 0, LV['landing_boom'], hall=0.3, label='landing boom')
    off = T(chords[1][0] - swell)
    n = ring_n(0.3, extra=off) + int(0.03 * SR)
    strum = np.zeros(n)
    for i, m in enumerate((62, 66, 69, 74, 78, 81)):
        k = int(i * 0.004 * SR)
        pl = pluck(midi(m), None, rng, 10, 1.5, 1.6, off=off - k / SR, rel=0.3)
        strum[k:k + len(pl)] += pl[: n - k]
    sh = butter(rng.standard_normal(n), 'highpass', 6000) * ar(n, 0.002, 0.8) * 0.15
    bus.add(norm(strum + sh), S(swell), 0, LV['landing_pluck'], hall=0.5, label='landing strum')
    n = ring_n(0.18, extra=0.002)
    taiko = (butter(rng.standard_normal(n), 'lowpass', 320) * ar(n, 0.001, 0.09) * 2.5
             + np.sin(TAU * midi(38) * tvec(n)) * ar(n, 0.002, 0.18))
    # (short: it marks the beat without adding much 400 ms loudness)
    bus.add(norm(taiko), S(swell), 0, LV['landing_boom'] + 1.0, room=0.2, hall=0.3, label='landing taiko')
    n = ring_n(0.75, extra=0.0015)
    crash = shaped_noise(n, lambda TT, F: band(F, 5500, 1.3) * (1 + 0.5 * band(F, 9000, 0.4)), rng)
    bus.add(norm(crash) * ar(n, 0.0015, 0.75)[:, None], S(swell), 0, LV['crash'], hall=0.5, label='landing crash')

    # --- D. Calm pulse to the end card ---------------------------------------
    def chord_at(f):
        for a, b, notes in chords:
            if a <= f < b:
                return notes
        return chords[-1][2]

    # The bass note is damped as the next one starts; the bell rings on (like a
    # held pedal) until the chord changes or the end hit.
    bounds = sorted({c[1] for c in chords})
    for i, b in enumerate(calm):
        notes = chord_at(b)
        root = notes[0] + 12 if notes[0] < 36 else notes[0]
        nxt = calm[i + 1] if i + 1 < len(calm) else end_hit
        chord_end = min(x for x in bounds if x > b)
        bus.add(heartbeat(rng, 1.0, 1.15, 0.1, body=0.6, click=0.5), S(b), 0, LV['calm_lub'], room=0.15,
                label=f'calm lub {b}')
        bus.add(pluck(midi(root), None, rng, 14, 1.3, 0.9, off=T(nxt - b), rel=0.1), S(b), 0, LV['calm_bass'],
                hall=0.2, label=f'calm bass {b}')
        top = sorted(notes)[-3:]
        m = top[i % 3] + 12
        bus.add(pluck(midi(m), None, rng, 8, 1.8, 1.4, off=T(chord_end - b), rel=0.25), S(b),
                PAN['orb'] * (0.5 if i % 2 else -0.5), LV['calm_bell'], hall=0.55, label=f'calm bell {b}')

    # --- E. One low hit on the end card, resolving to silence ----------------
    bus.add(thump(int(2.4 * SR), midi(26), midi(38), 0.7, rng, drive=1.5, sweep_tau=0.05),
            S(end_hit), 0, LV['end_boom'], hall=0.15)
    n = int(2.2 * SR)
    t = tvec(n)
    piano = np.zeros(n)
    for m in (26, 38, 45, 50, 54):
        piano += pluck(midi(m), n, rng, 16, 1.2, 2.0, inharm=0.0004, attack=0.003)
    piano += butter(rng.standard_normal(n), 'lowpass', 5000) * np.exp(-tvec(n) / 0.004) * 0.8
    piano += shaped_noise(n, lambda TT, F: band(F, 380, 1.0), rng, channels=1)[:, 0] * ar(n, 0.001, 0.035) * 0.9
    bus.add(norm(piano), S(end_hit), 0, LV['end_piano'], hall=0.4)

    return bus.render(irs), bus.cut_tails


# =============================================================== effects ===

def bot_of_blink(cfg: Config, frame: int) -> str:
    for bot, frames in cfg['BLINKS'].items():
        if frame in frames:
            return bot
    return 'cube'


def build_sfx(cfg: Config, irs: dict):
    """Returns (effects, strike inhale, slit-close air, cut tails). The inhale
    is kept apart so it alone can sound in the silence before the strike; the
    close air so it can sit over the end fade."""
    X, E, B, S, T = cfg['SFX'], cfg['EVENTS'], cfg['BEATS'], cfg.s, cfg.t
    N = cfg.n
    bus = Bus(N, 'sfx')
    rng = np.random.default_rng(23)

    # Light slit opens: soft air, 250 ms, rising in pitch as it widens.
    n = int(0.42 * SR)
    t = tvec(n)
    air = shaped_noise(n, lambda TT, F: band(F, interp_geo(TT, [(0, 650), (0.25, 2600)]), 1.3)
                       * (F / 1000) ** -0.2, rng)
    env = np.sin(np.pi / 2 * np.clip(t / 0.09, 0, 1)) * np.clip((0.25 - t) / 0.16, 0, 1) ** 1.5
    bus.add(norm(air) * env[:, None], S(X['slitAir']), 0, LV['slit_air'], hall=0.3)

    # Bot blinks: tiny porcelain ticks (close, and a softer one on reopening).
    for f in X['blinkTicks']:
        bot = bot_of_blink(cfg, f)
        for dt, g, p in ((0, 1.0, 1.0), (BLINK_REOPEN_FRAMES, 0.5, 1.08)):
            base = rng.uniform(3000, 3600) * p * {'bubble': 0.92, 'cube': 1.0, 'orb': 1.12}[bot]
            tick = modal(None, base * np.array([1, 1.51, 2.23, 2.92]), [1, .6, .4, .25],
                         [0.035, 0.022, 0.015, 0.010], rng, attack=0.0002)
            bus.add(tick * g, S(f + dt), PAN[bot], LV['tick'], room=0.4, hall=0.15, label=f'tick {f}+{dt}')

    # Diablo's eyes open: a metallic shing, 300 ms, swelling as the slits open.
    eo = E['eyesOpen']
    n = int(0.9 * SR)
    t = tvec(n)
    op = T(eo['to'] - eo['from'])
    shing = np.zeros((n, 2))
    for ch, det in ((0, 1.0), (1, 1.006)):
        freqs = np.array([2370, 3530, 4690, 5980, 7410, 9150]) * det
        glide = 1 + 0.035 * np.clip(t / 0.3, 0, 1)
        e = np.clip(t / 0.05, 0, 1) ** 2 * np.exp(-np.maximum(t - 0.05, 0) / 0.16)
        for k, (fq, a) in enumerate(zip(freqs, [1, .8, .7, .5, .35, .25])):
            ph = TAU * np.cumsum(fq * glide) / SR + rng.uniform(0, TAU)
            shing[:, ch] += a * np.sin(ph) * e * np.exp(-t / (0.5 / (1 + 0.4 * k)))
    hiss = shaped_noise(n, lambda TT, F: band(F, interp_geo(TT, [(0, 4500), (op, 9000)]), 0.7), rng)
    shing = norm(shing) + 0.45 * norm(hiss) * (np.clip(t / 0.08, 0, 1) * np.exp(-t / 0.09))[:, None]
    bus.add(norm(shing), S(X['eyesShing']), 0, LV['shing'], hall=0.4)

    # Pull up: a deep whoosh into a low rumble that holds until the silence,
    # with the tail's scythe sweeping across behind him.
    sil0 = B['silence']['from']
    p0 = X['pullUpWhoosh']
    rise = E['rise']
    n = S(sil0 + 1) - S(p0)
    t = tvec(n)
    tr = T(rise['settle'] - rise['from'])
    wh = shaped_noise(n, lambda TT, F: band(F, interp_geo(TT, [(0, 110), (tr * 0.55, 650), (tr * 1.3, 200)]), 1.4)
                      * hp_mag(F, 30), rng)
    env = env_db(t, [(0, -40), (tr * 0.55, 0), (tr * 1.4, -16), (t[-1], -24)])
    sub = np.sin(TAU * np.cumsum(interp_geo(t, [(0, 30), (tr * 0.6, 55), (tr * 1.5, 40)])) / SR)
    whoosh = norm(wh) * env[:, None] + 0.5 * (sub * env_db(t, [(0, -40), (tr * 0.6, 0), (tr * 1.8, -30)]))[:, None]
    bus.add(norm(whoosh), S(p0), 0, LV['whoosh'], hall=0.3, cut_ok=True)  # choked by the silence
    rm = rumble(n, rng)
    renv = env_db(t, [(0, -50), (tr * 0.6, -6), (tr * 1.2, 0), (t[-1], 3)])
    bus.add(norm(rm) * renv[:, None], S(p0), 0, LV['rumble'], hall=0.15, cut_ok=True)
    ts = E['tailSweep']
    n = S(ts['to'] + 8) - S(ts['from'])
    t = tvec(n)
    d = T(ts['to'] - ts['from'])
    sc = shaped_noise(n, lambda TT, F: band(F, interp_geo(TT, [(0, 900), (d * 0.5, 2900), (d, 1300)]), 0.8), rng)
    env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 2
    bus.add(norm(sc) * env[:, None], S(ts['from']), interp(t, [(0, -0.85), (d, 0.85)]), LV['scythe'], hall=0.5)

    # Claws up: a blade scrape from each hand, sliding up.
    cu = E['clawsUp']
    d = T(cu['to'] - cu['from']) + 0.05
    for side, dt in ((-0.5, 0.0), (0.5, 0.04)):
        n = int((d + 0.12 + TAILS * 0.12) * SR)
        t = tvec(n)
        parts = [1850, 2930, 4110, 5570, 7230]
        def mag(TT, F, parts=parts):
            sl = interp(TT, [(0, 1.0), (d, 1.07)])
            m = sum(a * np.exp(-0.5 * ((F - p * sl) / 55) ** 2) for p, a in zip(parts, [1, .8, .6, .45, .3]))
            return m + 0.08 * band(F, 7000, 0.8)
        scr = shaped_noise(n, mag, rng, nper=2048)
        grit = butter(np.abs(rng.standard_normal(n)) ** 3, 'lowpass', 180)
        grit = 0.35 + grit / np.max(grit)
        env = np.clip(t / 0.05, 0, 1) * np.clip((d - t) / 0.12 + 1, 0, 1) ** 2 + 0.25 * np.exp(-np.maximum(t - d, 0) / 0.12) * (t > d)
        bus.add(norm(scr) * (grit * env)[:, None], S(X['bladeScrape']) + int(dt * SR), side, LV['scrape'], hall=0.35)

    # ---- the strike: a 50 Hz thump, a noise burst and porcelain cracks ----
    # On their own bus, soft-clipped (below) so their crest does not make the
    # master limiter duck the whole hit.
    hit = X['strikeHit']
    sbus = Bus(N, 'strike')
    n = int(2.0 * SR)
    t = tvec(n)
    # The thump is short and driven hard: 100-400 Hz harmonics carry it on a
    # phone, and its sub no longer pumps the limiter under the crack.
    sbus.add(thump(n, 50, 125, 0.18, rng, drive=3.5, attack=0.0012), S(hit), 0, LV['strike_thump'],
             room=0.15, hall=0.1, label='strike thump')
    nb = shaped_noise(n, lambda TT, F: lp_mag(F, 7000, 2) * hp_mag(F, 40), rng)
    env = (np.exp(-t / 0.04) + 0.3 * np.exp(-t / 0.25)) * np.clip(t / 0.0006, 0, 1)
    sbus.add(norm(nb) * env[:, None], S(hit), 0, LV['strike_burst'], room=0.25, hall=0.2, label='strike burst')
    body = shaped_noise(n, lambda TT, F: band(F, 520, 0.9), rng)
    sbus.add(norm(body) * (np.exp(-t / 0.07) * np.clip(t / 0.001, 0, 1))[:, None], S(hit), 0, LV['strike_body'],
             room=0.3, label='strike body')
    for bot, dt, size in (('bubble', 0.0, 1.0), ('orb', 0.004, 1.05), ('cube', 0.011, 0.8)):
        cr = porcelain_crack(rng, size)
        g = 0.0 if bot != 'cube' else -5.0
        sbus.add(norm(cr), S(hit) + int(dt * SR), PAN[bot], LV['strike_crack'] + g, room=0.3, hall=0.25,
                 label=f'crack {bot}')
    strike = sbus.render(irs)
    strike = soft_clip(strike, float(np.max(np.abs(strike))) * db2a(-STRIKE_CLIP_DB), knee_db=4.0)

    # Slow motion: the rumble pitched down an octave, then crackle as the
    # cracks spread; both ease out on the ramp back to speed.
    sr_, rb = X['slowRumble'], E['rampBack']
    n = S(rb['to']) - S(sr_['from'])
    half = rumble((n + 1) // 2 + 64, rng)
    low = signal.resample_poly(half, 2, 1, axis=0)[:n]  # half speed: an octave down
    low = sat(norm(low) * 1.6, 1.5)
    t = tvec(n)
    env = env_db(t, [(0, -30), (0.12, 0), (T(sr_['to'] - sr_['from']), -2), (t[-1] - 0.02, -60), (t[-1], -90)])
    bus.add(low * env[:, None], S(sr_['from']), 0, LV['slow_rumble'], hall=0.3)
    ck = X['crackle']
    d = T(ck['to'] - ck['from'])
    tt = 0.0
    while tt < d:
        rate = 12 + 55 * np.exp(-((tt - 0.35 * d) / (0.3 * d)) ** 2)
        bot = rng.choice(list(PAN))
        a = rng.lognormal(0, 0.5) * (0.6 + 0.4 * np.exp(-tt / d))
        run = rng.integers(1, 5) if rng.uniform() < 0.25 else 1
        for r in range(run):
            g = grain(rng, fscale=0.72, tscale=1.8) * a * (0.8 ** r)
            bus.add(g, S(ck['from']) + int((tt + r * 0.012) * SR), PAN[bot] + rng.normal(0, 0.12),
                    LV['crackle'], room=0.3, hall=0.35, label='crackle grain')
        tt += rng.exponential(1.0 / rate)

    # Gold flows: a molten sizzle from the trace until every seam is sealed.
    sz, tr_, fa = X['sizzle'], E['trace'], E['fillAll']
    n = S(sz['to']) - S(sz['from']) + int(0.45 * SR)
    t = tvec(n)
    d_end = T(sz['to'] - sz['from'])
    hiss = shaped_noise(n, lambda TT, F: hp_mag(F, 2600, 2) * lp_mag(F, 12000) * (F / 4000) ** -0.3, rng)
    bub = np.abs(butter(rng.standard_normal(n), 'lowpass', 40))
    bub = 0.4 + bub / np.max(bub) * 1.4
    pops = np.zeros(n)
    k = 0
    while True:
        k += int(rng.exponential(SR / 35))
        if k >= n - 400:
            break
        pops[k:k + 200] += rng.standard_normal(200) * np.exp(-np.arange(200) / 30) * rng.uniform(0.5, 2.0)
    pops = butter(pops, 'bandpass', [2500, 9000])
    gloop = shaped_noise(n, lambda TT, F: band(F, 300, 0.8), rng, channels=1)[:, 0]
    gloop *= 0.5 + 0.5 * np.sin(TAU * 7.0 * t + 3 * np.sin(TAU * 1.3 * t))
    tf = T(fa['from'] - sz['from'])
    env = env_db(t, [(0, -40), (0.12, -6), (tf, -6), (d_end - 0.05, -4.5), (d_end, -4.5), (d_end + 0.35, -54),
                     (d_end + 0.42, -90)])
    mix = norm(hiss) * bub[:, None] + 0.6 * norm(pops)[:, None] + 0.35 * norm(gloop)[:, None]
    pan = interp(t, [(0, PAN['bubble']), (T(tr_['to'] - sz['from']), PAN['bubble'] * 0.8), (tf + 0.3, 0.0)])
    bus.add(norm(mix) * env[:, None], S(sz['from']), pan, LV['sizzle'], hall=0.3)

    # One chime per seam, each a scale step higher, the last landing on the tonic.
    # Each chime rings under the next five and is then damped, so the run stays
    # a clear rising line into the swell; the tonic rings out.
    chimes = X['seamChimes']
    nc = len(chimes)
    steps = [0, 2, 4, 5, 7, 9, 11]
    start = (-(nc - 1)) % 7
    for i, f in enumerate(chimes):
        dgr = start + i
        m = 62 + 12 * (dgr // 7) + steps[dgr % 7]  # D major from D4
        last = i == nc - 1
        ln = 1.4 if last else 1.0
        off = None if last else T(chimes[min(i + 5, nc - 1)] - f) + 0.1
        n = ring_n(*chime_taus(midi(m), ln)) if last else ring_n(0.35, extra=off)
        x = np.stack([chime(midi(m), n, rng, ln), chime(midi(m) * 2 ** (2 / 1200), n, rng, ln)], axis=1)
        if not last:
            x = release(x, off, 0.35)
        pan = 0.0 if last else interp(i, [(0, -0.55), (nc - 2, 0.55)])
        bus.add(norm(x), S(f), pan, LV['chime'] + (1.5 if last else 0.0) - 0.15 * i, hall=0.45, label=f'chime {f}')

    # A hairline crack on the orb, then the flicks: a bright tink and a snap
    # as the seal closes (the second quicker).
    c1, c2 = E['crack1'], E['crack2']
    hl = np.zeros(int(0.2 * SR))
    for j in range(HAIRLINE[0]):
        g = grain(rng, 1.1, 0.8) * (0.8 ** j)
        k = int(j * HAIRLINE[1] * SR)
        hl[k:k + len(g)] += g[: len(hl) - k]
    bus.add(norm(hl), S(c1['at']), PAN[CRACK_BOT['crack1']], LV['hairline'], room=0.3, hall=0.2)
    for f, crack, quick in ((X['flick1'], c1, False), (X['flick2'], c2, True)):
        pan = PAN[CRACK_BOT['crack1' if crack is c1 else 'crack2']]
        q = 0.6 if quick else 1.0
        tink = modal(None, midi(93) * np.array([1, 2.76, 5.4, 8.93]), [1, .55, .3, .12],
                     np.array([0.32, 0.13, 0.06, 0.03]) * q, rng, attack=0.0004)
        bus.add(norm(tink), S(f), pan, LV['tink'], room=0.2, hall=0.35, label=f'tink {f}')
        n = int(0.15 * SR)
        t = tvec(n)
        snap = (butter(rng.standard_normal(n), 'bandpass', [1500, 7000]) * np.exp(-t / (0.0025 * q))
                + 0.5 * np.sin(TAU * 950 * t) * np.exp(-t / (0.012 * q))
                + 0.3 * np.sin(TAU * 3100 * t) * np.exp(-t / (0.006 * q)))
        bus.add(norm(snap), S(f + crack['sealFrames']), pan, LV['snap'], room=0.35, hall=0.15)
        n = S(crack['sealFrames'] + 1)
        t = tvec(n)
        fizz = shaped_noise(n, lambda TT, F: band(F, 8000, 0.6), rng)
        bus.add(norm(fizz) * np.sin(np.pi * t / t[-1])[:, None], S(f), pan, LV['tink'] - 12, hall=0.2,
                cut_ok=True)  # a sine window: closes at its end

    # The ring: a soft whoosh around the bots, closing on a clean click.
    rw, rc = X['ringWhoosh'], X['ringClick']
    d = T(rc - rw)
    n = int((d + 0.25) * SR)
    t = tvec(n)
    ws = shaped_noise(n, lambda TT, F: band(F, interp_geo(TT, [(0, 350), (d, 1500)]), 1.1), rng)
    env = np.sin(np.pi / 2 * np.clip(t / (0.85 * d), 0, 1)) ** 2 * np.where(t < d, 1.0, np.exp(-(t - d) / 0.03))
    bus.add(norm(ws) * env[:, None], S(rw), 0.7 * np.sin(TAU * 0.75 * np.clip(t / d, 0, 1) - np.pi / 2),
            LV['ring_whoosh'], hall=0.4)
    n = int(0.3 * SR)
    t = tvec(n)
    click = np.zeros(n)
    for j, (g, dt) in enumerate(((1.0, 0.0), (0.6, 0.006))):
        k = int(dt * SR)
        tt = t[: n - k]
        click[k:] += g * (butter(rng.standard_normal(n - k), 'highpass', 2000) * np.exp(-tt / 0.0012)
                          + 0.7 * np.sin(TAU * 2200 * tt) * np.exp(-tt / 0.008)
                          + 0.35 * np.sin(TAU * 4600 * tt) * np.exp(-tt / 0.004)
                          + 0.4 * np.sin(TAU * 180 * tt) * np.exp(-tt / 0.025))
    bus.add(norm(click), S(rc), 0, LV['click'], room=0.3, hall=0.1)
    ring = modal(None, [midi(81), midi(88), midi(93)], [1, .6, .3], [0.6, 0.4, 0.25], rng, attack=0.003)
    bus.add(norm(ring), S(rc), 0, LV['ring_shimmer'], hall=0.5)

    # End card: a low hit with air as the 9° wipe crosses, and air as the slit closes.
    eh, wp = X['endHit'], E['wipe']
    n = int(2.2 * SR)
    t = tvec(n)
    boom = thump(n, midi(33), midi(45), 0.5, rng, drive=1.8)  # A1: a fifth over the score's D1, no beating
    whomp = butter(rng.standard_normal(n), 'lowpass', 400) * ar(n, 0.002, 0.25) * 0.6
    bus.add(norm(boom + whomp), S(eh), 0, LV['end_boom_sfx'], hall=0.12)
    d = T(wp['to'] - wp['from']) + 0.05
    n = int((d + 0.2) * SR)
    t = tvec(n)
    wa = shaped_noise(n, lambda TT, F: band(F, interp_geo(TT, [(0, 1200), (d, 3600)]), 1.0), rng)
    env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.5
    bus.add(norm(wa) * env[:, None], S(wp['from']), interp(t, [(0, -0.6), (d, 0.6)]), LV['wipe_air'], hall=0.4)
    sfx = bus.render(irs) + strike

    # Air as the slit closes, on its own bus: it goes in after the end fade, so
    # it is heard in full while the music resolves; its envelope closes at
    # slitClose.to.
    cbus = Bus(N, 'close air')
    sc = E['slitClose']
    d = T(sc['to'] - sc['from'])
    n = S(sc['to']) - S(X['slitCloseAir'])
    t = tvec(n)
    ca = shaped_noise(n, lambda TT, F: band(F, interp_geo(TT, [(0, 2600), (d, 700)]), 1.2) * (F / 1000) ** -0.2, rng)
    env = np.sin(np.pi / 2 * np.clip(t / 0.06, 0, 1)) * np.clip((t[-1] - t) / (0.55 * d), 0, 1) ** 1.2
    cbus.add(norm(ca) * env[:, None], S(X['slitCloseAir']), 0, LV['close_air'], hall=0.12, label='close air',
             cut_ok=True)  # its envelope closes at slitClose.to
    close_air = cbus.render(irs)

    # The 1-frame inhale before the strike, on its own bus.
    wbus = Bus(N, 'inhale')
    a, b = S(X['strikeWhoosh']), S(hit)
    n = b - a
    t = tvec(n)
    x = (t / t[-1]) ** 2.5
    w = (butter(rng.standard_normal((n, 2)), 'bandpass', [600, 4500]) +
         0.8 * butter(rng.standard_normal((n, 2)), 'lowpass', 300))
    w[-24:] *= np.linspace(1, 0, 24)[:, None]
    wbus.add(norm(w) * x[:, None], a, 0, LV['inhale'], room=0.25, fade_ms=0, cut_ok=True)  # cut by the hit
    return sfx, wbus.render(irs), close_air, bus.cut_tails + sbus.cut_tails + cbus.cut_tails


# ================================================================== main ===

def silence_mask(cfg: Config, until: int, fade_in_ms: float = 0.0) -> np.ndarray:
    """1 everywhere except: a 1-frame fade into BEATS.silence.from, zero from
    there until `until` (frame), then an optional raised-cosine fade back in
    (for a score that is still playing there), and zero from the end
    slit-close to the end."""
    B, E = cfg['BEATS'], cfg['EVENTS']
    m = np.ones(cfg.n)
    a = cfg.s(B['silence']['from'])
    f = cfg.s(B['silence']['from'] - 1)
    m[f:a] = 0.5 + 0.5 * np.cos(np.pi * np.arange(a - f) / (a - f))
    u = cfg.s(until)
    m[a:u] = 0.0
    L = int(fade_in_ms * 1e-3 * SR)
    if L > 1:
        m[u:u + L] = 0.5 - 0.5 * np.cos(np.pi * np.arange(L) / L)
    m[cfg.s(E['slitClose']['to']):] = 0.0
    return m


def end_fade(cfg: Config) -> np.ndarray:
    """Everything resolves to digital silence for the last frames (clean loop)."""
    E = cfg['EVENTS']
    m = np.ones(cfg.n)
    z = cfg.s(E['slitClose']['to'])
    f = z - int(0.6 * SR)
    m[f:z] = 0.5 + 0.5 * np.cos(np.pi * np.arange(z - f) / (z - f))
    m[z:] = 0.0
    return m


def close_mask(cfg: Config, ms: float = 60.0) -> np.ndarray:
    """1, then a raised-cosine close over the last `ms` before slitClose.to,
    then zero: closes a bus (its reverb included) exactly on the end silence."""
    m = np.ones(cfg.n)
    z = cfg.s(cfg['EVENTS']['slitClose']['to'])
    f = z - int(ms * 1e-3 * SR)
    m[f:z] = 0.5 + 0.5 * np.cos(np.pi * np.arange(z - f) / (z - f))
    m[z:] = 0.0
    return m


def beat_shift(cfg: Config, score: np.ndarray) -> dict:
    times, flux = onset_envelope(score)
    onsets = pick_onsets(times, flux, cfg.fps)
    beats = [cfg.f(o[0]) for o in onsets]
    out = []
    for c in cfg['CUTS']:
        near = [b for b in beats if abs(b - c) <= 3.0]
        best = min(near, key=lambda b: abs(b - c)) if near else None
        out.append({'cut': c, 'beat': None if best is None else round(best, 2),
                    'suggested_cut': c if best is None else int(round(best)),
                    'shift_frames': 0 if best is None else int(round(best)) - c})
    return {'source': cfg['SCORE_FILE'], 'max_shift_frames': 3, 'cuts': out,
            'detected_beats': [round(b, 2) for b in beats]}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--score-file', default=None, help='replace the synth score (default: SCORE_FILE if present)')
    ap.add_argument('--out-dir', default=str(AUDIO_BUILD))
    args = ap.parse_args()
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    cfg = load_config()
    N = cfg.n
    irs = {'hall': make_ir(3.2, 2.6, 0.9, seed=5, predelay_ms=18), 'room': make_ir(1.0, 0.7, 0.35, seed=7, predelay_ms=6)}

    B, X, E = cfg['BEATS'], cfg['SFX'], cfg['EVENTS']
    score_file = Path(args.score_file) if args.score_file else REEL / cfg['SCORE_FILE']
    external = score_file.exists()
    cut_tails: list[dict] = []
    # Sub-sonic energy goes first, BEFORE the silences and fades are cut in, so
    # the filter's ringing cannot carry past an edit (and get hard-cut there).
    hp = signal.butter(2, 26, 'highpass', fs=SR, output='sos')
    if external:
        score = fit_length(decode(score_file), N)
        score *= db2a(-21.0 - integrated_lufs(score))  # sit it under the effects, then the mix is normalised
        # Beats are detected on the score as supplied, before the silence is cut into it.
        (out / 'beat-shift.json').write_text(json.dumps(beat_shift(cfg, score), indent=2))
        score = signal.sosfilt(hp, score, axis=0)
        # The same silence as the synth score (silent through the inhale frame),
        # faded back in over 10 ms on the strike since it is still playing there.
        score *= silence_mask(cfg, B['strike'], fade_in_ms=10.0)[:, None]
        print(f'score: {score_file.relative_to(REEL) if score_file.is_relative_to(REEL) else score_file} '
              f'(beat-shift.json written)')
    else:
        score, cut_tails = build_score(cfg, irs)
        score = signal.sosfilt(hp, shelf(score, 70.0, -4.0, 'low'), axis=0)  # (the shelf keeps the sub in check)
        score *= silence_mask(cfg, B['strike'])[:, None]
        (out / 'beat-shift.json').unlink(missing_ok=True)
    score *= end_fade(cfg)[:, None]

    sfx, inhale, close_air, tails = build_sfx(cfg, irs)
    cut_tails += tails
    for c in cut_tails:
        print(f"WARNING cut tail: {c['bus']} {c['label'] or ''} at {c['at_s']} s ends at {c['end_s']} s "
              f"still {c['tail_db']} dB re its peak")
    sfx, inhale, close_air = (signal.sosfilt(hp, x, axis=0) for x in (sfx, inhale, close_air))
    sfx *= silence_mask(cfg, X['strikeHit'])[:, None]
    sfx = sfx * end_fade(cfg)[:, None] + inhale + close_air * close_mask(cfg)[:, None]

    # Master: normalise to -18 LUFS, true-peak limit.
    pre = score + sfx
    mix, gain, meas = normalize_and_limit(pre, TARGET_LUFS, CEILING_DBTP - AAC_HEADROOM_DB)
    g = db2a(gain)
    score, sfx = score * g, sfx * g

    # Hard guarantees after the limiter's filters: digital silence in the
    # pre-strike gap (the inhale's frame excepted) and at the very end.
    gap = slice(cfg.s(B['silence']['from']), cfg.s(X['strikeWhoosh']))
    for x in (mix, score, sfx):
        x[gap] = 0.0
        x[cfg.s(E['slitClose']['to']):] = 0.0
    score[cfg.s(B['silence']['from']):cfg.s(B['strike'])] = 0.0  # the score stays silent through the inhale
    mix = fit_length(mix, N)

    write_wav(out / 'score.wav', score)
    write_wav(out / 'sfx.wav', sfx)
    write_wav(out / 'mix-main.wav', mix)

    tm, ml = momentary_lufs(mix)
    loud_at = float(tm[np.argmax(ml)])
    up_peak = int(np.argmax(np.max(np.abs(mix), axis=1)))
    info = {
        'sample_rate': SR, 'samples': int(mix.shape[0]), 'seconds': mix.shape[0] / SR,
        'score_source': str(score_file.name) if external else 'synth',
        'mix_gain_db': round(gain, 3),
        'integrated_lufs': round(meas['lufs'], 2), 'true_peak_dbtp': round(meas['true_peak_dbtp'], 2),
        'limiter_max_gr_db': round(meas['max_gr_db'], 2),
        'loudest_momentary': {'lufs': round(float(ml.max()), 2), 'at_s': round(loud_at, 3),
                              'frame': round(cfg.f(loud_at), 1)},
        'sample_peak': {'dbfs': round(float(a2db(np.max(np.abs(mix)))), 2), 'frame': round(up_peak / SR * cfg.fps, 1)},
        'stem_peaks_dbfs': {'score': round(float(a2db(np.max(np.abs(score)))), 2),
                            'sfx': round(float(a2db(np.max(np.abs(sfx)))), 2)},
        'cut_tails': cut_tails,
    }
    (out / 'mix-info.json').write_text(json.dumps(info, indent=2))
    print(json.dumps(info, indent=2))


if __name__ == '__main__':
    main()
