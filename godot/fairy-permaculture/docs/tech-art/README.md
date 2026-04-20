# Tech-Art Library — Fairy Permaculture

Ship-target: **Godot 4.x on the GL Compatibility renderer.** Style-target: soft, warm, Ghibli-lite permaculture with a 7-branch food-chain world. This library exists because we kept shipping depressing broken visuals. Consult before touching shaders, terrain, lighting, or environment.

## If you're touching X, read Y first

| Task | Read first |
|---|---|
| Writing or editing any `.gdshader` | [godot-gl-compat-gotchas.md](godot-gl-compat-gotchas.md) — ALWAYS |
| Building ponds, streams, rivers | [water-shaders.md](water-shaders.md) + gotchas |
| Adding cel/toon look to a new mesh | [toon-shading.md](toon-shading.md) + gotchas |
| Editing `world_state.gd::_apply()` (time-of-day) | [stylized-lighting.md](stylized-lighting.md) + [color-grading-time-of-day.md](color-grading-time-of-day.md) |
| Building or editing biome terrain | [procedural-terrain.md](procedural-terrain.md) |
| Adding particles, fog, wind, ambience | [environmental-feel.md](environmental-feel.md) |
| Closing out a feature PR | [polish-checklist.md](polish-checklist.md) |
| Looking for a paper or tutorial | [references.md](references.md) |

## Files

- [godot-gl-compat-gotchas.md](godot-gl-compat-gotchas.md) — Bugs, footguns, workarounds of the Compatibility renderer.
- [procedural-terrain.md](procedural-terrain.md) — Noise, chunks, heightmaps, erosion.
- [stylized-lighting.md](stylized-lighting.md) — Warm-key / cool-fill, cel ramps, blue shadows.
- [water-shaders.md](water-shaders.md) — Stylized ponds, foam, refraction.
- [toon-shading.md](toon-shading.md) — Cel bands, rim, stepped specular.
- [color-grading-time-of-day.md](color-grading-time-of-day.md) — Dawn→night palette curves, LUTs.
- [environmental-feel.md](environmental-feel.md) — Fog, particles, ambient audio cross-links.
- [polish-checklist.md](polish-checklist.md) — "Is this visual done?" gate.
- [references.md](references.md) — Annotated external sources.

## Hard rules for this project

- **No post-process outlines.** Silhouette legibility comes from rim light + value contrast (see toon-shading).
- **No black shadows.** Shadow tint is always blue-cool or warm-violet, never `#000`. (see stylized-lighting).
- **No silent successes.** Every action pairs visual + audio feedback. (see polish-checklist).
- **No `ALPHA` writes in opaque shaders.** (see gotchas — this was the bug that killed a day).
- **Palette compliance.** All hardcoded colors must map to entries in `autoload/palette.gd`. If a color isn't there, add it there first.
