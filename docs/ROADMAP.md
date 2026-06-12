# NITRO RUSH — Roadmap

## M0 — Foundation ✅
- [x] Vite + TypeScript + Three.js + Rapier scaffold (Node 16 compatible)
- [x] Fixed-timestep loop, ECS-like world, input, asset manager
- [x] Asset pipeline scripts (download / optimize / build, CC0-only policy)

## M1 — Core driving ✅
- [x] Procedural circuit: spline road, barriers, grass, scenery
- [x] Kart physics on Rapier: accel, brake/reverse, steering, grip, collisions
- [x] Drift system: initiation/hold/exit, slip-angle scoring, tire smoke
- [x] Nitro: drift-charged gauge, boost with FOV surge + flames
- [x] Chase camera, procedural engine audio

## M2 — Racing ✅
- [x] Checkpoint rules (ordered gates), lap counting, 1/3/5 laps
- [x] 7 waypoint-AI rivals: cornering, overtaking nudges, stuck recovery,
      rubber-banding, nitro on straights
- [x] Live ranking, race clock, per-lap + best-lap timing
- [x] HUD (speed/rank/lap/time/nitro/drift), minimap, wrong-way warning
- [x] Start menu, countdown, results screen with live AI finishes

## M3 — Polish (next)
- [x] Kart models from Kenney Car Kit / Racing Kit (CC0) via asset pipeline,
      tinted per racer, with procedural fallback
- [ ] Track scenery from Kenney Racing Kit (flags, barriers, trees, grandstand)
- [ ] Drift mini-boost tiers (blue/orange spark levels, KartRider-style)
- [ ] Item-free time-trial mode with ghost replay
- [ ] Second track + track select; elevation support in TrackBuilder
- [ ] Engine/skid/impact sounds from CC0 packs; music
- [ ] Gamepad support; mobile touch controls
- [ ] Performance pass: instanced scenery, draw-call audit

## M4 — Multiplayer (future)
- [ ] Deterministic tick audit; input-delay rollback prototype
- [ ] WebSocket room server; transform interpolation for remote karts
