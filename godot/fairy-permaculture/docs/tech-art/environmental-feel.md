# Environmental Feel — Fog, Particles, Ambient

"Feel" is the layer that turns a working scene into a living one. Each of these is cheap individually and compounds fast.

## Atmospheric perspective (fog + color shift)

On GL Compatibility we rely on Godot's built-in fog (no true volumetric — see below). Tune:

```gdscript
env.fog_enabled = true
env.fog_light_color = tod.fog          # from world_state TOD curve
env.fog_light_energy = 1.0
env.fog_density = 0.006                # subtle; 0.003 bright noon, 0.012 misty dawn
env.fog_height_enabled = false         # we don't need hemisphere falloff
env.fog_sun_scatter = 0.1              # warm-shift of sun disc
env.fog_aerial_perspective = 0.5       # tints distant objects toward fog color
```

**Aerial perspective** is the cheap trick that makes distance read: `fog_aerial_perspective` blends distant ALBEDO toward fog color even if fog density is low. Set ≥ 0.4 unless distances are all <20 m.

Mood morph: raise `fog_density` to ~0.015 at dawn/dusk, drop to ~0.003 at noon. This alone ups the painterly quality more than any shader change.

Reference: [Distance Gradient Fog shader](https://godotshaders.com/shader/distance-gradient-fog-4-3/) — full-screen post-process with a gradient texture, if we ever need non-uniform fog per direction.

## Volumetric fog — skip on GL Compat

Godot 4's `FogVolume` is Forward+ only. On Compatibility it's not rendered. Cheap stylized fakes:

1. **Billboard fog sheets** — flat `QuadMesh` with scrolling noise + depth-fade, placed manually in pond / shadow hollows. Depth-fade prevents the "card edge" tell.
2. **Particle ground fog** — `GPUParticles3D` emitting large flat soft quads slowly drifting upward near water. ~8 particles, lifetime 6 s, near-transparent.
3. **Extra plane at camera** — quad parented to camera, slight scroll, fades in at dawn/dusk only. Controls overall scene mist without per-zone setup.

```glsl
// Fake ground-fog billboard shader (simplified)
shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_disabled, unshaded;
uniform sampler2D noise : hint_default_white;
uniform vec3 tint : source_color = vec3(0.85, 0.88, 0.92);
void fragment() {
    float n = texture(noise, UV + TIME * 0.02).r;
    // Depth fade so card edges disappear into geometry:
    float scene_d = texture(DEPTH_TEXTURE, SCREEN_UV).r;
    // ... (compute linear depth diff, fade alpha near it)
    ALBEDO = tint;
    ALPHA = n * 0.35;
}
```

## Life particles (pollen, seeds, fireflies, spores)

`GPUParticles3D` with a `ParticleProcessMaterial`. Rules of thumb:

- **Budget:** total < 200 live particles across the farm. More than that and GL Compat chokes on older iGPUs.
- **Mesh:** a tiny `QuadMesh` with an additive unshaded shader (single channel alpha, tinted) — NOT a billboard sprite (overkill).
- **Emission shape:** `SPHERE` or `BOX` covering a biome zone; one emitter per zone.
- **Lifetime:** 4–10 s. Below 4 s the motion reads as "bug", above 10 s it reads as "floating debris".
- **Velocity:** gentle (~0.2 m/s) + wind curve + randomness. Avoid straight-line motion.
- **Color over life:** fade-in alpha over first 10% of life, fade-out over last 30%. Never pop.

Config targets by ambient type:

| Effect | Emitter zone | Count | Color | When active |
|---|---|---|---|---|
| Pollen | Flowering beds | 30 | Honey-warm, emissive 0.4 | 0.3 ≤ t_of_day ≤ 0.7 (day) |
| Dandelion seed | Meadow biome | 15 | Off-white, emissive 0 | Day, wind > 0.3 |
| Fireflies | Forest edge | 25 | Yellow-green, emissive 1.5 | Night (t > 0.85 or t < 0.15) |
| Leaves falling | Compost/orchard | 8 | Palette browns | Autumn season only |
| Spores | Mushroom patches | 12 | Violet, emissive 0.8 | Night + near pond |

Reference: [Godot GPUParticles3D docs](https://docs.godotengine.org/en/stable/classes/class_gpuparticles3d.html), [haowg/GODOT-VFX-LIBRARY](https://github.com/haowg/GODOT-VFX-LIBRARY).

## Wind coupling

One global `wind_vector` in `world_state.gd` drives:
- Particle external acceleration
- Vertex-shader sway on foliage meshes (`pos.x += sin(time * 2.0 + worldPos.z) * wind_strength`)
- Audio mix (wind track volume scales with `|wind_vector|`)

Animating `wind_vector` on a slow sine (period ~40 s) already creates a "breathing" world.

## Ambient audio layers

Cross-link to the audio pipeline (ElevenLabs, `audio/` folder). Layer by zone + TOD:

| Layer | Source | Gates on |
|---|---|---|
| Wind bed | `audio/ambient/wind_loop.ogg` | Always, volume = f(wind) |
| Pond lapping | `audio/ambient/water_lap.ogg` | Near water tile + camera within 15 m |
| Insect day | `audio/ambient/cicada_day.ogg` | 0.3 < t_of_day < 0.75 |
| Crickets night | `audio/ambient/cricket_night.ogg` | t_of_day > 0.85 or < 0.15 |
| Forest rustle | `audio/ambient/forest_rustle.ogg` | In forest biome + wind |
| Stream flow | `audio/ambient/stream_flow.ogg` | Near stream + camera within 10 m |

Generate via the project's ElevenLabs pipeline — see `npm run sfx -- "gentle wind through grass" --duration 20 --name wind_loop`. Cross-fade via `AudioStreamPlayer3D` buses; attenuation handles proximity automatically.

## Weather as a single dial

Rain and clear are both controlled by one `weather_intensity ∈ [0, 1]` uniform, driving:
- Rain particle emission rate
- Cloud cover (fog density multiplier)
- Sun energy attenuation (multiply by `1 - 0.6 * weather_intensity`)
- Rain audio bus volume
- A wetness value pushed to the toon shader (small specular boost on horizontal surfaces)

One dial → many systems → coherent "it's raining" change. Don't author each separately.

## Checklist

- [ ] Particles don't spawn at fairy head-height where they'd obscure gameplay.
- [ ] Firefly count drops to 0 at dawn (not instant — fade over ~30 s in-game).
- [ ] Wind affects foliage, particles, and audio together (single source of truth).
- [ ] Fog density smoothly eases between TOD keyframes, no step changes.
- [ ] Every ambient effect has an OFF path (e.g. indoors should dampen wind, kill pollen).
