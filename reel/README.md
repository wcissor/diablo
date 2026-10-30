# Diablo — intro reel

A 20-second vertical intro reel for **Diablo — AI that evolves AI**, for
Instagram Reels and TikTok. Three porcelain bots look fine; Diablo pulls up
behind them, strikes, finds their weak spots, seals every crack in gold, learns,
and the bots come back stronger. Every frame is vector art drawn in code, in
Diablo's own Gold Seam style; every sound is synthesised in code.

This is its own Remotion project (React + TypeScript), separate from the app in
the repository root.

## Outputs

| File | What it is |
| --- | --- |
| `out/diablo-intro-20s.mp4` | The main post: score, sound and words, no voice. 1080×1920, 30 fps, exactly 600 frames, H.264 High, AAC 48 kHz. |
| `out/diablo-intro-20s-vo.mp4` | The same picture with a generated voice. Only made when a voice source works (see below). |
| `out/cover.png` | 1080×1920 cover: the strike at 6.0 s with the name. |
| `out/captions.srt` | The on-screen lines with their times, for the voice cut. |
| `out/qa/report.md` | One line per quality gate, with what was measured. |

## Render

```sh
cd reel
npm install
scripts/render.sh            # audio, the PNG sequence, both cuts, cover, captions
python3 scripts/qa/run_gates.py   # the quality gates → out/qa/report.md
```

`scripts/render.sh --skip-audio` reuses the audio; `--skip-frames` re-encodes
only. A full render takes about 15–30 minutes on four cores (the motion-blurred
moves cost eight samples a frame). Python needs `numpy scipy pyloudnorm pillow`;
the gates also use `ffmpeg` and `tesseract`.

Rendering uses the Chromium headless shell at
`/opt/pw-browsers/chromium_headless_shell-1243/…`. Elsewhere, set
`REMOTION_BROWSER` to a Chrome or headless-shell binary, or delete the line in
`remotion.config.ts` to let Remotion download its own.

While working: `npm run studio` opens Remotion Studio, and
`npx tsx scripts/stills.ts out/dev/x 30 144 300` renders a few frames with one
bundle. `npx tsx scripts/check-layout.ts` checks every frame's layout (safe
area, words clearance, right rail) from the scene state.

## Change the words or the timing

Every word on screen, every voice line, every beat and every event frame lives
in `src/config.ts`. To try another opening line (the Trial Reels hook test),
change the first shot's `words` and render again. The audio, captions and QA
read the same file through `build/config.json`.

## Voice cut

`scripts/audio/voice.py` tries, in order: ElevenLabs (`ELEVENLABS_API_KEY`),
OpenAI TTS (`OPENAI_API_KEY`), `edge-tts`, then `piper` with an English voice
model. It writes `audio/build/voice-status.json` saying which worked or why
none did. With no source the voice cut is skipped. To make it, set one of the
keys (or run where edge-tts or Hugging Face is reachable) and run
`scripts/render.sh` again.

## Music

The score is synthesised in code. To use a commissioned or licensed track
instead, drop it in as `audio/score.mp3`: the effects stay, and
`audio/build/beat-shift.json` suggests, for each hard cut, the nearest beat in
the track within 3 frames.

## Where things are

```
src/config.ts         words, voice lines, beats, events (frames at 30 fps)
src/theme.ts          the Gold Seam palette, the 9° slant, hatching, seams, type
src/geometry.ts       canvas, safe zones, where everyone stands
src/logo.ts           the mark traced from the logo: head, crescent, eyes
src/cast/             the bots, Diablo's head, hands, tail and the end-card mark
src/stage/            light pool, stage line, grain, vignette, words, slit
src/shots/            the six stage shots as frame → scene state, the end card
scripts/audio/        score and effects synthesis, mix, voice, captions, checks
scripts/qa/           the quality gates
```
