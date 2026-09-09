# Suspension Lab

Interactive car suspension playground at https://suspension-lab.apps.kibk.net.

Opening the page or pressing Reset spawns the car 35 cm above its settled pose,
so gravity produces a short fall, landing and suspension rebound. Reset clears
driving motion and preserves the selected suspension, surface and quarter speed.

Choose one of four suspension buttons beside the view controls. Grab the car's
actual surfaces: front/rear corners tilt that corner, the ends allow pitch, and
the middle holds the body's pitch and roll while lifting the whole car. Grab any
wheel to lift its physical hub and compress/articulate the suspension. Release
to drop. Drag the body downward to compress the suspension, then release to
watch it rebound. There are no permanent pull dots or Drop button. A subtle outline marks
the hovered area; wheel selection follows its actual position and remains
available through faded bodywork in cutaway view.
The camera follows chassis X/Z while retaining its height, orbit angle and zoom.
The display circle and rim ticks follow X/Z and remain on the ground. Inside it,
a world-aligned grid scrolls opposite actual travel, making forward motion,
reverse, turns and slides visible. Quarter-metre squares and stronger metre lines
remain clipped to the circle. Its position stays continuous when the empty
physics world rebases, and follows pause and quarter speed automatically.
Drag the background to orbit and scroll/pinch to zoom. Keyboard: Tab to a body
area or wheel, hold Shift + Up/Down, then release. Keyboard controls appear only
when focused and retain screen-reader labels. Cutaway, automatic rotation,
pause, quarter speed, sound and reset share the same control dock. The removed
Front and Drive/Park selectors are no longer needed: orbit freely and use the
keyboard or always-visible on-screen arrows to drive.
Each suspension has a ready-to-use setup; there are no tuning sliders.

## Sound

The **Sound** button enables procedural suspension and tyre audio; it starts
muted and creates the audio context only after a click. There is no engine layer.
Each wheel has a separate stereo voice, positioned relative to the orbiting
camera. Damper velocity controls hydraulic flow and quiet bushing movement;
crossing a travel stop produces a short, muted knock. A wheel landing after
airtime produces a rubber/body thump scaled by its downward speed.
The suspension sits quietly beneath the tyre mix: damper and bushing texture
is smoothed and low-passed, and travel-stop taps have short, damped decays without
metallic overtones. Tyre scrub, sliding and landing retain their original tuning.

Loaded tyres produce rolling noise with irregular tread pitches (coarser for
Baja), low-speed scrub and increasing friction noise/squeal under combined slip.
These use the same contact velocity, wheel rotation, load and grip usage as the
tyre physics, including sideways scrub during a stationary drop. Airborne tyres
have no road noise. Wet tyres have more hiss and less squeal; ice is quieter.
These acoustic surface settings are illustrative, not measured datasets.
Rolling sits in the background: its mix gain is reduced to one quarter, the
bright air-pumping component is heavily attenuated, and a 550 Hz low-pass filter
softens the remaining hiss. There is no separate wind track. Suspension and
sliding levels are unaffected by this rolling adjustment. Longitudinal scrub
uses both relative slip and grip usage, so the normal 1–2% slip generated during
ordinary motorway acceleration/braking does not become a loud skid sound.
Lateral scrub, wheelspin and locked-wheel sounds remain active.

Quarter speed stretches the sound with the simulation. Pause, hidden tabs and
mute silence it; resets discard pending impacts. Gain smoothing, a subsonic
filter, output limiting and a stalled-input fade protect against clicks and
stuck noise. Audio observes physics without changing any forces or damping.

`sound-model.js` observes every 240 Hz physics step so a short impact cannot be
missed between rendered frames. `sound-dsp.js` implements seeded noise, filters,
friction resonances and transient envelopes. `sound-worklet.js` runs that DSP
off the rendering thread; `sound.js` handles the user gesture, lifecycle and
camera-relative stereo mix. All code is served locally, without recordings,
microphone access or external requests. This is an experimental procedural
interpretation, not calibrated vehicle acoustics.

Run `node scripts/render-sounds.mjs` to produce repeatable WAV previews and
peak/RMS metrics from actual physics: press/rebound, Baja landings, quarter-speed
landings and dry/wet/ice cornering. Audio tests cover contact gating, impact
transitions, surface response, flat-road silence from the suspension, bounded
samples, panning, reset, stale input and slow-motion decay.

Implementation references: [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet),
[Web Audio playback activation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices),
and [Bridgestone tread pitch terminology](https://origin-prod-cloud.tires.bridgestone.com/en-us/learn/automotive/tire-terminology).

## Suspension designs

- **MacPherson:** hinged lower arms, wheel carriers and pivoting, telescoping struts.
- **Double wishbone:** hinged upper and lower arms with rigid wheel carriers.
- **Solid axle:** rigid beams located by four physical links per axle, including
  triangulated upper links for lateral location. Chassis brackets keep the
  locating links level at nominal ride height to avoid excessive roll steer;
  dark mounting plates distinguish those brackets from the straight links.
- **Baja truck:** wider, longer-travel front wishbones, a four-link live rear
  axle with direct chassis mounts, larger tyres, coilovers and additional bypass
  damping near compression. The rear links retain their original mounting heights
  and travel arcs, without the lowered brackets used by the all-solid layout.

Selecting a design resets the car and reveals the suspension. These are
illustrative mechanisms, not replicas of specific production vehicles. The first
three use the selected layout at both axles. Baja combines independent front
suspension and a live rear axle.

## Physics and limits

`src/physics.js` uses Rapier rigid bodies and joints at 240 Hz. The chassis moves
and rotates in all three dimensions. Actual arm bodies and revolute, spherical,
prismatic and travel-limit joints guide the wheels and locate the axles.
Springs and dampers apply equal-and-opposite forces at their body anchors.
An infinite collision plane provides an exactly vertical road normal at every
heading, preventing false sloped contacts from a large box-shaped ground.
The drawing follows the physical body transforms and linkage endpoints.

The 1,180 kg chassis has explicit rotational inertia. Wheel carriers, arms,
struts and axle beams add mass, giving totals of 1,452 kg (MacPherson), 1,460 kg
(wishbone), 1,540 kg (solid axle) and 1,500 kg (Baja). Suspension tuning differs
between layouts. Gravity settling determines the initial pose.

A kinematic grip follows the vertical pointer target at up to 9.6 m/s (four
times the former limit), with an 80 m/s² acceleration/braking ramp. The joint
solver uses extra iterations while a grip is active. Body grabs can press down
to 0.35 m below the settled body height; wheel targets respect the tyre's ground
clearance. Downward limits use the settled pose, so an airborne pickup can also
be lowered into compression. The grab uses a generic joint whose only locked translation is world vertical.
The hand is the first body, so its fixed reference frame keeps that constraint
vertical even when the car tilts or turns. Horizontal translations remain free;
following the picked anchor keeps coordinates small without applying a braking
force. The middle additionally holds pitch/roll at pickup while allowing yaw,
so steering continues. Front, rear, corner and wheel grabs allow all rotations.
A live axle can articulate and transmit a wheel lift to its other wheel. Releasing removes the grip entirely.
The body has no fixed centre pivot. Solid axles follow the arcs of their four
locating links, so some fore/aft movement during travel is physically expected.

Angular stops keep the independent linkages on their intended assembly branch;
in particular, the Baja lower arms stop before the four-bar can fold and turn
a wheel sideways. Spring damping is approximately 40% lower than the initial
rigid-body release.

Arrow keys start driving: Up accelerates forward, Down brakes and then reverses,
and Left/Right steer. Release to coast with gradual tyre rolling resistance.
Four on-screen arrow controls are always available for touch.
Grabbing the body or a wheel preserves velocity, tyre rotation, throttle and
steering. The car can accelerate, turn, lift and drop during the same gesture;
arrow input can also start driving while a grab is already held. Reset stops
driving and starts the short spawn drop. Quarter speed also slows the driving physics. Speed,
lateral acceleration, grip saturation and the four wheel loads make weight
transfer visible. The empty world rebases periodically for continuous driving.
Ground contact points are captured before a rebase and translated as complete
points, keeping tyre forces at the wheels while solver contacts change frames.

`src/tyres.js` supplies all tangential tyre forces, including while parked or
performing drops. Rapier supplies ground contact and normal impulse; wheel
loads are filtered over 25 ms and become zero when airborne. A transient brush
response resists lateral slip and suspension scrub, with load-sensitive grip,
0.35 m lateral relaxation length, longitudinal slip and a combined-slip friction
circle. An implicit rotational solve integrates wheel inertia and drive torque.
Longitudinal contact torque acts on the free wheel rotor, while drivetrain
reaction torque reaches its suspension carrier. Wheel rotation follows this
physical rolling state; there is no idle spin animation.

Rolling resistance applies a contact-only opposing force at each wheel hub,
`F = -Crr × load × tanh(hubSpeed / 0.2)`. Illustrative coefficients are 0.012
for the road layouts and 0.018 for Baja. It uses the tyre load and wheel heading,
acts in forward and reverse, fades smoothly near rest and becomes zero in the
air. Wheel inertia and traction still determine the rotor response. This adds
no velocity clamp or global damping while driving; aerodynamic drag is omitted.
The low-speed transition prevents resistance from driving the car backwards.
Model reference: [MathWorks rolling resistance](https://www.mathworks.com/help/sdl/ref/rollingresistance.html).

Dry, Wet and Ice use relative grip scales of 1, 0.60 and 0.12. They affect both
cornering and wheel scrub during compression/rebound. The surface selection
survives reset and suspension changes. A 0.75 m drop compresses independent
suspensions farther on ice because lateral scrub meets less resistance; the
fixed-track solid axle shows much less difference.

Front tyres steer with virtual knuckles and Ackermann angles. The drivetrain
uses equal drive torque at all four wheels. These are illustrative parameters,
not fitted to a measured tyre or production vehicle. Rigid contact shapes omit
vertical carcass deformation; camber thrust, self-aligning torque, detailed
steering links and structural flex are also omitted. This is an educational
approximation, not a validated engineering design tool. The former analytical `src/linkage.js` is unused
historical source and is excluded from the browser build.

Tests cover surface picking at different headings, all sixteen wheel/layout
combinations lifting and settling, downward compression/rebound, fast body lifts,
rapid reversals, moving grabs in forward/reverse on every layout, airborne
horizontal momentum during tilted grabs and world rebases, steering and
acceleration while held, the middle surface grip, all four resting layouts,
separate end lifts, corner rotation
and body translation, release and settling, free-fall centre of mass, axle
location, fixed link lengths, Baja geometry, wheel rotation and extreme pulls
on all seven handles, repeated Baja folding regression, visible rebound and
horizontal camera following. Driving tests cover acceleration, coasting losses,
smooth stops in forward and reverse, zero airborne rolling resistance,
braking, reversing, both steering directions, outside-wheel load transfer,
combined-slip saturation, zero airborne traction, world rebasing, high-speed
throttle-release stability, diagonal ground contact at 30–340 km/h (including
30-second 340 km/h coasts), tyre-force positions immediately after recentring, airborne
motion across rebases, input release
and surface-dependent parked drops. Browser and deployment checks are recorded
locally in `evidence/`, which is excluded from Git along with generated assets,
dependencies and credentials. Build from the committed source and lockfile.

## Local development

```
npm ci --ignore-scripts
make check
make serve
```

Open http://localhost:8097. Three.js 0.180.0 and Rapier 0.20.0 are pinned in the
lockfile and copied locally during the build. Rapier's compatibility module
embeds its WebAssembly. There are no external runtime requests, fonts, analytics,
accounts or server-side application state. The car is original procedural
geometry. Dependency licenses are served under `/vendor/THREE-LICENSE.txt` and
`/vendor/RAPIER-LICENSE.txt`.

## Deployment

```
make login
make push
make publish
make verify
make logout
```

These optional deployment commands require an authenticated Hebe checkout
(default `~/hebe`; override with `HEBE_ROOT=/path/to/hebe`), `crane`, and `jq`.
Credentials are supplied by local tooling and are never stored in this project.
Uses the existing Hebe crane build and logged publishing workflow, targeting
only the `suspension-lab` stateless app. The publisher resolves the image tag
to an immutable digest and manages HTTPS ingress. Verification checks health
and compares the served app and dependency modules with local bytes.

References: [Rapier joints](https://rapier.rs/docs/user_guides/javascript/joints/)
and [TSCO Trophy Truck layout](https://tscoracing.com/tsco-trophy-truck/).

Tyre reference: [MathWorks Fiala wheel model](https://www.mathworks.com/help/vdynblks/ref/fialawheel2dof.html).
