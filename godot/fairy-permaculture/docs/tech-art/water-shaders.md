# Water Shaders — Stylized Ponds & Streams

Our project uses water for ponds, streams, and (eventually) rain puddles. Authoritative builder: `autoload/world_grid.gd::_build_water_material()`. This doc is the reference the next person touching that function needs.

## Style target

**Wind Waker / A Short Hike** water — flat-ish, banded, slow scrolling normals, bright edge foam, no photoreal refraction. Ghibli-lite means we never want PBR-specular glare or real reflection probes.

## Approach taxonomy (pick one, not five)

| Approach | Cost | Look | When |
|---|---|---|---|
| **Flat colored plane** | ~0 | Pond-bottom flatness | Tiny puddles, cosmetic |
| **2-band depth-fade** | very low | Stylized pond (shallow/deep split) | Default for our ponds |
| **Scrolled normal map + depth foam** | low | Moving water with banded highlights | Streams, river channels |
| **Vertex-displaced waves (Gerstner/sin sum)** | med | Waves visibly rising | Open water — we don't have any |
| **`SCREEN_TEXTURE` refraction** | high on GL Compat | Sees through water to distorted floor | Only for hero pond if we go for it |

Our pond default: **#2 + #3 combined** — depth-fade color bands + scrolling normal + edge foam.

## Pond shader skeleton (Godot 4, GL Compat-safe)

```glsl
shader_type spatial;
render_mode blend_mix, depth_draw_always, cull_back, diffuse_lambert, specular_disabled;

// Keep constants in-body — source_color defaults unreliable on Compat.
uniform vec3 shallow_color : source_color = vec3(0.55, 0.78, 0.78);
uniform vec3 deep_color    : source_color = vec3(0.10, 0.26, 0.38);
uniform vec3 foam_color    : source_color = vec3(0.95, 0.98, 0.98);
uniform sampler2D normal_a : hint_normal;
uniform sampler2D normal_b : hint_normal;
uniform float depth_fade   = 1.5;   // world-units over which color blends
uniform float foam_width   = 0.25;  // world-units from shore where foam starts
uniform float scroll_speed = 0.04;
uniform float wave_strength = 0.04; // vertex displacement amplitude

void vertex() {
    // Gentle sinusoidal displacement — cheap, no Gerstner.
    float t = TIME * 0.6;
    float w = sin(VERTEX.x * 0.7 + t) * cos(VERTEX.z * 0.6 + t * 1.2);
    VERTEX.y += w * wave_strength;
}

void fragment() {
    vec2 uv_a = UV + vec2( TIME * scroll_speed,  TIME * scroll_speed * 0.7);
    vec2 uv_b = UV - vec2( TIME * scroll_speed * 0.8, TIME * scroll_speed * 0.4);
    vec3 n = normalize(texture(normal_a, uv_a).xyz * 2.0 - 1.0
                     + texture(normal_b, uv_b).xyz * 2.0 - 1.0);
    NORMAL_MAP = n * 0.5 + 0.5;

    // --- Depth fade (requires depth_texture; guard on Compat) ---
    float scene_depth = texture(DEPTH_TEXTURE, SCREEN_UV).r;
    vec4 ndc = vec4(SCREEN_UV * 2.0 - 1.0, scene_depth, 1.0);
    vec4 view = INV_PROJECTION_MATRIX * ndc;
    view.xyz /= view.w;
    float scene_z = -view.z;
    float frag_z  = -VERTEX.z; // already in view space inside fragment
    float depth_diff = scene_z - frag_z;

    float fade = clamp(depth_diff / depth_fade, 0.0, 1.0);
    vec3 water_color = mix(shallow_color, deep_color, fade);

    // --- Foam ring along shores ---
    float foam_mask = 1.0 - smoothstep(0.0, foam_width, depth_diff);
    // Broken-up edge via scrolled normal noise:
    foam_mask *= step(0.35, n.r);
    ALBEDO = mix(water_color, foam_color, foam_mask);
    METALLIC = 0.0;
    ROUGHNESS = 0.35;
    // ALPHA written here BECAUSE this is the rare, intentional transparent material.
    ALPHA = mix(0.85, 1.0, fade);
}
```

**Pitfalls this avoids:**
- `render_mode` declares `blend_mix` explicitly (transparent water) → ALPHA writes are legal.
- `depth_draw_always` is chosen (not `depth_draw_opaque` which contradicts blend_mix — see [gotchas](godot-gl-compat-gotchas.md)).
- Normal scroll reconstructs from two samples — single-sample normals look mechanically tiled.

Adapted from: [Stylized Water for Godot 4.x](https://godotshaders.com/shader/stylized-water-for-godot-4-x/), [Stylized Water with DepthFade](https://godotshaders.com/shader/stylized-water-with-depthfade/).

## Foam techniques

1. **Depth-read (preferred)** — compare scene depth vs. fragment depth, foam where diff < small_threshold. What we use above. Gives foam around any intersecting geometry (rocks, plants in pond).
2. **UV-distance / vertex color mask** — paint shore tiles with a mask channel; foam where mask > threshold. Cheaper, no depth read, but requires authored data.
3. **Scrolled noise edge** — multiply the depth-foam by a scrolling noise `step()` for a broken, hand-drawn edge (above).

## Caustics — cheap procedural

```glsl
// Cheap moving caustic: Voronoi-like from sin domain warp.
float caustic(vec2 p, float t) {
    vec2 q = p + vec2(sin(p.y * 3.0 + t), cos(p.x * 3.0 + t)) * 0.2;
    float c = sin(q.x * 8.0 + t) * sin(q.y * 8.0 - t);
    return pow(max(c, 0.0), 3.0);
}
// Add into EMISSION on the pond floor, NOT the water surface.
```

Apply caustics to the *floor* mesh (emission boost under water tiles), not to the water itself — double-baking caustics into both reads wrong.

## Refraction — SCREEN_TEXTURE

Available on GL Compat but: (a) forces a back-buffer copy per frame, (b) combines poorly with `hint_depth_texture` (turns black on resolution change — see gotchas). **Don't ship refraction on ponds unless the art director specifically asks.** If required:

```glsl
// Minimal refraction
vec2 refract_uv = SCREEN_UV + n.xy * 0.03;
vec3 behind = texture(SCREEN_TEXTURE, refract_uv).rgb;
ALBEDO = mix(behind, water_color, 0.6);
```

## Stream / river

Same as pond but:
- Flow direction as a uniform vector; scroll normals along it.
- Vertex wave amplitude = 0 (rivers shouldn't bob visibly at this scale).
- Foam width wider, triggered along banks *and* wherever flow diverges around rocks (extra vertex-painted mask).

## References

- Wind Waker water breakdown — GDC archive, search "Wind Waker tech art".
- *A Short Hike* uses almost literally our approach (flat color banded + depth-fade).
- *Kena: Bridge of Spirits* water is the aspirational ceiling (Unreal, more expensive).
- [Roystan — Unity Toon Water](https://roystan.net/articles/toon-water/) — technique translates directly; read for the depth-fade + foam logic.
- [Ronja Böhringer — Flowing River](https://www.ronja-tutorials.com/) — river flow direction fields.

## Project-specific checklist

- [ ] New water tiles appear only where `world_grid.is_water(x, z)` is true.
- [ ] Material is built ONCE and shared across all water tiles in a chunk (not per-mesh).
- [ ] Foam reads visible at dawn, noon, and night (test at all three lighting phases).
- [ ] No z-fighting with pond floor (water y-offset ≥ 0.02 from floor).
- [ ] Shader has `depth_draw_always` + `blend_mix`, NOT `depth_draw_opaque`.
