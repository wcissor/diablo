#!/usr/bin/env bash
# Render the reel: audio stems and mixes, the PNG sequence, both cuts, the cover
# and the captions. Run from anywhere: reel/scripts/render.sh
#   --skip-audio   reuse audio/build/*.wav
#   --skip-frames  reuse out/frames (re-encode only)
set -euo pipefail
cd "$(dirname "$0")/.."

SKIP_AUDIO=0; SKIP_FRAMES=0
for a in "$@"; do
  case "$a" in
    --skip-audio) SKIP_AUDIO=1 ;;
    --skip-frames) SKIP_FRAMES=1 ;;
  esac
done

npx tsx scripts/export-config.ts
[ "$SKIP_AUDIO" = 1 ] || bash scripts/audio/build.sh

if [ "$SKIP_FRAMES" = 0 ]; then
  rm -rf out/frames && mkdir -p out/frames
  npx remotion render src/index.ts IntroReel out/frames --sequence --image-format=png \
    --image-sequence-pattern='frame-[frame].[ext]' --concurrency=4
fi

# Both cuts: 1080×1920, 30 fps, exactly 600 frames, H.264 High yuv420p, AAC 48 kHz 192 kbps.
encode() {
  ffmpeg -y -hide_banner -loglevel error -framerate 30 -i out/frames/frame-%03d.png -i "$1" \
    -map 0:v:0 -map 1:a:0 -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow \
    -crf 18 -maxrate 14M -bufsize 28M -r 30 -frames:v 600 \
    -c:a aac -ar 48000 -b:a 192k -t 20 -movflags +faststart "$2"
}
encode audio/build/mix-main.wav out/diablo-intro-20s.mp4
if [ -f audio/build/mix-vo.wav ]; then
  encode audio/build/mix-vo.wav out/diablo-intro-20s-vo.mp4
else
  rm -f out/diablo-intro-20s-vo.mp4
  echo "voice cut skipped: see audio/build/voice-status.json"
fi

COVER_FRAME=$(node -e "console.log(require('./build/config.json').COVER_FRAME)")
npx remotion still src/index.ts Cover out/cover.png --frame="$COVER_FRAME"
ls -la out/*.mp4 out/cover.png out/captions.srt 2>/dev/null || true
