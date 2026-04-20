# Stylized Lighting — Ghibli-Lite for Fairy Permaculture

Target feel: *My Neighbor Totoro* hillside, not *Journey* desert. Warm, low-contrast, legible at any zoom. Every frame should look paintable.

## Core principles

1. **Warm key, cool fill.** Always. Sun is warm (1.0, 0.96, 0.87); ambient/fill is cool blue-violet. Shadow side of objects must read blue-cool, never black.
2. **Low contrast.** Shadow darkness at ~0.55 of lit (our `toon.gdshader::shadow_darkness`), not 0. Ghibli shadow values are typically 70–80% of lit, not 30%.
3. **Soft shadows everywhere.** Directional light `shadow_blur ≥ 0.8`, ambient sky contribution ≥ 0.5 during daylight. Sharp shadows read as "game", soft shadows read as "illustration".
4. **Bounce is faked.** GL Compat has no real GI — cheat it via high ambient + skylight.
5. **Single key light.** Don't stack directionals; use a single sun + ambient. Secondary fills come from colored tint not extra lights.

Ghibli reference breakdowns: [80.lv — Ghibli environment](https://80.lv/articles/working-on-an-environment-in-ghibli-style), [Kids With Sticks — UE4 Ghibli](https://kidswithsticks.com/creating-stylized-art-inspired-by-ghibli-using-unreal-engine-4/).

## Two-band vs three-band cel

**Two-band** (our current default) — lit / shadow. Clean, reads from any distance, cheap.

```glsl
float ndl = max(dot(normalize(n_world), SUN_DIR), 0.0);
float band = step(0.5, ndl);             // two bands, hard edge
// or smoothstep(0.45, 0.55, ndl) for a softer edge
vec3 lit = base * mix(SHADOW_TINT, vec3(1.0), band);
```

**Three-band** — deep shadow / shadow / lit. Use only on hero characters (fairies) where the extra value separation carries weight.

```glsl
float band = step(0.25, ndl) * 0.5 + step(0.65, ndl) * 0.5;
// 0.0, 0.5, 1.0 -> deep / mid / lit
vec3 lit = base * mix(vec3(DEEP), mix(vec3(MID), vec3(1.0), step(0.5, band)), step(0.25, band));
```

**Ramp texture alternative** — sample a 1×N gradient indexed by `ndl`. Artist-friendly, editable per biome. See [Roystan's toon shader](https://roystan.net/articles/toon-shader/) and [Team Dogpit ramp tut](https://www.patreon.com/posts/shader-tuts-part-28256616).

## Rim light — our silhouette solution (NO outlines)

We explicitly don't use post-process outlines. Legibility instead comes from rim lighting on the lit side:

```glsl
float rim = pow(1.0 - clamp(abs(dot(NORMAL, VIEW)), 0.0, 1.0), 3.0);
lit += rim * rim_strength * SUN_COLOR * band;  // gated by `band` so it only rims lit side
```

Key: gating rim by `band` prevents it from outlining the shadow side (which would read as fake and break the painterly feel). BOTW does the same thing — rim is lit-side only, approximating SSS on skin. Reference: [Several Graphic Discoveries in BOTW](https://guardhei.github.io/2019/10/breath-of-the-wild-graphics-discoveries/).

Formula: `rim = pow(1 - dot(view, normal), k)` where `k ∈ [2, 6]` (bigger = tighter band). Our default `k = 3`.

## Time-of-day palette rotation

`autoload/world_state.gd::_apply()` drives `Environment`. Current cycle (edit there, not here):

| Phase | Sun color | Ambient | Background | Fog tint |
|---|---|---|---|---|
| Dawn | `#ffb27a` (warm amber) | `#3a3660` (violet-cool) | `#f0c29a → #8aa9c4` | `#d89a7c` |
| Morning | `#fff2d8` (soft gold) | `#9fb8cf` (cool sky) | `#c4d9ea` | `#e0ddc8` |
| Noon | `#ffffff` (neutral-warm) | `#c9d8e4` (bright cool) | `#bcd5e6` | `#d6e1ec` |
| Afternoon | `#ffe6b8` (honey) | `#b9c2d6` | `#d9cfb4` | `#e6d4b0` |
| Dusk | `#ff8b55` (sunset orange) | `#544d88` (violet) | `#ff9e7a → #3e3a66` | `#9a5c6c` |
| Night | `#6d7fb0` (moon cool) | `#1f2540` (deep navy) | `#0f1429` | `#28304d` |

All values should be palette entries in `autoload/palette.gd`. Never drift toward saturated primaries — we lose the painterly feel immediately.

Shadow tint is interpolated from the complement of the sun color (cheap trick): `shadow_color = mix(ambient_color, sun_complement, 0.6)`. This keeps the cool-fill rule automatic across the day.

## Blue-tinted shadows (the rule we kept violating)

Stylized games NEVER use black shadows. Our `toon.gdshader` tints via `shadow_darkness` multiplier, but that's grayscale. For next iteration, tint toward cool:

```glsl
const vec3 SHADOW_TINT = vec3(0.55, 0.60, 0.72); // cool blue-grey, ~55% value
vec3 lit = base * mix(SHADOW_TINT, vec3(1.0), band) * SUN_COLOR;
```

Pick `SHADOW_TINT` from the palette's "shadow-day" entry, and swap it for a cooler one at night via `set_shader_parameter`.

Reference feel: *The Short Hike*, *Ooblets*, *Slime Rancher*, *Alba: a Wildlife Adventure* ([ustwo breakdown — Sorolla's warm Mediterranean palette inspiration](https://medium.com/@ustwogames/the-environment-art-of-alba-a-wildlife-adventure-6bddd8b56955)).

## Godot 4 `Environment` settings cheatsheet (Compatibility-safe)

```gdscript
env.background_mode = Environment.BG_COLOR  # sky shader works too
env.background_color = bg
env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
env.ambient_light_color = ambient
env.ambient_light_energy = 0.9  # high — fake GI
env.ambient_light_sky_contribution = 0.0 if BG_COLOR, else 0.5

env.fog_enabled = true
env.fog_light_color = fog
env.fog_density = 0.008     # subtle; raise at dawn/dusk for mood
env.fog_sun_scatter = 0.1

# NOT AVAILABLE on Compatibility (ignored):
# env.glow_enabled, env.adjustment_enabled (brightness/contrast/saturation/LUT)
```

Sun (DirectionalLight3D):
```gdscript
sun.light_color = sun_color
sun.light_energy = lerp(0.0, 1.3, noon_factor)  # 0 at midnight, 1.3 at noon
sun.shadow_enabled = true
sun.shadow_blur = 1.5           # soft
sun.rotation = Vector3(deg_to_rad(-45 + time_arc), 0.0, 0.0)
```

Reference settings by phase: [Godot forum — realistic lighting](https://forum.godotengine.org/t/tutorial-realistic-lighting-in-godot-4/87219).

## Quick sanity checklist before committing a lighting change

- [ ] Run at vitality 0 and vitality 1 (drives palette LUT endpoints)
- [ ] View at dawn / noon / dusk / night
- [ ] Shadow side of a fairy reads blue-tinted, not black
- [ ] Value range of a frame is ~0.4–0.95 (no pure black, no pure white)
- [ ] Lit side has visible rim silhouette against bg at any angle
