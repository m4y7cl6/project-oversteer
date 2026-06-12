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
- [x] Drift mini-boost tiers (blue/orange spark levels, KartRider-style):
      release boost, spark particles, HUD tier colors
- [x] SFX: Kenney CC0 one-shots (impacts, countdown, lap, boosts, finish
      jingle) + procedural engine/skid/nitro noise
- [x] Track scenery from Kenney Racing Kit: start-light gantry, flags,
      banner towers on the big corners, grandstands, light posts, trees,
      apex pylons (all visual; placement derived from track curvature)
- [x] Second track (THUNDER LOOP) + menu track select; tracks defined as
      data (src/track/tracks.ts), full teardown/rebuild on switch
- [x] Time-trial mode with persistent best-run ghost replay (localStorage,
      20 Hz pose recording, translucent kart playback)
- [ ] Elevation support in TrackBuilder (needs road-mesh colliders)
- [x] Background music: procedural chiptune loop (WebAudio sequencer),
      M to toggle
- [x] Mobile touch controls: auto-accelerate, steer/drift/nitro/brake
      buttons, portrait rotate hint, compact HUD (media queries)
- [x] Gamepad support (standard mapping: stick steer, RT/LT, A drift, B/X nitro)
- [ ] Performance pass: instanced scenery, draw-call audit

## M4 — Multiplayer (prototype ✅)
- [x] WebSocket room server (server/server.cjs: join-order host, 8-player
      rooms, JSON relay) — deployable to any Node host, `npm run server`
- [x] Client online mode via `?room=CODE&server=ws://...&name=NAME`:
      host-broadcast race start, 12 Hz kart state sync, remote karts as
      interpolated visuals (150 ms buffer), live cross-client ranking
- [x] Two-browser E2E test (scripts/online-test.cjs)
- Chosen sync model: state sync (not rollback) — remote karts are
  non-colliding visuals, which sidesteps determinism requirements at the
  cost of kart-vs-kart contact online.
- [ ] Next: remote wheel/flame animation, shared results table with peer
      names, kart-vs-kart collision (needs authoritative host or rollback),
      public server deployment
