# NITRO RUSH (project-oversteer)

A browser 3D kart-racing prototype in the spirit of KartRider: drift to charge
nitro, boost past 7 AI rivals, win the race. Built with **Three.js +
TypeScript + Vite + Rapier physics** — no binary assets required (everything
is procedural by default).

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production bundle (dist/)
```

> Requires Node 16+ (the project pins Vite 4 for Node 16 compatibility).

## Controls

| Key | Action |
| --- | --- |
| `W` | accelerate |
| `S` | brake / reverse |
| `A` / `D` | steer |
| `Shift` | drift (hold while turning) |
| `Ctrl` | fire nitro (when the gauge is full) |
| `R` | reset kart onto the track |

## Gameplay

- **Drift** through corners to build slip angle; the drift score charges the
  **nitro gauge**. Full gauge → `READY!` → `Ctrl` for a 2.6 s boost with FOV
  surge and exhaust flames.
- **Checkpoints** must be crossed in order; laps only count after every gate.
  Race length is selectable: 1 / 3 / 5 laps.
- **8 racers** (you + 7 AI). AI follow the racing line with per-driver skill
  and preferred line offsets, brake for corners, dodge traffic, boost on
  straights, and get a mild rubber-band so the pack stays interesting.
- Karts are **Rapier dynamic bodies** — wall hits, kart-vs-kart bumps and
  off-road grass (low grip, heavy drag) are all physical.

## Asset pipeline

Kart models come from **Kenney Car Kit + Racing Kit (CC0)**. Fetched assets
are not committed; on a fresh clone run the pipeline once (the game falls
back to procedural karts when `public/assets/` is missing):

```bash
npm run assets:download   # fetch CC0 packs into assets/raw/
node -r ts-node/register/transpile-only scripts/optimize-assets.ts --filter "kart-oo|race-future|race\.glb|raceCarWhite"
npm run assets:build      # publish to public/assets/ + manifest.json
```

Each racer's `model` is named in `RACERS` (src/game/config.ts); body
materials are tinted to the racer color at load. Only CC0 / free-commercial
/ redistributable sources are allowed — see [assets/ASSETS.md](assets/ASSETS.md).
Note: `@gltf-transform/cli` needs Node 18+, so on Node 16 the optimize step
copies models through unoptimized (they're tiny).

## Online multiplayer (prototype)

Run the room server somewhere both players can reach:

```bash
npm run server        # ws server on :8787 (PORT env to change)
```

Then open the game with room parameters (first joiner is the host and
starts the race):

```
http://localhost:5173/?room=MYROOM&name=PLAYER1
https://m4y7cl6.github.io/project-oversteer/?room=MYROOM&server=wss://your-host&name=PLAYER1
```

Remote karts are interpolated visuals (no kart-vs-kart collision online);
ranking syncs live. See docs/ROADMAP.md M4 for the sync-model notes.

## Project layout

```
src/
  core/      engine plumbing: Physics (Rapier), Input, AssetManager, ECS-like World
  game/      Game composition root + tuning config
  track/     TrackBuilder (procedural circuit), TrackData, TrackManager (rules)
  vehicle/   Kart (body + handling model), Player/AI controllers
  race/      RaceManager (clock, ranking, rubber-band, respawn)
  camera/    chase camera
  effects/   tire smoke, procedural engine audio
  ui/        HUD, minimap, screens, styles
scripts/     asset pipeline (download / optimize / build)
docs/        architecture & roadmap
```

More detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[docs/ROADMAP.md](docs/ROADMAP.md).
