#!/usr/bin/env python3
"""Self-test for run_gates.py on a synthetic reel.

Usage:  python3 scripts/qa/selftest.py [--keep]

Builds out/qa/_selftest/ with a fake config, 600 synthetic PNG frames (words,
cuts, the flash, a decaying shake, slow motion, black ends), a synthetic score
with onsets on the beats, both cuts encoded like scripts/render.sh, captions,
voice status and manual verdicts. Then runs the gates three ways:
  full    everything present (PNG sequence, voice cut, manual verdicts)
  mp4     no PNG sequence (frames decoded from the main cut), voice cut skipped, no manual.json
  empty   an empty root (nothing may crash)
checks the reports, and deletes out/qa/_selftest unless --keep.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.io import wavfile

REEL = Path(__file__).resolve().parents[2]
ROOT = REEL / "out/qa/_selftest"
W, H, FPS, NF, SR = 1080, 1920, 30, 600, 48000

NIGHT, MAROON, CREAM, GOLD = (18, 3, 9), (86, 2, 26), (253, 249, 240), (233, 180, 76)
PORCELAIN, SHADE, POOL = (239, 234, 228), (185, 193, 203), (43, 11, 22)

SHOTS = [
    {"id": 1, "name": "Looks fine", "from": 0, "to": 71, "words": ["Your AI", "looks fine."], "wordsIn": 9},
    {"id": 2, "name": "Pull up", "from": 72, "to": 131, "words": [], "wordsIn": 72},
    {"id": 3, "name": "Strike", "from": 132, "to": 221, "words": ["Diablo finds", "the cracks."], "wordsIn": 150},
    {"id": 4, "name": "Fix", "from": 222, "to": 329, "words": ["Then", "fixes them."], "wordsIn": 228},
    {"id": 5, "name": "Learns", "from": 330, "to": 449, "words": ["And learns", "every time."], "wordsIn": 336},
    {"id": 6, "name": "Evolves", "from": 450, "to": 539, "words": ["AI that", "evolves AI."], "wordsIn": 456},
    {"id": 7, "name": "End card", "from": 540, "to": 599, "words": [], "wordsIn": 549},
]
END_CARD = {"name": "Diablo", "nameIn": 549, "url": "diablo.si", "urlIn": 558}
EVENTS = {"flash": {"from": 138, "to": 139}, "shake": {"from": 138, "to": 148, "px": 12},
          "slowMo": {"from": 141, "to": 186, "rate": 0.25}, "wipe": {"from": 540, "to": 548},
          "slitOpen": {"from": 0, "to": 8}, "slitClose": {"from": 588, "to": 597}}
BEATS = {"heartbeat": [42, 62, 72, 86, 98, 108, 116, 123, 129], "silence": {"from": 132, "to": 138}, "strike": 138,
         "slowPulse": [154, 174], "tensePulse": [202, 222, 242, 262, 282], "swell": 294,
         "calmPulse": [310, 330, 350, 370, 390, 410, 430, 450, 470, 490, 510, 530], "endHit": 540}
CUTS = [s["from"] for s in SHOTS[1:]]
VOICE_LINES = [{"text": " ".join(s["words"]), "start": s["wordsIn"] + 3, "end": s["to"]} for s in SHOTS if s["words"]]
VOICE_LINES.append({"text": "Diablo.", "start": 549, "end": 587})
SCALE = {1: 1.0, 2: 0.9, 3: 1.0, 4: 0.95, 5: 1.0, 6: 0.9, 7: 0.9}  # each cut changes the framing
RAISE = {1: 0, 2: 40, 3: -20, 4: 30, 5: -30, 6: 20, 7: 20}


def font(name: str, size: int):
    try:
        return ImageFont.truetype(name, size)
    except OSError:
        return ImageFont.load_default(size=size)


SERIF, SERIF_END, MONO = font("DejaVuSerif-Bold.ttf", 80), font("DejaVuSerif-Bold.ttf", 110), font("DejaVuSansMono.ttf", 40)


def mixc(a, b, t):
    return tuple(int(round(x + (y - x) * t)) for x, y in zip(a, b))


def shot_of(f):
    return next(s for s in SHOTS if s["from"] <= f <= s["to"])


def eye_x(f: int) -> float:
    """A moving gold dot: 6 px/frame, a quarter of that in the slow motion."""
    x = 0.0
    for k in range(f):
        x += 1.5 if 141 <= k < 186 else 6.0
    return 200 + (x % 600)


def frame_image(f: int) -> Image.Image:
    s = shot_of(f)
    im = Image.new("RGB", (W, H), NIGHT)
    d = ImageDraw.Draw(im)
    flash = EVENTS["flash"]["from"] <= f <= EVENTS["flash"]["to"]
    if flash:
        d.rectangle([0, 0, W, H], fill=CREAM)
    if s["id"] < 7 or f < 544:
        k = SCALE[s["id"]] * (1 + 0.05 * (f - s["from"]) / (s["to"] - s["from"] + 1))
        dx = 0.0
        if 138 <= f < 148:
            dx = 12 * (1 - (f - 138) / 10) * (-1) ** f
        oy = RAISE[s["id"]]
        tr = lambda x, y: (540 + (x - 540) * k + dx, 760 + (y - 760) * k + oy)  # noqa: E731
        if not flash:
            x0, y0 = tr(0, 980)
            x1, y1 = tr(1080, 1280)
            d.ellipse([x0, y0, x1, y1], fill=POOL)
            d.line([tr(60, 1180), tr(1020, 1180)], fill=mixc(NIGHT, CREAM, 0.25), width=2)
        hx0, hy0 = tr(300, 600)
        hx1, hy1 = tr(780, 960)
        d.ellipse([hx0, hy0, hx1, hy1], fill=NIGHT if flash else MAROON)
        ex = eye_x(f)
        e0, e1 = tr(ex, 740), tr(ex + 90, 820)
        d.rectangle([e0, e1], fill=NIGHT if flash else GOLD)
        for cx, top in ((270, 990), (540, 980), (800, 970)):
            a, b = tr(cx - 100, top), tr(cx + 100, top + 190)
            d.ellipse([a, b], fill=NIGHT if flash else PORCELAIN, outline=NIGHT if flash else SHADE, width=2)
        if s["words"] and f >= s["wordsIn"] and not flash:
            t = min(1.0, (f - s["wordsIn"]) / 8)
            col = mixc(NIGHT, CREAM, t)
            for i, line in enumerate(s["words"]):
                d.text((540, 380 + 96 * i + (1 - t) * 12), line, font=SERIF, fill=col, anchor="ms")
    if s["id"] == 7 and f >= 541:
        wipe = min(1.0, (f - 540) / 8)
        d.rectangle([0, 0, int(W * wipe), H], fill=NIGHT)
        if wipe >= 1:
            d.ellipse([400, 520, 680, 880], fill=MAROON)
            d.rectangle([505, 670, 525, 720], fill=GOLD)
            d.rectangle([560, 680, 580, 730], fill=GOLD)
        for text, inf, base, fnt, col in ((END_CARD["name"], 549, 1040, SERIF_END, CREAM),
                                          (END_CARD["url"], 558, 1110, MONO, GOLD)):
            if f >= inf:
                t = min(1.0, (f - inf) / 8)
                d.text((540, base + (1 - t) * 12), text, font=fnt, fill=mixc(NIGHT, col, t), anchor="ms")
    a = np.asarray(im).astype(np.int16)
    a += np.random.default_rng(f).integers(-3, 4, size=(H, W, 1), dtype=np.int16)  # grain
    a = np.clip(a, 0, 255).astype(np.uint8)
    # the slit: black outside a band that opens over frames 0–8 and closes over 588–597
    if f <= 8:
        open_ = f / 8
    elif f >= 588:
        open_ = max(0.0, 1 - (f - 588) / 9)
    else:
        open_ = 1.0
    if open_ < 1:
        half = int(open_ * 560)
        a[:, : max(0, 540 - half)] = 0
        a[:, min(W, 540 + half):] = 0
    return Image.fromarray(a)


def thump(t, f0=60.0, decay=0.15, amp=0.3):
    return amp * np.sin(2 * np.pi * f0 * t) * np.exp(-t / decay) * np.minimum(1, t / 0.004)


def make_audio(root: Path) -> None:
    n = NF * SR // FPS
    t = np.arange(n) / SR
    score = 0.05 * np.sin(2 * np.pi * 110 * t) + 0.03 * np.sin(2 * np.pi * 55 * t)  # the drone
    beats = [v for v in BEATS.values() if isinstance(v, int)] + [b for v in BEATS.values() if isinstance(v, list) for b in v]
    for b in sorted(set(beats)):
        if b == 138:
            continue
        i0 = int(b / FPS * SR)
        m = min(SR, n - i0)
        score[i0: i0 + m] += thump(np.arange(m) / SR, amp=0.15)
    score[int(132 / FPS * SR): int(138 / FPS * SR)] = 0.0
    sfx = np.zeros(n)
    i0 = int(138 / FPS * SR)
    m = int(0.4 * SR)
    rng = np.random.default_rng(1)
    sfx[i0: i0 + m] += np.clip(rng.normal(0, 0.3, m), -0.6, 0.6) * np.exp(-np.arange(m) / (0.2 * SR))  # dense burst
    sfx[i0: i0 + SR] += thump(np.arange(SR) / SR, f0=50, decay=0.25, amp=0.3)
    voice = np.zeros(n)
    for ln in VOICE_LINES:
        j0 = int(ln["start"] / FPS * SR)
        dur = int(0.9 * SR)
        tt = np.arange(dur) / SR
        env = (0.5 + 0.5 * np.sin(2 * np.pi * 4 * tt - np.pi / 2)) * np.minimum(1, tt / 0.01)
        voice[j0: j0 + dur] += 0.2 * env * (np.sin(2 * np.pi * 150 * tt) + 0.5 * np.sin(2 * np.pi * 300 * tt))
    import pyloudnorm as pyln

    meter = pyln.Meter(SR)
    lufs = lambda x: meter.integrated_loudness(np.stack([x, x], 1))  # noqa: E731
    g_sfx = 1.0
    for _ in range(6):  # main mix at -18 LUFS with the strike peaking near -4 dBFS
        mix = score + g_sfx * sfx
        mix = mix * 10 ** ((-18 - lufs(mix)) / 20)
        peak = float(np.abs(mix).max())
        if peak <= 0.63:
            break
        g_sfx *= 0.63 / peak
    voice *= 10 ** ((-16 - lufs(voice)) / 20)
    d = root / "audio/build"
    d.mkdir(parents=True, exist_ok=True)
    for name, x in (("score", score), ("sfx", sfx), ("mix-main", mix), ("voice", voice), ("mix-vo", mix * 0.6 + voice)):
        wavfile.write(d / f"{name}.wav", SR, np.stack([x, x], 1).astype(np.float32))


def encode(root: Path, audio: str, out: str) -> None:
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-framerate", "30", "-i",
                    str(root / "out/frames/frame-%03d.png"), "-i", str(root / audio), "-map", "0:v:0", "-map", "1:a:0",
                    "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "18",
                    "-maxrate", "14M", "-bufsize", "28M", "-r", "30", "-frames:v", "600", "-c:a", "aac", "-ar", "48000",
                    "-b:a", "192k", "-t", "20", "-movflags", "+faststart", str(root / out)], check=True)


def srt_time(frames: int) -> str:
    ms = round(frames / FPS * 1000)
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def build(root: Path) -> None:
    if root.exists():
        shutil.rmtree(root)
    (root / "build").mkdir(parents=True)
    (root / "build/config.json").write_text(json.dumps(
        {"FPS": FPS, "WIDTH": W, "HEIGHT": H, "DURATION": NF, "SHOTS": SHOTS, "END_CARD": END_CARD, "EVENTS": EVENTS,
         "BEATS": BEATS, "CUTS": CUTS, "VOICE_LINES": VOICE_LINES}, indent=2))
    fdir = root / "out/frames"
    fdir.mkdir(parents=True)
    print("[selftest] drawing 600 frames …", flush=True)
    for f in range(NF):
        frame_image(f).save(fdir / f"frame-{f:03d}.png", compress_level=1)
    print("[selftest] audio + encodes …", flush=True)
    make_audio(root)
    encode(root, "audio/build/mix-main.wav", "out/diablo-intro-20s.mp4")
    encode(root, "audio/build/mix-vo.wav", "out/diablo-intro-20s-vo.mp4")
    (root / "out/captions.srt").write_text("\n".join(
        f"{i + 1}\n{srt_time(ln['start'])} --> {srt_time(ln['end'])}\n{ln['text']}\n" for i, ln in enumerate(VOICE_LINES)))
    (root / "audio/build/voice-status.json").write_text(json.dumps(
        {"status": "ok", "engine": "selftest", "lines": [{"text": ln["text"], "start": ln["start"]} for ln in VOICE_LINES]}))
    (root / "out/qa").mkdir(parents=True, exist_ok=True)
    (root / "out/qa/manual.json").write_text(json.dumps({k: {"verdict": "PASS", "note": "selftest"} for k in
                                                         ("G2", "G3", "G5", "G6", "G7", "G11", "G10_voice_words")}))


def gates(root: Path) -> dict[str, str]:
    r = subprocess.run([sys.executable, str(REEL / "scripts/qa/run_gates.py"), "--root", str(root)],
                       capture_output=True, text=True)
    if r.returncode:
        print(r.stderr[-3000:])
        raise SystemExit(f"run_gates.py crashed on {root}")
    report = (root / "out/qa/report.md").read_text()
    found = dict(re.findall(r"^- \*\*(G\d+) [^:]+: (\w+)\*\*", report, re.M))
    print(f"\n[selftest] ── {root.name} ──\n{report}")
    assert len(found) == 11, f"expected 11 gate lines, got {len(found)}"
    json.loads((root / "out/qa/measurements.json").read_text())
    return found


def expect(found: dict[str, str], want: dict[str, str], label: str) -> list[str]:
    return [f"{label}: {g} is {found.get(g)}, expected {s}" for g, s in want.items() if found.get(g) != s]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", action="store_true", help="keep out/qa/_selftest")
    args = ap.parse_args()
    errors: list[str] = []
    try:
        build(ROOT)
        full = gates(ROOT)
        errors += expect(full, {f"G{i}": "PASS" for i in range(1, 12)}, "full")
        # no PNG sequence, voice cut skipped, no manual verdicts
        shutil.rmtree(ROOT / "out/frames")
        (ROOT / "out/diablo-intro-20s-vo.mp4").unlink()
        (ROOT / "out/qa/manual.json").unlink()
        (ROOT / "audio/build/voice-status.json").write_text(json.dumps({"status": "skipped", "reason": "no TTS engine (selftest)"}))
        mp4 = gates(ROOT)
        errors += expect(mp4, {"G1": "PASS", "G2": "PENDING", "G4": "PASS", "G5": "PENDING", "G8": "PASS", "G9": "PASS",
                               "G10": "PASS", "G11": "PENDING"}, "mp4")
        empty = ROOT / "empty"
        empty.mkdir()
        none = gates(empty)
        errors += expect(none, {"G1": "MISSING", "G9": "MISSING", "G10": "MISSING"}, "empty")
    finally:
        if not args.keep:
            shutil.rmtree(ROOT, ignore_errors=True)
    print("\n[selftest] " + ("OK" if not errors else "FAILED:\n  " + "\n  ".join(errors)))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
