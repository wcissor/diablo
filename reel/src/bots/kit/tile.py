#!/usr/bin/env python3
"""Tile PNG frames into one labelled strip: tile.py out.png frame.png..."""
import sys
from PIL import Image, ImageDraw

out, files = sys.argv[1], sys.argv[2:]
cols = min(6, len(files)); w, h = 360, 640
rows = (len(files) + cols - 1) // cols
S = Image.new('RGB', (cols * w, rows * (h + 24)), (40, 40, 40))
d = ImageDraw.Draw(S)
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((w, h))
    x, y = (i % cols) * w, (i // cols) * (h + 24)
    S.paste(im, (x, y + 24))
    d.text((x + 6, y + 5), f.split('/')[-1], fill=(255, 255, 0))
S.save(out)
