# Fog Density — Time-of-Day Spec

Atmospheric perspective is the cheapest trick that reads as "painterly"
in Ghibli-lite work. Our current `main.tscn` Environment ships with a
flat `fog_density = 0.0035`, which is too low to see at noon and too
low for dawn / dusk mood.

This document is the recipe the environment engineer should apply to
`scripts/sun_cycle.gd` when it gets its fog-density pass. (I don't edit
that script — it's owned by the sun-cycle agent.)

## Density curve

Target density per phase — lower = clearer, higher = atmospheric:

| Phase        | t     | fog_density | Intent |
|--------------|-------|------------:|--------|
| night_dark   | 0.00  | 0.003       | Crisp moonlit air |
| predawn      | 0.08  | 0.010       | Soft mist forming |
| dawn         | 0.18  | 0.012       | Golden-haze hero |
| morning      | 0.30  | 0.008       | Clearing |
| noon         | 0.50  | 0.006       | Bright, just enough aerial perspective |
| afternoon    | 0.68  | 0.008       | Warming again |
| sunset       | 0.80  | 0.014       | Heaviest — orange-tinted haze |
| twilight     | 0.88  | 0.010       | Softening into night |

Smooth-interpolate via the same `_bracket(t)` helper `sun_cycle.gd`
uses for sky / ambient.

## Aerial perspective

Keep `env.fog_aerial_perspective = 0.5` across all phases. It's the
parameter that tints distant ALBEDO toward fog color — the cheap
depth cue. Never let it drop below 0.3 or distances start reading flat.

## Fog tint handoff

`sun_cycle.gd` already writes `env.fog_light_color = sky_color` so the
fog stays in palette. Keep that line — the density curve above is the
ONLY new write.

## GL Compatibility notes

Regular (non-volumetric) fog works fine on Compatibility. Avoid
`FogVolume` — that's Forward+ only (see `godot-gl-compat-gotchas.md`).
For zone-specific fog (e.g. pond hollows), prefer billboarded ground-fog
sheets over volumetrics.

## Handoff snippet

Once the sun_cycle agent is ready, the phase dictionary entries should
gain a `fog_density` key:

```gdscript
{
    "t": 0.18, "label": "dawn",
    "alt_scale": 0.18, "az": -78.0,
    "sky": Palette.CORAL.lerp(Palette.HONEY_SKY, 0.55),
    "ambient": Palette.MOON.lerp(Palette.HONEY_SKY, 0.60),
    "sun": Palette.HONEY.lerp(Palette.PARCHMENT, 0.40),
    "sun_energy": 0.85,
    "ambient_energy": 0.62,
    "fog_density": 0.012,   # <-- new
}
```

And `_apply_lighting()` interpolates it:

```gdscript
var fog_density: float = lerp(
    float(a["fog_density"]),
    float(b["fog_density"]),
    k,
)
env.fog_density = fog_density
```

That's the full change. Palette compliance is preserved because fog
color is still driven by sky_color.
