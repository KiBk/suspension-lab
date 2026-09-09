# Suspension Lab audio credits

Combustion and driving-skid sounds use the recordings listed below. All samples
are bundled locally; the app never streams from these services. The suspension,
landing, rolling and electric motor layers remain procedural.

## Engine recordings — Creative Commons Zero 1.0

- **GiocoSound**, BMW 120d exterior recordings: [Idle](https://freesound.org/people/GiocoSound/sounds/401552/), [Low RPM](https://freesound.org/people/GiocoSound/sounds/401556/), [Medium RPM](https://freesound.org/people/GiocoSound/sounds/401555/), [High RPM](https://freesound.org/people/GiocoSound/sounds/401551/).
- **TheLittleCrow**, [Car Engine Contact Recording—Mini Cooper S 2019, Gunning it](https://freesound.org/people/TheLittleCrow/sounds/669622/).
- **overmedium**, [v8 engine rev.wav](https://freesound.org/people/overmedium/sounds/651534/).
- **mmplisskin**, [Porsche.MP3](https://freesound.org/people/mmplisskin/sounds/90404/).

Each source page specifies [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
The retained source files are the publicly downloadable high-quality MP3 previews,
not lossless originals. Source URLs, exact download URLs and SHA-256 hashes are
recorded in `assets/source/audio/sources.json` in the repository.

## Tyre recording — Creative Commons Attribution 3.0

**Tom Haigh (audible-edge)** recorded [Chrysler LHS tire squeal 04](https://freesound.org/people/audible-edge/sounds/71739/).
**qubodup** edited it into [Car tire squeal skid loop](https://opengameart.org/content/car-tire-squeal-skid-loop),
licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
The original Freesound recording now lists CC0; we retain the attribution licence
of the specific OpenGameArt loop used here. No endorsement is implied.

## Adaptation

Suspension Lab trimmed the recordings, combined channels to mono, removed low
rumble, attenuated high frequencies, stabilized pitch in selected engine segments,
crossfaded loop boundaries and normalized levels. The tyre loop has an additional
upper-midrange cut. Output is 24 kHz, 16-bit PCM WAV. Playback follows simulated
RPM/load or tyre contact/slip, with restrained levels and RPM crossfades.

The car bodies and powertrains are fictional: these are representative sound
families, not recordings of each model's exact engine. RPM anchors are approximate
sound-design mappings, not measured source RPM. Engines share source families;
the electric sedan keeps its quiet synthesized motor and has no idle sound.
The sources include short clips, so the highest revs use pitch shifting.

`manifest.json` records source segments and output hashes. Rebuild with
`scripts/prepare-audio.py` (Python + NumPy and ffmpeg). Original source files stay
in the repository; only processed loops and these credits ship with the app.
