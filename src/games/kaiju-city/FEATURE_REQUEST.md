# Kaiju City — Feature Request Document

## Overview
A browser-based 3D game where the player selects a real-world city, the game generates a voxel replica from map data, and the player controls a Godzilla-style kaiju to destroy it. Desktop browser only, keyboard + mouse controls.

## Core Loop
1. **Select city** — search or pick from a map
2. **Generate voxel city** — fetch building/road/terrain data, convert to voxel grid
3. **Spawn kaiju** — drop into the city at a chosen location
4. **Destroy everything** — pure sandbox, no enemies, no timer, no score
5. **Explore the ruins** — walk through the wreckage

---

## Module 1: City Data Pipeline

### Data Sources
- **Default (free):** OpenStreetMap via Overpass API
  - Building footprints with height tags (`building:levels`, `height`)
  - Road network, parks, water bodies
  - No API key required
- **Premium:** Google Maps 3D Tiles API
  - Photorealistic 3D building geometry and heights
  - Requires Google Cloud API key
  - Higher fidelity, textured reference for voxelization

### Pipeline
1. User enters city name or coordinates
2. Fetch bounding box of map data (OSM Overpass query or Google Tiles)
3. Parse building footprints → extrude to height → voxelize
4. Parse roads → flat voxel strips
5. Parse water/parks → colored ground voxels
6. Estimate heights where data is missing (default 3 floors = ~10m)

### City Scale
- **Full city (km-scale)** — aggressive LOD + chunked loading required
- Chunk grid: 64x64 voxel chunks, loaded/unloaded by distance from kaiju
- Near chunks: full voxel resolution (1 voxel ≈ 1-2 meters)
- Medium chunks: reduced resolution (1 voxel ≈ 4m), simplified geometry
- Far chunks: flat colored blocks, no individual voxels
- Skyline silhouettes at extreme distance

---

## Module 2: Voxel Engine

### Architecture
- Chunked voxel world (chunk size TBD, likely 32³ or 64³)
- Greedy meshing for efficient rendering (merge adjacent same-type faces)
- Per-chunk mesh regeneration on destruction
- Voxel types: concrete, glass, steel, road, ground, water, park/tree, rubble
- Each type has color, density (structural strength), and debris behavior

### Performance Targets
- 60fps on mid-range desktop GPU
- Chunk loading radius: ~500m full detail, ~2km reduced, ~5km silhouette
- Max visible voxels: budget ~2M faces visible at once
- Web Workers for chunk meshing (off main thread)

### Rendering
- Three.js with custom chunk meshes (BufferGeometry, merged faces)
- Ambient occlusion baked per-voxel (simple neighbor sampling)
- Simple directional light (sun) + ambient
- Optional: fog for distance fade (helps with LOD transitions)

---

## Module 3: Kaiju Character

### Character: Godzilla-style
- **Single playable kaiju**, designed for extensible roster later
- Third-person follow camera (orbit behind/above)
- Scale: ~80m tall (roughly 40 voxels at 2m resolution)

### Controls (keyboard + mouse)
| Input | Action |
|-------|--------|
| WASD | Move / strafe |
| Mouse | Look / aim |
| Left click | Punch / claw swipe |
| Right click | Tail swipe (wide arc behind) |
| Space | Stomp (area damage below) |
| F | Atomic breath (hold — beam weapon, drains energy) |
| Shift | Sprint / charge |
| Q | Roar (visual/audio effect, shakes camera) |

### Character System
- Simple skeletal animation (walk, idle, attack, roar)
- Could start with a capsule/box placeholder, add model later
- Collision with buildings: kaiju pushes through, buildings take damage
- Footstep ground impacts crack the terrain
- Energy bar for atomic breath (recharges over time)

---

## Module 4: Destruction System

### Progressive Destruction (two tiers)

**Tier 1 — Voxel Crumble (light hits)**
- Punch/swipe removes voxels from the contact surface
- Removed voxels spawn as small debris particles (instanced cubes)
- Debris falls, bounces, piles up on the ground
- Chunk mesh regenerates where voxels were removed
- Fast, satisfying, low computational cost

**Tier 2 — Structural Collapse (heavy hits / accumulated damage)**
- Buildings track structural integrity per column
- When ground-floor supports are destroyed, upper floors lose support
- Unsupported sections collapse downward as large chunks
- Collapse cascade: falling chunks damage what they hit
- Stomp triggers radial ground-floor destruction → collapse
- Atomic breath carves through buildings, triggering collapses along the beam path

### Debris System
- Instanced mesh for small debris (thousands of cubes)
- Debris has simple physics: gravity + ground collision + damping
- Debris accumulates on the ground (doesn't disappear)
- Far debris fades out to manage performance
- Dust/smoke particle effects on impact and collapse

---

## Module 5: Camera System

### Third-Person Follow
- Orbits behind and above the kaiju
- Mouse controls orbit angle
- Smooth follow with damping (lerp position and look-at)
- Collision avoidance: camera pushes forward if it would clip inside a building
- Zoom: scroll wheel adjusts distance (close-up to wide shot)
- Screen shake on impacts (stomp, collapse, atomic breath)

---

## Module 6: UI

### City Selection Screen
- Search bar (geocoding via Nominatim or Google)
- Interactive map preview (could use Leaflet for 2D map)
- "Generate" button → loading screen with progress bar
- Recent cities list

### In-Game HUD
- Minimal: energy bar (atomic breath), minimap showing destruction spread
- No health, no score, no timer (pure sandbox)
- Pause menu: return to city select, settings, restart

### Settings
- Graphics quality preset (voxel detail, draw distance, effects)
- Controls rebinding
- Audio volume

---

## Module 7: Audio (future)

- Footstep impacts (heavy thuds)
- Building crumble / collapse sounds
- Atomic breath charge + beam
- Roar
- Ambient city sounds (faint, destroyed areas go silent)

---

## Technical Architecture

```
src/games/kaiju-city/
  index.html              — entry point
  main.js                 — game state machine, init, loop
  config.js               — constants, tuning parameters

  city/
    data-osm.js           — OpenStreetMap Overpass API fetcher
    data-google.js        — Google 3D Tiles fetcher
    voxelizer.js          — converts building geometry → voxel grid
    chunk.js              — single chunk: voxel storage + mesh generation
    chunk-manager.js      — chunk loading/unloading, LOD management
    world.js              — top-level world state, coordinates

  kaiju/
    controller.js         — input handling, movement, physics
    model.js              — mesh/animation (placeholder → real model)
    abilities.js          — punch, stomp, tail swipe, atomic breath
    energy.js             — energy bar management

  destruction/
    damage.js             — apply damage to voxels, structural checks
    collapse.js           — structural collapse simulation
    debris.js             — instanced debris particles
    effects.js            — dust, smoke, screen shake

  camera/
    follow-camera.js      — third-person follow + orbit + collision

  ui/
    city-select.js        — city search and selection screen
    hud.js                — in-game overlay
    loading.js            — generation progress screen

  utils/
    mesher.js             — greedy meshing algorithm
    worker-mesher.js      — Web Worker for off-thread meshing
    geo.js                — lat/lng ↔ world coordinate conversion
```

---

## Development Phases

### Phase 1: Foundation
- [ ] Project setup, entry point, game loop
- [ ] Basic voxel chunk rendering (hardcoded test city)
- [ ] Kaiju placeholder (capsule) with WASD movement
- [ ] Third-person camera
- [ ] Basic voxel removal on punch

### Phase 2: City Generation
- [ ] OSM Overpass API integration
- [ ] Building footprint → voxel extrusion
- [ ] Road/park/water voxel types
- [ ] Chunk-based world with loading/unloading
- [ ] City selection UI

### Phase 3: Destruction
- [ ] Voxel crumble (Tier 1) with debris particles
- [ ] Structural integrity system
- [ ] Collapse simulation (Tier 2)
- [ ] All kaiju abilities (stomp, tail, breath)
- [ ] Dust/smoke effects

### Phase 4: Polish
- [ ] LOD system for full km-scale cities
- [ ] Greedy meshing optimization
- [ ] Web Worker chunk meshing
- [ ] Ambient occlusion
- [ ] Audio
- [ ] Settings/controls UI

### Phase 5: Premium
- [ ] Google 3D Tiles integration
- [ ] Higher-fidelity voxelization from 3D geometry
- [ ] Kaiju model + animations (replace placeholder)

---

## Dependencies
- `three` — rendering
- `leaflet` or similar — city selection map widget (optional)
- No physics engine — custom simple physics for debris (gravity + ground plane)
- Web Workers API — off-thread chunk meshing

## API Keys Required
- **Google Maps** (optional/premium): 3D Tiles API + Geocoding
- **None for default**: OSM Overpass is free and keyless
