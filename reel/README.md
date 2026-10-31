# Diablo — intro reel

A 28-second vertical intro reel for **Diablo — AI that evolves AI**, for
Instagram Reels and TikTok, in a fast flat motion-graphics style on white and
maroon at 120 BPM. Three flat mascot bots (a chat bubble, a TV-head robot and a
hovering orb) pop in and look fine; Diablo's mark drops in and the camera dives
into his eye. Each of his three slashes lands as a white swipe with a quick wince
and a two-frame glitch, and chips a lightning-bolt notch out of a bot (a chipped
toy, never a wound). A lens finds each chip, white seams pour into the notches
and leave white bolt badges. "Again?": Diablo slashes the fixed bots a second
time and white shields shatter every blade ("Not a scratch."). Colour beats
carry "AI that evolves AI", the camera pulls back to a whole crowd of fixed bots
("Every model. Every update."), and the crowd collapses into a dot that draws
his crescent for the end card.

This is its own Remotion project (React + TypeScript), separate from the app in
the repository root.

## Outputs

| File | What it is |
| --- | --- |
| `out/diablo-intro-28s.mp4` | The main post: score, sound and words, no voice. 28 s, 1080×1920, 30 fps, exactly 840 frames, H.264 High, AAC 48 kHz. |
| `out/diablo-intro-28s-vo.mp4` | The same picture with a generated voice. Only made when a voice source works (see below). |
| `out/cover.png` | 1080×1920 cover: the three cracked bots at 6.9 s with the name. |
| `out/captions.srt` | The on-screen lines with their times, for the voice cut. |
| `out/qa/report.md` | The checks run on this cut, with what was measured. |

## Render

```sh
cd reel
npm install
scripts/render.sh            # audio, the PNG sequence, both cuts, cover, captions
npm run qa                   # layout of every frame + the audio checks
```

`scripts/render.sh --skip-audio` reuses the audio; `--skip-frames` re-encodes
only. A full render takes about 3 minutes on four cores. Python needs
`numpy scipy pillow`, plus `ffmpeg`. Rendering uses SwiftShader GL
(`remotion.config.ts`): the swangle backend dropped 512 px raster tiles.

Rendering uses the Chromium headless shell at
`/opt/pw-browsers/chromium_headless_shell-1243/…`. Elsewhere, set
`REMOTION_BROWSER` to a Chrome or headless-shell binary, or delete the line in
`remotion.config.ts` to let Remotion download its own.

While working: `npm run studio` opens Remotion Studio, and
`npx tsx scripts/stills.ts out/dev/x 30 144 300` renders a few frames with one
bundle. `npx tsx scripts/check-layout.ts` checks every frame's layout (safe
area, words clearance, right rail) from the timeline itself.

The bots render on their own too: `npx tsx scripts/stills.ts out/dev/bots/sheet 0
--comp=Sheet --entry=src/bots/index.ts` freezes every state on one page, and
`--comp=Strip` plays the reel's hit and seal rhythm on the bot row. Close-up lab
pages (`--entry=src/bots/lab-index.ts`, compositions Zoom, Hits, Fix, Cheer,
White) show the damage at the lens's 2.1x, every hit frame and every seal step.

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

The score is synthesised in code at 120 BPM (a beat is 15 frames): drums, bass,
plucked arpeggios, stabs on the hits and colour beats, and a logo sting. The
effects (pops, whooshes, slashes, the impact, lens blips, seam zips, type
ticks) sit on the same grid, all cued from `src/config.ts`.

## Where things are

```
src/config.ts         words, voice lines, beats, events (frames at 30 fps)
src/theme.ts          the palette (white, maroon, night, porcelain, ember) and type (Geist)
src/geometry.ts       canvas, safe zones, where the bots stand
src/logo.ts           the mark traced from the logo: head, crescent, eyes
src/v2/timeline.ts    the whole reel as pure functions of the frame
src/v2/               the renderer, kinetic type, the flat mark, rings/ribbons/glints
src/bots/             the three bots: art, faces, the hit, the chip, the white seam
src/bots/kit/         the bots' contract, plus Sheet/Strip dev compositions
scripts/audio/        score and effects synthesis, mix, voice, captions, checks
```
