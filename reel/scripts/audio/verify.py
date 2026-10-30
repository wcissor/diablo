#!/usr/bin/env python3
"""Measures the audio build against brief sections 7 and 8 and prints the
numbers; writes audio/build/verify.json.

  durations      ffprobe: 48 kHz, stereo, exactly DURATION frames of samples
  loudness       ffmpeg ebur128 (peak=true): main mix -18 LUFS ±0.5, TP <= -1 dBTP
  silence        BEATS.silence: digital zero in every stem except the 1-frame
                 inhale at SFX.strikeWhoosh (score silent through it); the
                 last 0.1 s digital zero
  beats          onset detection on the score stem: a transient within 1 frame
                 of every BEATS time; every CUT within 3 frames of a beat and
                 with a transient in the mix
  strike         the loudest momentary loudness and the sample peak sit on the strike
  voice          voice stem -16 LUFS ±1 and mix-vo TP when the voice exists
  captions       out/captions.srt matches config

  python3 scripts/audio/verify.py [--strict]   (--strict: exit 1 on a failure)
"""
from __future__ import annotations

import json
import re
import subprocess
import sys

import numpy as np

from dsp import (AUDIO_BUILD, REEL, SR, a2db, load_config, momentary_lufs, onset_envelope, pick_onsets,
                 read_wav)

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str) -> None:
    results.append((name, bool(ok), detail))


def ffprobe(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries',
                          'stream=codec_name,sample_rate,channels,duration_ts,duration', '-of', 'json', str(path)],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)['streams'][0]


def ebur128(path):
    r = subprocess.run(['ffmpeg', '-nostats', '-hide_banner', '-nostdin', '-i', str(path), '-af', 'ebur128=peak=true',
                        '-f', 'null', '-'], capture_output=True, text=True)
    s = r.stderr[r.stderr.rfind('Summary:'):]
    num = r'(-?[\d.]+|-inf)'
    i = float(re.search(r'I:\s+' + num + ' LUFS', s).group(1))
    lra = float(re.search(r'LRA:\s+' + num + ' LU', s).group(1))
    tp = float(re.search(r'True peak:\s+Peak:\s+' + num + ' dBFS', s, re.S).group(1))
    return {'I': i, 'LRA': lra, 'TP': tp}


def main() -> int:
    cfg = load_config()
    B, X, E = cfg['BEATS'], cfg['SFX'], cfg['EVENTS']
    N, fps = cfg.n, cfg.fps
    report: dict = {}

    names = ['score', 'sfx', 'mix-main'] + [n for n in ('voice', 'mix-vo') if (AUDIO_BUILD / f'{n}.wav').exists()]
    wav = {n: read_wav(AUDIO_BUILD / f'{n}.wav') for n in names}

    # durations
    report['files'] = {}
    for n in names:
        p = ffprobe(AUDIO_BUILD / f'{n}.wav')
        report['files'][n] = p
        ok = int(p['sample_rate']) == SR and int(p['channels']) == 2 and int(p['duration_ts']) == N
        check(f'file {n}.wav', ok, f"{p['codec_name']} {p['sample_rate']} Hz {p['channels']} ch "
                                   f"{p['duration_ts']} samples = {float(p['duration']):.6f} s")

    # loudness
    lm = ebur128(AUDIO_BUILD / 'mix-main.wav')
    report['mix_main_ebur128'] = lm
    check('main mix loudness', abs(lm['I'] + 18.0) <= 0.5, f"I {lm['I']:.1f} LUFS (target -18 ±0.5), LRA {lm['LRA']:.1f} LU")
    check('main mix true peak', lm['TP'] <= -1.0, f"TP {lm['TP']:.1f} dBTP (max -1.0)")
    mix = wav['mix-main']
    check('main mix no clipping', np.max(np.abs(mix)) < 1.0, f'sample peak {a2db(np.max(np.abs(mix))):.2f} dBFS')

    # silence before the strike
    s = cfg.s
    gap = slice(s(B['silence']['from']), s(X['strikeWhoosh']))
    inhale = slice(s(X['strikeWhoosh']), s(X['strikeHit']))
    peaks = {n: float(np.max(np.abs(wav[n][gap]))) for n in ('score', 'sfx', 'mix-main')}
    check(f"silence frames {B['silence']['from']}-{X['strikeWhoosh'] - 1}", all(v == 0.0 for v in peaks.values()),
          'digital zero in score, sfx and mix' if all(v == 0 for v in peaks.values()) else f'peaks {peaks}')
    sc_in = float(np.max(np.abs(wav['score'][inhale])))
    fx_in = float(np.max(np.abs(wav['sfx'][inhale])))
    check(f"frame {X['strikeWhoosh']} inhale only", sc_in == 0.0 and fx_in > 0.0,
          f'score {"zero" if sc_in == 0 else a2db(sc_in)}, inhale peak {a2db(fx_in):.1f} dBFS')
    tail = slice(N - int(0.1 * SR), N)
    tails = {n: float(np.max(np.abs(w[tail]))) for n, w in wav.items()}
    check('last 0.1 s digital silence', all(v == 0.0 for v in tails.values()), ', '.join(f'{k} {v:g}' for k, v in tails.items()))

    # beats on the score stem
    times, flux = onset_envelope(wav['score'])
    onsets = pick_onsets(times, flux, fps)
    ofr = np.array([o[0] * fps for o in onsets])
    beat_rows = []
    all_ok = True
    for group, v in B.items():
        if group == 'silence':
            continue
        for b in (v if isinstance(v, list) else [v]):
            d = ofr - b
            i = int(np.argmin(np.abs(d))) if len(d) else -1
            off = float(d[i]) if i >= 0 else 99.0
            ok = abs(off) <= 1.0
            all_ok &= ok
            beat_rows.append({'group': group, 'frame': b, 'onset_offset_frames': round(off, 2),
                              'strength_vs_local_median': round(onsets[i][2], 1) if i >= 0 else 0, 'ok': ok})
    report['beats'] = beat_rows
    worst = max(beat_rows, key=lambda r: abs(r['onset_offset_frames']))
    weakest = min(beat_rows, key=lambda r: r['strength_vs_local_median'])
    check('score transient on every BEATS time', all_ok,
          f"{sum(r['ok'] for r in beat_rows)}/{len(beat_rows)} within 1 frame; worst offset "
          f"{worst['onset_offset_frames']:+.2f} f at {worst['frame']}; weakest x{weakest['strength_vs_local_median']} at {weakest['frame']}")

    beat_frames = sorted(b for g, v in B.items() if g != 'silence' for b in (v if isinstance(v, list) else [v]))
    mt, mf = onset_envelope(mix)
    mo = np.array([o[0] * fps for o in pick_onsets(mt, mf, fps)])
    cut_rows = []
    for c in cfg['CUTS']:
        nb = min(beat_frames, key=lambda b: abs(b - c))
        no = float(mo[np.argmin(np.abs(mo - c))] - c) if len(mo) else 99.0
        cut_rows.append({'cut': c, 'nearest_beat': nb, 'beat_offset': nb - c, 'mix_onset_offset': round(no, 2),
                         'ok': abs(nb - c) <= 3 and abs(no - (nb - c)) <= 1.0})
    report['cuts'] = cut_rows
    check('every cut within 3 frames of a beat', all(r['ok'] for r in cut_rows),
          '; '.join(f"{r['cut']}: beat {r['beat_offset']:+d} f, mix onset {r['mix_onset_offset']:+.2f} f" for r in cut_rows))

    # the strike is the loudest moment
    t, m = momentary_lufs(mix, 0.4, 0.02)
    hit = X['strikeHit']
    near = (t * fps >= hit - 3) & (t * fps <= hit + 18)
    loud_f = float(t[np.argmax(m)] * fps)
    rest = float(m[~near].max())
    pk_f = float(np.argmax(np.max(np.abs(mix), axis=1)) / SR * fps)
    check('strike is the loudest moment', near[np.argmax(m)] and hit - 1 <= pk_f <= hit + 12,
          f'max momentary {m.max():.1f} LUFS at frame {loud_f:.0f} (elsewhere max {rest:.1f}, margin '
          f'{m.max() - rest:.1f} LU); sample peak at frame {pk_f:.1f}')
    report['strike'] = {'momentary_max_lufs': float(m.max()), 'at_frame': loud_f, 'elsewhere_max_lufs': rest,
                        'sample_peak_frame': pk_f}

    # voice
    vs_path = AUDIO_BUILD / 'voice-status.json'
    if vs_path.exists():
        vs = json.loads(vs_path.read_text())
        report['voice_status'] = vs
        if vs.get('ok'):
            lv = ebur128(AUDIO_BUILD / 'voice.wav')
            lvo = ebur128(AUDIO_BUILD / 'mix-vo.wav')
            check('voice loudness', abs(lv['I'] + 16.0) <= 1.0, f"voice I {lv['I']:.1f} LUFS (target -16 ±1)")
            check('voice mix true peak', lvo['TP'] <= -1.0, f"mix-vo I {lvo['I']:.1f} LUFS, TP {lvo['TP']:.1f} dBTP")
            starts = []
            v = wav['voice'][:, 0]
            for line in cfg['VOICE_LINES']:
                a = cfg.s(line['start'])
                seg = np.abs(v[max(0, a - int(0.3 * SR)):a + int(0.5 * SR)])
                on = np.flatnonzero(seg > np.max(np.abs(v)) * 0.05)
                starts.append(((on[0] / SR - 0.3) if len(on) else 9.9))
            check('voice line starts', all(abs(x) <= 0.2 for x in starts),
                  ', '.join(f'{x:+.2f} s' for x in starts))
        else:
            check('voice', True, 'skipped: ' + '; '.join(f'{k}: {r}' for k, r in vs['reasons'].items()))

    # captions
    srt = REEL / 'out' / 'captions.srt'
    if srt.exists():
        txt = srt.read_text(encoding='utf-8')
        blocks = [b for b in txt.strip().split('\n\n') if b.strip()]
        lines = [' '.join(b.split('\n')[2:]) for b in blocks]
        want = [' '.join(sh['words']) for sh in cfg['SHOTS'] if sh['words']] + [cfg['END_CARD']['name']]
        check('captions', lines == want, f'{len(blocks)} cues: ' + ' | '.join(lines))

    w = max(len(r[0]) for r in results)
    for name, ok, detail in results:
        print(f"{'PASS' if ok else 'FAIL'}  {name.ljust(w)}  {detail}")
    report['checks'] = [{'check': n, 'pass': ok, 'detail': d} for n, ok, d in results]
    report['pass'] = all(ok for _, ok, _ in results)
    (AUDIO_BUILD / 'verify.json').write_text(json.dumps(report, indent=2))
    return 1 if ('--strict' in sys.argv and not report['pass']) else 0


if __name__ == '__main__':
    sys.exit(main())
