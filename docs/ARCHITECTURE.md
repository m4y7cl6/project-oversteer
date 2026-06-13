# NITRO RUSH — Architecture

## Goals

- Kart-racer *feel* first: stable arcade handling on top of real physics.
- Modular, ECS-like layout: state lives in plain components, behaviour in
  systems/managers — a future netcode layer can serialize component state.
- Zero required binary assets; an optional pipeline upgrades art later.

## Layers

```
main.ts ── boots Rapier WASM, constructs Game
Game (composition root)
 ├─ core/    Physics (fixed 60 Hz Rapier world), Input, AssetManager, World (ECS-like)
 ├─ track/   TrackBuilder → TrackData (samples) → TrackManager (rules)
 │           tracks.ts: definitions + themes (sky/fog/light/ground/props)
 ├─ vehicle/ Kart = RigidBody + handling model + procedural mesh
 │           PlayerController / AIController write KartInput intents
 │           vehicles.ts: vehicle database + upgrades → Kart.perf multipliers
 ├─ race/    RaceManager: clock, checkpoints→laps, ranking, rubber-band
 │           GhostSystem: time-trial best-run recording/playback
 ├─ items/   ItemManager (placement/collection/respawn), ItemDefinition,
 │           ItemEffect (nitro charge, coins) — future pickups slot in here
 ├─ save/    SaveSystem (versioned localStorage), PlayerProfile (career)
 ├─ audio/   AudioManager: music/sfx buses, procedural engine + chiptune BGM,
 │           sample one-shots with synthesized fallbacks
 ├─ replay/  ReplayRecorder / ReplayPlayback (20 Hz all-kart pose capture)
 ├─ editor/  CustomTrack model + validation + CustomTrackStore (foundation)
 ├─ camera/  ChaseCamera (speed/nitro FOV)
 ├─ effects/ SmokeSystem (pooled sprites, drift-tier spark colors)
 └─ ui/      HUD, Minimap, Screens (splash/menu/garage/settings/setup/results)
```

## Game flow & career

Screens is a pure view layer; Game wires its callbacks. The profile
(coins, vehicle/track unlocks, upgrade levels, per-track records, volume
settings) auto-saves through SaveSystem on every mutation. Race rewards =
placement + drift bonus + coins collected; banked on the finish line.

Vehicle stats are multipliers (1.0 = the global KART/NITRO tuning) applied
inside `Kart.fixedUpdate`, so vehicles and upgrades change real physics while
AI karts stay at the defaults.

## Simulation loop

Fixed-timestep accumulator at 60 Hz, render decoupled:

1. Controllers (player input / AI) write **KartInput** intents.
2. Each Kart's handling model reshapes its body velocity (drive, grip, drift),
   then `physics.step()` resolves collisions/gravity for everything.
3. RaceManager advances progress (checkpoints, laps, ranking, events).
4. Render pass interpolates visuals between the last two physics ticks
   (`syncVisual(alpha)`), updates camera/HUD/effects.

## Handling model (the important part)

Karts are dynamic Rapier bodies with yaw-only rotation (X/Z locked; the
visual leans instead). Per tick the model decomposes planar velocity into
forward/lateral components in the kart frame and:

- **Drive**: engine accel tapering to max speed; brake/reverse; rolling and
  off-road drag; soft cap decay after a boost ends.
- **Grip**: lateral speed decays exponentially (`GRIP_NORMAL`); drifting drops
  it to `GRIP_DRIFT`, counter-steering adds recovery grip.
- **Drift**: Shift + steer + speed ⇒ lateral kick breaks traction, steering
  gains `YAW_BOOST`; slip angle accumulates drift score → nitro gauge.
- **Nitro**: full gauge + Ctrl ⇒ timed boost (max speed, accel, kick).

Crucially the model *modifies* the current velocity each tick rather than
overriding the body pose, so collision impulses from walls/karts persist and
feel physical. Vertical velocity is untouched (gravity, kerb bumps).

## Track

A closed centripetal Catmull-Rom spline is sampled into 420 `TrackSample`s
(position, tangent, right vector, signed curvature, arc length). From these:

- road ribbon mesh + start line + barrier ribbons (procedural canvas textures)
- static Rapier colliders: one ground cuboid + segmented barrier cuboids
- **waypoints**: the samples themselves (AI lookahead targets)
- **checkpoints**: 12 evenly spaced sample indices; `TrackManager` enforces
  ordered crossing (CP1→CP2→…), lap counting and finish detection, and
  computes a monotonic ranking score (gates dominate, distance breaks ties).

## AI

Per-tick: closest-sample hint update → steer toward a speed-scaled lookahead
point (offset by the driver's preferred line) → corner speed limit from
`sqrt(latAccel / curvatureAhead)` → avoidance nudges around karts ahead →
stuck-reversal state machine → passive nitro charge, fired on straights.
RaceManager applies a gentle rubber-band multiplier by checkpoint gap.

## Extension points

- **Multiplayer**: KartInput + body transforms are the sync surface; the
  fixed-tick loop is deterministic-friendly.
- **New tracks**: feed different control points to TrackBuilder, or load
  spline data via AssetManager.
- **Real art**: run the asset pipeline, then swap `Kart.buildVisual()` /
  track meshes for glTF nodes from `AssetManager`.
