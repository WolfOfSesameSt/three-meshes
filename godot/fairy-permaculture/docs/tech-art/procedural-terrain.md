# Procedural Terrain — Godot 4, Stylized

Our world is a 500×500 tile homestead on a BC coast. Heightmap is *gentle* — the game is about fairies working rows and ponds, not mountains. Don't over-engineer.

## Noise — pick one, understand it

| Type | Use when | Avoid when |
|---|---|---|
| **Perlin** | Legacy compatibility, smooth blobs | Visible axis-aligned bias; use Simplex instead |
| **Simplex / OpenSimplex2** | Default choice. Isotropic, fast, good gradient | — |
| **Cellular / Worley** | Puddle shapes, biome patchwork, stone cracks | Continuous rolling hills |
| **Value noise** | Cheapest noise; blocky unless heavily smoothed | Hero terrain |
| **Ridged multi-fractal** | Mountain ridges, cliff erosion look | Coastal meadows (our case) |

Godot 4 ships [`FastNoiseLite`](https://docs.godotengine.org/en/stable/classes/class_fastnoiselite.html) with all of these. Preferred: `TYPE_SIMPLEX_SMOOTH` for hills, `TYPE_CELLULAR` with `DISTANCE_EUCLIDEAN_SQUARED` for ponds.

```gdscript
var n := FastNoiseLite.new()
n.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
n.frequency = 0.015      # bigger = tighter features
n.fractal_octaves = 4
n.fractal_lacunarity = 2.0
n.fractal_gain = 0.5
n.seed = run_seed
var h := n.get_noise_2d(x, z) * 0.5 + 0.5  # 0..1
```

### fBM + domain warping (Inigo Quilez)
fBM (stacked octaves) is self-similar — perfect for erosion-shaped hills. Adding a single warp layer gives the "river-valley" look cheaply.

```glsl
// Inigo Quilez — https://iquilezles.org/articles/warp/
float pattern(vec2 p) {
    vec2 q = vec2(fbm(p + vec2(0.0, 0.0)),
                  fbm(p + vec2(5.2, 1.3)));
    return fbm(p + 4.0 * q);
}
```
In GDScript you can fake this by sampling the noise at `(x + offsetX(x,z), z + offsetZ(x,z))` where offsets come from a second, lower-freq FastNoiseLite.

## Heightmap vs. tile-grid

We use a **500×500 tile grid** (authored in `autoload/world_grid.gd`). Each tile owns a biome + water flag. Heightmap is decoupled — a coarser Nx×Nz `PackedFloat32Array` sampled bilinearly when building visual meshes.

**Tradeoffs:**
- **Tile-grid** — discrete occupancy, easy gameplay reads, easy serialization. Rebuild cost per-tile is cheap.
- **Heightmap** — smooth terrain, but collides awkwardly with "tile owns biome" reads.
- **Our answer:** tile grid for gameplay/state, heightmap layer purely visual, sampled at tile center + 4 corners.

## Chunking & LOD

Godot 4's `ArrayMesh` + `MultiMeshInstance3D` is plenty for our scale. For 500×500 tiles, chunk at **32×32** (=225 chunks) — keeps each chunk under ~1k tris and under the instance cap.

- Build each chunk into one `ArrayMesh` surface per biome.
- Static scatter (grass, rocks) → one `MultiMesh` per chunk per variant.
- LOD: swap chunk mesh for a flat quad + impostor texture beyond ~8 chunk radius. Godot's built-in `MeshInstance3D.lod_bias` helps but is Forward+ only — on GL Compat, roll distance-based visibility toggles manually.

Collision: a single `HeightMapShape3D` at scene root is cheaper than per-chunk trimeshes when the farm floor is mostly traversable. See [`HeightMapShape3D` docs](https://docs.godotengine.org/en/stable/classes/class_heightmapshape3d.html).

## Cheap erosion (<10 ms / regeneration)

We don't need geomorphology — we need "the pond-side looks eroded, the ridge looks crumbly". Two CA passes over the heightmap:

**Thermal (talus) — one pass:**
```gdscript
# Sediment slides off slopes steeper than talus_angle.
for z in range(1, H - 1):
    for x in range(1, W - 1):
        var h := heights[z * W + x]
        var lowest := h
        var lx := x; var lz := z
        for dz in [-1, 0, 1]:
            for dx in [-1, 0, 1]:
                var nh := heights[(z + dz) * W + (x + dx)]
                if nh < lowest: lowest = nh; lx = x + dx; lz = z + dz
        var diff := h - lowest
        if diff > talus:
            heights[z * W + x] -= diff * 0.5
            heights[lz * W + lx] += diff * 0.5
```

**Hydraulic (fake) — blur pass biased downhill:** 3×3 gaussian weighted toward the lowest neighbor. One pass is enough to soften ridges and widen pond banks.

Reference: [Inigo Quilez — terrain](https://iquilezles.org/articles/morenoise/); [Sebastian Lague erosion](https://www.youtube.com/watch?v=eaXk97ujbPQ) (Unity but algorithm is portable).

## Godot-specific primitives

- [`FastNoiseLite`](https://docs.godotengine.org/en/stable/classes/class_fastnoiselite.html) — in-engine, reasonably fast.
- [`ArrayMesh`](https://docs.godotengine.org/en/stable/classes/class_arraymesh.html) — for custom surface buffers. Use `Mesh.PRIMITIVE_TRIANGLES`.
- [`SurfaceTool`](https://docs.godotengine.org/en/stable/classes/class_surfacetool.html) — nicer API, slower. Prototype with it, ship with `ArrayMesh`.
- [`HeightMapShape3D`](https://docs.godotengine.org/en/stable/classes/class_heightmapshape3d.html) — single collider for whole farm.
- [`MultiMeshInstance3D`](https://docs.godotengine.org/en/stable/classes/class_multimeshinstance3d.html) — thousands of grass blades / pebbles from one draw call.
- [`NavigationRegion3D`](https://docs.godotengine.org/en/stable/classes/class_navigationregion3d.html) — bake a navmesh off the final chunk meshes.

## Real-world references

- **Townscaper** — hex-ish grid, no heightmap, infinite charm from palette + silhouette.
- **A Short Hike** — chunked low-poly island, atmospheric fog hides draw distance.
- **No Man's Sky** — Simplex + fractal octaves + biome masks; the technique is mostly vanilla, the art direction carries it.
- **Minecraft** — tile grid at extreme scale. Relevant to us: their chunk-streaming pattern.
- **Dwarf Fortress** — 3-layer (above/at/below ground) tile world; our "branch" overlays are a cousin concept.

## Project-specific notes

- `autoload/world_grid.gd` owns the authoritative tile state. Any procgen writes here, then notifies listeners via `farm_totals` signals. Don't bypass.
- Water tiles are flagged in the grid; the water mesh is rebuilt per-chunk by `_build_water_material()` (see [water-shaders.md](water-shaders.md)).
- When regenerating heights, also rebake the heightmap collider once (not per-chunk) — otherwise fairies sink.
