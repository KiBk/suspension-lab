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
own radius and width. Compression travel respects the mesh's arch clearance,
with small explicit ride-height adjustments of 20–35 mm.

These are fictional designs with class-appropriate suspension, not calibrated
replicas of production vehicles. Mechanisms follow real architectural patterns:
[Toyota struts and torsion beams](https://newsroom.toyota.eu/the-all-new-toyota-yaris/)
and [Mazda double-wishbone/five-link architecture](https://www.mazda.com/content/dam/mazda/corporate/mazda-com/en/pdf/innovation/monozukuri/technology/tech-review/2006/giho_all2006.pdf).

The cutaway adds structural rails/subframes, uprights, ball joints, bushes,
spring seats, bump stops, brake discs and calipers, anti-roll links and driven
half-shafts with CV boots. Coil and damper endpoints follow physical anchors;
five-link rear suspensions have five actual locating links per wheel.

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
