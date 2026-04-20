# Polish Checklist — "Is This Visual Done?"

Run this before opening a PR on anything visual. Copy the checklist into the PR description. If you can't tick a box, explain why in the PR.

Cross-ref: `feedback_game_feedback_philosophy.md` (no silent successes), `feedback_visual_quality.md` (running anti-pattern log).

## Pre-merge gate

### Interaction feedback
- [ ] **Hover state** — mouse-over or controller-focus produces a visible change (outline, tint, scale, hover ring) within 1 frame.
- [ ] **Select state** — picking an object gives a distinct visual from hover (sustained, not flash).
- [ ] **Action feedback** — every player action (plant, water, collect, assign) pairs a **visual** + **audio** cue. No silent successes.
- [ ] **Failure feedback** — invalid actions shake/flash/buzz; the player knows why it didn't work.

### Animation
- [ ] **No instant state changes** for anything the camera can see. Everything tweens ≥ 0.15 s.
- [ ] **Tweens ease** (at least `EASE_OUT`, ideally `TRANS_CUBIC` + `EASE_IN_OUT`). Linear = robotic.
- [ ] **Numbers/counters count up**, don't snap.
- [ ] **Spawns and despawns fade/scale**, don't pop.
- [ ] **Idle states breathe** — no frozen poses on characters that the player looks at for >3 s.

### Palette compliance
- [ ] **Every color referenced from `autoload/palette.gd`**, not hardcoded in shader/GDScript/inspector.
- [ ] **New palette entries named** with intent (`shadow_day_cool`, not `color_27`).
- [ ] **No saturated primaries** unless the asset is a UI accent or a pure fantasy element (fairy glow). Ground truth colors are muted.
- [ ] **Shader has NO `source_color` default** providing the actual shipping value — defaults may be zeroed on Compat; push from GDScript instead.

### Lighting correctness (see [stylized-lighting.md](stylized-lighting.md))
- [ ] **Shadow side tints blue-cool or violet**, never pure black.
- [ ] **Rim light is gated to the lit side only**.
- [ ] **Value range of any frame ~0.4–0.95** — no pure black, no blown whites. Take a screenshot and check the histogram.
- [ ] **Single directional sun** — no extra directional lights stacked.
- [ ] **Ambient light energy ≥ 0.6 during day**, ≥ 0.3 at night.

### Time-of-day coverage (see [color-grading-time-of-day.md](color-grading-time-of-day.md))
- [ ] Tested at all six phases: deep-night, dawn, morning, noon, afternoon, dusk.
- [ ] No phase has unreadable contrast (too dark, too washed).
- [ ] Shader uniforms that track TOD actually update (sun color, shadow tint, sun dir).

### Vitality-LUT endpoints
- [ ] Verified at `vitality = 0.0` (dying farm, muted desaturated palette).
- [ ] Verified at `vitality = 0.5` (neutral).
- [ ] Verified at `vitality = 1.0` (thriving, saturated/vibrant palette).
- [ ] No vitality value produces broken shader output (black, magenta, over-saturation).

### Shader robustness (see [godot-gl-compat-gotchas.md](godot-gl-compat-gotchas.md))
- [ ] Tested in **GL Compatibility renderer** (our ship target), not just Forward+.
- [ ] Tested in **editor** AND **running build** (shadows can differ on Compat).
- [ ] Tested via **headless render** if the asset affects procgen output.
- [ ] **`NORMAL` is `normalize()`'d** before any dot product.
- [ ] **`ALPHA` is NOT written** unless the material is genuinely transparent.
- [ ] `render_mode` contains `blend_mix` XOR `depth_draw_opaque`, never both.
- [ ] **No black/magenta fallbacks** visible anywhere on screen (magenta = Godot's "shader compile failed" color).

### Audio pairing (see [environmental-feel.md](environmental-feel.md))
- [ ] **Paired SFX cue** exists for every new action verb.
- [ ] **SFX exists in `audio/`** — not a placeholder. Generate via `npm run sfx` if missing.
- [ ] **3D audio attenuation** set on world-positioned sounds (not UI).
- [ ] **Ambient audio layer** respects zone/TOD gates.

### Performance
- [ ] Draw calls did not increase by more than 10% per chunk.
- [ ] No per-frame allocations in the shader material setup (set uniforms once, reuse).
- [ ] `MultiMeshInstance3D` used for >20 identical scatter instances.
- [ ] Tested at target device floor (integrated iGPU, 1080p). Frame time < 16.6 ms.

### Godot-specific sanity
- [ ] No autoload name collides with a built-in class (e.g. `Logger`, `Camera`, `Timer`).
- [ ] `.gdshader` compiles without warnings in editor.
- [ ] `.tscn`/`.tres` diff is minimal — no unrelated inspector noise.

## Anti-patterns to actively avoid

From accumulated project feedback:

- **Black shadows** — the #1 visual sin. Tint cool.
- **Outline-on-everything** — we don't use post-process outlines. Use rim light.
- **Saturated primaries** — immediately reads as "mobile game", breaks the Ghibli-lite target.
- **Instant UI pops** — TweenWeight everything.
- **Unpaired feedback** — visual without audio, or vice versa. Both or neither.
- **Per-frame `set_shader_parameter` on many materials** — cache a shared material per shader + uniform permutation.
- **Shader defaults via `source_color` that actually matter at runtime** — they're unreliable on Compat.

## Reviewer commands

```bash
# Run viewer at every TOD + vitality combination (tools script):
./run.sh --tod-sweep --vitality-sweep --screenshots out/polish/

# Diff screenshots against the last tagged baseline:
python tools/img_diff.py out/polish baseline/polish --threshold 0.02
```

Tooling targets not yet built — add as we standardize the PR gate.
