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
                 with a transient in the mix (with an external audio/score.mp3
                 these two only WARN: its beats are its own, see beat-shift.json)
  clicks         no sound cut off while ringing: synth's own tail check
                 (mix-info.json cut_tails) and a click detector on the mix
                 (energy above 8 kHz in a sliding 1 ms window, > 20x its
                 median over ±50 ms, away from every intended transient)
  strike         the loudest momentary loudness sits on the strike, full range
                 and through a 200 Hz high-pass (a phone speaker); the sample
                 peak sits on the strike
  voice          voice stem -16 LUFS ±1 and mix-vo TP when the voice exists
  captions       out/captions.srt matches config

  python3 scripts/audio/verify.py [--strict]   (--strict: exit 1 on a FAIL; WARN never fails)
"""
from __future__ import annotations

import json
import re
import subprocess
import sys

import numpy as np
from scipy import ndimage, signal

from dsp import (AUDIO_BUILD, REEL, SR, a2db, load_config, momentary_lufs, onset_envelope, pick_onsets,
                 read_wav)
from synth import BLINK_REOPEN_FRAMES, CRACK_BURST_S, HAIRLINE

PHONE_HP_HZ = 200.0  # a phone speaker plays little below this
CLICK_RATIO = 20.0   # an HF burst this many times the local median is a click...
CLICK_TOL = 1.0      # ...unless within this many frames of an intended transient

results: list[tuple[str, str, str]] = []


def check(name: str, ok, detail: str, warn_only: bool = False) -> None:
    results.append((name, 'PASS' if ok else ('WARN' if warn_only else 'FAIL'), detail))


def intended_transients(cfg) -> tuple[list[float], list[tuple[float, float]]]:
    """Frames where a sound is meant to start (BEATS, SFX, and the few effects
    placed relative to an EVENT), and spans full of intended transients (the
    SFX ranges: crackle, sizzle; the strike's crack burst; the hairline run)."""
    pts: list[float] = []
    spans: list[tuple[float, float]] = []

    def take(v):
        if isinstance(v, dict) and 'from' in v and 'to' in v:
            pts.extend([v['from'], v['to']])
            return v['from'], v['to']
        for x in (v if isinstance(v, list) else [v]):
            pts.append(x)
        return None

    for v in cfg['BEATS'].values():
        take(v)
    for v in cfg['SFX'].values():
        sp = take(v)
        if sp:
            spans.append(sp)
    E, X = cfg['EVENTS'], cfg['SFX']
    pts += [E['crack1']['at'], X['flick1'] + E['crack1']['sealFrames'], X['flick2'] + E['crack2']['sealFrames']]
    pts += [f + BLINK_REOPEN_FRAMES for f in X['blinkTicks']]
    fps = cfg.fps
    spans += [(X['strikeHit'], X['strikeHit'] + CRACK_BURST_S * fps),
              (E['crack1']['at'], E['crack1']['at'] + HAIRLINE[0] * HAIRLINE[1] * fps)]
    return sorted(set(pts)), spans


def hf_clicks(x: np.ndarray, fps: float, pts, spans):
    """Energy above 8 kHz in a sliding 1 ms window (every 0.25 ms, so a click
    is never split between blocks) against its median over ±50 ms; returns
    [(frame, ratio, level dB, explained)] for every local peak over CLICK_RATIO."""
    hf = signal.sosfiltfilt(signal.butter(4, 8000, 'highpass', fs=SR, output='sos'), x, axis=0)
    hop = int(0.00025 * SR)
    e = ndimage.uniform_filter1d((hf ** 2).sum(axis=1) / hf.shape[1], int(0.001 * SR), mode='constant')[::hop]
    med = ndimage.median_filter(e, size=int(0.1 * SR / hop) | 1, mode='nearest')
    ratio = e / (med + 1e-14)
    peak = ndimage.maximum_filter1d(ratio, int(0.004 * SR / hop) | 1) == ratio
    out = []
    for i in np.flatnonzero(peak & (ratio > CLICK_RATIO) & (e > 1e-10)):
        f = i * hop / SR * fps
        ok = any(abs(f - p) <= CLICK_TOL for p in pts) or any(a - CLICK_TOL <= f <= b + CLICK_TOL for a, b in spans)
        out.append((round(float(f), 1), round(float(ratio[i]), 1), round(float(10 * np.log10(e[i])), 1), ok))
    return out


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
    info_path = AUDIO_BUILD / 'mix-info.json'
    info = json.loads(info_path.read_text()) if info_path.exists() else {}
    external = info.get('score_source', 'synth') != 'synth'

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
    # the cuts into silence are fades, not steps (a filter ringing past a fade
    # and then hard-zeroed would click right where the click gate looks away)
    edges = {}
    for f in (B['silence']['from'], E['slitClose']['to']):
        i = s(f)
        edges[f] = max(float(a2db(np.max(np.abs(wav[n][i] - wav[n][i - 1])))) for n in ('score', 'sfx', 'mix-main'))
    check('clean edges into the silences', all(v <= -90.0 for v in edges.values()),
          ', '.join(f'frame {f}: step {v:.0f} dB' for f, v in edges.items()) + ' (max -90)')
    report['silence_edges_db'] = edges
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
          f"{worst['onset_offset_frames']:+.2f} f at {worst['frame']}; weakest x{weakest['strength_vs_local_median']} at {weakest['frame']}"
          + (f" (external score {info['score_source']})" if external else ''), warn_only=external)

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
          '; '.join(f"{r['cut']}: beat {r['beat_offset']:+d} f, mix onset {r['mix_onset_offset']:+.2f} f" for r in cut_rows)
          + (' (external score: move the cuts per beat-shift.json)' if external else ''), warn_only=external)

    # clicks: nothing cut off while still ringing
    tails = info.get('cut_tails', [])
    check('no sound cut off while ringing (synth)', not tails,
          'every sound decays below -60 dB re its peak before its buffer ends' if not tails else
          '; '.join(f"{c['bus']} {c['label']} @{c['at_s']} s: {c['tail_db']} dB" for c in tails[:6]))
    pts, spans = intended_transients(cfg)
    report['hf_clicks'] = {}
    # (an external score has transients of its own, so on the mix this only WARNs then)
    for stem, warn in (('sfx', False), ('mix-main', external)):
        clicks = hf_clicks(wav[stem], fps, pts, spans)
        bad = [c for c in clicks if not c[3]]
        report['hf_clicks'][stem] = {'intended': [c[:3] for c in clicks if c[3]], 'unexplained': [c[:3] for c in bad]}
        check(f'no clicks in {"the effects stem" if stem == "sfx" else "the main mix"}', not bad,
              f'{len(clicks)} HF bursts > {CLICK_RATIO:g}x local median, all at intended transients' if not bad else
              f'{len(bad)} unexplained HF bursts at frames ' + ', '.join(f'{c[0]} (x{c[1]:g}, {c[2]} dB)' for c in bad[:12]),
              warn_only=warn)

    # the strike is the loudest moment, full range and on a phone
    hit = X['strikeHit']
    pk_f = float(np.argmax(np.max(np.abs(mix), axis=1)) / SR * fps)
    report['strike'] = {'sample_peak_frame': pk_f}
    for label, hp in (('full range', 0.0), (f'{PHONE_HP_HZ:g} Hz high-pass (phone)', PHONE_HP_HZ)):
        y = mix if not hp else signal.sosfilt(signal.butter(4, hp, 'highpass', fs=SR, output='sos'), mix, axis=0)
        t, m = momentary_lufs(y, 0.4, 0.02)
        near = (t * fps >= hit - 6) & (t * fps <= hit + 18)  # windows that hold the hit
        loud_f = float(t[np.argmax(m)] * fps)
        rest_i = np.flatnonzero(~near)[np.argmax(m[~near])]
        rest, rest_f = float(m[rest_i]), float(t[rest_i] * fps)
        ok = bool(near[np.argmax(m)]) and (hp or hit - 1 <= pk_f <= hit + 12)
        check(f'strike is the loudest moment, {label}', ok,
              f'max momentary {m.max():.1f} LUFS at frame {loud_f:.0f}; elsewhere max {rest:.1f} at frame '
              f'{rest_f:.0f} (margin {m.max() - rest:.1f} LU)' + ('' if hp else f'; sample peak at frame {pk_f:.1f}'))
        report['strike']['phone' if hp else 'full_range'] = {
            'momentary_max_lufs': round(float(m.max()), 2), 'at_frame': round(loud_f, 1),
            'elsewhere_max_lufs': round(rest, 2), 'elsewhere_at_frame': round(rest_f, 1),
            'margin_lu': round(float(m.max()) - rest, 2)}

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
            check('voice', True, 'skipped (voice cut not made): ' + '; '.join(f'{k}: {r}' for k, r in vs['reasons'].items()))

    # captions
    srt = REEL / 'out' / 'captions.srt'
    if srt.exists():
        txt = srt.read_text(encoding='utf-8')
        blocks = [b for b in txt.strip().split('\n\n') if b.strip()]
        lines = [' '.join(b.split('\n')[2:]) for b in blocks]
        want = [' '.join(sh['words']) for sh in cfg['SHOTS'] if sh['words']] + [cfg['END_CARD']['name']]
        check('captions', lines == want, f'{len(blocks)} cues: ' + ' | '.join(lines))

    w = max(len(r[0]) for r in results)
    for name, status, detail in results:
        print(f"{status}  {name.ljust(w)}  {detail}")
    report['checks'] = [{'check': n, 'status': st, 'pass': st != 'FAIL', 'detail': d} for n, st, d in results]
    report['pass'] = all(st != 'FAIL' for _, st, _ in results)
    (AUDIO_BUILD / 'verify.json').write_text(json.dumps(report, indent=2))
    if not report['pass']:
        print('verify: FAILED' + (' (strict: stopping the build)' if '--strict' in sys.argv else ''))
    return 1 if ('--strict' in sys.argv and not report['pass']) else 0


if __name__ == '__main__':
    sys.exit(main())
