# Notes on the final cut

The gates are in `report.md` (11 of 11 pass). Below are the deviations from the
brief, and the polish a fresh creative director still suggested on the final
render, so they can be weighed for a v2.

## Deviations from the brief

- **No voice cut.** No TTS source was reachable from the build machine: no
  ElevenLabs or OpenAI key, and the network policy blocks Bing speech
  (edge-tts) and Hugging Face (piper voices). `scripts/audio/voice.py` tries all
  four in order and records why each failed in `audio/build/voice-status.json`.
  Run `scripts/render.sh` where one of them works and it makes
  `out/diablo-intro-20s-vo.mp4`. `out/captions.srt` is already written.
- **The logo.** `logo.jpg` was not supplied. The mark comes from the app's
  `public/icon.svg`, the vector trace of the same 1254 × 1254 logo, split into
  head and crescent. Its measurements match the brief's crop (594 × 864; eyes
  at (287, 354) and (390, 376)).
- **True peak.** The mix is at −2.7 dBTP rather than −1, because the AAC encode
  adds up to about 1 dB on the strike. The encoded cut measures −2.6 dBTP at
  −18.0 LUFS.
- **Camera.** Gate 3 requires all three bots inside the core safe area in every
  still, which caps the zoom at about 1.08×. The shots vary their framing
  within that: scale from 0.86 to 1.08, horizon height, and how big Diablo
  looms. They cannot get as close as a true close-up.
- **Cracks per bot.** Each bot gets 6 cracks (mains plus forks), not 5–8 per
  claw point. This keeps the seams legible at phone size and matches one chime
  per seam.

## Remaining polish ideas (from the final director review)

- The tail's tap on the cube comes from in front of the stage, against the
  floor. A route from behind Diablo would read as more of a piece with him, but
  it is hidden by his hands and head at the strike.
- The "learns" beat is the weakest with the sound off. One reviewer inferred it
  from the gold on his crescent; the other did not. Making the tail seams match
  the bots' seams one to one, or giving the tail more space, would help.
- The gold seams could be finer and calmer still.
- The hands and tail could be separated more from the head (a lighter rim or
  keyline) so his silhouette never merges.
- Diablo's eye slits are a little wider than the logo's (about 38 px against
  the logo's 28 px). Narrowing them would make him read sharper.
- The first 1.4 s are calm on purpose ("looks fine"), but a reviewer saw too
  little change there. A small idle beat would help the hook.
