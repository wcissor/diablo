# Diablo intro reel (v2): checks

v2 restyles the reel after feedback on v1. The changes:

- Gold is replaced by white everywhere.
- Diablo appears only as his flat logo mark, with no hands or body.
- The "learns" beat is removed.
- The motion is a fast flat motion-graphics style at 120 BPM.

The v1 gate runner (`scripts/qa/run_gates.py`) was written against the v1 story: a strike flash at frame 138, slow motion, light-on-dark words and a gold palette. It has been retired along with its stored reviewer verdicts. The checks below were run on this cut. Stills are in `stills/` and `contact-sheet.png`.

| Check | Result | What was measured |
| --- | --- | --- |
| File | PASS | `diablo-intro-20s.mp4`: H.264 High yuv420p, 1080×1920, 30 fps, 600 frames, 20.000 s; AAC 48 kHz stereo; faststart. |
| Safe area and right rail | PASS | `scripts/check-layout.ts` checks all 600 frames from the timeline. Words, bots, the lens, the mark and the end card stay inside x 120–936 and y 288–1248. Nothing enters the right rail (x > 936 below y 800). Words stay at least 40 px above the bots. `layout.json` has no violations. |
| Words | PASS | OCR (tesseract) on frames 90, 250, 360, 445 and 570 read "Your AI / looks fine.", "Diablo finds / the cracks.", "Then / fixes them.", "AI that / evolves AI." and "Diablo"; "AI" was read as "Al", the sans-serif I/l confusion. The URL "diablo.si" did not OCR in its crop, but is legible in the stills. At most 4 words on screen. Text is Geist ExtraBold at 108–150 px. |
| Not technical | PASS (by eye) | No charts, numbers, UI or code. The only text is the reel's own lines and the URL. |
| Palette | PASS | White, maroon, night, porcelain and ember. No gold anywhere: the theme's seam colour is white. |
| Loop | PASS | Frames 0 and 597–599 are pure black. The iris opens from black and closes on Diablo's eyes. |
| Sound | PASS | −18.0 LUFS integrated and −2.6 dBTP true peak, measured on the encoded file. Silent from frame 597. `scripts/audio/verify.py` passes. |
| Cuts on the beat | PASS | The colour beats at frames 405, 435, 450 and 465 are beats 27, 29, 30 and 31. Each has a strong transient within ±2 frames (17–107× the median onset strength). |
| Voice cut | SKIPPED | No TTS source is reachable from the build machine (no API keys; the Bing speech and Hugging Face hosts are blocked). See `audio/build/voice-status.json`. `captions.srt` is written. |
| Rendering | Note | The swangle GL backend dropped a 510 px raster tile row on some frames. Rendering now uses SwiftShader, and the full sequence was checked for black bands. |

Not repeated this round: the fresh-reviewer passes (originality and the sound-off read). The bots are unchanged from v1, where reviewers rated their similarity to real AI product icons 4/10 at most.
