---
name: procgen-realm
description: Procedural generation patterns for Void Raiders realms — terrain, resource placement, settlement generation, POI distribution
argument-hint: [aspect]
user-invocable: true
allowed-tools: Read Write Edit Grep Glob
---

# Procedural Realm Generation

Patterns for generating Void Raiders realms from a seed.

## Pipeline

```
Seed (number)
  → PRNG (seeded random)
  → Heightmap (2D noise → terrain elevation)
  → Biomes (temperature + moisture → biome type)
  → Resources (deposit placement weighted by biome)
  → Settlements (alien cities on flat terrain near resources)
  → Military (defense installations protecting settlements)
  → Secrets (hidden caches in remote/difficult areas)
  → Stargate Entry (safe-ish landing zone)
```

## Seeded RNG

```js
// Simple mulberry32 PRNG — deterministic from seed
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const random = mulberry32(realmSeed);
random(); // 0.0 - 1.0, deterministic
```

## Noise for Terrain

```js
// Use simplex noise seeded by realm seed for terrain heightmap
// Multiple octaves for detail at different scales

function fbm(x, z, octaves, lacunarity, persistence) {
  let value = 0, amplitude = 1, frequency = 1, max = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * simplex2(x * frequency, z * frequency);
    max += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return value / max; // normalized -1 to 1
}

// Terrain height at world position
function getHeight(x, z) {
  return fbm(x * 0.001, z * 0.001, 6, 2.0, 0.5) * 200; // 0-200m height
}
```

## POI Placement (Poisson Disk)

Distribute POIs with minimum spacing so nothing overlaps:

```js
function poissonDisk(width, height, minDist, rng, maxAttempts = 30) {
  const points = [];
  const cellSize = minDist / Math.sqrt(2);
  const grid = {};

  function gridKey(x, y) {
    return `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
  }

  function tooClose(x, y) {
    const gx = Math.floor(x / cellSize), gy = Math.floor(y / cellSize);
    for (let dx = -2; dx <= 2; dx++)
      for (let dy = -2; dy <= 2; dy++) {
        const p = grid[`${gx+dx},${gy+dy}`];
        if (p && Math.hypot(p.x - x, p.y - y) < minDist) return true;
      }
    return false;
  }

  // Seed first point
  const first = { x: rng() * width, y: rng() * height };
  points.push(first);
  grid[gridKey(first.x, first.y)] = first;
  const active = [first];

  while (active.length) {
    const idx = Math.floor(rng() * active.length);
    const point = active[idx];
    let found = false;
    for (let i = 0; i < maxAttempts; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = minDist + rng() * minDist;
      const nx = point.x + Math.cos(angle) * dist;
      const ny = point.y + Math.sin(angle) * dist;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && !tooClose(nx, ny)) {
        const np = { x: nx, y: ny };
        points.push(np);
        grid[gridKey(nx, ny)] = np;
        active.push(np);
        found = true;
        break;
      }
    }
    if (!found) active.splice(idx, 1);
  }
  return points;
}
```

## Realm Parameters (from data)

```json
{
  "tier": 1,
  "biomes": ["desert", "rocky"],
  "resourceDensity": 0.6,
  "settlementCount": [2, 5],
  "militaryStrength": 0.3,
  "secretCount": [0, 2],
  "alienAdvancement": "low"
}
```

## Instructions

When generating or modifying realm generation for $ARGUMENTS:
1. Always use seeded RNG — realms must be reproducible from their seed
2. Keep generation fast (< 500ms for initial realm setup)
3. Stream chunk detail as mothership moves — don't generate everything upfront
4. Test with multiple seeds to verify variety
