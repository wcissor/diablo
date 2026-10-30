#!/usr/bin/env python3
"""The reel's sound: a 120 BPM score and the effects, synthesised in code (no
samples). Every time comes from build/config.json (src/config.ts), so the
music and the picture share one beat grid.

Writes audio/build/score.wav, sfx.wav, mix-main.wav (-18 LUFS, true peak
under -1 dBTP after the AAC encode) and mix-info.json.
"""

import json

import numpy as np
from scipy import signal

from dsp import AUDIO_BUILD, SR, convolve_stereo, integrated_lufs, load_config, make_ir, normalize_and_limit, tail_fade, to_stereo, true_peak_db, write_wav

TARGET_LUFS = -18.0
CEILING_DBTP = -1.0
AAC_HEADROOM_DB = 1.5  # the AAC encode adds up to ~1 dB of true peak on dense transients

cfg = load_config()
N, FPS = cfg.n, cfg.fps
BEAT = cfg['BEAT']
E, X = cfg['EVENTS'], cfg['SFX']
rng = np.random.default_rng(20)

# One chord per bar (2 s): i–VI–iv–V, i–III–VI–VII, i, i.
CHORDS = [[62, 65, 69], [58, 62, 65], [55, 58, 62], [57, 61, 64], [62, 65, 69],
          [53, 57, 60], [58, 62, 65], [60, 64, 67], [62, 65, 69], [62, 65, 69]]
ROOTS = [38, 34, 31, 33, 38, 41, 34, 36, 38, 38]
BAR = 4 * BEAT
GROOVE = [(165, E['wipeOut']['from']), (E['colourBeats'][0], E['collapse']['from'])]  # the full beat


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tv(n):
    return np.arange(n) / SR


def sos(kind, fc, order=2):
    return signal.butter(order, fc, btype=kind, fs=SR, output='sos')


def filt(x, kind, fc, order=2):
    return signal.sosfilt(sos(kind, fc, order), x)


def decay(n, tau, attack=0.002):
    t = tv(n)
    return np.minimum(1.0, t / attack) * np.exp(-t / tau)


def saw(f, n, detune=0.0):
    t = tv(n)
    out = 2.0 * ((f * t) % 1.0) - 1.0
    if detune:
        out = 0.5 * (out + 2.0 * ((f * 2 ** (detune / 1200) * t + 0.37) % 1.0) - 1.0)
    return out


def sweep_noise(n, f0, f1, q=2.0, curve=1.0):
    """White noise through a band-pass whose centre glides from f0 to f1 (a whoosh)."""
    x = rng.standard_normal(n)
    out = np.zeros(n)
    blk = 256
    zi = None
    for i in range(0, n, blk):
        p = (i / max(1, n - 1)) ** curve
        fc = f0 * (f1 / f0) ** p
        bw = fc / q
        s = signal.butter(2, [max(30, fc - bw / 2), min(SR / 2 - 100, fc + bw / 2)], btype='band', fs=SR, output='sos')
        if zi is None:
            zi = signal.sosfilt_zi(s) * 0
        seg, zi = signal.sosfilt(s, x[i:i + blk], zi=zi)
        out[i:i + blk] = seg
    return out / (np.abs(out).max() + 1e-9)


def add(buf, sig, frame, gain=1.0, pan=0.0):
    """Mix a mono (or stereo) sound into buf at a frame."""
    a = cfg.s(frame)
    if a >= N:
        return
    st = to_stereo(sig, pan) if sig.ndim == 1 else sig
    b = min(N, a + len(st))
    buf[a:b] += gain * st[: b - a]


def in_groove(f):
    return any(a <= f < b for a, b in GROOVE)


def chord_at(f):
    return CHORDS[min(9, int(f // BAR))]


# ---------------------------------------------------------------- drums ---

def kick(punch=1.0):
    n = int(0.42 * SR)
    t = tv(n)
    f = 46 + 110 * np.exp(-t / 0.035)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * decay(n, 0.2, 0.001)
    click = filt(rng.standard_normal(n), 'high', 1800) * decay(n, 0.006, 0.0005)
    return np.tanh(1.6 * punch * (body + 0.35 * click))


def clap():
    n = int(0.25 * SR)
    x = filt(rng.standard_normal(n), 'band', [900, 3000])
    env = np.zeros(n)
    for k, d in enumerate([0, 0.011, 0.022]):
        a = int(d * SR)
        env[a:] += (0.6 if k < 2 else 1.0) * decay(n - a, 0.012 if k < 2 else 0.09, 0.0008)
    return x * env


def hat(open_=False):
    n = int((0.18 if open_ else 0.05) * SR)
    return filt(rng.standard_normal(n), 'high', 7000) * decay(n, 0.06 if open_ else 0.014, 0.0005)


# --------------------------------------------------------------- voices ---

def bass_note(m, n):
    f = midi(m)
    x = saw(f, n, 8) + 0.6 * np.sin(2 * np.pi * f / 2 * tv(n))
    env = decay(n, 0.16, 0.003)
    return filt(x, 'low', 520) * env


def pluck(m, n=int(0.32 * SR)):
    f = midi(m)
    t = tv(n)
    x = sum(np.sin(2 * np.pi * f * k * t) * np.exp(-t * (6 + 5 * k)) / k for k in range(1, 7))
    return x * np.minimum(1, t / 0.002)


def stab(notes, n=int(0.5 * SR), bright=3500):
    x = sum(saw(midi(m), n, 12) for m in notes) / len(notes)
    # a falling filter, as a crossfade from a bright band to a dark one
    k = np.exp(-tv(n) / 0.07)
    return (filt(x, 'low', bright) * k + filt(x, 'low', 700) * (1 - k)) * decay(n, 0.22, 0.002)


def pad(notes, n, attack=0.4, fc=1800):
    t = tv(n)
    x = sum(saw(midi(m), n, 9) + saw(midi(m + 12), n, -7) * 0.4 for m in notes) / len(notes)
    env = np.minimum(1, t / attack) * np.minimum(1, (n / SR - t) / 0.6)
    return filt(x, 'low', fc) * env


def bell(f, n=int(1.6 * SR), tau=0.6):
    t = tv(n)
    ratios, amps = [1, 2.76, 5.4, 8.93], [1, 0.45, 0.22, 0.1]
    return sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / (tau / r ** 0.5)) for r, a in zip(ratios, amps)) * np.minimum(1, t / 0.001)


# -------------------------------------------------------------- effects ---

def whoosh(frames, f0, f1, curve=1.0, q=1.6):
    n = int(frames / FPS * SR)
    x = sweep_noise(n, f0, f1, q, curve)
    t = np.linspace(0, 1, n)
    return x * np.sin(np.pi * t) ** 1.5


def riser(frames):
    n = int(frames / FPS * SR)
    t = np.linspace(0, 1, n)
    x = sweep_noise(n, 300, 6000, 1.2, 1.4)
    tone = np.sin(2 * np.pi * np.cumsum(200 + 900 * t ** 2) / SR)
    return (0.8 * x + 0.25 * tone) * t ** 2


def impact():
    n = int(1.6 * SR)
    t = tv(n)
    sub = np.sin(2 * np.pi * np.cumsum(30 + 60 * np.exp(-t / 0.08)) / SR) * decay(n, 0.6, 0.001)
    crash = filt(rng.standard_normal(n), 'high', 2500) * decay(n, 0.35, 0.001)
    body = filt(rng.standard_normal(n), 'low', 300) * decay(n, 0.12, 0.001)
    return np.tanh(1.4 * (sub + 0.35 * crash + 0.6 * body))


def pop(f0=500, f1=1100, dur=0.07):
    n = int(dur * SR)
    t = tv(n)
    f = f0 + (f1 - f0) * np.minimum(1, t / dur)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * np.minimum(1, t / dur)) ** 0.7


def tick():
    n = int(0.012 * SR)
    return filt(rng.standard_normal(n), 'band', [2500, 6000]) * decay(n, 0.003, 0.0003)


def blip(f=1400):
    n = int(0.11 * SR)
    t = tv(n)
    ff = np.where(t < 0.045, f, f * 1.5)
    x = np.sign(np.sin(2 * np.pi * np.cumsum(ff) / SR)) * 0.5 + 0.5 * np.sin(2 * np.pi * np.cumsum(ff) / SR)
    return filt(x, 'low', 5000) * decay(n, 0.05, 0.002)


def crack():
    n = int(0.35 * SR)
    x = np.zeros(n)
    for _ in range(26):
        a = int(rng.uniform(0, 0.22) * SR)
        m = int(0.006 * SR)
        x[a:a + m] += rng.standard_normal(min(m, n - a)) * rng.uniform(0.3, 1) * np.exp(-a / (0.08 * SR))
    return filt(x, 'band', [1500, 9000])


def hit():
    n = int(0.6 * SR)
    t = tv(n)
    thump = np.sin(2 * np.pi * np.cumsum(55 + 140 * np.exp(-t / 0.03)) / SR) * decay(n, 0.15, 0.0008)
    snap = filt(rng.standard_normal(n), 'band', [1200, 7000]) * decay(n, 0.05, 0.0005)
    out = np.tanh(1.8 * (thump + 0.7 * snap))
    c = crack()
    out[: len(c)] += 0.8 * c
    return out


def shing():
    n = int(1.1 * SR)
    x = bell(1650, n, 0.5) + 0.5 * bell(2480, n, 0.4)
    return x + 0.3 * filt(rng.standard_normal(n), 'high', 6000) * decay(n, 0.08)


def zip_(frames):
    n = int(frames / FPS * SR)
    t = np.linspace(0, 1, n)
    x = sweep_noise(n, 1500, 9000, 3.0)
    grit = (np.sin(2 * np.pi * np.cumsum(60 + 120 * t) / SR) > 0.6) * 1.0
    return x * (0.6 + 0.4 * grit) * np.sin(np.pi * t) ** 0.8


def boing():
    n = int(0.25 * SR)
    t = tv(n)
    f = 220 * (1 + 0.6 * np.exp(-t / 0.04)) * (1 + 0.04 * np.sin(2 * np.pi * 18 * t))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * decay(n, 0.09, 0.002)


# ---------------------------------------------------------------- build ---

def build_score():
    score = np.zeros((N, 2))
    send = np.zeros((N, 2))
    duck = np.ones(N)  # sidechain from the kick
    kicks = [30, 45, 60, 75, 90, E['drop']['land'] + 30] + [f for f in range(165, cfg.frames, BEAT) if in_groove(f)]
    for f in kicks:
        add(score, kick(), f, 0.9)
        a = cfg.s(f)
        n = min(N - a, int(0.22 * SR))
        duck[a:a + n] = np.minimum(duck[a:a + n], 0.35 + 0.65 * np.linspace(0, 1, n) ** 0.7)
    for f in range(60, E['wipeIn']['from'], BEAT):
        if (f // BEAT) % 2 == 1:
            add(score, clap(), f, 0.5, 0.05)
    for f in range(165, cfg.frames, BEAT):
        if not in_groove(f):
            continue
        if (f // BEAT) % 2 == 1:
            add(score, clap(), f, 0.55, 0.05)
        for k in range(4):  # 16th hats, accent on the off-beat
            add(score, hat(open_=(k == 2 and (f // BEAT) % 4 == 3)), f + k * BEAT / 4, 0.22 if k == 2 else 0.1, 0.25)
    # The build before the colour beats: a rising snare roll.
    a, b = E['wipeOut']['to'], E['colourBeats'][0]
    f = a
    while f < b:
        p = (f - a) / (b - a)
        add(score, filt(rng.standard_normal(int(0.08 * SR)), 'band', [800 + 2500 * p, 5000 + 3000 * p]) * decay(int(0.08 * SR), 0.03), f, 0.15 + 0.4 * p, -0.1)
        f += BEAT / 2 if p < 0.4 else BEAT / 4 if p < 0.75 else BEAT / 8
    # Bass: 8th notes on the root, octave on the off-beat, ducked by the kick.
    bass = np.zeros((N, 2))
    for f8 in np.arange(165, cfg.frames, BEAT / 2):
        if not in_groove(f8):
            continue
        root = ROOTS[min(9, int(f8 // BAR))]
        m = root + (12 if int(round(f8 / (BEAT / 2))) % 2 else 0)
        add(bass, bass_note(m, int(0.24 * SR)), f8, 0.55)
    score += bass * duck[:, None]
    # Plucked arpeggio (16ths) in the intro, the fix and the colour beats.
    arp = np.zeros((N, 2))
    for lo, hi_ in [(0, E['wipeIn']['from']), (270, E['wipeOut']['from']), (E['colourBeats'][0], E['collapse']['from'])]:
        for j, f16 in enumerate(np.arange(lo, hi_, BEAT / 4)):
            ch = chord_at(f16)
            pattern = [ch[0], ch[1], ch[2], ch[0] + 12, ch[2], ch[1]]
            add(arp, pluck(pattern[j % 6] + 12), f16, 0.16 if lo else 0.2, 0.35 * np.sin(j * 0.9))
    score += arp
    send += arp * 0.4
    # Dark pad under Diablo's arrival; stabs on the hits and colour beats.
    add(score, pad([43, 50, 55], int(1.6 * SR), 0.05, 900), E['drop']['land'], 0.35)
    for f in cfg['BEATS']['hits'] + E['colourBeats']:
        add(score, stab([n - 12 for n in chord_at(f)] + [chord_at(f)[0]]), f, 0.45)
        add(send, stab(chord_at(f)), f, 0.15)
    # The logo sting: a wide D minor (add 9) pad, a bell and a sub, ringing out.
    s0 = X['sting']
    n = cfg.s(cfg['END_CARD']['out'] + 6) - cfg.s(s0)
    add(score, pad([50, 57, 62, 64, 65, 69], n, 0.02, 2400), s0, 0.8)
    add(send, pad([62, 69, 74, 76], n, 0.3, 3000), s0, 0.45)
    for k, m in enumerate([74, 81, 86]):
        add(score, bell(midi(m), int(2.5 * SR), 0.9), s0 + 2 * k, 0.24)
        add(send, bell(midi(m), int(2.5 * SR), 0.9), s0 + 2 * k, 0.12)
    add(score, kick(1.4), s0, 0.9)
    add(score, impact(), s0, 0.45)
    return score, send


def build_sfx():
    sfx = np.zeros((N, 2))
    send = np.zeros((N, 2))
    add(sfx, whoosh(10, 200, 3000), X['irisOpen'], 0.35)
    add(sfx, pop(380, 900), X['dotPop'], 0.4)
    for f, pan in zip(X['flights'], [-0.5, 0.5]):
        add(sfx, whoosh(6, 1500, 5000), f, 0.2, pan)
    for f, (f0, f1), pan in zip(X['botPops'], [(600, 1300), (500, 1000), (350, 800)], [-0.55, 0.55, 0]):
        add(sfx, pop(f0, f1), f, 0.5, pan)
        add(send, pop(f0, f1), f, 0.2, pan)
    for f in X['typeTicks'] + X['urlTicks']:
        add(sfx, tick(), f, 0.25, rng.uniform(-0.2, 0.2))
    for f in X['bops']:
        add(sfx, boing(), f + 10, 0.12)
    add(sfx, riser(X['riser']['to'] - X['riser']['from']), X['riser']['from'], 0.35)
    add(sfx, whoosh(9, 150, 2500, 0.7), X['wipeIn'], 0.4)
    add(sfx, whoosh(8, 4000, 300, 1.0, 1.2), X['dropWhoosh'], 0.45)
    add(sfx, impact(), X['land'], 1.0)
    add(send, impact(), X['land'], 0.3)
    add(sfx, whoosh(9, 600, 4000), X['tailSwoosh'], 0.3, -0.2)
    add(sfx, shing(), X['eyesOpen'], 0.3)
    add(send, shing(), X['eyesOpen'], 0.3)
    add(sfx, whoosh(11, 200, 7000, 2.0, 1.4), X['zoom'], 0.5)
    for f, pan in zip(X['slashes'], [-0.5, 0.5, 0.1]):
        add(sfx, whoosh(5, 2000, 8000, 0.6, 2.0), f, 0.45, pan)
    for f, pan in zip(X['hits'], [-0.45, 0.45, 0.1]):
        add(sfx, hit(), f, 0.9, pan)
        add(send, hit(), f, 0.2, pan)
    for f, pan in zip(X['locks'], [-0.45, 0.1, 0.45]):
        add(sfx, blip(1400), f, 0.25, pan)
    add(sfx, whoosh(12, 300, 5000, 1.0, 1.3), X['swoosh'], 0.5, 0.3)
    for f, pan in zip(X['sealZips'], [-0.45, 0.45, 0.1]):
        add(sfx, zip_(cfg['EVENTS']['sealFrames']), f, 0.22, pan)
    for f, m, pan in zip(X['sealDings'], [77, 81, 84], [-0.45, 0.45, 0.1]):
        add(sfx, bell(midi(m), int(1.2 * SR), 0.4), f, 0.2, pan)
        add(send, bell(midi(m), int(1.2 * SR), 0.4), f, 0.25, pan)
    for f in X['cheers']:
        add(sfx, boing(), f, 0.18)
    for k in range(8):
        add(send, bell(midi(86 + 2 * k), int(0.6 * SR), 0.2), X['glint'] + k, 0.05)
    add(sfx, whoosh(9, 250, 4000, 0.8), X['wipeOut'], 0.4)
    for f in X['botsUp']:
        add(sfx, pop(450, 1050), f, 0.35, rng.uniform(-0.4, 0.4))
    add(sfx, whoosh(11, 6000, 200, 1.0, 1.3), X['collapse'], 0.45)
    add(sfx, pop(300, 700, 0.06), cfg['EVENTS']['collapse']['to'], 0.45)
    add(sfx, whoosh(14, 500, 3500, 1.0, 1.6), X['ribbon'], 0.35, -0.2)
    add(sfx, pop(250, 650, 0.09), X['headPop'], 0.5)
    add(sfx, shing(), cfg['EVENTS']['eyesOpenEnd'], 0.2)
    add(sfx, tick(), X['blink'], 0.2)
    add(sfx, whoosh(12, 3000, 200, 1.0, 1.4), X['irisClose'], 0.25)
    return sfx, send


def main():
    out = AUDIO_BUILD
    out.mkdir(parents=True, exist_ok=True)
    score, send_m = build_score()
    sfx, send_s = build_sfx()
    ir = make_ir(2.2, 1.9, 0.8, seed=5)
    verb = convolve_stereo(send_m + send_s, ir)[:N]
    mix = 0.9 * score + 0.85 * sfx + 0.5 * verb
    mix = filt(mix.T, 'high', 28).T
    # Silent from frame 597 (black) to the end; a short fade into it.
    end = cfg.s(cfg['EVENTS']['irisClose']['to'])
    fade = int(0.25 * SR)
    mix[end - fade:end] *= np.linspace(1, 0, fade)[:, None] ** 2
    mix[end:] = 0
    y, gain, meas = normalize_and_limit(mix, TARGET_LUFS, CEILING_DBTP - AAC_HEADROOM_DB)
    y[end:] = 0
    y = tail_fade(y)
    write_wav(out / 'score.wav', score)
    write_wav(out / 'sfx.wav', sfx)
    write_wav(out / 'mix-main.wav', y)
    info = {'score_source': 'synth', 'samples': int(len(y)), 'gain_db': round(float(gain), 2),
            'lufs': round(float(integrated_lufs(y)), 2), 'true_peak_dbtp': round(float(true_peak_db(y)), 2)}
    (out / 'mix-info.json').write_text(json.dumps(info, indent=2))
    print(json.dumps(info, indent=2))


if __name__ == '__main__':
    main()
