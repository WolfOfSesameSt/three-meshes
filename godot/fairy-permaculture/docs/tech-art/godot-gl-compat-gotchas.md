# Godot 4 GL Compatibility Renderer — Gotchas & Footguns

We ship on **GL Compatibility** (broad device coverage, lower floor than Forward+). Most tutorials target Forward+ and their shaders silently break here. This file is our running list of pain.

Canonical upstream tracker: [Issue #66458 — 4.x OpenGL Compatibility renderer issues](https://github.com/godotengine/godot/issues/66458).

## Our hard-won list (project-specific)

### 1. `source_color` uniform defaults silently become zero / wrong
Setting a `uniform vec4 c : source_color = vec4(...)` default *sometimes* ships as `(0,0,0,0)` at runtime, especially right after `new ShaderMaterial()` instantiation.

**Fix:** hardcode constants in the shader body, or force-set the default from GDScript after instancing.

```gdscript
# Workaround when using source_color defaults
mat.set_shader_parameter(
    p_name,
    RenderingServer.shader_get_parameter_default(mat.shader.get_rid(), p_name)
)
```
Reference: [godot#101605](https://github.com/godotengine/godot/issues/101605).

### 2. Writing `ALPHA` in a fragment shader auto-enables transparency
Even writing `ALPHA = 1.0` flips the material into transparent mode → z-sorted → black/invisible surfaces, broken shadows, wrong draw order. This cost us a full day on 2026-04-19.

**Rule:** never write `ALPHA` in an opaque shader. Our `shaders/toon.gdshader` explicitly comments this. See [godot#92144](https://github.com/godotengine/godot/issues/92144).

### 3. `render_mode diffuse_toon + ambient_light_disabled` + custom `light()` → near-zero ALBEDO
The built-in toon diffuse combined with a disabled ambient term can clamp output to ~0 under GL Compat. Our workaround: `render_mode unshaded` and compute the cel ramp manually against a hardcoded sun direction. See `shaders/toon.gdshader`.

### 4. `depth_draw_opaque` + `blend_mix` is contradictory
`blend_mix` implies transparent; `depth_draw_opaque` tells the engine to write to depth unconditionally. These contradict and the compiler may silently pick one — resulting in either z-fighting or missing translucency. **Pick one:** opaque → no `blend_mix`, transparent → `depth_draw_alpha_prepass` or `depth_draw_always`.

### 5. `Logger` collides with Godot 4's built-in class
Naming an autoload `Logger` shadows Godot's internal class and causes `Identifier not declared` errors inside scripts that reference either. Ours is `FPLogger` (autoload path still `logger.gd`).

## Upstream Compatibility renderer — unimplemented or broken

From [#66458](https://github.com/godotengine/godot/issues/66458) and related issues:

- **No environment glow.** Bloom/glow settings are ignored. Fake it with an additive sprite / mesh if you need it.
- **No environment adjustments.** `Environment.adjustment_*` (brightness, contrast, saturation, LUT) is **not applied** on Compatibility. Drive color grading via ambient + background + fog + shader tinting instead.
- **No `ReflectionProbe`.** Use baked fakes or flat reflection colors.
- **No `TextureArray` / `Texture3D` samplers in shaders.**
- **No 2D MSAA, no FXAA.**
- **No alpha-hash transparency** (`alpha_hash` render mode). Use `alpha_scissor_threshold` (cutout) or `blend_mix` (standard transparency).
- **Directional shadows:** work in editor, sometimes broken in running project on some drivers. Test every build.
- **`FOG` cannot be written from a shader** unless fog is first explicitly enabled on the `WorldEnvironment` ([godot#94183](https://github.com/godotengine/godot/issues/94183)). Otherwise it's silently dropped.
- **`hint_screen_texture`** goes black on resolution change when combined with `hint_depth_texture`. Touch a uniform to force reupload, or avoid the combo.
- **Tonemap exposure** incorrectly affects reflections / lightmap results.
- **`NORMAL`** is no longer guaranteed normalized inside the fragment shader on newer 4.x — always call `normalize(NORMAL)` defensively ([godot#103675](https://github.com/godotengine/godot/issues/103675)).
- **Blend modes other than `Mix`** are broken unless `depth_draw` is `never`.
- **`ALPHA = 1.0` still marks the material transparent** ([godot#92144](https://github.com/godotengine/godot/issues/92144)).
- **No shader precompilation yet** on Compatibility → first-frame hitches on shader introduction. Pre-warm by instancing hidden material copies at boot ([proposal #12119](https://github.com/godotengine/godot-proposals/issues/12119)).

## Defensive shader template (starting point)

```glsl
shader_type spatial;
render_mode unshaded;  // bypass GL Compat lighting entirely — safest

// Hardcode the default in the shader body, don't trust source_color defaults.
uniform vec4 albedo_color : source_color = vec4(1.0);
uniform sampler2D albedo_tex : source_color, hint_default_white;
uniform bool use_texture = false;

void fragment() {
    vec3 base = albedo_color.rgb;
    if (use_texture) base *= texture(albedo_tex, UV).rgb;
    // ... manual cel ramp, rim, etc.
    ALBEDO = base;
    // DO NOT write ALPHA unless this material is truly transparent.
}
```

## Debugging flow when a shader ships wrong

1. Run with `--rendering-driver opengl3` explicitly (don't rely on project.godot default).
2. Toggle `render_mode unshaded` — if the mesh appears, lighting path is the issue.
3. Hardcode `ALBEDO = vec3(1,0,1)` — if still black, transparency/cull issue.
4. Check `material.shader.get_code()` at runtime — confirms the right shader is bound.
5. Check `material.get_shader_parameter("albedo_color")` — `null` or wrong means uniform default bug.
6. Test in headless: `godot --headless --rendering-driver opengl3 -s tools/render_probe.gd`.
