# Intro / Title Screen Spec

**Purpose:** Set the tone — *warm, inviting, slightly magical permaculture dream* — before the player ever sees a tile. The main scene currently boots straight into `main.tscn`; this replaces that entry point with `scenes/intro.tscn`.

**`project.godot` change (implementation agent):**
```
run/main_scene="res://scenes/intro.tscn"
```

## Layout

Parchment-backed fullscreen Control. Viewport 1600×900 design target; stretch mode `canvas_items` / aspect `expand` (already configured).

```
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║                  ~ fairy silhouette drifts ~                   ║
║                                                                ║
║                                                                ║
║                 ╭──────────────────────────╮                   ║
║                 │                          │                   ║
║                 │     Fairy Permaculture   │  ← serif title    ║
║                 │                          │                   ║
║                 │   ~ small tagline line ~ │                   ║
║                 ╰──────────────────────────╯                   ║
║                                                                ║
║                     [  New Farm   ]                            ║
║                     [  Load Farm  ]                            ║
║                     [  Settings   ]                            ║
║                     [  Lab        ]                            ║
║                     [  Credits    ]                            ║
║                                                                ║
║                                                                ║
║  ~ fairy silhouette drifts ~                                   ║
║                                                                ║
║  v0.x.y                                        build hash      ║
╚════════════════════════════════════════════════════════════════╝
```

Centered column, top/bottom thirds have slow-drifting fairy silhouettes. Soft vignette darkens the corners.

## Art direction

- **Background:** a parchment texture (reuse `ui/parchment.png` style) with a subtle forest-edge silhouette at the bottom 30 % — conifer spires, hint of meadow. All inks `Palette.COMPOST`, all washes through `Palette.clamp_happy()`.
- **Title text:** "Fairy Permaculture" in a warm serif (Cormorant Garamond, 96 pt), color `Palette.INK`, with a 1-px `Palette.HONEY` drop-offset for inked warmth. No hard shadow.
- **Tagline:** "A disembodied fairy tends a Pacific coastal farm." 24 pt italic, `Palette.EARTH`.
- **Vignette:** radial dark-edge, tint `Palette.COMPOST` (warm), never black. Opacity 0.25 at corners, 0 at center.
- **Fairy silhouettes:** 4–6 tiny fairies (~12 px), AnimatedSprite2D loop (wings flap 6 fps), drifting left-to-right then looping with a 0.2 Hz sinusoidal vertical bob. Color `Palette.HONEY` at 0.4 alpha for a soft bokeh read.
- **Button style:** parchment-scroll shape, 3 px ink border, hover fills `Palette.SAGE` at 0.2 alpha. Click plays `hover-tick.mp3` then a paper-flip whoosh on transition.
- **Saturation floor:** as always, LUT clamps via `Palette.clamp_happy()`. No greys.

## Buttons

### New Farm
Opens a slide-down biome picker:

- **British Columbia Coastal** (shipped) — full art card, stats (days/year 120, default seed 42), "Start" button.
- **Boreal Forest** (future) — grayed card reading "Coming in Content Pack 2", tooltip explains.
- **Tropical Lowland** (future) — grayed.
- **Inland Prairie** (future) — grayed.

Below the biome cards:
- `[Seed: ____]` text field (optional; blank = random). "Challenge seed" button rolls a curated seed from `data/challenge_seeds.json`.
- `[Fairy name: ____]` — player names their first fairy. Default rotates through 10 BC-themed names (Salal, Juno, Pip, Meadowlark, Thistle, etc.).
- `[Start]` button → fade to parchment + scrolling intro text (see below) → load `main.tscn`.

**Scrolling intro text** (3 s fade-in, 15 s scroll, click to skip):
> _A century ago, the people left this valley. The forest crept back to the edges. The fences fell. Only the ruined homestead remembers that food once grew here._
>
> _You are the fairy who watched it all. Today, with a few small hands and a lot of patience, you'll invite the land back to life._

Audio during intro text: `music-dawn-piano.mp3` fades in at -12 dB. (Generate via `npm run music` if the asset is missing — 30 s soft solo-piano loop, C-major, warm upright-piano timbre.)

### Load Farm
Opens a list Control reading from `SaveSystem.list_saves()`. Each slot:
- **Slot N** — farm name (or "Unnamed Farm")
- Metadata line: "Day 47 / Season: Summer / Year 2 / Biome: BC Coastal / Fairies: 14 / Vitality: 0.42"
- Small thumbnail (auto-captured on save — 256×144 rendered frame of the main camera).
- `[Load]` `[Rename]` `[Delete]` (delete double-confirms with parchment warning).

Empty state: "No farms yet. Plant your first one." with a `[New Farm]` shortcut.

### Settings
Reuses `scenes/settings_panel.tscn` (already exists). Tabs: Graphics / Audio / Controls / Accessibility. Add "Back" → returns to intro.

### Lab
Direct link to the dev lab scene (`scenes/lab.tscn`). Unlocked always (this is a sandbox build); in a ship build it hides behind a `--dev` CLI flag or `OS.has_feature("editor")`.

### Credits
Parchment scroll with soft auto-scroll; lists design, code, sound, research sources (Savory Institute, Sepp Holzer, Bill Mollison, BC Indigenous plant lore consultants — see `CREDITS.md`). "Back" and "Skip to bottom" buttons.

## Ambient audio

- **Loop 1:** `music/music-dawn-piano.mp3` — slow solo piano, warm, C-major, ≤ -12 dB.
- **Loop 2:** `ambient/wind-forest-loop.mp3` — quiet wind + very faint distant bird (chickadee, varied thrush). -24 dB.
- **One-shot ambience (random 20–60 s):** a single fairy-chime, distant cow, or sheep bleat at -20 dB. Keeps the screen alive without distracting.
- **Button hover:** `hover-tick.mp3` at -18 dB (already exists).
- **Button click:** paper-flip whoosh; generate if missing.

All music fades out over 1.5 s when "Start" is clicked.

## Scene structure

```
intro.tscn
├── CanvasLayer
│   ├── ColorRect (parchment bg)
│   ├── TextureRect (forest-silhouette bottom strip)
│   ├── Control (title block)
│   │   ├── Label "Fairy Permaculture"
│   │   └── Label (tagline, italic)
│   ├── VBoxContainer (buttons)
│   │   ├── Button "New Farm"
│   │   ├── Button "Load Farm"
│   │   ├── Button "Settings"
│   │   ├── Button "Lab"
│   │   └── Button "Credits"
│   ├── Node2D (fairy silhouette field — 6 AnimatedSprite2D)
│   └── ColorRect (vignette overlay, shader or gradient)
└── AudioStreamPlayer × 2 (music, ambient)
```

## Script sketch (`scripts/intro.gd`)

```gdscript
extends Control

@onready var music: AudioStreamPlayer = $AudioStreamPlayer
@onready var ambient: AudioStreamPlayer = $AmbientPlayer

func _ready() -> void:
    GameLog.info("intro scene entered", "flow")
    music.stream = load("res://audio/music-dawn-piano.mp3")
    music.volume_db = -12.0
    music.play()
    ambient.stream = load("res://audio/ambient/wind-forest-loop.mp3")
    ambient.volume_db = -24.0
    ambient.play()

func _on_new_farm_pressed() -> void:
    AudioManager.play("ui-whoosh", -12.0)
    _show_biome_picker()

func _on_load_farm_pressed() -> void:
    _show_save_browser()

func _start_run(biome_id: String, seed_val: int, fairy_name: String) -> void:
    Game.pending_new_run = { "biome": biome_id, "seed": seed_val, "starter_fairy": fairy_name }
    _fade_to_scene("res://scenes/main.tscn")
```

## Transition

On "Start", parchment overlay fades in over 0.8 s while music fades out. Intro narration scrolls during the fade-hold, then `get_tree().change_scene_to_file("res://scenes/main.tscn")`. `Game` autoload reads `pending_new_run` and seeds the world accordingly.

## DESIGN-CHECK

- Palette: `PARCHMENT`, `INK`, `EARTH`, `COMPOST`, `HONEY`, `SAGE` — all from canonical list.
- No raw `Color()` calls.
- No black, no grey, no cold-blue cast.
- Paired feedback: every button = visual (hover fill) + audio (tick).
- Saturation clamped via `Palette.clamp_happy()`.

Sources consulted: `DESIGN.md §Art Direction`, feedback_happy_palette_mandatory.md, `scenes/settings_panel.tscn`, `scenes/lab.tscn`, `CREDITS.md`, `project.godot`.
