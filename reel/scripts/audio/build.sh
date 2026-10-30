#!/usr/bin/env bash
# The reel's sound, all made in code (brief section 7):
#   1. synth.py     the 120 BPM score + effects stems and the main mix (-18 LUFS, <= -1 dBTP)
#   2. voice.py     generated voice + voice-cut mix, or voice-status.json saying why not
#   3. captions.py  out/captions.srt
#   4. verify.py    length, loudness, true peak, the silent black tail, a transient
#                   on every colour-beat cut. --strict: any FAIL exits 1, which
#                   stops this script and scripts/render.sh
# Run from anywhere: reel/scripts/audio/build.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
export PYTHONDONTWRITEBYTECODE=1  # keep scripts/audio free of __pycache__

npx tsx scripts/export-config.ts
python3 scripts/audio/synth.py
python3 scripts/audio/voice.py
python3 scripts/audio/captions.py
python3 scripts/audio/verify.py --strict
