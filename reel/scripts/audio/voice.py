#!/usr/bin/env python3
"""Generated voice for the backup cut (brief section 7, "Voice cut").

Speaks exactly VOICE_LINES (the words on screen, each 0.1 s after its words
appear, and "Diablo." on the end card), in a low, calm, confident English voice.
Sources, in order, each tried with short timeouts so the script never hangs:
  1. ElevenLabs   (ELEVENLABS_API_KEY; ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL optional)
  2. OpenAI TTS   (OPENAI_API_KEY; OPENAI_TTS_MODEL, OPENAI_TTS_VOICE optional)
  3. edge-tts     (pip package, Microsoft's online service; EDGE_TTS_VOICE optional)
  4. piper        (pip piper-tts + an English voice model: PIPER_MODEL=/path/x.onnx,
                   audio/voices/*.onnx, or downloaded from Hugging Face)
Missing pip packages are installed into build/pydeps (project-local, ignored
by git) unless DIABLO_VOICE_NO_INSTALL=1. No other engine stands in for these.

On success: audio/build/voice.wav (voice stem, -16 LUFS) and
audio/build/mix-vo.wav (score ducked 10 dB under the voice with a smooth
sidechain envelope, effects ducked 3 dB, true peak <= -1 dBTP, same length).
Always: audio/build/voice-status.json {ok, source, reasons{per source}, ...}
and exit code 0. On failure the stale voice.wav / mix-vo.wav are removed so
the render skips the voice cut.
"""
from __future__ import annotations

import asyncio
import importlib
import json
import os
import shutil
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np
from scipy import ndimage

from dsp import (AUDIO_BUILD, REEL, SR, Config, a2db, butter, db2a, decode, fit_length, integrated_lufs,
                 limit, load_config, read_wav, true_peak_db, write_wav)

TIMEOUT = 15.0  # seconds, per network request
VOICE_LUFS = -16.0
SCORE_DUCK_DB = -10.0
SFX_DUCK_DB = -3.0
CEILING_DBTP = -1.0
AAC_HEADROOM_DB = 1.5  # the AAC encode adds up to ~1 dB of true peak on the strike's dense transient
PYDEPS = REEL / 'build' / 'pydeps'
TMP = AUDIO_BUILD / 'voice-tmp'
STYLE = ('Speak in a low, calm, confident voice. Unhurried, warm and certain, like a film trailer '
         'narrator who never raises his voice. Short pause at each full stop.')


class SourceError(Exception):
    pass


# ---------------------------------------------------------------- helpers ---

def ssl_context() -> ssl.SSLContext:
    cafile = os.environ.get('SSL_CERT_FILE') or os.environ.get('REQUESTS_CA_BUNDLE')
    return ssl.create_default_context(cafile=cafile if cafile and Path(cafile).exists() else None)


def http(url: str, headers: dict | None = None, body: dict | None = None, timeout: float = TIMEOUT) -> bytes:
    data = None if body is None else json.dumps(body).encode()
    hdrs = dict(headers or {})
    if body is not None:
        hdrs['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=data, headers=hdrs, method='POST' if body is not None else 'GET')
    host = urllib.request.urlparse(url).netloc
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ssl_context()) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        detail = e.read()[:200].decode('utf-8', 'replace').strip()
        raise SourceError(f'HTTP {e.code} from {host}: {detail}') from None
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        reason = getattr(e, 'reason', e)
        raise SourceError(f'{host} unreachable: {reason}') from None


def pip_local(package: str, timeout: float) -> None:
    """Install a package into build/pydeps (never system-wide)."""
    if os.environ.get('DIABLO_VOICE_NO_INSTALL'):
        raise SourceError(f'{package} not installed (DIABLO_VOICE_NO_INSTALL set)')
    PYDEPS.mkdir(parents=True, exist_ok=True)
    try:
        r = subprocess.run([sys.executable, '-m', 'pip', 'install', '--quiet', '--disable-pip-version-check',
                            '--no-input', '--target', str(PYDEPS), package],
                           capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise SourceError(f'pip install {package} timed out after {timeout:.0f} s') from None
    if r.returncode != 0:
        raise SourceError(f'pip install {package} failed: {r.stderr.strip()[-300:]}')
    if str(PYDEPS) not in sys.path:
        sys.path.insert(0, str(PYDEPS))
    importlib.invalidate_caches()


def import_or_install(module: str, package: str, timeout: float):
    if PYDEPS.exists() and str(PYDEPS) not in sys.path:
        sys.path.insert(0, str(PYDEPS))
    try:
        return importlib.import_module(module)
    except ImportError:
        pip_local(package, timeout)
        try:
            return importlib.import_module(module)
        except ImportError as e:
            raise SourceError(f'{package} installed but import failed: {e}') from None


# ---------------------------------------------------------------- sources ---

def src_elevenlabs(lines: list[dict], tmp: Path):
    key = os.environ.get('ELEVENLABS_API_KEY')
    if not key:
        raise SourceError('ELEVENLABS_API_KEY not set')
    voice = os.environ.get('ELEVENLABS_VOICE_ID', 'nPczCjzI2devNBz1zQrb')  # a deep, calm narrator voice
    model = os.environ.get('ELEVENLABS_MODEL', 'eleven_multilingual_v2')
    files = []
    for i, line in enumerate(lines):
        audio = http(f'https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128',
                     {'xi-api-key': key, 'Accept': 'audio/mpeg'},
                     {'text': line['text'], 'model_id': model,
                      'voice_settings': {'stability': 0.65, 'similarity_boost': 0.8, 'style': 0.1,
                                         'use_speaker_boost': True}})
        p = tmp / f'line{i}.mp3'
        p.write_bytes(audio)
        files.append(p)
    return files, {'voice': voice, 'model': model}


def src_openai(lines: list[dict], tmp: Path):
    key = os.environ.get('OPENAI_API_KEY')
    if not key:
        raise SourceError('OPENAI_API_KEY not set')
    model = os.environ.get('OPENAI_TTS_MODEL', 'gpt-4o-mini-tts')
    voice = os.environ.get('OPENAI_TTS_VOICE', 'onyx')
    base = os.environ.get('OPENAI_BASE_URL', 'https://api.openai.com/v1').rstrip('/')
    files = []
    for i, line in enumerate(lines):
        body = {'model': model, 'voice': voice, 'input': line['text'], 'response_format': 'wav'}
        if not model.startswith('tts-1'):
            body['instructions'] = STYLE
        audio = http(f'{base}/audio/speech', {'Authorization': f'Bearer {key}'}, body)
        p = tmp / f'line{i}.wav'
        p.write_bytes(audio)
        files.append(p)
    return files, {'voice': voice, 'model': model}


def src_edge_tts(lines: list[dict], tmp: Path):
    edge_tts = import_or_install('edge_tts', 'edge-tts', 120)
    voice = os.environ.get('EDGE_TTS_VOICE', 'en-US-ChristopherNeural')
    proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
    files = [tmp / f'line{i}.mp3' for i in range(len(lines))]

    async def run():
        for line, p in zip(lines, files):
            kw = dict(rate='-6%', pitch='-5Hz')
            try:
                c = edge_tts.Communicate(line['text'], voice, proxy=proxy, connect_timeout=10, receive_timeout=20, **kw)
            except TypeError:
                c = edge_tts.Communicate(line['text'], voice, **kw)
            await c.save(str(p))

    try:
        asyncio.run(asyncio.wait_for(run(), timeout=45))
    except asyncio.TimeoutError:
        raise SourceError('speech.platform.bing.com: no answer within 45 s') from None
    except Exception as e:  # aiohttp / websocket / TLS errors; say what the host itself answers
        try:
            http('https://speech.platform.bing.com/', timeout=8)
            probe = 'host reachable'
        except SourceError as pe:
            probe = str(pe)
        raise SourceError(f'edge-tts {type(e).__name__}: {str(e)[:200]} (probe: {probe})') from None
    for p in files:
        if not p.exists() or p.stat().st_size < 1000:
            raise SourceError(f'edge-tts returned no audio for {p.name}')
    return files, {'voice': voice}


PIPER_VOICE = 'en_US-ryan-high'
PIPER_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ryan/high/'


def piper_model() -> Path:
    env = os.environ.get('PIPER_MODEL')
    if env:
        p = Path(env)
        if not p.exists():
            raise SourceError(f'PIPER_MODEL={env} does not exist')
        return p
    local = sorted((REEL / 'audio' / 'voices').glob('*.onnx'))
    if local:
        return local[0]
    cache = REEL / 'build' / 'piper' / f'{PIPER_VOICE}.onnx'
    if cache.exists() and cache.with_suffix('.onnx.json').exists():
        return cache
    cache.parent.mkdir(parents=True, exist_ok=True)
    for suffix in ('.onnx.json', '.onnx'):
        data = http(PIPER_BASE + PIPER_VOICE + suffix, timeout=TIMEOUT if suffix == '.onnx.json' else 120)
        (cache.parent / (PIPER_VOICE + suffix)).write_bytes(data)
    return cache


def src_piper(lines: list[dict], tmp: Path):
    model = piper_model()  # fails fast (no download) before installing anything heavy
    import_or_install('piper', 'piper-tts', 300)
    env = dict(os.environ, PYTHONPATH=os.pathsep.join([str(PYDEPS), os.environ.get('PYTHONPATH', '')]))
    files = []
    for i, line in enumerate(lines):
        p = tmp / f'line{i}.wav'
        try:
            r = subprocess.run([sys.executable, '-m', 'piper', '--model', str(model), '--output_file', str(p)],
                               input=line['text'], capture_output=True, text=True, timeout=120, env=env)
        except subprocess.TimeoutExpired:
            raise SourceError('piper timed out') from None
        if r.returncode != 0 or not p.exists():
            raise SourceError(f'piper failed: {r.stderr.strip()[-300:]}')
        files.append(p)
    return files, {'voice': model.stem}


SOURCES = [('elevenlabs', src_elevenlabs), ('openai', src_openai), ('edge_tts', src_edge_tts), ('piper', src_piper)]


# ------------------------------------------------------------------- mix ---

def trim(x: np.ndarray) -> np.ndarray:
    w = int(0.01 * SR)
    env = np.sqrt(np.convolve(x ** 2, np.ones(w) / w, mode='same'))
    on = np.flatnonzero(env > env.max() * db2a(-40))
    if not len(on):
        return x
    a = max(0, on[0] - int(0.02 * SR))
    b = min(len(x), on[-1] + int(0.08 * SR))
    y = x[a:b].copy()
    f = int(0.005 * SR)
    y[:f] *= np.linspace(0, 1, f)
    y[-f:] *= np.linspace(1, 0, f)
    return y


def time_fit(x: np.ndarray, ratio: float, tmp: Path) -> np.ndarray:
    """Speed speech up by `ratio` without changing its pitch (ffmpeg atempo)."""
    src, dst = tmp / 'fit-in.wav', tmp / 'fit-out.wav'
    write_wav(src, x)
    chain, r = [], ratio
    while r > 2.0:
        chain.append('atempo=2.0')
        r /= 2.0
    chain.append(f'atempo={r:.5f}')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-filter:a', ','.join(chain), str(dst)],
                   check=True, timeout=60)
    return decode(dst, channels=1)[:, 0]


def duck_curve(voice: np.ndarray, depth_db: float, look: float = 0.08, attack: float = 0.06,
               hold: float = 0.15, release: float = 0.35) -> np.ndarray:
    """Smooth sidechain gain from the voice: activity in 20 ms windows, opened
    `look` ahead of the voice, held across word gaps, then an attack/release
    follower at a 1 kHz control rate (reaches the full depth on every line)."""
    hop = SR // 1000
    k = len(voice) // hop
    env = np.sqrt(np.mean(voice[:k * hop].reshape(k, hop) ** 2, axis=1))
    env = np.sqrt(np.convolve(env ** 2, np.ones(20) / 20, mode='same'))
    act = np.clip((a2db(env) + 50.0) / 12.0, 0.0, 1.0)
    act = ndimage.maximum_filter1d(act, size=int(hold * 1000) | 1, origin=-(int(hold * 1000) // 2))
    shift = int(look * 1000)
    act = np.concatenate([act[shift:], np.zeros(shift)])
    ca, cr = np.exp(-1.0 / (attack * 1000)), np.exp(-1.0 / (release * 1000))
    g = np.empty(k)
    state = 0.0
    for i, a in enumerate(act):
        state = a + (state - a) * (ca if a > state else cr)
        g[i] = state
    gain = np.interp(np.arange(len(voice)) / hop, np.arange(k) + 0.5, g)
    return db2a(depth_db * gain)


def build_voice(cfg: Config, lines: list[dict], files: list[Path], tmp: Path) -> dict:
    N = cfg.n
    voice = np.zeros(N)
    placed = []
    for line, path in zip(lines, files):
        x = trim(decode(path, channels=1)[:, 0])
        slot = (line['end'] + 1 - line['start']) / cfg.fps - 0.1
        dur = len(x) / SR
        ratio = 1.0
        if dur > slot:
            ratio = dur / slot
            x = time_fit(x, ratio, tmp)
        a = cfg.s(line['start'])
        k = min(len(x), N - a)
        voice[a:a + k] += x[:k]
        placed.append({'text': line['text'], 'start_s': round(a / SR, 3), 'dur_s': round(k / SR, 3),
                       'slot_s': round(slot, 3), 'tempo': round(ratio, 3)})
    voice = butter(voice, 'highpass', 70.0)
    stereo = np.stack([voice, voice], axis=1)  # centred; loudness measured on the stereo stem
    for _ in range(2):
        stereo *= db2a(VOICE_LUFS - integrated_lufs(stereo))
        stereo, _ = limit(stereo, CEILING_DBTP - 0.3)

    score = read_wav(AUDIO_BUILD / 'score.wav')
    sfx = read_wav(AUDIO_BUILD / 'sfx.wav')
    mono = stereo[:, 0]
    mix = (score * duck_curve(mono, SCORE_DUCK_DB)[:, None] + sfx * duck_curve(mono, SFX_DUCK_DB)[:, None]
           + stereo)
    mix, gr = limit(mix, CEILING_DBTP - AAC_HEADROOM_DB - 0.25)
    B, X, E = cfg['BEATS'], cfg['SFX'], cfg['EVENTS']
    mix[cfg.s(B['silence']['from']):cfg.s(X['strikeWhoosh'])] = 0.0
    mix[cfg.s(E['slitClose']['to']):] = 0.0
    mix = fit_length(mix, N)
    write_wav(AUDIO_BUILD / 'voice.wav', stereo)
    write_wav(AUDIO_BUILD / 'mix-vo.wav', mix)
    return {'lines_placed': placed, 'voice_lufs': round(integrated_lufs(stereo), 2),
            'mix_vo_lufs': round(integrated_lufs(mix), 2), 'mix_vo_true_peak_dbtp': round(true_peak_db(mix), 2),
            'limiter_max_gr_db': round(gr, 2)}


def main() -> int:
    cfg = load_config()
    lines = cfg['VOICE_LINES']
    status: dict = {'ok': False, 'source': None, 'reasons': {}, 'lines': lines}
    shutil.rmtree(TMP, ignore_errors=True)
    TMP.mkdir(parents=True, exist_ok=True)
    try:
        for name, fn in SOURCES:
            t0 = time.time()
            tmp = TMP / name
            tmp.mkdir(parents=True, exist_ok=True)
            try:
                files, meta = fn(lines, tmp)
            except SourceError as e:
                status['reasons'][name] = str(e)
                print(f'voice: {name}: {e} ({time.time() - t0:.1f} s)')
                continue
            except Exception as e:  # never let one source stop the others
                status['reasons'][name] = f'{type(e).__name__}: {str(e)[:300]}'
                print(f'voice: {name}: {status["reasons"][name]}')
                continue
            try:
                status.update(build_voice(cfg, lines, files, tmp))
                status.update(ok=True, source=name, meta=meta)
                status['reasons'][name] = 'ok'
                print(f'voice: {name} ok')
                break
            except Exception as e:
                status['reasons'][name] = f'audio from {name} could not be used: {type(e).__name__}: {e}'
                print(f'voice: {status["reasons"][name]}')
    finally:
        shutil.rmtree(TMP, ignore_errors=True)
    if not status['ok']:
        for f in ('voice.wav', 'mix-vo.wav'):
            (AUDIO_BUILD / f).unlink(missing_ok=True)
        status['note'] = 'No voice source worked: the voice cut is skipped (no other engine stands in).'
        print('voice: no source worked; voice cut skipped')
    (AUDIO_BUILD / 'voice-status.json').write_text(json.dumps(status, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
