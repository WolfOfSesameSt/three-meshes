---
name: shader
description: Quick shader help — GLSL syntax, Three.js/Pixi.js shader setup, common patterns (noise, lighting, SDF, post-processing), debugging compile errors
argument-hint: [question or task]
user-invocable: true
allowed-tools: Read Grep Glob Edit Write
---

# Shader Help

You are a GLSL shader expert. Help with $ARGUMENTS.

## Quick Reference

### Three.js ShaderMaterial (auto-injected uniforms)
Vertex attributes: `position`, `normal`, `uv`, `color`
Matrices: `projectionMatrix`, `modelViewMatrix`, `modelMatrix`, `viewMatrix`, `normalMatrix`
Camera: `cameraPosition`, `cameraFar`, `cameraNear`

### Three.js RawShaderMaterial
You must declare everything yourself. Add `precision mediump float;` at the top.

### Pixi.js Filters
Fragment-only. Input texture via `uSampler`. UVs via `vTextureCoord`.

### This Project's Conventions
- `.vert`/`.frag` files in `src/shaders/`, import with `?raw` suffix
- Chunks in `src/shaders/chunks/`, filters in `src/shaders/filters/`
- Uniform prefix: `u` (uTime, uResolution), varying prefix: `v` (vUv, vNormal)

## Common Patterns

### Noise (copy-paste ready)
```glsl
// Simple hash
float hash(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}
```

### Fresnel
```glsl
float fresnel = 1.0 - abs(dot(normalize(vNormal), normalize(vViewDir)));
fresnel = pow(fresnel, 2.5);
```

### Remap
```glsl
float remap(float value, float inMin, float inMax, float outMin, float outMax) {
  return outMin + (value - inMin) * (outMax - outMin) / (inMax - inMin);
}
```

### SDF Primitives
```glsl
float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
```

## Debugging Tips
- Output values as color: `gl_FragColor = vec4(vec3(value), 1.0);`
- Check browser console for GLSL compile errors
- `texture2D()` for GLSL 1.0, `texture()` for GLSL 3.0
- Integer literals need `.0` suffix in float context

## Shader Recipes

Full implementation recipes with GLSL + Three.js wiring are available in the shader-expert agent's reference file. For these effects, adapt from the tested recipes rather than writing from scratch:

1. Water refraction / shimmer (noise UV distortion, FBM)
2. Fresnel rim lighting (edge glow, energy shields)
3. Dynamic color grading post-processing (HSV, vignette, tint presets)
4. VHS / retro post-processing (scanlines, chromatic aberration, tracking)
5. Vegetation sway / object wobble (vertex wind deformation)

Reference: `.claude/agents/shader-expert/reference.md`

## Instructions
Read existing shaders in `src/shaders/` before writing new ones. Match the project's style. Keep answers concise — show code, not lectures.
