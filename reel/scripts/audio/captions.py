#!/usr/bin/env python3
"""out/captions.srt for the voice cut: the words on screen are the captions.

One cue per on-screen line, from the frame its words start to fade in
(wordsIn) to the end of its shot (the words leave with the cut), the slash in
the brief (one SHOTS.words entry per line) as a line break, plus the name on
the end card from END_CARD.nameIn until the slit starts to close.
"""
from __future__ import annotations

from dsp import REEL, load_config


def stamp(frame: int, fps: int) -> str:
    ms = int(round(frame * 1000 / fps))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'


def cues(cfg) -> list[tuple[int, int, str]]:
    out = [(s['wordsIn'], s['to'] + 1, '\n'.join(s['words'])) for s in cfg['SHOTS'] if s['words']]
    end = cfg['END_CARD']
    out.append((end['nameIn'], cfg['EVENTS']['slitClose']['from'], end['name']))
    return out


def main() -> None:
    cfg = load_config()
    blocks = [f'{i}\n{stamp(a, cfg.fps)} --> {stamp(b, cfg.fps)}\n{text}\n'
              for i, (a, b, text) in enumerate(cues(cfg), 1)]
    dest = REEL / 'out' / 'captions.srt'
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text('\n'.join(blocks), encoding='utf-8')
    print(f'wrote out/captions.srt ({len(blocks)} cues)')


if __name__ == '__main__':
    main()
