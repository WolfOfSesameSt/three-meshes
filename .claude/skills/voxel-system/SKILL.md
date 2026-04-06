---
name: voxel-system
description: Voxel terrain generation, chunked rendering, greedy meshing, and destructible structures for Void Raiders realms
argument-hint: [task]
user-invocable: true
allowed-tools: Read Write Edit Grep Glob
---

# Voxel System

Build and maintain voxel terrain and destructible structures for Void Raiders.

## Architecture

```
Realm (10km)
  └── Chunks (16x16x16 voxels each)
       └── Voxels (individual blocks with type/state)
```

### Chunk Management
- Only load chunks near the mothership (streaming radius)
- Unload distant chunks to save memory
- Chunk LOD: full voxels nearby, simplified mesh at distance, billboard far away

### Greedy Meshing
- Merge adjacent same-type voxel faces into larger quads
- Dramatically reduces vertex count
- Rebuild mesh only when chunk is modified (destruction)

### Destruction
- Remove voxels on damage → rebuild chunk mesh
- Spawn debris particles for visual feedback
- Expose interior voxels (resources, interiors)
- Chain destruction for large explosions (remove sphere of voxels)

## Voxel Types

| Type | Visual | Destructible | Notes |
|------|--------|-------------|-------|
| Terrain | Biome-colored | Yes (heavy weapons) | Ground surface |
| Structure | Alien architecture | Yes | Buildings, walls |
| Resource | Glowing/distinct | Yes (mining) | Ore deposits |
| Reinforced | Military | Yes (hard) | Bases, bunkers |
| Indestructible | Bedrock | No | Realm boundaries |

## Performance Targets

- 60fps with full realm loaded around mothership
- Chunk rebuild < 5ms (web worker if needed)
- Max loaded chunks: ~1000 (adjust based on profiling)
- Use `THREE.BufferGeometry` with merged faces

## Reference

- Kaiju City implementation: `src/games/kaiju-city/` (reference patterns)
- Three.js instancing for repeated chunk types
