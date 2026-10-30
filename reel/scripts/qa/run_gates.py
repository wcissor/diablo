#!/usr/bin/env python3
"""Quality gates for the Diablo intro reel (brief section 8).

Usage:  python3 scripts/qa/run_gates.py [--root DIR]

DIR defaults to the reel project (two levels above this file). Every path
below is relative to it. Missing inputs never crash the run: the gates that
need them say MISSING (or FAIL) and the rest still run.

Reads
  out/diablo-intro-20s.mp4           main cut (score, sound, words)
  out/diablo-intro-20s-vo.mp4        voice cut; if absent, audio/build/voice-status.json says why
  out/frames/frame-000.png … 599     the rendered PNG sequence (else the main cut is decoded)
  build/config.json                  `npx tsx scripts/export-config.ts`
  audio/build/score.wav, sfx.wav, mix-main.wav, voice.wav (optional)
  out/captions.srt                   captions for the voice cut
  out/qa/manual.json                 verdicts for the judged gates (absent: PENDING)

Writes
  out/qa/report.md                   one line per gate, 11 gates
  out/qa/measurements.json           every number behind the report
  out/qa/stills/still-01.0s.png …    the nine gate-2 stills
  out/qa/overlay/still-01.0s.png …   the same with the safe zones outlined
  out/qa/contact-sheet.png           every 10th frame, numbered
  out/qa/strips/shot-N.png           every 5th frame of each shot

manual.json holds the human/agent verdicts, one key per gate:
  {"G2":  {"verdict": "PASS", "note": "looked at all nine stills"},
   "G3":  {"verdict": "PASS", "note": "bots, eyes and claws inside the core area"},
   "G5":  ..., "G6": ..., "G7": ..., "G11": ...,
   "G10_voice_words": {"verdict": "PASS", "note": "listened: words match"}}
A value may also be a plain string such as "PASS: no charts anywhere".
"""

from __future__ import annotations

import argparse
import csv
import datetime as _dt
import difflib
import functools
import io
import json
import math
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import traceback
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage
from scipy.spatial import cKDTree

# ───────────────────────────── the brief's numbers ─────────────────────────────

REEL = Path(__file__).resolve().parents[2]
W, H, FPS, NF = 1080, 1920, 30, 600
DURATION_S = NF / FPS

STILL_FRAMES = [30, 114, 144, 165, 240, 300, 405, 504, 570]  # 1.0 3.8 4.8 5.5 8.0 10.0 13.5 16.8 19.0 s


@dataclass(frozen=True)
class Box:
    x0: int
    y0: int
    x1: int
    y1: int

    def contains(self, b: "Box") -> bool:
        return b.x0 >= self.x0 and b.y0 >= self.y0 and b.x1 <= self.x1 and b.y1 <= self.y1

    def s(self) -> str:
        return f"x {self.x0}–{self.x1}, y {self.y0}–{self.y1}"


SAFE = Box(120, 288, 936, 1248)
WORDS_ZONE = Box(160, 300, 920, 500)
RAIL = Box(936, 800, 1080, 1920)
RAIL_GATED_Y1 = 1248  # below the core area the tail and shadows may pass
TEXT_BAND_Y1 = 520  # words live above this
WORDS_CLEAR = 40
END_CARD_BAND = Box(120, 925, 960, 1160)  # below the mark (bottom ≈ y 910), name and URL
WORDS_OCR_BOX = Box(120, 270, 960, 530)

PALETTE = {
    "night": "#120309",
    "maroon": "#56021A",
    "cream": "#FDF9F0",
    "gold": "#E9B44C",
    "porcelain": "#EFEAE4",
    "porcelain-shade": "#B9C1CB",
    "ember": "#E8392E",
    "poolCentre": "#2B0B16",
}
# The slit that opens and closes the reel is true black; it counts as palette.
EXTRA_ANCHORS = {"black (slit)": "#000000"}
BACKGROUND = ["#000000", "#120309", "#2B0B16"]  # and blends between them

PALETTE_DE = 12.0
PALETTE_MIN_SHARE = 0.97
NONBG_DE = 15.0  # a pixel this far from the background blends belongs to something
RAIL_MAX_PX = 25  # anti-aliasing and glow allowance; a claw tip or a ring edge is more than this
FLASH_JUMP = 0.10  # luma (0–1) above the neighbours' median
SLOWMO_MAX_RATIO = 0.7
CUT_MAX_DIST = 3  # frames
CUT_FIND_SCORE, CUT_CONFIRM_SCORE = 4.0, 3.0  # change spike vs its neighbours: to find a cut / to confirm a planned one
OCR_DIGIT_CONF = 60
OCR_STRAY_CONF = 85
OCR_TOKEN_PX = (12, 160)  # word-box heights that can be text here (the 120 px name is ~120 px with descenders)
MIN_GLYPH_PX = 30
MIN_CONTRAST = 7.0
LUFS_MAIN, LUFS_VOICE, LUFS_TOL, TRUE_PEAK_MAX = -18.0, -16.0, 1.0, -1.0
VOICE_ONSET_TOL = 0.2  # s

PASS, FAIL, PENDING, MISSING = "PASS", "FAIL", "PENDING", "MISSING"


# ─────────────────────────────── small helpers ───────────────────────────────


def log(msg: str) -> None:
    print(f"[qa] {msg}", file=sys.stderr, flush=True)


def run(cmd: list[str], timeout: int = 600, text: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=text, timeout=timeout)


def have(tool: str) -> bool:
    return shutil.which(tool) is not None


def fnum(x, nd: int = 1) -> str:
    if x is None or (isinstance(x, float) and not math.isfinite(x)):
        return "n/a"
    return f"{x:.{nd}f}"


def still_name(frame: int) -> str:
    return f"still-{frame / FPS:04.1f}s.png"


def to_jsonable(o):
    if isinstance(o, dict):
        return {str(k): to_jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple, set)):
        return [to_jsonable(v) for v in o]
    if isinstance(o, np.ndarray):
        return to_jsonable(o.tolist())
    if isinstance(o, np.generic):
        return to_jsonable(o.item())
    if isinstance(o, float):
        return round(o, 5) if math.isfinite(o) else None
    if isinstance(o, Path):
        return str(o)
    if isinstance(o, Box):
        return [o.x0, o.y0, o.x1, o.y1]
    return o


# ─────────────────────────────────── colour ───────────────────────────────────


def hex_rgb(h: str) -> np.ndarray:
    return np.array([int(h[i : i + 2], 16) for i in (1, 3, 5)], dtype=np.float64)


def srgb_to_linear(c: np.ndarray) -> np.ndarray:
    c = np.asarray(c, dtype=np.float64) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


LIN_LUT = srgb_to_linear(np.arange(256)).astype(np.float32)
LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)  # Rec.709


def rel_lum(rgb) -> np.ndarray:
    """WCAG relative luminance of sRGB 0–255 colours (…, 3)."""
    return srgb_to_linear(rgb) @ LUMA.astype(np.float64)


def wcag(a, b) -> float:
    la, lb = float(rel_lum(a)), float(rel_lum(b))
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def rgb_to_lab(rgb) -> np.ndarray:
    lin = srgb_to_linear(rgb)
    m = np.array(
        [[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]]
    )
    xyz = lin @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def blend_tree(hexes: list[str], steps: int = 65) -> cKDTree:
    """KD-tree of Lab samples on every colour and every sRGB blend between two of them."""
    cols = [hex_rgb(h) for h in hexes]
    t = np.linspace(0, 1, steps)[:, None]
    pts = [c[None, :] for c in cols]
    for i in range(len(cols)):
        for j in range(i + 1, len(cols)):
            pts.append(cols[i] * (1 - t) + cols[j] * t)
    return cKDTree(rgb_to_lab(np.concatenate(pts)))


def delta_e_map(rgb: np.ndarray, tree: cKDTree) -> np.ndarray:
    """Per-pixel ΔE76 from rgb (h, w, 3 uint8) to the nearest point of `tree`."""
    flat = rgb.reshape(-1, 3).astype(np.int32)
    packed = (flat[:, 0] << 16) | (flat[:, 1] << 8) | flat[:, 2]
    u, inv = np.unique(packed, return_inverse=True)
    cols = np.stack([(u >> 16) & 255, (u >> 8) & 255, u & 255], -1)
    d, _ = tree.query(rgb_to_lab(cols))
    return d[inv].reshape(rgb.shape[:2]).astype(np.float32)


def luma_of(rgb: np.ndarray) -> np.ndarray:
    return (rgb.astype(np.float32) @ LUMA) / 255.0


def otsu(values: np.ndarray) -> float:
    hist, edges = np.histogram(values, bins=256, range=(0.0, 1.0))
    p = hist.astype(np.float64) / max(1, hist.sum())
    w = np.cumsum(p)
    mu = np.cumsum(p * (edges[:-1] + edges[1:]) / 2)
    with np.errstate(divide="ignore", invalid="ignore"):
        between = (mu[-1] * w - mu) ** 2 / (w * (1 - w))
    between[~np.isfinite(between)] = 0
    return float((edges[np.argmax(between)] + edges[np.argmax(between) + 1]) / 2)


PALETTE_TREE = blend_tree(list(PALETTE.values()) + list(EXTRA_ANCHORS.values()))
BG_TREE = blend_tree(BACKGROUND)
CREAM_TREE = cKDTree(rgb_to_lab(hex_rgb(PALETTE["cream"])[None, :]))
TEXT_TREE = cKDTree(rgb_to_lab(np.stack([hex_rgb(PALETTE["cream"]), hex_rgb(PALETTE["gold"])])))


# ──────────────────────────────── text helpers ────────────────────────────────

CONFUSABLE = str.maketrans({"l": "i", "|": "i", "!": "i", "1": "i", "0": "o"})


def norm_text(s: str, fold: bool = True) -> str:
    """Lower case, punctuation to spaces, whitespace collapsed; l/I/1 and 0/o folded."""
    s = s.lower()
    if fold:
        s = s.translate(CONFUSABLE)
    s = re.sub(r"[^a-z0-9%]+", " ", s)
    return " ".join(s.split())


def word_count(s: str) -> int:
    return len([w for w in s.split() if re.search(r"[A-Za-z0-9]", w)])


# ────────────────────────────────── context ──────────────────────────────────


class Ctx:
    def __init__(self, root: Path):
        self.root = root
        self.main = root / "out/diablo-intro-20s.mp4"
        self.vo = root / "out/diablo-intro-20s-vo.mp4"
        self.frames_dir = root / "out/frames"
        self.config_path = root / "build/config.json"
        self.audio = root / "audio/build"
        self.captions = root / "out/captions.srt"
        self.qa = root / "out/qa"
        self.manual_path = self.qa / "manual.json"
        self.qa.mkdir(parents=True, exist_ok=True)
        self.m: dict = {"root": str(root)}
        self.config = self._load_json(self.config_path, "config")
        self.manual = self._load_json(self.manual_path, "manual") or {}
        self.tmp = Path(tempfile.mkdtemp(prefix="_tmp-", dir=self.qa))

    def _load_json(self, p: Path, key: str):
        if not p.exists():
            self.m.setdefault("inputs", {})[key] = "missing"
            return None
        try:
            data = json.loads(p.read_text())
            self.m.setdefault("inputs", {})[key] = str(p.relative_to(self.root))
            return data
        except Exception as e:  # noqa: BLE001
            self.m.setdefault("inputs", {})[key] = f"unreadable: {e}"
            return None

    def rel(self, p: Path) -> str:
        try:
            return str(p.relative_to(self.root))
        except ValueError:
            return str(p)

    # config accessors (None when the config is missing)
    def shots(self) -> list[dict] | None:
        return (self.config or {}).get("SHOTS")

    def events(self) -> dict:
        return (self.config or {}).get("EVENTS") or {}

    def shot_at(self, frame: int) -> dict | None:
        for s in self.shots() or []:
            if s["from"] <= frame <= s["to"]:
                return s
        return None

    def words_visible(self, frame: int) -> list[str]:
        """Lines fully on screen at `frame` (faded in for 8 frames), [] if none."""
        s = self.shot_at(frame)
        if not s or not s.get("words") or frame < s["wordsIn"] + 8:
            return []
        return list(s["words"])

    def manual_verdict(self, key: str) -> tuple[str | None, str]:
        v = None
        for k in (key, key.lower(), key.lstrip("G"), f"gate{key.lstrip('G')}"):
            if k in self.manual:
                v = self.manual[k]
                break
        if v is None:
            return None, ""
        if isinstance(v, bool):
            return (PASS if v else FAIL), ""
        if isinstance(v, str):
            mm = re.match(r"\s*(PASS|FAIL|PENDING)\b[\s:—–-]*(.*)", v, re.I | re.S)
            return (mm.group(1).upper(), mm.group(2).strip()) if mm else (PENDING, v.strip())
        if isinstance(v, dict):
            verdict = str(v.get("verdict", v.get("status", PENDING))).upper()
            if verdict not in (PASS, FAIL, PENDING):
                verdict = PENDING
            note = v.get("note") or v.get("notes") or v.get("answer") or v.get("reviewer") or ""
            return verdict, str(note).strip()
        return PENDING, str(v)


def combine(auto_ok: bool | None, manual: tuple[str | None, str]) -> str:
    """Automated part first; a failure there fails the gate. Otherwise the manual verdict decides."""
    if auto_ok is False:
        return FAIL
    verdict = manual[0]
    if verdict is None:
        return PENDING
    return verdict


def manual_text(manual: tuple[str | None, str]) -> str:
    if manual[0] is None:
        return "manual: PENDING (no verdict in out/qa/manual.json)"
    return f"manual: {manual[0]}" + (f" ({manual[1]})" if manual[1] else "")


# ─────────────────────────────── frame scanning ───────────────────────────────


def load_rgb(p: Path) -> np.ndarray:
    with Image.open(p) as im:
        im = im.convert("RGB")
        if im.size != (W, H):
            im = im.resize((W, H), Image.BILINEAR)
        return np.asarray(im)


class Frames:
    """One pass over the reel: per-frame series plus the few full frames the gates look at."""

    SHAKE_RANGE = range(128, 160)
    SHAKE_ROWS = (560, 1400)  # below the words, through Diablo, the bots and the stage

    def __init__(self, ctx: Ctx):
        self.ctx = ctx
        self.kind: str | None = None
        self.desc = "no frames"
        self.have = np.zeros(NF, dtype=bool)
        self.luma = np.full(NF, np.nan)
        self.lum_lin = np.full(NF, np.nan)
        self.small = np.full((NF, H // 8, W // 8), np.nan, dtype=np.float32)
        self.full: dict[int, np.ndarray] = {}
        self.thumbs: dict[int, Image.Image] = {}
        self.shake: dict[int, np.ndarray] = {}
        self.layout: dict[int, dict] = {}  # gate-3 measurements on every 5th frame and the kept frames

    def _png_path(self, i: int) -> Path | None:
        for pat in (f"frame-{i:03d}.png", f"frame-{i:04d}.png"):
            p = self.ctx.frames_dir / pat
            if p.exists():
                return p
        return None

    def _png_source(self):
        for i in range(NF):
            p = self._png_path(i)
            if p is not None:
                try:
                    yield i, load_rgb(p)
                except Exception as e:  # noqa: BLE001
                    log(f"unreadable {p.name}: {e}")

    def _mp4_source(self):
        cmd = ["ffmpeg", "-v", "error", "-i", str(self.ctx.main), "-map", "0:v:0", "-vf", f"scale={W}:{H}",
               "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        size = W * H * 3
        try:
            for i in range(NF):
                buf = proc.stdout.read(size)
                if len(buf) < size:
                    break
                yield i, np.frombuffer(buf, dtype=np.uint8).reshape(H, W, 3)
        finally:
            proc.kill()
            proc.wait()

    def scan(self, keep: set[int]) -> None:
        n_png = sum(1 for i in range(NF) if self._png_path(i) is not None)
        if n_png == NF:
            self.kind, self.desc, source = "png", f"PNG sequence ({NF} frames)", self._png_source()
        elif self.ctx.main.exists() and have("ffmpeg"):
            self.kind, source = "mp4", self._mp4_source()
            self.desc = f"decoded main cut (PNG sequence {'incomplete: ' + str(n_png) if n_png else 'absent'})"
        elif n_png:
            self.kind, self.desc, source = "png", f"partial PNG sequence ({n_png}/{NF})", self._png_source()
        else:
            self.ctx.m["frames"] = {"source": self.desc}
            return
        log(f"scanning frames: {self.desc}")
        r0, r1 = self.SHAKE_ROWS
        for i, rgb in source:
            y = luma_of(rgb)
            self.have[i] = True
            self.luma[i] = float(y.mean())
            sub = rgb[::2, ::2]
            self.lum_lin[i] = float((LIN_LUT[sub[..., 0]] * LUMA[0] + LIN_LUT[sub[..., 1]] * LUMA[1]
                                     + LIN_LUT[sub[..., 2]] * LUMA[2]).mean())
            self.small[i] = y.reshape(H // 8, 8, W // 8, 8).mean(axis=(1, 3))
            if i in self.SHAKE_RANGE:
                self.shake[i] = y[r0:r1].reshape((r1 - r0) // 2, 2, W // 2, 2).mean(axis=(1, 3))
            if i % 5 == 0:
                self.thumbs[i] = Image.fromarray(rgb).reduce(10)
            if i in keep:
                self.full[i] = np.array(rgb, copy=True)
            if i % 5 == 0 or i in keep:
                self.layout[i] = layout_sample(self.ctx, i, rgb)
            if i % 100 == 99:
                log(f"  frame {i + 1}/{NF}")
        self.desc += f", {int(self.have.sum())} read"
        self.ctx.m["frames"] = {"source": self.desc, "count": int(self.have.sum())}

    def get(self, i: int) -> np.ndarray | None:
        return self.full.get(i)


# ─────────────────────────────────── audio ───────────────────────────────────


def decode_audio(path: Path, sr: int = 48000) -> np.ndarray | None:
    """Float samples (n, channels) at `sr`, or None."""
    if not path.exists() or not have("ffmpeg"):
        return None
    pr = run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=channels", "-of", "csv=p=0",
              str(path)])
    try:
        ch = int(pr.stdout.strip().splitlines()[0])
    except (ValueError, IndexError):
        return None
    r = run(["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:a:0", "-ar", str(sr), "-ac", str(ch), "-f", "f32le",
             "-acodec", "pcm_f32le", "-"], text=False)
    if r.returncode or not r.stdout:
        return None
    return np.frombuffer(r.stdout, dtype=np.float32).reshape(-1, ch)


def ebur128(path: Path, stream: str = "0:a:0") -> dict | None:
    """ffmpeg ebur128 summary: integrated loudness, LRA and true peak."""
    if not path.exists() or not have("ffmpeg"):
        return None
    r = run(["ffmpeg", "-nostats", "-hide_banner", "-i", str(path), "-map", stream, "-af", "ebur128=peak=true",
             "-f", "null", "-"])
    txt = r.stderr
    k = txt.rfind("Summary:")
    if k < 0:
        return None
    s = txt[k:]

    def grab(pat):
        mm = re.search(pat, s)
        if not mm:
            return None
        v = mm.group(1)
        return -math.inf if v == "-inf" else float(v)

    return {"I": grab(r"I:\s+(-?inf|-?[\d.]+) LUFS"), "LRA": grab(r"LRA:\s+(-?[\d.]+) LU"),
            "true_peak": grab(r"Peak:\s+(-?inf|-?[\d.]+) dBFS")}


# K-weighting (ITU-R BS.1770) at 48 kHz.
K_SHELF = ([1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585])
K_HPF = ([1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621])


def momentary_loudness(x: np.ndarray, sr: int = 48000, win: float = 0.4, hop: float = 0.05):
    from scipy.signal import lfilter

    z = lfilter(*K_HPF, lfilter(*K_SHELF, x, axis=0), axis=0)
    p = (z.astype(np.float64) ** 2).sum(axis=1)
    c = np.concatenate([[0.0], np.cumsum(p)])
    n, h = int(win * sr), int(hop * sr)
    starts = np.arange(0, max(1, len(p) - n + 1), h)
    ms = (c[np.minimum(starts + n, len(p))] - c[starts]) / n
    return starts / sr, -0.691 + 10 * np.log10(np.maximum(ms, 1e-12))


def spectral_flux_onsets(x: np.ndarray, sr: int = 48000, n_fft: int = 1024, hop: int = 256) -> dict:
    """Onsets by half-wave-rectified log spectral flux, plus hard stops (sound cut to silence)."""
    mono = x.mean(axis=1).astype(np.float64)
    pad = np.pad(mono, (n_fft // 2, n_fft // 2))
    nfr = 1 + (len(pad) - n_fft) // hop
    idx = np.arange(n_fft)[None, :] + hop * np.arange(nfr)[:, None]
    frames = pad[idx] * np.hanning(n_fft)[None, :]
    mag = np.abs(np.fft.rfft(frames, axis=1))
    logm = np.log1p(1000.0 * mag)
    flux = np.concatenate([[0.0], np.maximum(0.0, np.diff(logm, axis=0)).sum(axis=1)])
    flux /= max(1e-9, float(np.percentile(flux, 99.5)))
    rms_db = 10 * np.log10(np.maximum((frames**2).mean(axis=1), 1e-14))
    w, a, wait, delta = 3, 24, 10, 0.08
    half_s = sr // (2 * hop)
    onsets, last = [], -wait
    for n in range(1, nfr):
        lo, hi = max(0, n - w), min(nfr, n + w + 1)
        if flux[n] < flux[lo:hi].max() or flux[n] <= 0:
            continue
        if flux[n] < flux[max(0, n - a): n + a + 1].mean() + delta:
            continue
        if flux[n] < 0.3 * flux[max(0, n - half_s): n + half_s + 1].max():  # ripple in a bigger hit's tail
            continue
        if rms_db[n: n + 8].max() < -60:
            continue
        if n - last < wait:
            continue
        onsets.append(n * hop / sr)
        last = n
    # hard stops: 10 ms RMS falls ≥ 20 dB within ~20 ms and stays down for 100 ms
    step = sr // 100
    m = len(mono) // step
    lvl = 10 * np.log10(np.maximum((mono[: m * step].reshape(m, step) ** 2).mean(axis=1), 1e-14))
    stops, last = [], -10
    for n in range(3, m - 12):
        before = lvl[n - 3: n].mean()
        if before < -45:
            continue
        if lvl[n + 2: n + 12].max() <= before - 20 and n - last > 5:
            stops.append(n / 100.0)
            last = n
    return {"onsets_s": onsets, "stops_s": stops}


# ─────────────────────────────────── drawing ───────────────────────────────────


@functools.lru_cache(maxsize=None)
def font(size: int):
    for name in ("DejaVuSans.ttf", "LiberationSans-Regular.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def missing_thumb() -> Image.Image:
    im = Image.new("RGB", (W // 10, H // 10), (60, 60, 60))
    ImageDraw.Draw(im).text((8, 8), "missing", fill=(200, 200, 200), font=font(14))
    return im


def thumb_grid(items: list[tuple[int, Image.Image | None]], cols: int, title: str) -> Image.Image:
    tw, th, pad, label, head = W // 10, H // 10, 6, 20, 34
    rows = max(1, math.ceil(len(items) / cols))
    sheet = Image.new("RGB", (pad + cols * (tw + pad), head + rows * (th + label + pad) + pad), (28, 28, 30))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 8), title, fill=(235, 235, 235), font=font(18))
    for k, (frame, im) in enumerate(items):
        x = pad + (k % cols) * (tw + pad)
        y = head + (k // cols) * (th + label + pad)
        sheet.paste(im if im is not None else missing_thumb(), (x, y))
        d.text((x + 2, y + th + 2), f"f{frame}  {frame / FPS:.2f}s", fill=(220, 220, 220), font=font(13))
    return sheet


def draw_overlay(rgb: np.ndarray, label: str) -> Image.Image:
    im = Image.fromarray(rgb).copy()
    d = ImageDraw.Draw(im)
    zones = [(SAFE, (0, 230, 255), "core safe area"), (WORDS_ZONE, (255, 60, 220), "words zone"),
             (RAIL, (255, 230, 0), "right rail")]
    for b, col, _ in zones:
        d.rectangle([b.x0, b.y0, b.x1 - 1, b.y1 - 1], outline=col, width=2)
    d.line([0, 1180, W, 1180], fill=(120, 255, 120), width=1)
    f = font(24)
    y = 1700
    d.text((20, y - 40), label, fill=(255, 255, 255), font=f)
    for _, col, name in zones + [(None, (120, 255, 120), "stage line y 1180")]:
        d.rectangle([20, y + 6, 44, y + 22], outline=col, width=3)
        d.text((54, y), name, fill=col, font=f)
        y += 34
    return im


# ─────────────────────────────────── gates ───────────────────────────────────


@dataclass
class Result:
    status: str
    text: str


def top_atoms(path: Path) -> list[str]:
    out = []
    size = path.stat().st_size
    with path.open("rb") as f:
        pos = 0
        while pos < size and len(out) < 64:
            f.seek(pos)
            hdr = f.read(8)
            if len(hdr) < 8:
                break
            n, typ = struct.unpack(">I4s", hdr)
            if n == 1:
                n = struct.unpack(">Q", f.read(8))[0]
            elif n == 0:
                n = size - pos
            out.append(typ.decode("latin1"))
            if n < 8:
                break
            pos += n
    return out


def frac(s: str | None) -> float:
    try:
        a, b = (s or "0/1").split("/")
        return float(a) / float(b) if float(b) else float("nan")
    except ValueError:
        return float("nan")


def probe_cut(path: Path) -> tuple[dict, list[str]]:
    """ffprobe one cut. Returns (info, problems); info["notes"] holds spec deviations that are reported, not failed
    (H.264 profile, audio bitrate, faststart): the gate itself is size, rate, frame count, duration, streams, codecs."""
    info: dict = {"present": path.exists(), "notes": []}
    if not path.exists():
        return info, ["missing"]
    r = run(["ffprobe", "-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", str(path)])
    if r.returncode:
        return info, [f"ffprobe failed: {r.stderr.strip()[:160]}"]
    j = json.loads(r.stdout or "{}")
    streams, fmt = j.get("streams", []), j.get("format", {})
    v = [s for s in streams if s.get("codec_type") == "video"]
    a = [s for s in streams if s.get("codec_type") == "audio"]
    other = [s.get("codec_type") for s in streams if s.get("codec_type") not in ("video", "audio")]
    p: list[str] = []
    info.update(n_video=len(v), n_audio=len(a), other_streams=other, duration=float(fmt.get("duration", "nan")))
    if len(v) != 1 or len(a) != 1 or other:
        p.append(f"streams {len(v)}v+{len(a)}a" + (f"+{len(other)} other" if other else ""))
    if v:
        s = v[0]
        info.update(width=s.get("width"), height=s.get("height"), r_frame_rate=s.get("r_frame_rate"),
                    avg_frame_rate=s.get("avg_frame_rate"), fps=frac(s.get("avg_frame_rate")),
                    frames=int(s.get("nb_read_frames") or s.get("nb_frames") or -1),
                    v_duration=float(s.get("duration", "nan")), codec=s.get("codec_name"), profile=s.get("profile"),
                    pix_fmt=s.get("pix_fmt"), v_bitrate=int(s.get("bit_rate") or 0))
        if (info["width"], info["height"]) != (W, H):
            p.append(f"size {info['width']}×{info['height']}")
        if abs(frac(s.get("r_frame_rate")) - FPS) > 1e-3 or abs(info["fps"] - FPS) > 1e-3:
            p.append(f"fps {s.get('r_frame_rate')}/{s.get('avg_frame_rate')}")
        if info["frames"] != NF:
            p.append(f"{info['frames']} frames")
        if not abs(info["v_duration"] - DURATION_S) <= 0.5 / FPS:
            p.append(f"video {fnum(info['v_duration'], 3)} s")
        if info["codec"] != "h264":
            p.append(f"codec {info['codec']}")
        if str(info["profile"]).lower() != "high":
            info["notes"].append(f"profile {info['profile']} (want High)")
        if info["pix_fmt"] != "yuv420p":
            p.append(f"pix_fmt {info['pix_fmt']}")
    if a:
        s = a[0]
        info.update(a_codec=s.get("codec_name"), sample_rate=int(s.get("sample_rate") or 0), channels=s.get("channels"),
                    a_bitrate=int(s.get("bit_rate") or 0), a_duration=float(s.get("duration", "nan")))
        if info["a_codec"] != "aac" or info["sample_rate"] != 48000:
            p.append(f"audio {info['a_codec']} {info['sample_rate']} Hz")
        if not 176_000 <= info["a_bitrate"] <= 208_000:
            info["notes"].append(f"audio {info['a_bitrate'] // 1000} kb/s (set 192k; AAC undershoots on sparse audio)")
    if not abs(info["duration"] - DURATION_S) <= 0.05:
        p.append(f"container {fnum(info['duration'], 3)} s")
    atoms = top_atoms(path)
    info["atoms"] = atoms
    info["faststart"] = "moov" in atoms and "mdat" in atoms and atoms.index("moov") < atoms.index("mdat")
    if not info["faststart"]:
        info["notes"].append("no faststart (moov after mdat)")
    return info, p


def cut_summary(i: dict) -> str:
    if not i.get("present"):
        return "missing"
    return (f"{i.get('width')}×{i.get('height')}, {fnum(i.get('fps'), 2)} fps, {i.get('frames')} frames, "
            f"{fnum(i.get('v_duration'), 3)} s video / {fnum(i.get('duration'), 3)} s file, "
            f"{i.get('n_video')}v+{i.get('n_audio')}a, {i.get('codec')} {i.get('profile')} {i.get('pix_fmt')}, "
            f"{i.get('a_codec')} {(i.get('sample_rate') or 0) / 1000:g} kHz {i.get('channels')}ch "
            f"{(i.get('a_bitrate') or 0) / 1000:.0f} kb/s, faststart {'yes' if i.get('faststart') else 'NO'}")


def voice_status(ctx: Ctx) -> tuple[str, dict | None]:
    p = ctx.audio / "voice-status.json"
    if not p.exists():
        return "no audio/build/voice-status.json", None
    try:
        j = json.loads(p.read_text())
    except Exception as e:  # noqa: BLE001
        return f"voice-status.json unreadable ({e})", None
    if isinstance(j, dict):
        parts = [str(j[k]) for k in ("note", "reason", "error", "message", "detail", "why") if j.get(k)]
        if isinstance(j.get("reasons"), dict):  # one reason per voice engine tried
            parts.append("; ".join(f"{k}: {str(v)[:90]}" for k, v in j["reasons"].items()))
        if not parts and j.get("status"):
            parts.append(str(j["status"]))
        if parts:
            engine = j.get("engine") or j.get("source")
            return " — ".join(parts) + (f" (engine: {engine})" if engine else ""), j
    return json.dumps(j)[:200], j


def g1_file(ctx: Ctx) -> Result:
    if not have("ffprobe"):
        return Result(MISSING, "ffprobe not installed")
    main, pm = probe_cut(ctx.main)
    vo, pv = probe_cut(ctx.vo)
    ctx.m["G1"] = {"main": main, "main_problems": pm, "vo": vo, "vo_problems": pv}
    def flags(info: dict, probs: list[str]) -> str:
        out = f" [FAIL: {'; '.join(probs)}]" if probs else ""
        return out + (f" [note: {'; '.join(info['notes'])}]" if info.get("notes") else "")

    text = f"main: {cut_summary(main)}" + (flags(main, pm) if main.get("present") else "")
    if vo.get("present"):
        text += f" · voice cut: {cut_summary(vo)}" + flags(vo, pv)
        vo_ok = not pv
    else:
        why, _ = voice_status(ctx)
        ctx.m["G1"]["vo_skipped_reason"] = why
        text += f" · voice cut skipped: {why}"
        vo_ok = (ctx.audio / "voice-status.json").exists()
    if not main.get("present"):
        return Result(MISSING, f"main cut {ctx.rel(ctx.main)} missing" + text[text.find(" · "):])
    return Result(PASS if (not pm and vo_ok) else FAIL, text)


def g2_stills(ctx: Ctx, fr: Frames) -> Result:
    for sub in ("stills", "overlay", "strips"):
        d = ctx.qa / sub
        d.mkdir(parents=True, exist_ok=True)
        for old in list(d.glob("still-*.png")) + list(d.glob("shot-*.png")):
            old.unlink()
    written = []
    for f in STILL_FRAMES:
        rgb = fr.get(f)
        if rgb is None:
            continue
        name = still_name(f)
        Image.fromarray(rgb).save(ctx.qa / "stills" / name)
        draw_overlay(rgb, f"frame {f} · {f / FPS:.1f} s").save(ctx.qa / "overlay" / name)
        written.append(name)
    contact = None
    if fr.thumbs:
        items = [(f, fr.thumbs.get(f)) for f in range(0, NF, 10)]
        thumb_grid(items, 10, "Diablo intro reel: every 10th frame").save(ctx.qa / "contact-sheet.png")
        contact = "out/qa/contact-sheet.png"
    strips = []
    for s in ctx.shots() or []:
        if not fr.thumbs:
            break
        items = [(f, fr.thumbs.get(f)) for f in range(s["from"], s["to"] + 1) if f % 5 == 0]
        title = f"Shot {s['id']}: {s['name']} (frames {s['from']}–{s['to']}), every 5th frame"
        thumb_grid(items, len(items), title).save(ctx.qa / "strips" / f"shot-{s['id']}.png")
        strips.append(f"shot-{s['id']}.png")
    man = ctx.manual_verdict("G2")
    ctx.m["G2"] = {"stills": written, "contact_sheet": contact, "strips": strips, "manual": man}
    text = (f"stills written {len(written)}/{len(STILL_FRAMES)} (out/qa/stills, overlays in out/qa/overlay), "
            f"contact sheet {'yes' if contact else 'no'}, {len(strips)} shot strips · looked at: "
            + (f"{man[0]}" + (f" ({man[1]})" if man[1] else "") if man[0] else "PENDING (no G2 verdict in manual.json)"))
    if not written:
        return Result(MISSING, "no frames to take stills from · " + text)
    return Result(combine(len(written) == len(STILL_FRAMES), man), text)


def text_and_clearance(rgb: np.ndarray, band_y1: int = 700) -> dict:
    """Cream text above y 520: its bounding box and its distance to the nearest character pixel."""
    y0 = 250
    band = rgb[y0:band_y1]
    nonbg = delta_e_map(band, BG_TREE) > NONBG_DE
    cream = delta_e_map(band, CREAM_TREE) <= 20
    cream[TEXT_BAND_Y1 - y0:] = False
    cream[:, :WORDS_OCR_BOX.x0] = False  # claws or rims out at the sides are not words
    cream[:, WORDS_OCR_BOX.x1:] = False
    out: dict = {"text_px": int(cream.sum())}
    if cream.sum() < 30:
        return out
    # glyph strokes are thick (Bodoni stems ≥ 8 px at 88 px); a 3 px cream rim on a hand or a horn is not text
    lab_c, n_c = ndimage.label(cream, structure=np.ones((3, 3)))
    radius = ndimage.maximum(ndimage.distance_transform_edt(cream), lab_c, index=np.arange(1, n_c + 1))
    core = np.isin(lab_c, np.arange(1, n_c + 1)[np.asarray(radius) >= 2.5])
    out["rim_px_ignored"] = int((cream & ~core).sum())
    if core.sum() < 30:
        return out
    rows = np.where(core.sum(axis=1) >= 2)[0]
    cols = np.where(core.sum(axis=0) >= 2)[0]
    if len(rows) == 0 or len(cols) == 0:
        return out
    bbox = Box(int(cols[0]), int(rows[0] + y0), int(cols[-1] + 1), int(rows[-1] + 1 + y0))
    out["bbox"] = bbox
    lab, _ = ndimage.label(nonbg | core, structure=np.ones((3, 3)))
    ids = np.unique(lab[core])
    ids = ids[ids > 0]
    text_mask = np.isin(lab, ids)
    # a text component that runs on below y 540 has merged with a character
    merged = bool(text_mask[540 - y0:].any())
    char = nonbg & ~text_mask
    if merged:
        out["clearance"] = 0.0
        out["merged_with_character"] = True
    elif char.any():
        dist = ndimage.distance_transform_edt(~text_mask)
        k = np.argmin(np.where(char, dist, np.inf))
        cy, cx = np.unravel_index(k, char.shape)
        out["clearance"] = float(dist[cy, cx])
        out["nearest_character_px"] = [int(cx), int(cy + y0)]
    else:
        out["clearance"] = float(band_y1 - bbox.y1)  # nothing in the band below the words
        out["clearance_note"] = f"no character above y {band_y1}"
    return out


def end_card_text_box(rgb: np.ndarray) -> Box | None:
    b = END_CARD_BAND
    crop = rgb[b.y0:b.y1, b.x0:b.x1]
    core = delta_e_map(crop, TEXT_TREE) <= 20
    rows = np.where(core.sum(axis=1) >= 2)[0]
    cols = np.where(core.sum(axis=0) >= 2)[0]
    if len(rows) == 0 or len(cols) == 0:
        return None
    return Box(int(cols[0] + b.x0), int(rows[0] + b.y0), int(cols[-1] + 1 + b.x0), int(rows[-1] + 1 + b.y0))


def rail_report(rgb: np.ndarray) -> dict:
    crop = rgb[RAIL.y0:RAIL.y1, RAIL.x0:RAIL.x1]
    mask = delta_e_map(crop, BG_TREE) > NONBG_DE
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    for k, sl in enumerate(ndimage.find_objects(lab), start=1):
        if sl is None:
            continue
        hgt, wid = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if hgt <= 3 or (hgt <= 5 and wid >= 20):  # the stage line (and its fading end), not action
            mask[sl][lab[sl] == k] = False
    split = RAIL_GATED_Y1 - RAIL.y0
    upper, lower = mask[:split], mask[split:]
    out = {"px_800_1248": int(upper.sum()), "px_below_1248": int(lower.sum())}
    bright = luma_of(crop)[:split] > 0.25
    out["bright_px_800_1248"] = int((upper & bright).sum())
    if upper.any():
        ys, xs = np.where(upper)
        out["bbox_800_1248"] = Box(int(xs.min() + RAIL.x0), int(ys.min() + RAIL.y0), int(xs.max() + 1 + RAIL.x0),
                                   int(ys.max() + 1 + RAIL.y0))
    return out


def layout_sample(ctx: Ctx, f: int, rgb: np.ndarray) -> dict:
    """Gate-3 numbers for one frame: words box and clearance (if words are up), right rail, end-card text."""
    out: dict = {"words": " / ".join(ctx.words_visible(f)), "rail": rail_report(rgb)}
    tc = text_and_clearance(rgb)
    if out["words"]:
        out.update(tc)
    else:
        out["cream_px_above_520"] = tc["text_px"]
    shot = ctx.shot_at(f)
    end = (ctx.config or {}).get("END_CARD") or {}
    if ((shot["id"] == 7) if shot else f >= 549) and f >= end.get("nameIn", 549) + 8:
        out["end_card_text_bbox"] = end_card_text_box(rgb)
    return out


def frame_ranges(frames: list[int], step: int = 5) -> str:
    """[340, 345, 350, 420] → "340–350, 420"."""
    out, run_ = [], []
    for f in sorted(frames):
        if run_ and f - run_[-1] > step:
            out.append(run_)
            run_ = []
        run_.append(f)
    if run_:
        out.append(run_)
    return ", ".join(f"{r[0]}–{r[-1]}" if len(r) > 1 else f"{r[0]}" for r in out)


def g3_safe(ctx: Ctx, fr: Frames) -> Result:
    """Automated part: words inside the words zone and 40 px clear of every character, nothing in the right rail,
    end-card text inside the core area, on every 5th frame plus the stills. Characters inside the core area: manual."""
    smp = fr.layout
    if not smp:
        return Result(MISSING, "no frames")
    boxes, clear, out_zone, too_close, no_text, rail, end_bad = [], [], [], [], [], [], []
    for f in sorted(smp):
        r = smp[f]
        if r["words"]:
            if "bbox" not in r:
                no_text.append(f)
            else:
                boxes.append(r["bbox"])
                if not WORDS_ZONE.contains(r["bbox"]):
                    out_zone.append(f)
                if "clearance" in r:
                    clear.append((r["clearance"], f, r.get("nearest_character_px")))
                    if r["clearance"] < WORDS_CLEAR:
                        too_close.append(f)
        if r["rail"]["px_800_1248"] > RAIL_MAX_PX:
            rail.append(f)
        eb = r.get("end_card_text_bbox")
        if eb is not None and not SAFE.contains(eb):
            end_bad.append(f)
    man = ctx.manual_verdict("G3")
    ctx.m["G3"] = {"checked_frames": sorted(smp), "per_frame": smp, "stills": STILL_FRAMES, "manual": man,
                   "words_outside_zone": out_zone, "words_too_close": too_close, "words_not_found": no_text,
                   "rail_action": rail, "end_card_outside_core": end_bad}
    union = (Box(min(b.x0 for b in boxes), min(b.y0 for b in boxes), max(b.x1 for b in boxes), max(b.y1 for b in boxes))
             if boxes else None)
    worst = min(clear, key=lambda c: c[0]) if clear else None
    text = (f"checked {len(smp)} frames (every 5th + stills): words bbox (union) {union.s() if union else 'n/a'} vs zone "
            f"{WORDS_ZONE.s()}" + (f", outside at f{frame_ranges(out_zone)}" if out_zone else "")
            + (f", words not found at f{frame_ranges(no_text)}" if no_text else "")
            + (f"; min clearance to a character {worst[0]:.0f} px at f{worst[1]}"
               + (f" (character at x {worst[2][0]}, y {worst[2][1]})" if worst[2] else "")
               + f" (≥ {WORDS_CLEAR})" if worst else "")
            + (f", under {WORDS_CLEAR} px at f{frame_ranges(too_close)}" if too_close else ""))
    if rail:
        top = max(rail, key=lambda f: smp[f]["rail"]["px_800_1248"])
        text += (f"; right rail (x ≥ 936, y 800–1248) has action at f{frame_ranges(rail)} "
                 f"(max {smp[top]['rail']['px_800_1248']} px at f{top}, {smp[top]['rail']['bbox_800_1248'].s()})")
    else:
        text += "; right rail (x ≥ 936, y 800–1248) clear"
    ends = [f for f in smp if smp[f].get("end_card_text_bbox")]
    if ends:
        f = max(ends)
        text += f"; end-card text f{f} {smp[f]['end_card_text_bbox'].s()}" + (" OUTSIDE core" if end_bad else " in core")
    text += f" · {manual_text(man)}"
    auto_ok = not (out_zone or too_close or no_text or rail or end_bad)
    return Result(combine(auto_ok, man), text)


# ── G4 text ──


def ocr_prep(rgb: np.ndarray, scale: int) -> Image.Image:
    y = luma_of(rgb)
    y = np.clip(y / max(0.5, float(np.percentile(y, 99.8))), 0, 1)  # never stretch grain into "text"
    im = Image.fromarray((255 * (1 - y)).astype(np.uint8))  # dark text on white for tesseract
    if scale != 1:
        im = im.resize((im.width * scale, im.height * scale), Image.LANCZOS)
    return Image.fromarray(np.pad(np.asarray(im), 20, constant_values=255))


def tesseract(img: Image.Image, psm: int, tmp: Path, name: str) -> list[dict]:
    p = tmp / f"{name}.png"
    img.save(p)
    r = run(["tesseract", str(p), "stdout", "--psm", str(psm), "tsv"], timeout=180)
    rows = []
    for row in csv.DictReader(io.StringIO(r.stdout), delimiter="\t", quoting=csv.QUOTE_NONE):
        try:
            rows.append({k: (row[k] if k == "text" else float(row[k])) for k in row if k})
        except (TypeError, ValueError):
            continue
    for row in rows:
        row["text"] = (row.get("text") or "").strip()
    return rows


def glyph_metrics(rgb: np.ndarray, box: Box) -> dict | None:
    """x-height, cap/ascender height (px), text colour, background and WCAG contrast for one line."""
    pad, ring = 4, 16
    x0, y0 = max(0, box.x0 - ring), max(0, box.y0 - ring)
    x1, y1 = min(W, box.x1 + ring), min(H, box.y1 + ring)
    big = rgb[y0:y1, x0:x1]
    yb = luma_of(big)
    ix0, iy0 = box.x0 - pad - x0, box.y0 - pad - y0
    inner = (slice(max(0, iy0), box.y1 + pad - y0), slice(max(0, ix0), box.x1 + pad - x0))
    t = otsu(yb[inner])
    lighter = float(np.median(yb[inner])) < t
    mask = (yb > t) if lighter else (yb < t)
    glyph = np.zeros_like(mask)
    glyph[inner] = mask[inner]
    if glyph.sum() < 20:
        return None
    lab, _ = ndimage.label(glyph, structure=np.ones((3, 3)))
    comps = []
    for sl in ndimage.find_objects(lab):
        if sl is None:
            continue
        h, area = sl[0].stop - sl[0].start, int((lab[sl] > 0).sum())
        if area >= 8:
            comps.append((h, sl[0].stop))
    if not comps:
        return None
    hs = np.array([c[0] for c in comps], dtype=float)
    bottoms = np.array([c[1] for c in comps], dtype=float)
    keep = hs >= 0.25 * hs.max()
    baseline = float(np.median(bottoms[keep]))
    on_base = keep & (np.abs(bottoms - baseline) <= max(2.0, 0.05 * hs.max()))
    hb = hs[on_base] if on_base.any() else hs[keep]
    xh = float(np.median(hb[hb <= 1.08 * hb.min()]))  # the shortest letters on the baseline: a c e m n o r s …
    cap = float(hb.max()) if hb.max() >= 1.15 * xh else None  # capitals or ascenders, if the line has any
    est = max((cap or 0) / 0.75, xh / 0.53)  # conservative type size from typical cap 0.65–0.75 em, x 0.45–0.53 em
    interior = ndimage.binary_erosion(glyph, iterations=1)
    if interior.sum() < 10:
        interior = glyph
    text_rgb = np.median(big[interior], axis=0)
    # background: everything not within 3 px of a glyph (or of other text-bright pixels near the line)
    bright_all = (yb > t) if lighter else (yb < t)
    bgmask = ~ndimage.binary_dilation(glyph | bright_all, iterations=3)
    if bgmask.sum() < 50:
        bgmask = ~ndimage.binary_dilation(glyph, iterations=3)
    bg = big[bgmask]
    bg_med = np.median(bg, axis=0)
    lum = rel_lum(bg)
    bg_p95 = bg[np.argsort(lum)[int(0.95 * (len(lum) - 1))]] if lighter else bg[np.argsort(lum)[int(0.05 * (len(lum) - 1))]]
    return {"x_height": xh, "cap_or_ascender": cap, "est_font_px": est,
            "text_rgb": "#%02X%02X%02X" % tuple(int(v) for v in text_rgb),
            "bg_median": "#%02X%02X%02X" % tuple(int(v) for v in bg_med),
            "bg_p95": "#%02X%02X%02X" % tuple(int(v) for v in bg_p95),
            "contrast_median": wcag(text_rgb, bg_med), "contrast_p95": wcag(text_rgb, bg_p95)}


def ocr_region(ctx: Ctx, rgb: np.ndarray, box: Box, name: str, psm: int = 6) -> dict:
    crop = rgb[box.y0:box.y1, box.x0:box.x1]
    rows = tesseract(ocr_prep(crop, 2), psm, ctx.tmp, f"{name}-psm{psm}")

    def to_frame(r: dict) -> Box:  # tesseract box (2× scale, 20 px border) → frame pixels
        return Box(int(box.x0 + (r["left"] - 20) / 2), int(box.y0 + (r["top"] - 20) / 2),
                   int(math.ceil(box.x0 + (r["left"] + r["width"] - 20) / 2)),
                   int(math.ceil(box.y0 + (r["top"] + r["height"] - 20) / 2)))

    lines: dict[tuple, dict] = {}
    for r in rows:
        key = (int(r.get("block_num", 0)), int(r.get("par_num", 0)), int(r.get("line_num", 0)))
        if int(r.get("level", 0)) == 4:
            lines.setdefault(key, {"words": []})["box"] = to_frame(r)
        elif int(r.get("level", 0)) == 5 and r["text"]:
            lines.setdefault(key, {"words": []})["words"].append(
                {"text": r["text"], "conf": r.get("conf", -1), "height_px": r.get("height", 0) / 2, "box": to_frame(r)})
    out_lines = []
    for key in sorted(lines):
        ln = lines[key]
        if not ln["words"] or "box" not in ln:
            continue
        # measure glyphs on the real words only (a stray mark read as "~" must not widen the line)
        real = [w["box"] for w in ln["words"] if re.search(r"[A-Za-z0-9]", w["text"]) and w["conf"] >= 30]
        mbox = (Box(min(b.x0 for b in real), min(b.y0 for b in real), max(b.x1 for b in real), max(b.y1 for b in real))
                if real else ln["box"])
        gm = glyph_metrics(rgb, mbox)
        out_lines.append({"text": " ".join(w["text"] for w in ln["words"]), "box": ln["box"], "words": ln["words"],
                          "metrics": gm})
    return {"text": " ".join(l["text"] for l in out_lines), "lines": out_lines, "psm": psm}


def ocr_targets(ctx: Ctx) -> list[tuple[int, list[str], Box, str]]:
    """(frame, expected lines, region, label): one frame per shot once its words have faded in, and the end card."""
    shots, end = ctx.shots() or [], (ctx.config or {}).get("END_CARD") or {}
    targets = []
    for s in shots:
        if s.get("words"):
            targets.append((min(s["wordsIn"] + 12, s["to"] - 2), list(s["words"]), WORDS_OCR_BOX, f"shot {s['id']}"))
    if end:
        last = next((s for s in shots if s["id"] == 7), None)
        f = min((ctx.events().get("slitClose") or {}).get("from", 588) - 4, (last or {}).get("to", 599) - 2)
        f = max(f, max(end.get("nameIn", 0), end.get("urlIn", 0)) + 10)
        targets.append((f, [end["name"], end["url"]], END_CARD_BAND, "end card"))
    return targets


def g4_text(ctx: Ctx, fr: Frames) -> Result:
    if not have("tesseract"):
        return Result(MISSING, "tesseract not installed")
    if not ctx.config:
        return Result(MISSING, "build/config.json missing (run `npx tsx scripts/export-config.ts`)")
    shots, end = ctx.shots() or [], ctx.config.get("END_CARD") or {}
    targets = ocr_targets(ctx)
    # the expected words, run together: OCR may split a word ("learn" "s") or join two, so a token is
    # expected text when it occurs anywhere in that run
    blob = "".join(norm_text(" ".join(lines)).replace(" ", "") for _, lines, _, _ in targets)
    words = {w for _, lines, _, _ in targets for w in norm_text(" ".join(lines)).split()}

    def expected(token: str) -> bool:
        parts = norm_text(token).split()
        return bool(parts) and all(part in blob for part in parts)

    def expected_word(token: str) -> bool:  # whole words only: "A1" may be "AI", but "10" is never part of "diablo"
        parts = norm_text(token).split()
        return bool(parts) and all(part in words for part in parts)
    per, problems = [], []
    max_words_cfg = max([word_count(" ".join(s.get("words", []))) for s in shots]
                        + [word_count(f"{end.get('name', '')} {end.get('url', '')}")])
    max_words_ocr, sizes, contrasts = 0, [], []
    for f, lines, box, label in targets:
        rgb = fr.get(f)
        if rgb is None:
            problems.append(f"{label}: frame {f} missing")
            continue
        exp = " ".join(lines)
        o = ocr_region(ctx, rgb, box, f"words-{f}", 6)
        if norm_text(o["text"]) != norm_text(exp):  # lines of different sizes read better as a column
            o4 = ocr_region(ctx, rgb, box, f"words-{f}", 4)
            if norm_text(o4["text"]) == norm_text(exp) or len(o4["text"]) > len(o["text"]):
                o = o4
        ok = norm_text(o["text"]) == norm_text(exp)
        sim = difflib.SequenceMatcher(None, norm_text(o["text"], False), norm_text(exp, False)).ratio()
        n_words = sum(1 for l in o["lines"] for w in l["words"] if w["conf"] >= 50 and re.search(r"[A-Za-z0-9]", w["text"]))
        max_words_ocr = max(max_words_ocr, n_words)
        digits = [w["text"] for l in o["lines"] for w in l["words"] if re.search(r"[0-9%]", w["text"])
                  and not expected_word(w["text"])]
        for l in o["lines"]:
            gm = l["metrics"]
            if gm:
                sizes.append((gm["est_font_px"], gm["x_height"], gm["cap_or_ascender"], l["text"]))
                contrasts.append((gm["contrast_p95"], l["text"]))
        per.append({"frame": f, "label": label, "expected": exp, "ocr": o["text"], "psm": o["psm"], "match": ok,
                    "similarity": sim, "ocr_words": n_words, "digits": digits, "lines": o["lines"]})
        if not ok:
            problems.append(f"{label} f{f}: read “{o['text']}” ≠ “{exp}”")
        if digits:
            problems.append(f"{label} f{f}: digits/percent {digits}")
    # digits, percent signs and stray text anywhere in any still
    stray, ignored = [], []
    for f in sorted(set(STILL_FRAMES) | {t[0] for t in targets}):
        rgb = fr.get(f)
        if rgb is None:
            continue
        for r in tesseract(ocr_prep(rgb, 1), 11, ctx.tmp, f"full-{f}"):
            tok, conf, hgt = r["text"], float(r.get("conf", -1)), float(r.get("height", 0))
            if int(r.get("level", 0)) != 5 or not tok:
                continue
            text_sized = OCR_TOKEN_PX[0] <= hgt <= OCR_TOKEN_PX[1]
            tokinfo = {"frame": f, "text": tok, "conf": conf, "height_px": hgt,
                       "at": [int(r.get("left", 0)) - 20, int(r.get("top", 0)) - 20]}
            if re.search(r"[0-9%]", tok) and not expected_word(tok):
                good = conf >= OCR_DIGIT_CONF and text_sized
                (stray if good else ignored).append({**tokinfo, "kind": "digit"})
            elif conf >= OCR_STRAY_CONF and text_sized and len(re.sub(r"[^A-Za-z]", "", tok)) >= 2 and not expected(tok):
                stray.append({**tokinfo, "kind": "text"})
    for s in stray:
        problems.append(f"f{s['frame']}: stray {s['kind']} “{s['text']}” (conf {s['conf']:.0f})")
    min_size = min(sizes, key=lambda s: s[0]) if sizes else None
    min_con = min(contrasts, key=lambda c: c[0]) if contrasts else None
    if max(max_words_cfg, max_words_ocr) > 4:
        problems.append(f"{max(max_words_cfg, max_words_ocr)} words on screen")
    if min_size and min_size[0] < MIN_GLYPH_PX:
        problems.append(f"“{min_size[3]}” glyphs ≈ {min_size[0]:.0f} px")
    if min_con and min_con[0] < MIN_CONTRAST:
        problems.append(f"“{min_con[1]}” contrast {min_con[0]:.1f}:1")
    if not sizes:
        problems.append("no glyphs measured")
    ctx.m["G4"] = {"frames": per, "stray_tokens": stray, "ignored_low_conf_digits": ignored,
                   "max_words_config": max_words_cfg, "max_words_ocr": max_words_ocr,
                   "glyphs": [{"line": s[3], "est_font_px": s[0], "x_height": s[1], "cap_or_ascender": s[2]}
                              for s in sizes],
                   "contrast_p95": [{"line": c[1], "contrast": c[0]} for c in contrasts], "problems": problems}
    matched = sum(1 for p in per if p["match"])
    read = ", ".join("f%d “%s”" % (p["frame"], p["ocr"]) for p in per)
    text = (f"OCR (tesseract psm 6, psm 4 fallback, 2×) matched {matched}/{len(targets)} lines to config ({read}); "
            f"full-still OCR (psm 11): digits/% {len([s for s in stray if s['kind'] == 'digit'])} (conf ≥ {OCR_DIGIT_CONF}, "
            f"text-sized; {len(ignored)} low-conf/shape tokens ignored), stray text "
            f"{len([s for s in stray if s['kind'] == 'text'])}; "
            f"max words on screen {max(max_words_cfg, max_words_ocr)} (config {max_words_cfg}, OCR {max_words_ocr}); "
            + (f"smallest glyphs “{min_size[3]}” x-height {fnum(min_size[1], 0)} px, cap/ascender {fnum(min_size[2], 0)} px "
               f"→ ≈{min_size[0]:.0f} px type (≥ {MIN_GLYPH_PX}); " if min_size else "")
            + (f"lowest contrast {min_con[0]:.1f}:1 “{min_con[1]}” (vs p95 background, ≥ {MIN_CONTRAST:g})"
               if min_con else ""))
    if problems:
        text += f" · problems: {'; '.join(problems[:6])}" + (" …" if len(problems) > 6 else "")
    return Result(PASS if not problems else FAIL, text)


def g_manual(ctx: Ctx, key: str, what: str) -> Result:
    man = ctx.manual_verdict(key)
    ctx.m[key] = {"manual": man}
    if man[0] is None:
        return Result(PENDING, f"{what}: no {key} verdict in out/qa/manual.json")
    return Result(man[0], f"{what}: {man[0]}" + (f" ({man[1]})" if man[1] else ""))


def palette_share(rgb: np.ndarray) -> tuple[float, list]:
    q = (rgb[::2, ::2].astype(np.int32) >> 2 << 2) + 2  # quantise to 64 levels per channel
    packed = (q[..., 0] << 16) | (q[..., 1] << 8) | q[..., 2]
    u, cnt = np.unique(packed.ravel(), return_counts=True)
    cols = np.stack([(u >> 16) & 255, (u >> 8) & 255, u & 255], -1)
    d, _ = PALETTE_TREE.query(rgb_to_lab(cols))
    share = float(cnt[d <= PALETTE_DE].sum() / cnt.sum())
    off = np.argsort(-(cnt * (d > PALETTE_DE)))[:5]
    worst = [("#%02X%02X%02X" % tuple(cols[k]), round(100 * cnt[k] / cnt.sum(), 3), round(float(d[k]), 1))
             for k in off if d[k] > PALETTE_DE and cnt[k] > 0]
    return share, worst


def g7_style(ctx: Ctx, fr: Frames) -> Result:
    per = {}
    for f in STILL_FRAMES:
        rgb = fr.get(f)
        if rgb is not None:
            share, worst = palette_share(rgb)
            per[f] = {"share": share, "top_off_palette": worst}
    if not per:
        return Result(MISSING, "no frames")
    man = ctx.manual_verdict("G7")
    ctx.m["G7"] = {"per_still": per, "manual": man, "threshold_dE76": PALETTE_DE}
    low = [f for f in per if per[f]["share"] < PALETTE_MIN_SHARE]
    text = (f"palette share (pixels within ΔE76 {PALETTE_DE:g} of a palette colour or a blend of two) "
            + ", ".join(f"{f / FPS:.1f}s {100 * per[f]['share']:.1f}%" for f in per)
            + f"; min {100 * min(p['share'] for p in per.values()):.1f}% (≥ {100 * PALETTE_MIN_SHARE:g}%)")
    if low:
        text += " · off-palette: " + "; ".join(f"f{f} {per[f]['top_off_palette'][:3]}" for f in low)
    text += f" · {manual_text(man)}"
    return Result(combine(not low, man), text)


def phase_shift(a: np.ndarray, b: np.ndarray) -> tuple[float, float, float]:
    """(dx, dy, peak): the translation that moves `a` onto `b`, sub-pixel, by phase correlation."""
    win = np.outer(np.hanning(a.shape[0]), np.hanning(a.shape[1]))
    fa = np.fft.fft2((a - a.mean()) * win)
    fb = np.fft.fft2((b - b.mean()) * win)
    r = fb * np.conj(fa)
    r /= np.abs(r) + 1e-12
    c = np.fft.ifft2(r).real
    py, px = np.unravel_index(np.argmax(c), c.shape)

    def sub(axis_vals: np.ndarray, p: int) -> float:
        n = len(axis_vals)
        l, m, rr = axis_vals[(p - 1) % n], axis_vals[p], axis_vals[(p + 1) % n]
        den = l - 2 * m + rr
        d = 0.5 * (l - rr) / den if abs(den) > 1e-12 else 0.0
        v = p + d
        return v - n if v > n / 2 else v

    return sub(c[py, :], px), sub(c[:, px], py), float(c[py, px])


def g8_motion(ctx: Ctx, fr: Frames) -> Result:
    if fr.kind is None or fr.have.sum() < NF:
        return Result(MISSING, f"needs all {NF} frames ({fr.desc})")
    ev = ctx.events()
    m: dict = {}
    parts, ok = [], True
    flash_cfg = ev.get("flash") or {"from": 138, "to": 139}
    flash_exp = list(range(flash_cfg["from"], flash_cfg["to"] + 1))

    # flash frames: luma far above the neighbours' median (±8 frames, the candidate's own ±2 excluded)
    L = fr.luma
    flagged = []
    for i in range(NF):
        nb = [L[j] for j in range(max(0, i - 8), min(NF, i + 9)) if abs(j - i) > 2]
        base = float(np.median(nb))
        if L[i] - base > FLASH_JUMP and L[i] > 1.5 * base + 0.02:
            flagged.append(i)
    m["flash_frames"] = flagged
    m["luma_around_flash"] = {i: float(L[i]) for i in range(134, 144)}
    flash_ok = flagged == flash_exp
    ok &= flash_ok
    parts.append(f"flash frames {flagged or 'none'} (want {flash_exp[0]}–{flash_exp[-1]}) "
                 f"{'ok' if flash_ok else 'FAIL'}")

    # shake: phase correlation on a 2× downscaled grey band (y 560–1400) between consecutive frames
    shifts = {}
    for f in range(134, 156):
        if f in fr.shake and f + 1 in fr.shake and f not in flash_exp and f + 1 not in flash_exp:
            dx, dy, pk = phase_shift(fr.shake[f], fr.shake[f + 1])
            shifts[f] = {"dx": 2 * dx, "dy": 2 * dy, "mag": 2 * math.hypot(dx, dy), "peak": pk}
    shake_to = (ev.get("shake") or {}).get("to", 148)
    late = {f: s["mag"] for f, s in shifts.items() if 148 <= f <= 152}
    early = {f: s["mag"] for f, s in shifts.items() if f < 148}
    m["shake_shifts_f_to_f1"] = shifts
    shake_ok = bool(late) and max(late.values()) < 1.0 and shake_to <= 148
    ok &= shake_ok
    parts.append(f"shake (px moved f→f+1) peak {fnum(max(early.values()) if early else None)} before 148, "
                 f"{', '.join(f'{f}:{v:.2f}' for f, v in late.items())} from 148 (< 1) {'ok' if shake_ok else 'FAIL'}")

    # slow motion: mean absolute frame difference in the Diablo/bots region, noise floor removed
    sm = fr.small
    diff = np.abs(np.diff(sm, axis=0))  # diff[i-1] = |f(i) - f(i-1)|
    reg = diff[:, 540 // 8:1260 // 8, 120 // 8:960 // 8].mean(axis=(1, 2))
    floor = diff[:, 0:240 // 8, :].mean(axis=(1, 2))  # top of frame: grain and vignette only
    motion = np.maximum(0.0, reg - floor)
    slow_cfg = ev.get("slowMo") or {}
    s0, s1 = slow_cfg.get("from", 141), slow_cfg.get("to", 186)
    m0 = max(s0, shake_to)  # the shake overlaps the start of the slow motion; leave it out
    slow = float(motion[m0:s1].mean())  # pairs (m0→m0+1) … (s1-1→s1)
    after = float(motion[s1 + 1:221].mean())
    ratio = slow / after if after > 1e-6 else float("inf")
    cfg_ok = (s0, s1) == (141, 186) and abs(slow_cfg.get("rate", 0.25) - 0.25) < 1e-9
    slow_ok = cfg_ok and ratio <= SLOWMO_MAX_RATIO
    ok &= slow_ok
    m["slow_motion"] = {"config": slow_cfg, "measured_window": [m0, s1], "after_window": [s1 + 1, 221],
                        "mean_motion_slow": slow, "mean_motion_after": after, "ratio": ratio,
                        "motion_per_frame": {i: float(motion[i]) for i in range(132, 222)}}
    parts.append(f"slow-mo config {s0}–{s1} @ {slow_cfg.get('rate')} {'ok' if cfg_ok else 'FAIL'}, motion "
                 f"{m0}–{s1} vs {s1 + 1}–221 ratio {fnum(ratio, 2)} (≤ {SLOWMO_MAX_RATIO}) "
                 f"{'ok' if slow_ok else 'FAIL'}")

    # hard cuts: spikes in whole-frame difference (flash frames excluded)
    whole = np.maximum(0.0, diff.mean(axis=(1, 2)) - floor)
    D = np.concatenate([[0.0], whole])  # D[i] = change into frame i
    excl = set(flash_exp) | {flash_exp[-1] + 1}
    score = np.zeros(NF)
    for i in range(1, NF):
        nb = [D[j] for j in range(max(1, i - 6), min(NF, i + 7)) if abs(j - i) > 1 and j not in excl]
        score[i] = D[i] / (float(np.median(nb)) + 1e-4) if nb else 0
    peaks = [i for i in range(1, NF) if i not in excl and D[i] >= 0.006 and score[i] == score[max(1, i - 2):i + 3].max()]
    spikes = [i for i in peaks if score[i] >= CUT_FIND_SCORE]
    cuts_cfg = (ctx.config or {}).get("CUTS") or []
    wipe = ev.get("wipe") or {}
    cut_info, detected = [], []
    for c in cuts_cfg:  # a planned cut needs a smaller spike (shot 3 is the same angle, pushed in)
        hit = [s for s in peaks if abs(s - c) <= 1 and score[s] >= CUT_CONFIRM_SCORE]
        how = "spike" if hit else None
        if not hit and wipe and c == wipe.get("from"):
            base = float(np.median(D[max(1, c - 12):c - 1]))
            if D[c:wipe.get("to", c + 8) + 1].max() >= 3 * base + 0.004:
                hit, how = [c], "wipe"
        cut_info.append({"planned": c, "detected": hit[0] if hit else None, "how": how,
                         "spike_score": float(score[c]) if c < NF else None})
        if hit:
            detected.append(hit[0])
    extra = [s for s in spikes if all(abs(s - c) > 1 for c in cuts_cfg)]
    m["cut_spikes"] = spikes
    m["cuts"] = cut_info
    m["luma_per_frame"] = [round(float(v), 5) for v in L]
    m["frame_change_per_frame"] = [round(float(v), 5) for v in D]
    m["cut_spike_score_per_frame"] = [round(float(v), 2) for v in score]
    cuts_ok = bool(cuts_cfg) and all(ci["detected"] is not None for ci in cut_info)

    # cut ↔ score onsets
    src = None
    for p in (ctx.audio / "score.wav", ctx.audio / "mix-main.wav", ctx.main):
        x = decode_audio(p)
        if x is not None:
            src = p
            break
    beats = []
    for v in ((ctx.config or {}).get("BEATS") or {}).values():
        if isinstance(v, (int, float)):
            beats.append(v)
        elif isinstance(v, list):
            beats.extend(v)
        elif isinstance(v, dict) and "from" in v:
            beats.append(v["from"])
    if src is None:
        onset_ok = False
        parts.append("cuts: no score audio for onsets MISSING")
    else:
        on = spectral_flux_onsets(x)
        events = [(t * FPS, "onset") for t in on["onsets_s"]] + [(t * FPS, "stop") for t in on["stops_s"]]
        m["score_source"] = ctx.rel(src)
        m["score_onsets_frames"] = [round(t * FPS, 2) for t in on["onsets_s"]]
        m["score_stops_frames"] = [round(t * FPS, 2) for t in on["stops_s"]]
        dists = []
        for ci in cut_info:
            c = ci["detected"] if ci["detected"] is not None else ci["planned"]
            if events:
                e = min(events, key=lambda ev_: abs(ev_[0] - c))
                ci["nearest_event"] = {"frame": round(e[0], 2), "kind": e[1], "dist": round(abs(e[0] - c), 2)}
                dists.append(abs(e[0] - c))
            ci["nearest_beat_config"] = min(beats, key=lambda b: abs(b - c)) if beats else None
        for s in extra:
            if events:
                e = min(events, key=lambda ev_: abs(ev_[0] - s))
                m.setdefault("extra_spikes", []).append({"frame": s, "nearest_event": round(e[0], 2)})
        onset_ok = bool(dists) and len(dists) == len(cut_info) and max(dists) <= CUT_MAX_DIST
        parts.append(
            f"cuts detected {sum(1 for ci in cut_info if ci['detected'] is not None)}/{len(cut_info)} "
            + "[" + ", ".join(f"{ci['planned']}"
                              + (f"→{ci['detected']}" if ci["detected"] not in (None, ci["planned"]) else "")
                              + (" missed" if ci["detected"] is None else "")
                              + (f" {ci['nearest_event']['kind']} Δ{ci['nearest_event']['dist']:.1f}f"
                                 if "nearest_event" in ci else "")
                              + (f" beat Δ{abs(ci['nearest_beat_config'] - (ci['detected'] or ci['planned']))}f"
                                 if ci.get("nearest_beat_config") is not None else "")
                              for ci in cut_info) + "]"
            + f" vs {len(on['onsets_s'])} onsets in {ctx.rel(src)} (≤ {CUT_MAX_DIST} f) "
            + ("ok" if cuts_ok and onset_ok else "FAIL")
            + (f"; other change spikes (flicker, shake, effects; info) {extra}" if extra else ""))
    ok &= cuts_ok and onset_ok
    ctx.m["G8"] = m
    return Result(PASS if ok else FAIL, "; ".join(parts))


def g9_loop(ctx: Ctx, fr: Frames) -> Result:
    want = [0, 597, 598, 599]
    vals = {f: (float(fr.luma[f]) if fr.have[f] else None) for f in want}
    lin = {f: (float(fr.lum_lin[f]) if fr.have[f] else None) for f in want}
    ctx.m["G9"] = {"luma_rec709": vals, "relative_luminance": lin}
    if any(v is None for v in vals.values()):
        return Result(MISSING, f"frames missing: {[f for f, v in vals.items() if v is None]}")
    ok = all(v < 0.02 for v in vals.values())
    return Result(PASS if ok else FAIL, "mean luma (Rec.709, 0–1) " + ", ".join(f"f{f} {v:.4f}" for f, v in vals.items())
                  + " (< 0.02)")


def parse_srt(p: Path) -> list[dict]:
    if not p.exists():
        return []
    out = []
    for block in re.split(r"\n\s*\n", p.read_text(encoding="utf-8", errors="replace").strip()):
        mm = re.search(r"(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)\s*\n(.*)", block, re.S)
        if mm:
            g = [int(x) for x in mm.groups()[:8]]
            out.append({"start": g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000,
                        "end": g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000, "text": " ".join(mm.group(9).split())})
    return out


def speech_onsets(x: np.ndarray, sr: int = 48000) -> list[float]:
    mono = x.mean(axis=1)
    step = sr // 100
    m = len(mono) // step
    lvl = 10 * np.log10(np.maximum((mono[: m * step].reshape(m, step) ** 2).mean(axis=1), 1e-14))
    thr = max(-45.0, float(lvl.max()) - 35.0)
    active = lvl > thr
    active = ndimage.binary_closing(active, structure=np.ones(35))  # bridge gaps < 0.35 s
    lab, n = ndimage.label(active)
    starts = []
    for k, sl in enumerate(ndimage.find_objects(lab), start=1):
        if sl[0].stop - sl[0].start >= 8:
            starts.append(sl[0].start / 100.0)
    return starts


def g10_sound(ctx: Ctx) -> Result:
    m: dict = {}
    parts, ok = [], True
    if not ctx.main.exists():
        return Result(MISSING, f"{ctx.rel(ctx.main)} missing")
    e = ebur128(ctx.main)
    m["main_ebur128"] = e
    if not e or e["I"] is None:
        return Result(FAIL, "ebur128 could not measure the main cut's audio")
    li_ok = abs(e["I"] - LUFS_MAIN) <= LUFS_TOL
    tp_ok = e["true_peak"] is not None and e["true_peak"] <= TRUE_PEAK_MAX
    ok &= li_ok and tp_ok
    parts.append(f"main {e['I']:.1f} LUFS ({LUFS_MAIN:g} ±{LUFS_TOL:g}) {'ok' if li_ok else 'FAIL'}, "
                 f"true peak {fnum(e['true_peak'])} dBTP (≤ {TRUE_PEAK_MAX:g}) {'ok' if tp_ok else 'FAIL'}")
    x = decode_audio(ctx.main)
    if x is not None and len(x):
        sr = 48000
        a, b = int(136 / FPS * sr), int(151 / FPS * sr)
        seg = np.abs(x[a:b])
        pk = float(seg.max()) if seg.size else 0.0
        pk_db = 20 * math.log10(max(pk, 1e-9))
        gi = int(np.argmax(np.abs(x).max(axis=1)))
        t, mom = momentary_loudness(x, sr)
        k = int(np.argmax(mom))
        loud_t = float(t[k])
        in_strike = loud_t < 151 / FPS and loud_t + 0.4 > 136 / FPS
        clip_ok = pk_db < 0.0
        ok &= clip_ok and in_strike
        m.update(strike_sample_peak_dbfs=pk_db, global_sample_peak_dbfs=20 * math.log10(max(float(np.abs(x).max()), 1e-9)),
                 global_sample_peak_t=gi / sr, loudest_momentary_lufs=float(mom[k]), loudest_momentary_window_s=[loud_t, loud_t + 0.4])
        parts.append(f"strike (f136–150) sample peak {pk_db:.1f} dBFS (< 0) {'ok' if clip_ok else 'FAIL'}, loudest 400 ms "
                     f"at {loud_t:.2f}–{loud_t + 0.4:.2f} s ({mom[k]:.1f} LUFS) {'= strike ok' if in_strike else 'not the strike FAIL'}")
    else:
        ok = False
        parts.append("could not decode the main cut's audio")
    stems = {}
    for name in ("score", "sfx", "mix-main", "voice", "mix-vo"):
        p = ctx.audio / f"{name}.wav"
        if p.exists():
            se = ebur128(p)
            stems[name] = se
    m["stems_ebur128"] = stems

    if ctx.vo.exists():
        voice = ctx.audio / "voice.wav"
        vparts = []
        ve = ebur128(voice) if voice.exists() else None
        lines = (ctx.config or {}).get("VOICE_LINES") or []
        if ve and ve["I"] is not None:
            v_ok = abs(ve["I"] - LUFS_VOICE) <= LUFS_TOL
            vparts.append(f"voice stem {ve['I']:.1f} LUFS ({LUFS_VOICE:g} ±{LUFS_TOL:g}) {'ok' if v_ok else 'FAIL'}")
        else:
            v_ok = False
            vparts.append("voice stem audio/build/voice.wav missing FAIL")
        on_ok = False
        if voice.exists() and lines:
            xv = decode_audio(voice)
            on = speech_onsets(xv) if xv is not None else []
            dd = []
            for ln in lines:
                st = ln["start"] / FPS
                near = min(on, key=lambda o: abs(o - st)) if on else None
                dd.append({"text": ln["text"], "planned_s": st, "onset_s": near,
                           "delta_s": (near - st) if near is not None else None})
            m["voice_onsets"] = {"detected_s": on, "lines": dd}
            on_ok = all(d["delta_s"] is not None and abs(d["delta_s"]) <= VOICE_ONSET_TOL for d in dd)
            worst = max((abs(d["delta_s"]) for d in dd if d["delta_s"] is not None), default=None)
            vparts.append(f"{len(on)} speech onsets for {len(lines)} lines, worst Δ {fnum(worst, 2)} s "
                          f"(≤ {VOICE_ONSET_TOL}) {'ok' if on_ok else 'FAIL'}")
        elif not lines:
            vparts.append("VOICE_LINES missing from config FAIL")
        # words: no speech recogniser here; check the script the voice was made from and the captions
        exp = [norm_text(ln["text"]) for ln in lines]
        srt = parse_srt(ctx.captions)
        srt_ok = bool(srt) and [norm_text(s["text"]) for s in srt] == exp
        _, vs = voice_status(ctx)
        vs_lines = None
        if isinstance(vs, dict) and isinstance(vs.get("lines"), list):
            vs_lines = [norm_text(l.get("text", "") if isinstance(l, dict) else str(l)) for l in vs["lines"]]
        script_ok = vs_lines == exp if vs_lines is not None else None
        man = ctx.manual_verdict("G10_voice_words")
        words_ok = srt_ok and script_ok is not False and man[0] != FAIL
        m["voice_words"] = {"captions_match": srt_ok, "voice_status_lines_match": script_ok, "manual": man}
        vparts.append(f"words: captions.srt {'match' if srt_ok else 'MISMATCH/missing'}, voice script "
                      f"{'match' if script_ok else ('n/a' if script_ok is None else 'MISMATCH')}, "
                      f"by ear {man[0] or 'PENDING'} {'ok' if words_ok else 'FAIL'}")
        ok &= v_ok and on_ok and words_ok
        parts.append("voice cut: " + ", ".join(vparts))
    else:
        why, _ = voice_status(ctx)
        parts.append(f"voice cut skipped: {why}")
    ctx.m["G10"] = m
    return Result(PASS if ok else FAIL, "; ".join(parts))


# ─────────────────────────────────── main ───────────────────────────────────

GATES = [(1, "File"), (2, "Stills"), (3, "Safe area"), (4, "Text"), (5, "Not technical"), (6, "Originality"),
         (7, "Style"), (8, "Motion"), (9, "Loop"), (10, "Sound"), (11, "Sound-off test")]


def main() -> int:
    ap = argparse.ArgumentParser(description="Diablo intro reel quality gates (brief section 8)")
    ap.add_argument("--root", type=Path, default=REEL, help="reel project directory (default: %(default)s)")
    args = ap.parse_args()
    root = args.root.resolve()
    ctx = Ctx(root)
    log(f"root {root}")
    if ctx.config is None:
        log("build/config.json missing: run `npx tsx scripts/export-config.ts` (config gates will say MISSING)")

    keep = set(STILL_FRAMES) | {t[0] for t in ocr_targets(ctx)}
    fr = Frames(ctx)
    try:
        fr.scan(keep)
    except Exception as e:  # noqa: BLE001
        log(f"frame scan failed: {e}")
        ctx.m["frames_error"] = traceback.format_exc()

    runners = {
        1: lambda: g1_file(ctx),
        2: lambda: g2_stills(ctx, fr),
        3: lambda: g3_safe(ctx, fr),
        4: lambda: g4_text(ctx, fr),
        5: lambda: g_manual(ctx, "G5", "no charts, graphs, axes, callouts, code, UI or dashboards (reviewer)"),
        6: lambda: g_manual(ctx, "G6", "fresh reviewer: does any bot resemble a real AI product's icon or logo?"),
        7: lambda: g7_style(ctx, fr),
        8: lambda: g8_motion(ctx, fr),
        9: lambda: g9_loop(ctx, fr),
        10: lambda: g10_sound(ctx),
        11: lambda: g_manual(ctx, "G11", "sound-off reviewer's one-sentence answer"),
    }
    results: dict[int, Result] = {}
    for num, name in GATES:
        log(f"G{num} {name}")
        try:
            results[num] = runners[num]()
        except Exception as e:  # noqa: BLE001
            results[num] = Result(FAIL, f"internal error: {type(e).__name__}: {e}")
            ctx.m.setdefault("errors", {})[f"G{num}"] = traceback.format_exc()
            log(traceback.format_exc())

    counts = {s: sum(1 for r in results.values() if r.status == s) for s in (PASS, FAIL, PENDING, MISSING)}
    stamp = _dt.datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = [
        "# Diablo intro reel: quality gates",
        "",
        f"Run {stamp} by `scripts/qa/run_gates.py` on `{root}`. Frames: {fr.desc}. "
        f"Summary: {counts[PASS]} PASS, {counts[FAIL]} FAIL, {counts[PENDING]} PENDING, {counts[MISSING]} MISSING. "
        "Every number is in `out/qa/measurements.json`; stills in `out/qa/stills/`.",
        "",
    ]
    for num, name in GATES:
        r = results[num]
        lines.append(f"- **G{num} {name}: {r.status}** — {r.text.replace(chr(10), ' ')}")
    lines.append("")
    (ctx.qa / "report.md").write_text("\n".join(lines), encoding="utf-8")
    ctx.m["gates"] = {f"G{n}": {"name": nm, "status": results[n].status, "text": results[n].text} for n, nm in GATES}
    (ctx.qa / "measurements.json").write_text(json.dumps(to_jsonable(ctx.m), indent=2, ensure_ascii=False),
                                              encoding="utf-8")
    shutil.rmtree(ctx.tmp, ignore_errors=True)
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
