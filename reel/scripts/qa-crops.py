#!/usr/bin/env python3
"""Crops for the fresh reviewers: the three bots alone (gate 6) at idle,
cracked, sealed and proud, from the rendered PNG sequence.
Usage: python3 scripts/qa-crops.py   → out/qa/bots/*.png"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FRAMES = {"idle": 30, "cracked": 175, "sealed": 300, "proud": 500}
BOTS = {"bubble": (130, 900, 420, 1215), "cube": (420, 850, 660, 1215), "orb": (660, 900, 950, 1215)}
out = ROOT / "out" / "qa" / "bots"
out.mkdir(parents=True, exist_ok=True)
for state, f in FRAMES.items():
    im = Image.open(ROOT / "out" / "frames" / f"frame-{f:03d}.png").convert("RGB")
    im.crop((120, 850, 960, 1230)).save(out / f"row-{state}.png")
    for name, box in BOTS.items():
        c = im.crop(box)
        c.resize((c.width * 2, c.height * 2), Image.LANCZOS).save(out / f"{name}-{state}.png")
print(f"wrote {len(list(out.glob('*.png')))} crops to {out.relative_to(ROOT)}")
