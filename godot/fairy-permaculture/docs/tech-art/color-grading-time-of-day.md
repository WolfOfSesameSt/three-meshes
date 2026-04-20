# Color Grading & Time of Day

Driver: `autoload/world_state.gd::_apply()`. This file mutates the `Environment` (ambient, background, fog) and pushes uniforms to the toon shader (sun dir/color, shadow tint).

**Hard constraint:** `Environment.adjustment_*` (brightness/contrast/saturation, LUT) is **silently ignored on GL Compatibility** (see [gotchas](godot-gl-compat-gotchas.md)). All grading therefore happens via ambient + background + fog + per-material uniforms. We cannot rely on a 3D-texture LUT at render time.

## TOD curve — analytical, not data-table

Drive everything off a single `t_of_day ∈ [0, 1]` (one 24-hr tick). Derive per-phase blends by easing between six keyframes. Keyframes live in `world_state.gd`; this file documents the *shape* we want.

```gdscript
# Pseudo-GDScript
const KEYS := [
    # t,    sun_color,        ambient,        background,      fog,            sun_energy, sun_altitude_deg
    [0.00,  Color("6d7fb0"),  Color("1f2540"), Color("0f1429"), Color("28304d"), 0.05, -20],  # deep night
    [0.22,  Color("ffb27a"),  Color("3a3660"), Color("f0c29a"), Color("d89a7c"), 0.6,   5],   # dawn
    [0.35,  Color("fff2d8"),  Color("9fb8cf"), Color("c4d9ea"), Color("e0ddc8"), 1.0,  30],   # morning
    [0.50,  Color("ffffff"),  Color("c9d8e4"), Color("bcd5e6"), Color("d6e1ec"), 1.3,  60],   # noon
    [0.75,  Color("ffe6b8"),  Color("b9c2d6"), Color("d9cfb4"), Color("e6d4b0"), 1.0,  30],   # afternoon
    [0.85,  Color("ff8b55"),  Color("544d88"), Color("ff9e7a"), Color("9a5c6c"), 0.5,   5],   # dusk
    [1.00,  Color("6d7fb0"),  Color("1f2540"), Color("0f1429"), Color("28304d"), 0.05, -20],  # back to night
]
```

Lerp between adjacent keys with a **smoothstep eased `t`**, not linear — linear reads as mechanical:

```gdscript
func _sample(t: float) -> Dictionary:
    for i in range(KEYS.size() - 1):
        var a = KEYS[i]; var b = KEYS[i + 1]
        if t >= a[0] and t <= b[0]:
            var f = smoothstep(a[0], b[0], t)
            return {
                "sun":     a[1].lerp(b[1], f),
                "ambient": a[2].lerp(b[2], f),
                "bg":      a[3].lerp(b[3], f),
                "fog":     a[4].lerp(b[4], f),
                "energy":  lerp(a[5], b[5], f),
                "altitude": lerp(a[6], b[6], f),
            }
    return {}
```

## Why these specific colors

- **Dawn amber `#ffb27a` / violet-cool ambient `#3a3660`** — classic warm-cool separation. The sky is still bruised, the first sunlight is pushing over the ridge. Dusk is its symmetric sibling with a redder sun (`#ff8b55`) because dusk light has traveled through more atmosphere.
- **Noon neutral-warm `#ffffff`** — pure white at altitude 60°, slightly warm ambient `#c9d8e4` (sky-blue, desaturated). Noon shouldn't be a color event; it should feel "normal".
- **Night moon-cool `#6d7fb0`** — moon light is NOT blue. Real moonlight is yellowish white, but our eyes read it blue due to Purkinje shift. Fake the perceived effect.
- **Never saturate past ~70%.** A Ghibli frame is full of muted earth-tones. Saturated primaries read as "early-2000s toon".

## Shadow tint follows

`shadow_tint = mix(ambient, sun_complement, 0.6)` where `sun_complement = Color(1,1,1) - sun * 0.5`. This keeps shadows pushing into the cool/violet direction all day, and into deep-cool at night.

Push as uniform to the toon shader:

```gdscript
for mat in shared_toon_materials:
    mat.set_shader_parameter("shadow_tint", shadow_tint)
    mat.set_shader_parameter("sun_color",   sun_color)
    mat.set_shader_parameter("sun_dir",     _sun_dir_from_altitude(altitude))
```

## Fog = atmospheric perspective

Fog doubles as color grade on Compatibility. Dusk fog is warm-pink (`#9a5c6c`) — it tints the distant shed toward sunset. Noon fog is near-neutral. Use fog density to *compress value range at distance* — far objects trend toward fog color so nothing far reads pure black or pure white. This is your "saturation rolloff" without an LUT.

```gdscript
env.fog_enabled = true
env.fog_light_color = fog
env.fog_density = 0.004 + 0.008 * dusk_or_dawn_factor  # heavier at magic hour
env.fog_sun_scatter = 0.1
```

See [environmental-feel.md](environmental-feel.md) for volumetric alternatives.

## LUT option (if we ever leave Compatibility)

On Forward+/Mobile, `env.adjustment_enabled = true` + `env.adjustment_color_correction = <Texture3D>` gives us a classic 3D-LUT color grade. Author via DaVinci/Photoshop. Build-time pipeline:

1. Screenshot representative frames at each TOD.
2. Grade in Photoshop (curves → saturation → color balance).
3. Export HALD CLUT as a Texture3D (Godot supports).
4. Cross-fade two LUTs per TOD by rendering a blend in-shader (requires a custom post-process pass since `adjustment_color_correction` is a single texture slot).

**For now: don't bother.** Drive everything through ambient/bg/fog/shadow-tint. Cheaper, works on Compat, survives driver quirks.

## Debug overlay

Bind a dev key to cycle `t_of_day` in 0.05 steps. Every palette change must look right at all six keyframes, not just "noon when I tested it". This is a recurring failure mode — `_apply()` changes get merged after testing at one TOD and break at dusk.

## References

- [Godot forum — realistic lighting by phase](https://forum.godotengine.org/t/tutorial-realistic-lighting-in-godot-4/87219) — the energy/altitude numbers informing our curve.
- [TokisanGames — Sky3D](https://github.com/TokisanGames/Sky3D) — full atmospheric day/night plugin. Too heavy for us but a good reference for sun altitude math.
- [Ghibli color breakdowns — 80.lv](https://80.lv/articles/working-on-an-environment-in-ghibli-style) — warm-key / cool-fill reference frames.
- [ustwo Alba breakdown](https://medium.com/@ustwogames/the-environment-art-of-alba-a-wildlife-adventure-6bddd8b56955) — Sorolla-inspired palette, gradient-UV trick for baked lighting feel.
