# Asset policy

Only assets meeting **all** of these conditions may enter this repository or
its pipeline:

1. **CC0** (preferred) or an explicit free-for-commercial-use license
2. Redistribution allowed (we commit processed copies)
3. Source + license recorded in a `LICENSE.txt` next to the files

## Approved sources

- [Kenney](https://kenney.nl) — CC0
- [Poly Pizza](https://poly.pizza) — filter to CC0
- [KayKit](https://kaylousberg.com/game-assets) — CC0
- [OpenGameArt](https://opengameart.org) — filter to CC0
- [Pixabay](https://pixabay.com) — Pixabay license (free commercial use)

## Folders

```
assets/raw/        downloaded packs (gitignore-able, re-fetchable)
assets/processed/  optimized glTF/textures (Draco, webp)
public/assets/     published runtime files + manifest.json
```

The game currently uses **procedural assets only**; this pipeline exists for
the M3 art upgrade.
