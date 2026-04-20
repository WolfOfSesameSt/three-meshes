# Fairy Permaculture — Godot 4 port

This is the Godot 4.6 port of the Three.js prototype in
`src/games/fairy-permaculture/`. The design, data, and audio are all
carried over — only the visual / UI / input layer is rewritten native.

## Open in Godot

Point Godot 4.6+ at this folder. The editor should load `project.godot`
and show `scenes/main.tscn` as the main scene.

## What carries over from the JS prototype

| From JS | To Godot |
|---|---|
| `data/*.json` | `data/*.json` (read via `FileAccess` + `JSON.parse_string`) |
| `public/audio/fairy-permaculture/*.mp3` | `audio/*.mp3` (via `AudioStreamPlayer`) |
| `compost/pile.js` state machine | `scripts/pile.gd` — pure logic, 1:1 port |
| `farm/soil.js` | `scripts/soil_field.gd` (future) |
| `core/day-tick.js` | `autoload/scheduler.gd` |
| `fairies/population.js` | `autoload/game.gd` population block |
| `events/event-engine.js` | `scripts/event_engine.gd` (future) |

## What's different (native Godot primitives replace custom code)

| JS pain | Godot primitive |
|---|---|
| Manual raycaster in `ui/interactions.js` | `StaticBody3D` + `input_event` signal per interactable |
| DOM HUD with event-delegation workaround | `Control` nodes with theme resources |
| Isometric camera + WASD + shadow-frustum math | `Camera3D` (orthographic) + `CharacterBody3D` rig |
| WebAudio autoplay dance | `AudioStreamPlayer` autoplay, bus system |
| Manual lerp for fairy movement | `Tween` / `AnimationPlayer` |
| Custom 2-band toon shader with `DataTexture` pitfalls | `toon.gdshader` — Godot's shader language |

## Directory layout

```
scenes/         — .tscn scenes (main, fairy, compost_pile, plant, hud)
scripts/        — .gd scripts attached to scenes
shaders/        — .gdshader files (toon, water, grass-wind)
data/           — JSON game content (same as JS prototype)
audio/          — SFX + music MP3s
ui/             — HUD + panel scenes
autoload/       — global singletons (Scheduler, Game, DataStore, FarmTotals)
addons/         — third-party addons (empty for MVP)
```

## Current status

**First-playable scaffold.** Opening scene loads, HUD shows day/season/fairy
counters, camera pans with WASD, compost pile is clickable.
Simulation systems are being ported chunk-by-chunk — see
`docs/port-status.md`.
