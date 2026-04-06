# Weapon Effect Shader Plan

Visual upgrade plan for each weapon type. Current V1 uses simple beam lines and instanced sphere bolts. This document describes the shader work needed for V2 visuals.

## Beam Weapons (Hitscan)

### Pulse Laser (current mothership weapon)
Current line visual is fine for V1. No changes needed.

### Railgun
- Bright muzzle flash at fire origin (additive billboard quad, fade over 0.05s)
- Thick beam that tapers from source to impact (use a quad strip instead of Line, wider at origin)
- Impact crater glow on hit surface (ground-plane disc with animated fade-out)

### Plasma Lance
- Sustained beam with heat distortion (screen-space UV offset along beam direction using a post-process pass)
- Orange-to-white gradient along beam length (fragment shader lerp on beam UV.x)
- Beam width pulses slightly during the 0.3s duration (sin wave on width uniform)

### Cruiser Beam (enemy shielded cruiser)
- Pulsing beam width (sin wave on beam width, magenta glow)
- Emissive glow halo around beam line (billboard quad along beam axis, additive blend)

## Bolt Weapons (Projectile)

### Plasma Bolt (current enemy bolt)
Current instanced sphere is V1. Add a short trail using a stretched billboard quad aligned to velocity vector.

### Heavy Cannon (patrol cruiser)
- Larger bolt with particle trail (spawn small additive quads behind projectile each frame)
- Impact creates expanding shockwave ring on ground (animated disc geometry with radius uniform)

### Bomber Torpedo
- Big glowing projectile with pulsing intensity (sin wave on emissive uniform, 0xff2266)
- Thick smoke trail behind projectile (stretched billboard quads with fade-out, dark tint)
- Massive explosion on impact (expanding sphere of additive particles + screen shake)

### Interceptor Burst
- Tiny fast bolts, almost tracer-like (very small instanced quads stretched along velocity)
- Minimal trail -- just velocity stretch, no particles

### Missile Pod
- Cone-shaped projectile mesh (replace sphere with cone aligned to velocity)
- Engine flare trail (bright point light + stretched billboard behind)
- Slight homing behavior (future gameplay feature, not shader)

### Scatter Cannon
- Fire 3-5 small bolts per trigger pull (gameplay change: fire() called multiple times per shot)
- Each bolt is tiny with minimal trail

## Special Weapons

### Proximity Mine (minelayer)
- Deployed as a slow-moving glowing orb
- Idle state: gentle pulse (sin wave on emissive, yellow-green)
- Armed state: pulse rate increases, tints red when target enters detonation radius
- Detonation: expanding sphere of particles + shockwave ring

### Repair Beam (drone)
- Current beam line + add soft blue glow particles floating from drone to target
- Particles drift along beam axis with slight random offset (billboard quads, additive blend)

### Mining Beam (drone)
- Current beam line + add sparkling particles at the contact point
- Small bright flashes at impact position (random offset within small radius, short lifetime)

## Shader Techniques Needed

### Billboard Trail Quads
Stretch a quad along the velocity vector. Vertex shader takes velocity direction and stretches back vertices. Fragment shader applies gradient fade from bright head to transparent tail.

```
// Vertex: stretch along velocity
vec3 right = normalize(cross(velocity, cameraDir));
vec3 stretched = position - normalize(velocity) * trailLength * (1.0 - uv.y);
```

### Screen-Space Heat Distortion
Post-process pass that offsets UV sampling based on a distortion texture. Apply only in screen-space region near the beam. Requires render-to-texture pipeline (currently not set up -- would need EffectComposer).

### Expanding Shockwave Ring
Ground-plane disc mesh with animated radius. Fragment shader draws a ring at the expanding edge using smoothstep on distance from center. Fades out as radius grows.

```
// Fragment: ring at expanding radius
float dist = length(vUv - 0.5) * 2.0;
float ring = smoothstep(uRadius - 0.05, uRadius, dist) * smoothstep(uRadius + 0.05, uRadius, dist);
float alpha = ring * (1.0 - uRadius); // fade as it expands
```

### Pulsing Emissive Intensity
Simple sin wave on the emissive uniform color. Can be done per-instance via instance attribute or per-material for single objects.

```
// Update loop
material.emissiveIntensity = 0.3 + 0.7 * Math.sin(elapsed * pulseFrequency);
```

## Implementation Priority

1. Billboard trail quads (improves all bolt weapons)
2. Pulsing emissive (easy win for torpedoes, mines, beams)
3. Shockwave rings (bomber torpedo impact, mine detonation)
4. Heat distortion (requires post-process pipeline -- defer to later)
