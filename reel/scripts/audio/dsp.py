"""Shared audio code for the Diablo reel: config and timing, WAV I/O, loudness
(ITU-R BS.1770 via pyloudnorm), true peak, a 4x-oversampled look-ahead
true-peak limiter, onset detection and a few synthesis primitives.

Every time comes from build/config.json (written from src/config.ts by
scripts/export-config.ts). Frame f starts at sample round(f * SR / FPS).
"""
from __future__ import annotations

import json
import subprocess
import warnings
from pathlib import Path

import numpy as np
from scipy import ndimage, signal
from scipy.io import wavfile

REEL = Path(__file__).resolve().parents[2]
AUDIO_BUILD = REEL / 'audio' / 'build'
SR = 48000
TAU = 2.0 * np.pi
OS = 4  # oversampling for true peak


# ---------------------------------------------------------------- config ---

class Config:
    """build/config.json with frame/sample helpers."""

    def __init__(self, data: dict):
        self.d = data
        self.fps = int(data['FPS'])
        self.frames = int(data['DURATION'])
        self.n = int(round(self.frames * SR / self.fps))  # 960000 for 600 f

    def __getitem__(self, key):
        return self.d[key]

    def s(self, frame: float) -> int:
        """First sample of a (possibly fractional) frame."""
        return int(round(frame * SR / self.fps))

    def t(self, frame: float) -> float:
        return frame / self.fps

    def f(self, seconds: float) -> float:
        return seconds * self.fps


def load_config() -> Config:
    path = REEL / 'build' / 'config.json'
    src = REEL / 'src' / 'config.ts'
    if not path.exists() or (src.exists() and path.stat().st_mtime < src.stat().st_mtime):
        subprocess.run(['npx', 'tsx', 'scripts/export-config.ts'], cwd=REEL, check=True)
    return Config(json.loads(path.read_text()))


# ------------------------------------------------------------------- I/O ---

def write_wav(path: Path, x: np.ndarray) -> None:
    """32-bit float WAV at SR."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    wavfile.write(str(path), SR, np.ascontiguousarray(x, dtype=np.float32))


def read_wav(path: Path) -> np.ndarray:
    sr, x = wavfile.read(str(path))
    if sr != SR:
        raise ValueError(f'{path}: {sr} Hz, expected {SR}')
    if x.dtype.kind == 'i':
        x = x / float(np.iinfo(x.dtype).max)
    x = x.astype(np.float64)
    return x if x.ndim == 2 else x[:, None]


def decode(path: Path, channels: int = 2) -> np.ndarray:
    """Decode any audio file with ffmpeg to float64 (samples, channels) at SR."""
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-nostdin', '-i', str(path), '-f', 'f32le', '-acodec', 'pcm_f32le',
         '-ac', str(channels), '-ar', str(SR), '-'],
        capture_output=True, check=True, timeout=120).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, channels).astype(np.float64)


def fit_length(x: np.ndarray, n: int) -> np.ndarray:
    if x.shape[0] >= n:
        return x[:n]
    pad = np.zeros((n - x.shape[0],) + x.shape[1:])
    return np.concatenate([x, pad], axis=0)


# -------------------------------------------------------------- loudness ---

def db2a(db):
    return 10.0 ** (np.asarray(db, dtype=float) / 20.0)


def a2db(a, floor=1e-12):
    return 20.0 * np.log10(np.maximum(np.abs(a), floor))


def integrated_lufs(x: np.ndarray) -> float:
    import pyloudnorm as pyln
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        return float(pyln.Meter(SR).integrated_loudness(x))


def k_weight(x: np.ndarray) -> np.ndarray:
    # BS.1770 K-weighting, coefficients specified for 48 kHz.
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)


def momentary_lufs(x: np.ndarray, win: float = 0.4, hop: float = 0.05):
    """(centre times, loudness) of BS.1770 momentary (400 ms) windows."""
    y = k_weight(x if x.ndim == 2 else x[:, None])
    p = np.sum(y ** 2, axis=1)
    w, h = int(win * SR), int(hop * SR)
    cs = np.concatenate([[0.0], np.cumsum(p)])
    starts = np.arange(0, len(p) - w + 1, h)
    ms = (cs[starts + w] - cs[starts]) / w
    return (starts + w / 2) / SR, -0.691 + 10 * np.log10(ms + 1e-20)


def upsample(x: np.ndarray, os: int = OS) -> np.ndarray:
    return signal.resample_poly(x, os, 1, axis=0, window=('kaiser', 9.0))


def true_peak_db(x: np.ndarray) -> float:
    return float(a2db(np.max(np.abs(upsample(x)))))


# --------------------------------------------------------------- limiter ---

def limit(x: np.ndarray, ceiling_db: float = -1.2, lookahead_ms: float = 1.5,
          release_ms: float = 90.0, os: int = OS):
    """Look-ahead true-peak limiter run on a 4x oversampled signal.

    The gain needed to keep every oversampled sample under the ceiling is held
    over the look-ahead window, ramped in with a moving average of the same
    length (so it is fully applied when the peak arrives: no latency, no
    overshoot), released exponentially in dB, applied to the oversampled signal
    and the result is filtered back down. Stereo-linked.
    Returns (y, max gain reduction dB).
    """
    x2 = x if x.ndim == 2 else x[:, None]
    up = upsample(x2, os)
    peak = np.max(np.abs(up), axis=1)
    c = db2a(ceiling_db)
    need = np.maximum(0.0, a2db(peak) - ceiling_db)  # attenuation, dB
    L = int(round(lookahead_ms * 1e-3 * SR * os)) | 1  # odd
    hold = ndimage.maximum_filter1d(need, size=L, origin=-(L // 2), mode='constant')  # max(need[n:n+L])
    cs = np.concatenate([np.zeros(L), np.cumsum(hold)])
    ramp = (cs[L:] - cs[:-L]) / L  # mean(hold[n-L+1:n+1])
    # Exponential release in dB, vectorised: att[n] = max_k ramp[k] * r**(n-k).
    lc = -1.0 / (release_ms * 1e-3 * SR * os)  # log(r)
    idx = np.arange(len(ramp), dtype=np.float64)
    with np.errstate(divide='ignore'):
        lr = np.log(ramp)
    att = np.exp(idx * lc + np.maximum.accumulate(lr - idx * lc))
    att = np.maximum(att, ramp)
    y_up = up * db2a(-att)[:, None]
    # Safety: anything still over the ceiling after the ramp (cannot happen by
    # construction, kept for float rounding) is clipped on the oversampled grid.
    y_up = np.clip(y_up, -c, c)
    y = signal.resample_poly(y_up, 1, os, axis=0, window=('kaiser', 9.0))[: x2.shape[0]]
    y = y if x.ndim == 2 else y[:, 0]
    return y, float(att.max())


def soft_clip(x: np.ndarray, ceiling: float, knee_db: float = 4.0, os: int = OS) -> np.ndarray:
    """Oversampled soft clipper (per channel): linear below `knee_db` under
    `ceiling` (linear amplitude), then a tanh knee that approaches the ceiling.
    Used to take the crest off short, noisy transients (the strike) so the
    master limiter does not have to duck everything around them."""
    T = ceiling * float(db2a(-knee_db))
    up = upsample(x if x.ndim == 2 else x[:, None], os)
    a = np.abs(up)
    over = a > T
    up[over] = np.sign(up[over]) * (T + (ceiling - T) * np.tanh((a[over] - T) / (ceiling - T)))
    y = signal.resample_poly(up, 1, os, axis=0, window=('kaiser', 9.0))[: x.shape[0]]
    return y if x.ndim == 2 else y[:, 0]


def normalize_and_limit(x: np.ndarray, target_lufs: float, ceiling_dbtp: float = -1.0,
                        margin_db: float = 0.25, iters: int = 8):
    """Gain to target integrated loudness, true-peak limited to the ceiling.
    Returns (y, gain_db, measured dict)."""
    gain = target_lufs - integrated_lufs(x)
    ceil = ceiling_dbtp - margin_db
    y = x
    gr = 0.0
    for _ in range(iters):
        y, gr = limit(x * db2a(gain), ceiling_db=ceil)
        lufs = integrated_lufs(y)
        tp = true_peak_db(y)
        if tp > ceiling_dbtp - 0.05:
            ceil -= (tp - ceiling_dbtp) + 0.1
            continue
        if abs(lufs - target_lufs) < 0.03:
            break
        gain += target_lufs - lufs
    return y, gain, {'lufs': integrated_lufs(y), 'true_peak_dbtp': true_peak_db(y), 'max_gr_db': gr}


# ----------------------------------------------------------------- onsets ---

def onset_envelope(x: np.ndarray, hop: int = 200, nfft: int = 1024, lag_s: float = 0.017):
    """SuperFlux-style onset strength: log energy in 40 log-spaced bands
    (80 Hz to 14 kHz), each compared with the max over its neighbouring bands
    `lag_s` earlier (so sustained tones that beat or wobble do not count),
    positive dB differences averaged over bands. Below ~80 Hz a 21 ms window
    only flickers with the waveform's phase, so those bands are left out.
    Returns (times s, flux)."""
    mono = x.mean(axis=1) if x.ndim == 2 else x
    f, t, Z = signal.stft(mono, fs=SR, window='hann', nperseg=nfft, noverlap=nfft - hop,
                          boundary='zeros', padded=True)
    P = np.abs(Z) ** 2
    edges = np.geomspace(80, 14000, 41)
    centre = np.searchsorted(f, np.sqrt(edges[:-1] * edges[1:]))
    bands = []
    for (lo, hi), c in zip(zip(edges[:-1], edges[1:]), centre):
        sel = (f >= lo) & (f < hi)
        bands.append(P[sel].sum(axis=0) if sel.any() else P[min(c, len(f) - 1)])
    E = 10 * np.log10(np.array(bands) + 1e-20)
    E = np.maximum(E, E.max() - 75.0)
    lag = max(1, int(round(lag_s * SR / hop)))
    ref = ndimage.maximum_filter1d(E, size=3, axis=0)
    ref = np.concatenate([np.repeat(ref[:, :1], lag, axis=1), ref[:, :-lag]], axis=1)
    flux = np.maximum(0.0, E - ref).mean(axis=0)
    return t, flux


def pick_onsets(times: np.ndarray, flux: np.ndarray, fps: float, min_gap_frames: float = 2.0,
                rel: float = 2.5, floor_frac: float = 0.04):
    """Local-max peak picking with an adaptive (median) threshold.
    Returns list of (time s, strength, ratio to local median)."""
    dt = times[1] - times[0]
    w = max(1, int(round(min_gap_frames / fps / dt)))
    W = max(3, int(round(0.5 / dt)))
    locmax = ndimage.maximum_filter1d(flux, size=2 * w + 1) == flux
    med = ndimage.median_filter(flux, size=2 * W + 1, mode='nearest')
    floor = floor_frac * np.percentile(flux, 99.5)
    ok = locmax & (flux > rel * med + floor) & (flux > floor)
    return [(float(times[i]), float(flux[i]), float(flux[i] / (med[i] + 1e-9))) for i in np.flatnonzero(ok)]


# -------------------------------------------------------------- synthesis ---

def tvec(n: int) -> np.ndarray:
    return np.arange(n) / SR


def interp(t, pts):
    xs, ys = zip(*pts)
    return np.interp(t, xs, ys)


def interp_geo(t, pts):
    """Geometric interpolation (for frequencies)."""
    xs, ys = zip(*pts)
    return np.exp(np.interp(t, xs, np.log(ys)))


def env_db(t, pts):
    return db2a(interp(t, pts))


def ar(n: int, attack: float, tau: float, hold: float = 0.0) -> np.ndarray:
    """Smooth attack, optional hold, exponential decay."""
    t = tvec(n)
    a = np.sin(0.5 * np.pi * np.clip(t / max(attack, 1e-6), 0.0, 1.0))
    return a * np.exp(-np.maximum(t - attack - hold, 0.0) / tau)


def to_stereo(sig: np.ndarray, pan=0.0) -> np.ndarray:
    """Constant-power pan (pan in -1..1, scalar or per sample). Mono → -3 dB
    each side at centre; stereo input is balanced (unity at centre)."""
    theta = (np.clip(np.asarray(pan, dtype=float), -1, 1) + 1) * np.pi / 4
    if sig.ndim == 1:
        return np.stack([sig * np.cos(theta), sig * np.sin(theta)], axis=1)
    gl = np.cos(theta) * np.sqrt(2)
    gr = np.sin(theta) * np.sqrt(2)
    return np.stack([sig[:, 0] * np.minimum(gl, 1.0), sig[:, 1] * np.minimum(gr, 1.0)], axis=1)


def shaped_noise(n: int, mag, rng: np.random.Generator, channels: int = 2, nper: int = 1024) -> np.ndarray:
    """White noise filtered by a time-varying magnitude response
    mag(t[1,T] seconds, f[F,1] Hz) -> (F, T), in the STFT domain.
    Independent noise per channel (decorrelated stereo). Returns (n, channels)."""
    hop = nper // 4
    w = rng.standard_normal((channels, n + nper))
    f, t, Z = signal.stft(w, fs=SR, window='hann', nperseg=nper, noverlap=nper - hop)
    M = np.broadcast_to(mag(t[None, :], np.maximum(f[:, None], 1.0)), Z.shape[1:])
    _, y = signal.istft(Z * M, fs=SR, window='hann', nperseg=nper, noverlap=nper - hop)
    return fit_length(y.T, n)


def band(f, fc, oct_bw):
    """Gaussian band in log-frequency (fc, bandwidth in octaves; both may vary in time)."""
    return np.exp(-0.5 * (np.log2(f / fc) / oct_bw) ** 2)


def lp_mag(f, fc, order=2):
    return 1.0 / np.sqrt(1.0 + (f / fc) ** (2 * order))


def hp_mag(f, fc, order=2):
    return 1.0 / np.sqrt(1.0 + (fc / f) ** (2 * order))


def butter(x, kind, fc, order=2):
    sos = signal.butter(order, fc, btype=kind, fs=SR, output='sos')
    return signal.sosfilt(sos, x, axis=0)


def shelf(x: np.ndarray, f0: float, gain_db: float, kind: str = 'low') -> np.ndarray:
    """RBJ shelving biquad (slope 1)."""
    A = 10 ** (gain_db / 40)
    w0 = TAU * f0 / SR
    cw, al = np.cos(w0), np.sin(w0) / 2 * np.sqrt(2)
    sa = 2 * np.sqrt(A) * al
    if kind == 'low':
        b = [A * ((A + 1) - (A - 1) * cw + sa), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - sa)]
        a = [(A + 1) + (A - 1) * cw + sa, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - sa]
    else:
        b = [A * ((A + 1) + (A - 1) * cw + sa), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - sa)]
        a = [(A + 1) - (A - 1) * cw + sa, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - sa]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0)


def make_ir(seconds: float, rt_low: float, rt_high: float, seed: int, predelay_ms: float = 12.0,
            lp_hz: float = 9000.0, early: int = 10) -> np.ndarray:
    """Synthetic stereo reverb IR: decorrelated noise with a frequency-dependent
    exponential decay (long lows, short highs), a few sparse early reflections,
    unit energy per channel."""
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)

    def mag(t, f):
        rt = rt_high + (rt_low - rt_high) / (1.0 + (f / 2500.0) ** 1.5)
        return np.exp(-6.91 * t / rt) * lp_mag(f, lp_hz, 1) * hp_mag(f, 90.0, 2)

    ir = shaped_noise(n, mag, rng)
    t = tvec(n)
    ir *= (1.0 - np.exp(-t / 0.010))[:, None]
    for ch in range(2):
        for _ in range(early):
            k = int(rng.uniform(0.006, 0.075) * SR)
            ir[k, ch] += rng.choice([-1, 1]) * rng.uniform(0.15, 0.4) * np.exp(-k / SR / 0.05) * 12
    pre = int(predelay_ms * 1e-3 * SR)
    ir = np.concatenate([np.zeros((pre, 2)), ir])[:n]
    ir /= np.sqrt(np.sum(ir ** 2, axis=0, keepdims=True))
    return ir


def convolve_stereo(send: np.ndarray, ir: np.ndarray) -> np.ndarray:
    """Reverb return for a stereo send: light crossfeed into decorrelated L/R tails."""
    n = send.shape[0]
    l_in = 0.72 * send[:, 0] + 0.28 * send[:, 1]
    r_in = 0.28 * send[:, 0] + 0.72 * send[:, 1]
    wl = signal.oaconvolve(l_in, ir[:, 0])[:n]
    wr = signal.oaconvolve(r_in, ir[:, 1])[:n]
    return np.stack([wl, wr], axis=1)


TAIL_FADE_MS = 10.0
TAIL_FLOOR_DB = -60.0


def tail_fade(x: np.ndarray, ms: float = TAIL_FADE_MS) -> np.ndarray:
    """Raised-cosine fade over the last `ms` of a signal (a copy)."""
    x = np.array(x, dtype=float, copy=True)
    L = min(int(ms * 1e-3 * SR), x.shape[0])
    if L > 1:
        w = 0.5 + 0.5 * np.cos(np.pi * np.arange(1, L + 1) / L)
        x[-L:] *= w if x.ndim == 1 else w[:, None]
    return x


def tail_level_db(x: np.ndarray, ms: float = TAIL_FADE_MS) -> float:
    """Level (dB re the signal's peak) just before its last `ms`: how much is
    still ringing when the buffer ends."""
    L = max(1, int(ms * 1e-3 * SR))
    pk = float(np.max(np.abs(x)))
    if pk <= 0 or x.shape[0] <= 2 * L:
        return -np.inf
    return float(a2db(np.max(np.abs(x[-2 * L:-L])) / pk))


class Bus:
    """A stereo stem with hall and room sends.

    Every signal gets a raised-cosine fade over its last 10 ms (`fade_ms`) so a
    buffer end can never click, and every signal that ends inside the bus is
    checked: if it is still above TAIL_FLOOR_DB (re its own peak) where its
    buffer ends it was cut off while ringing, and it is logged in `cut_tails`.
    `cut_ok` marks a sound that ends where it is meant to: its own envelope
    closes to zero at the buffer end, or the pre-strike silence chokes it."""

    def __init__(self, n: int, name: str = 'bus'):
        self.n = n
        self.name = name
        self.dry = np.zeros((n, 2))
        self.hall = np.zeros((n, 2))
        self.room = np.zeros((n, 2))
        self.cut_tails: list[dict] = []

    def add(self, sig: np.ndarray, at: int, pan=0.0, db: float = 0.0, hall: float = 0.0,
            room: float = 0.0, fade_ms: float = TAIL_FADE_MS, cut_ok: bool = False, label: str = '') -> None:
        a = int(at)
        if not cut_ok and a + sig.shape[0] <= self.n:
            lv = tail_level_db(sig, fade_ms or TAIL_FADE_MS)
            if lv > TAIL_FLOOR_DB:
                self.cut_tails.append({'bus': self.name, 'label': label, 'at_s': round(a / SR, 3),
                                       'end_s': round((a + sig.shape[0]) / SR, 3), 'tail_db': round(lv, 1)})
        if fade_ms:
            sig = tail_fade(sig, fade_ms)
        st = to_stereo(sig, pan) * db2a(db)
        if a < 0:
            st, a = st[-a:], 0
        k = min(st.shape[0], self.n - a)
        if k <= 0:
            return
        st = st[:k]
        self.dry[a:a + k] += st
        if hall:
            self.hall[a:a + k] += st * hall
        if room:
            self.room[a:a + k] += st * room

    def render(self, irs: dict) -> np.ndarray:
        out = self.dry.copy()
        if np.any(self.hall):
            out += convolve_stereo(self.hall, irs['hall'])
        if np.any(self.room):
            out += convolve_stereo(self.room, irs['room'])
        return out
