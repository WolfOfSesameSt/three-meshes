# Bloom / Glow — Tuning Spec

The Fairy Permaculture main scene ships with `env.glow_enabled = false` by
default because we target **GL Compatibility** which silently ignores
`Environment.glow_*` settings (see `godot-gl-compat-gotchas.md`).

This document is the canonical recipe for a future `main.tscn` pass (or
a Forward+ branch) that enables bloom. The agent who edits `main.tscn`
can lift the values below verbatim.

## Exposed helper

`autoload/juice.gd` ships a runtime helper:

```gdscript
Juice.set_glow_preset("off" | "subtle" | "medium" | "strong")
```

The helper is safe to call on GL Compatibility — it writes the
Environment fields but the renderer ignores them. That lets us author
and test bloom levels now so the numbers are already calibrated when we
ship a Forward+ build.

## Intended values

Target mood: warm-pastel Ghibli-lite. Bloom is a soft halo, not an
overdriven sci-fi lens. Honey-warm highlights should feather out; we
must NOT create a hazy washed-out image.

| Preset  | glow_intensity | glow_bloom | glow_strength | glow_hdr_threshold | Use case |
|---------|---------------:|-----------:|--------------:|-------------------:|----------|
| off     | —              | —          | —             | —                  | Default ship state |
| subtle  | 0.40           | 0.10       | 0.8           | 1.1                | Daylight / noon — minimal halo |
| medium  | 0.80           | 0.20       | 1.0           | 1.0                | Dawn / dusk hero shots |
| strong  | 1.40           | 0.35       | 1.2           | 0.9                | Night fireflies + kiln plumes |

## Tonemap + exposure handoff

`main.tscn` currently ships with:

```
tonemap_mode = 2   # FILMIC
tonemap_exposure = 1.05
tonemap_white = 6.0
```

When bloom is enabled, drop `tonemap_exposure` to ~0.95 so the
highlights driving glow read as accents and not blown-out white. Keep
`tonemap_white` at 6.0 — the bloom shouldn't require lifting the white
point; that would mute the palette.

## MSAA

`project.godot` already sets `rendering/anti_aliasing/quality/msaa_3d=2`
(2×). Good for the crisp cel silhouettes. Do NOT raise to 4× globally
on Compatibility — the post chain is software and gets expensive fast.

## Per-TOD modulation (future work)

Plug `set_glow_preset` into `sun_cycle.gd` to swap presets:

| Phase     | Preset   |
|-----------|----------|
| night     | strong   |
| predawn   | medium   |
| dawn      | medium   |
| morning   | subtle   |
| noon      | subtle   |
| afternoon | subtle   |
| sunset    | medium   |
| twilight  | strong   |

The environment engineer owns `sun_cycle.gd`; this document is the
handoff spec.
