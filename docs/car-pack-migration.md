# Passenger car pack migration

## Status

The requested source is **Generic passenger car pack** by **Comrade1280**:
https://sketchfab.com/3d-models/generic-passenger-car-pack-20f9af9b8a404d5cb022ac6fe87f21f5

The model page lists **CC BY 4.0**:
https://creativecommons.org/licenses/by/4.0/

Source and licence were checked on 2026-09-09. The user supplied all three
original formats, now retained under `assets/source` with SHA-256 checksums.
The processor generates ten separate GLBs plus measured geometry metadata.
The application uses those assets and the mechanisms below. Validation and
publishing evidence is retained locally under `evidence/`.

## Vehicle inventory and intended mechanisms

These are fictional designs. The layouts below are class-appropriate
mechanisms, not claims about the artist's original engineering or replicas of
specific production cars. Dimensions and available wheel travel were determined from the source meshes.

| Pack model | Front | Rear | Intended character |
| --- | --- | --- | --- |
| Compact | MacPherson | Torsion beam | Light, narrow, modest tyres and travel |
| Hatchback | MacPherson | Torsion beam | Everyday small car with more compliance |
| Sedan | MacPherson | Independent multi-link | Balanced road handling |
| Wagon | MacPherson | Independent multi-link | Softer ride with greater rear load capacity |
| Coupe | MacPherson | Independent multi-link | Firmer road setup, rear drive |
| Sport | Double wishbone | Independent multi-link | Low body and short travel |
| Minivan | MacPherson | Torsion beam | Higher mass and comfort-oriented rates |
| SUV | Double wishbone | Independent multi-link | Greater clearance and four-wheel drive |
| Pickup | Double wishbone | Leaf-sprung live axle | Load-carrying rear suspension |
| Offroad | Linked live axle | Linked live axle | Axle articulation and increased travel |

Architecture references:

- Toyota's Yaris documentation describes MacPherson struts and a torsion beam,
  including the integrated rear roll coupling:
  https://newsroom.toyota.eu/the-all-new-toyota-yaris/
- Mazda's technical review shows double-wishbone front and multi-link rear
  suspension in the third-generation MX-5:
  https://www.mazda.com/content/dam/mazda/corporate/mazda-com/en/pdf/innovation/monozukuri/technology/tech-review/2006/giho_all2006.pdf

## Processing and acceptance

1. Inspect the archive and retain the original licence/credits. Record its hash.
   Prefer original separate parts; do not extract assets from the web viewer.
2. Inspect each car's transforms, material assignments, wheel parts and pivots.
   Preserve the artist's proportions and textures. Establish metres, forward
   axis and wheel centres before splitting each model into its own asset.
3. Measure body and tyre geometry. Distinguish body sill, underfloor/skid plate,
   differential and axle clearance. Fit collision shapes to the underside.
4. Build suspension around the actual hub locations. Check the full wheel
   envelope through compression, droop, articulation and steering. Mount springs,
   arms and dampers to credible structural members below their wheel housings.
5. Model mechanical differences explicitly: subframes, uprights, ball joints,
   bushings, spring seats, bump stops, anti-roll links, brake discs/calipers and
   driven half-shafts where appropriate. Visible moving endpoints must follow
   the mechanism rather than unrelated animation. Leaf/beam flexibility must
   be identified as an approximation if not physically resolved.
6. Retain direct surface/wheel dragging, downward compression, moving grabs,
   camera and road following, spawn drop, quarter speed and the quiet audio mix.
   Body and glass fade in cutaway; mechanical components remain legible.
7. Validate every car's settled pose, full travel, wheel/body fit, drops, grabs,
   steering and terrain behaviour. Re-run high-speed flat-road stability checks
   so the earlier invisible-bump and folding-linkage bugs do not return.
8. Serve processed assets locally. Add visible model attribution and ship the
   licence, author/source links and adaptation notice. Review and scan the Git
   changes before pushing; verify the published files against the local build.
