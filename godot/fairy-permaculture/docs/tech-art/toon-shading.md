# Toon / Cel Shading — Godot 4 GL Compat

Canonical implementation: `shaders/toon.gdshader`. This doc is background reading so the next edit doesn't regress it.

## Why we use `render_mode unshaded` (not `diffuse_toon`)

Godot 4's built-in `diffuse_toon` + GL Compat + our ambient settings produced near-zero ALBEDO output on opaque meshes (see [gotchas](godot-gl-compat-gotchas.md) entry 3). We bypass the engine's light loop entirely:

```glsl
shader_type spatial;
render_mode unshaded;  // we compute cel manually
```

Tradeoff: we lose automatic `Light3D` contributions. We gain: deterministic output, works identically in editor and runtime, survives GL Compat bugs. For this project's look (single-sun overworld + ambient) that's the right trade. If we ever need dynamic point lights (fairy lanterns at night), we add them via `LIGHT_VERTEX` interpolation or move to a `light()` function — but ONLY after testing under Compat.

## 2-band (our default)

```glsl
// n_world and SUN_DIR both normalized, world space
float ndl  = max(dot(n_world, SUN_DIR), 0.0);
float band = step(0.5, ndl);                // hard edge at 0.5
// or: smoothstep(0.45, 0.55, ndl) for a cleaner pixel edge
vec3 lit   = base * mix(SHADOW_TINT, vec3(1.0), band);
```
Clean, cheap, reads from any distance. This is the right default for world props.

## 3-band

```glsl
float lit_mask   = step(0.65, ndl);   // brightest
float mid_mask   = step(0.25, ndl);   // mid + lit
float band = lit_mask * 0.5 + mid_mask * 0.5;  // 0.0, 0.5, 1.0
vec3 lit = base * mix(DEEP_TINT, mix(MID_TINT, vec3(1.0), lit_mask), mid_mask);
```
Reserve for hero characters (fairies). More value steps = more weight / readability at hero scale.

## Ramp-texture cel (artist-friendly)

Bake the shadow-to-lit gradient into a 1×N texture, index by `ndl`. Lets artists tune shadow color, transition softness, and extra highlight bands without touching GLSL.

```glsl
uniform sampler2D cel_ramp : hint_default_white, filter_linear, repeat_disable;

float u = clamp(ndl, 0.01, 0.99);
vec3  ramp = texture(cel_ramp, vec2(u, 0.5)).rgb;
vec3  lit  = base * ramp * SUN_COLOR;
```

Reference: [Roystan toon shader](https://roystan.net/articles/toon-shader/), [Team Dogpit ramps](https://www.patreon.com/posts/shader-tuts-part-28256616).

## Rim light (our outline substitute)

```glsl
float rim = pow(1.0 - clamp(abs(dot(NORMAL, VIEW)), 0.0, 1.0), rim_power);
// CRITICAL: gate rim by `band` so it only rims the LIT side.
lit += rim * rim_strength * SUN_COLOR * band;
```

- `rim_power ∈ [2, 6]` — higher = tighter band.
- `rim_strength ∈ [0.1, 0.3]` — subtle. If rim is obvious, it's wrong.
- Gating by `band` mimics BOTW's character rim and prevents the "fake ink outline" look on shadow side ([BOTW graphics discoveries](https://guardhei.github.io/2019/10/breath-of-the-wild-graphics-discoveries/)).

**NO post-process outlines.** They read as "toy-like" and conflict with our painterly feel. Rim + value contrast is the silhouette solution.

## Stepped specular (when you need sparkle)

Two-band spec for water drops, polished fruit, fairy wing sheen:

```glsl
vec3 H = normalize(SUN_DIR + VIEW);
float ndh = max(dot(n_world, H), 0.0);
float spec_raw = pow(ndh, spec_shininess);   // 16..64
float spec = step(spec_threshold, spec_raw); // 0 or 1 — cel!
lit += spec * spec_color * band;             // gate by lit band too
```

`spec_threshold ≈ 0.7–0.85` gives a pinpoint highlight. `spec_shininess ≈ 32` is the sweet spot for soft organic surfaces.

For multi-band spec (wet-look water drops), use `step(t1, spec_raw) * 0.5 + step(t2, spec_raw) * 0.5`.

## Normal handling in Godot 4

`NORMAL` in fragment is **view-space** by default. If you compute against a world-space sun direction (our toon shader does):

```glsl
vec3 n_world = normalize((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
```

Also: NORMAL is [no longer guaranteed normalized](https://github.com/godotengine/godot/issues/103675) on newer 4.x. **Always call `normalize()` defensively** before dot products.

## Shadow tint (not `shadow_darkness`)

Our current shader multiplies by a scalar `shadow_darkness` — this makes shadows grey. Upgrade path: replace with a `vec3 shadow_tint`:

```glsl
uniform vec3 shadow_tint : source_color = vec3(0.55, 0.60, 0.72);
vec3 lit = base.rgb * mix(shadow_tint, vec3(1.0), band) * SUN_COLOR;
```

Drive `shadow_tint` from `world_state.gd::_apply()` so night shadows go deeper/cooler than noon shadows.

## Alternate approaches considered & rejected

- **Godot `diffuse_toon` + custom light()** — broken on GL Compat (see gotchas #3).
- **Inverted-hull outlines** — the classic BOTW approach. Rejected: extra draw cost, extra mesh authoring burden, looks toy-like on organic foliage.
- **Sobel/post-process outlines** — rejected: "no outlines" is a project-wide rule.
- **`StandardMaterial3D` toon mode** — works but we can't reach our palette goals or our gated-rim behavior through inspector parameters.

## References

- [Complete Cel Shader for Godot 4 (eldskald)](https://github.com/eldskald/godot4-cel-shader) — full-featured modular cel shader, includes specular, anisotropy, multiple lights. Good reference for when we need more than two bands.
- [gameidea toon shader (Godot 4)](https://gameidea.org/2024/02/15/toon-cel-shader/) — `light()`-based implementation; our current shader adapts its NdotL + smoothstep pattern.
- [Baldur Games stylized shaders](https://baldurgames.com/posts/stylized-shaders-godot) — Part 1 covers toon, Part 2 covers custom shadows.
- [Binbun3D toon shading](https://bun3d.com/tutorials/shading/godot-toon-shading/) — simpler, `StandardMaterial3D`-based approach for quick prototyping.
- [GDC 2015 — Guilty Gear Xrd art style](https://www.gdcvault.com/play/1022031/GuiltyGearXrd-s-Art-Style-The) — manually-tweaked vertex normals to control cel shape per-pose. Not our pipeline but excellent mental model for "what the cel is hiding".
- [GDQuest — godot-shaders library](https://github.com/gdquest-demos/godot-shaders) — MIT-licensed reference shaders.

## Project-specific checklist

- [ ] Shader has `render_mode unshaded`
- [ ] `NORMAL` is `normalize()`'d before any dot product
- [ ] No `ALPHA` write unless material is truly transparent
- [ ] Rim is gated by `band` (lit side only)
- [ ] Shadow tint is a `vec3`, not a scalar darkness multiplier (upgrade target)
- [ ] Sun direction + color uniforms are driven by `world_state.gd`, not hardcoded per-material
- [ ] Tested at all 6 TOD phases and both vitality endpoints
