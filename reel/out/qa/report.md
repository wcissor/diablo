# Diablo intro reel: checks on this cut

This round answers the user's request: "make the ai bots better and how they get hurt too … looks too artificial … don't make really hurt, make it in a cool way". Only the bots and how they are hurt and fixed changed (plus the small fixes reviewers asked for along the way). The rest of the approved cut is untouched.

The stills are in `stills/` and `contact-sheet.png`.

## How the bots were chosen

### Design panel

Four independent designers each built a full bot set with a different "cool, not painful" damage idea:

- **Glitch:** a digital glitch tear.
- **Clean cut:** a clean slice.
- **Sticker bolt:** a sticker-style lightning-bolt chip.
- **Facets:** a geometric facet break.

Three judges scored all four against the old bots: an art director, a brand-and-tone reviewer, and a phone-readability reviewer.

| Concept | Total score (of 210) | Notes |
| --- | --- | --- |
| Sticker bolt | **161** | Ranked first by all three judges, for its damage arc. |
| Clean cut | 138 | Best characters. |
| Glitch | 132 | |
| Facets | 105 | |

### Final bots

The final bots take the clean-cut concept's characters and the sticker-bolt concept's damage, plus the panel's grafts:

- The hit reads as a slash, not a punch.
- One beat of a ">_<" wince, then a double-take, then a sheepish "oops" smile.
- The chips fall and are gone.
- The notch is dark maroon, not black.
- The damage sits on the side of each bot, never as a forehead scar.
- Red appears only as the robot's status light.
- The chip snaps back, then white pours into the notch.
- No four-point star sparkles anywhere.

Three reviewers rejected the first build. After one fix round all three passed it, with totals of 62, 55.5 and 60 out of 70.

### Review of the rendered reel

**Round 1.** Three fresh reviewers each took one lens: the user's request and regressions, frame-level integration, and a sound-off read on a phone.

- Two said ship.
- One blocked: the bubble's and the orb's slash ribbons ran into the cube.

That blocker and the useful notes were fixed:

- **Slashes:** tapered blades that stop short of the neighbouring bot.
- **Wince:** held longer, so it clears the flash.
- **Mood:** sheepish instead of sad.
- **Fix lens:** a second lens tour watches each chip seal.
- **Badges:** bolder white bolts.
- **Glints:** reshaped and moved so they never read as eyes.
- **End card:** a logo shine replaces the horn glints.
- **Cover:** a new composition.

**Round 2.** A verifier found two bugs in those fixes, and both were fixed:

- The blade heads were concave.
- The badge flash stayed put while its bot hopped away.

**Round 3.** The final render was re-verified (see the last section).

## Checks

| Check | Result | What was measured |
| --- | --- | --- |
| File | PASS | `diablo-intro-20s.mp4`: H.264 High yuv420p, 1080×1920, 30 fps, 600 frames, 20.0 s. AAC 48 kHz stereo, faststart. |
| Safe area and right rail | PASS | `scripts/check-layout.ts` checks all 600 frames from the timeline: words, bots (their contract box), the lens, the mark and the end card. Everything stays inside x 120–936 and y 288–1248, nothing enters the right rail, and the words stay at least 40 px above the bots. |
| Words | PASS | OCR on frames 90, 250, 360, 445 and 570 reads every line ("AI" comes back as "Al", the usual I/l confusion in sans-serif type). At most 4 words are on screen at once. |
| Not technical | PASS (by eye) | No charts, numbers, UI or code. No letters or digits on the bots. |
| Tone of the hurt | PASS (reviewers) | A white swipe, a wince, a double-take and a chipped lightning notch. No blood, wounds or red damage. Fixed into a white bolt badge. |
| Palette | PASS | White, maroon, night, porcelain and ember, plus mixes of them (the bots' blush). No gold. |
| Loop | PASS | Frames 0 and 597–599 are pure black. |
| Sound | PASS | −18.0 LUFS integrated, −2.3 dBFS peak on the encoded file. The hits are a digital zap, not a crunch. There is a click as each chip snaps back and a blip for each lens stop. Silent from frame 597. |
| Cuts on the beat | PASS | The colour beats at frames 405, 435, 450 and 465 each land on a transient (16–103× the median onset strength). |
| Rendering | PASS | SwiftShader GL; no dropped tiles in any frame from 10 to 584. |
| Voice cut | SKIPPED | No text-to-speech source is reachable from this machine. `captions.srt` is written. |

## Final verification

Two fresh reviewers looked at this exact render: a frame-level verifier and a sound-off phone viewer. Their verdicts are recorded below.
