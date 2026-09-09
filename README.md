# Suspension Lab

A suspension playground at https://suspension-lab.apps.kibk.net.

Ten consistently styled cars use **Generic passenger car pack** by **Comrade1280**
under **CC BY 4.0**. Bodywork, glass, lights, textures and individual wheel designs
are preserved. Each car has a suspension fitted to its measured wheel positions
and available wheel-arch space. Baja is no longer in the vehicle carousel.

## Explore

Use the carousel arrows to change cars and Flat / Gravel / Rough trail to change
the physical road. Drag the body or a wheel up, or push the body down and release
to watch it bounce. Corners tilt the car; grabbing the middle holds pitch and roll
while lifting. Driving continues during a grab. Drag the background to orbit,
and scroll/pinch to zoom. The camera and display circle follow horizontal motion
without following vertical falls. The grid scrolls with actual ground travel.

Arrow keys accelerate, brake/reverse and steer; on-screen arrows support touch.
Releasing the keys allows tyre rolling resistance to slow the car. Reset and
initial loading start a 70 cm drop. Cutaway, orbit, pause, quarter speed and sound
remain in the compact control dock. Sound starts muted, with no engine layer.
Keyboard lifting: Tab to a body zone/wheel, hold Shift + Up/Down, then release.

## Cars and mechanisms

| Car | Front | Rear | Drive |
| --- | --- | --- | --- |
| City compact | MacPherson | Torsion beam | Front |
| Hatchback | MacPherson | Torsion beam | Front |
| Sedan | MacPherson | Five-link independent | Rear |
| Family wagon | MacPherson | Five-link independent | Front |
| Grand touring coupe | MacPherson | Five-link independent | Rear |
| Sports car | Double wishbone | Five-link independent | Rear |
| Family minivan | MacPherson | Torsion beam | Front |
| SUV | Double wishbone | Five-link independent | All |
| Pickup | Double wishbone | Leaf-sprung live axle | Rear |
| Off-road 4×4 | Four-link live axle | Four-link live axle | All |

`src/setups.js` contains representative masses, wheel rates, dampers, anti-roll
coupling, centre-of-mass heights and drivetrains. `src/car-dimensions.js` is
measured from the imported meshes. The sports car retains its larger rear tyres;
collision shapes, wheel inertia inputs, rotation and tyre forces use each wheel's
own radius and width. Small explicit ride-height adjustments of 20–35 mm remain;
the suspension can now compress into recessed inner wheelhouses, rather than
stopping at the visible tyre-to-arch gap.

These are fictional designs with class-appropriate suspension, not calibrated
replicas of production vehicles. Mechanisms follow real architectural patterns:
[Toyota struts and torsion beams](https://newsroom.toyota.eu/the-all-new-toyota-yaris/)
and [Mazda double-wishbone/five-link architecture](https://www.mazda.com/content/dam/mazda/corporate/mazda-com/en/pdf/innovation/monozukuri/technology/tech-review/2006/giho_all2006.pdf).

The cutaway adds structural rails/subframes, uprights, ball joints, bushes,
spring seats, bump stops, brake discs and calipers, anti-roll links and driven
half-shafts with CV boots. Coil and damper endpoints follow physical anchors;
five-link rear suspensions have five actual locating links per wheel.

### Mounting-point review

`src/suspension-mounts.js` gives each body its own front/rear shock heights and
insets. Bonnet and rear body surfaces were sampled from the actual GLBs; the
geometry regression checks all forty top mounts against those surfaces. Heights
below are in the original mesh frame, before its 20–35 mm ride adjustment.

| Car | Front shock top | Rear shock top | Packaging choice |
| --- | ---: | ---: | --- |
| City compact | 840 mm | 880 mm | Inboard front strut towers; low rear coils on trailing-arm pans |
| Hatchback | 930 mm | 1,010 mm | Bonnet-height front bearings; separate wheelhouse rear shocks |
| Sedan | 905 mm | 970 mm | Front inner-wing towers; rear coils on lower links, separate shocks |
| Family wagon | 910 mm | 970 mm | Front towers below bonnet; rear mounts below the cargo-side bodywork |
| Grand touring coupe | 860 mm | 830 mm | Lower front towers and rear mounts below the low rear deck |
| Sports car | 690 mm | 760 mm | Compact coilovers between lower arms and the low body decks |
| Family minivan | 1,140 mm | 1,070 mm | Tall front struts; rear shocks beside the cabin and separate low coils |
| SUV | 1,200 mm | 1,200 mm | Tall front coilover brackets; independent rear coil pans and shocks |
| Pickup | 1,200 mm | 900 mm | Front coilovers; staggered rear shocks to frame brackets below the bed |
| Off-road 4×4 | 1,100 mm | 1,100 mm | Separate tall coil seats and shocks on both live axles |

The top plates, cups, fasteners and supporting braces follow these physical
anchors. Uprights and shock lower eyes sit inboard of the tyres. MacPherson
coils occupy the upper part of the strut, above a lower spring perch; separate
rear coils sit on actual trailing/control-arm attachments. Separate shocks apply
damping forces at their own mounts, including the inclined pickup rear shocks.
Spring and damping rates account for nominal arm leverage and inclination.
This follows the architectural distinction described by
[KYB](https://www.kyb.com/resource/faqs/whats-the-difference-between-shocks-and-struts/)
and the body-to-knuckle strut mounting described by
[Monroe](https://www.monroe.com/sr-rs/support/technical-tips/lv/mounting-kits-protection-kits/value-and-importance-mounting-kits.html).
These are packaging estimates for the fictional meshes, not measured OEM points
or a complete structural design of their inner body panels.

Paint and wheel textures use a locally generated studio reflection environment.
Softer metallic response and balanced fill lighting keep shaded doors, wheel
spokes and trim readable as the view rotates, without external HDR image assets.

### Front and rear travel

`src/vehicle-travel.js` sets separate compression and droop for both axles.
The readout uses the corresponding axle's total stroke. `src/wheel-wells.js`
recesses and subdivides inward-facing arch surfaces at load time, retaining the
outer fender lips and upper exterior panels. This makes space for the tyres to
tuck up and for the inward movement from camber gain. The original downloads
and processed GLB files remain unchanged.

| Car | Front bump / droop | Rear bump / droop |
| --- | ---: | ---: |
| City compact | 80 / 100 mm | 80 / 110 mm |
| Hatchback | 110 / 110 mm | 120 / 115 mm |
| Sedan | 100 / 100 mm | 115 / 110 mm |
| Family wagon | 105 / 110 mm | 120 / 120 mm |
| Grand touring coupe | 75 / 75 mm | 85 / 90 mm |
| Sports car | 45 / 50 mm | 55 / 60 mm |
| Family minivan | 115 / 120 mm | 105 / 130 mm |
| SUV | 180 / 150 mm | 195 / 160 mm |
| Pickup | 180 / 150 mm | 170 / 180 mm |
| Off-road 4×4 | 170 / 180 mm | 130 / 190 mm |

Tests check upper tyre vertex paths from settled ride height to full compression
at all forty wheels, shock/tyre clearance at compression and droop, and retention
of the original upper exterior panels. This is a geometric packaging check of
representative suspension, not a validated production-vehicle clearance study.

Pickup leaf springs use two effective half-leaves and a swinging rear shackle
on each side. Vertical spring forces approximate distributed leaf bending;
constraints approximate the packs' lateral shear and wind-up stiffness. Layered
leaves follow the guide endpoints. This is a lumped flexible-leaf approximation,
not a finite-element spring pack. Rear torsion beams similarly use physical
trailing arms with elastic roll coupling rather than distributed beam torsion.
Steering uses virtual knuckles and Ackermann angles, with visible tie rods.

## Imported sources and processing

All three user-provided downloads are retained unchanged under `assets/source`:
original FBX/textures ZIP, glTF/textures/licence ZIP and GLB. SHA-256 checksums
record those originals. No source archive is copied into the website build.

```sh
node scripts/process-car-pack.mjs assets/source/sketchfab.glb
```

The processor splits the scene into ten GLBs, removes the presentation platform,
bakes transforms into metres/Y-up, corrects the coupe's internal rotation,
centres wheel pivots on tyre geometry and preserves material/texture assignments.
`assets/cars/manifest.json` records measured dimensions, wheel positions, arch
clearance, triangle counts, source attribution and the input hash. The same
measurements generate `src/car-dimensions.js`.

The browser loads one car at a time and retains at most three decoded models.
Everything is served locally; there are no external runtime model requests.
Attribution, licence links and an adaptation notice appear in How it works and
`assets/cars/LICENSE.txt`. Original asset source:
https://sketchfab.com/3d-models/generic-passenger-car-pack-20f9af9b8a404d5cb022ac6fe87f21f5

## Physics, terrain and sound

Rapier rigid bodies and joints run at 240 Hz. Springs/dampers apply equal and
opposite forces at physical attachment points; per-wheel bump/droop constraints
prevent mechanisms folding through the body. Static settling establishes each
car's rest pose. Chassis collision height is aligned with the visible underside.
The former four standalone layouts remain only as historical regression fixtures.

Flat uses an infinite collision plane. Gravel and Rough trail use streamed
12 m heightfield tiles with 25 cm samples and matching rendered geometry.
Shared edge samples and Rapier internal-edge correction prevent false seams.
Contact-force events recover solved tyre loads on heightfields. Ground contact
points remain consistent during periodic horizontal world rebases.

Tyres use a transient brush response, longitudinal slip, load-sensitive grip,
a combined-slip friction circle and wheel inertia. Tyre friction remains active
during parked drops, resisting sideways scrub as the suspension moves. Rolling
resistance depends on contact load and fades smoothly near rest. Airborne tyres
have no road forces. Aerodynamic drag, carcass deformation, camber thrust,
self-aligning torque, loose stones and deformable soil are omitted.

Quiet procedural sound follows contact load, slip, damper speed and impacts.
Suspension noise stays below tyre sounds, rolling hiss is heavily attenuated,
and there is no engine or wind track. Quarter speed stretches the audio with
physics. Mute, pause and hidden tabs silence it. This is an educational simulation
with illustrative physical and acoustic parameters, not an engineering tool.

## Development and verification

```sh
npm ci --ignore-scripts
make check
make serve
```

Open http://localhost:8097. Three.js 0.180.0 and Rapier 0.20.0 are pinned and
copied locally. `make check` builds and runs geometry, picking, physics, driving,
grabbing, tyre, terrain and audio regressions. Tests exercise every imported car
through hard drops, fast downward presses and diagonal 340 km/h coasting,
including the earlier axle-folding and invisible-bump regressions.
Local browser/deployment evidence is ignored under `evidence/`.

## Deployment

```sh
make login
make push
make publish
make verify
make logout
```

Uses the existing Hebe stateless-app publisher, an immutable image digest and
HTTPS at suspension-lab.apps.kibk.net. Credentials come from local tooling and
are never stored here. `make verify` compares all served code, dependencies,
licences and processed car assets against local bytes and checks `/healthz`.
The private GitHub repository includes source downloads, processed assets,
source code and reproducible build/processing scripts.
