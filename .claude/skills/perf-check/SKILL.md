---
name: perf-check
description: Check Void Raiders performance budgets — draw calls, frame time, memory, drone count scaling, chunk rebuild time
argument-hint: [area or "all"]
user-invocable: true
allowed-tools: Read Grep Glob Bash
---

# Performance Check

Monitor and enforce performance budgets for Void Raiders.

## Performance Budgets

| Metric | Budget | How to Measure |
|--------|--------|----------------|
| Frame time | < 16.6ms (60fps) | `performance.now()` around render loop |
| Draw calls | < 50 full scene | `renderer.info.render.calls` |
| Triangles | < 500K visible | `renderer.info.render.triangles` |
| Drone instances (200) | < 2ms GPU | Profile instanced draw call |
| Voxel chunk rebuild | < 5ms per chunk | `performance.now()` around mesh rebuild |
| AI routine eval (200 drones) | < 1ms total | Profile routine tick |
| Heap memory | < 512MB peak | `performance.memory.usedJSHeapSize` |
| Texture memory | < 256MB | `renderer.info.memory.textures` |

## In-Game Performance Monitor

Add a debug overlay (toggle with backtick key) that shows:

```js
// Performance stats to track
const stats = {
  fps: 0,
  frameTime: 0,
  drawCalls: 0,
  triangles: 0,
  droneCount: 0,
  activeChunks: 0,
  heapMB: 0,
  routineEvalMs: 0,
};

// After each frame:
stats.drawCalls = renderer.info.render.calls;
stats.triangles = renderer.info.render.triangles;
stats.heapMB = performance.memory?.usedJSHeapSize / 1048576;
```

## Scaling Test Pattern

Test that performance holds as drone count increases:

```js
// Test instancing at various counts
for (const count of [5, 25, 50, 100, 150, 200]) {
  const startTime = performance.now();
  updateInstances(drones.slice(0, count));
  renderer.render(scene, camera);
  const frameTime = performance.now() - startTime;
  
  console.log(`${count} drones: ${frameTime.toFixed(2)}ms`);
  assert(frameTime < 16.6, `${count} drones exceeded frame budget`);
}
```

## Common Performance Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| High draw calls | Non-instanced objects | Use InstancedMesh |
| Slow frame, low draw calls | Complex shaders | Simplify fragment shader, reduce texture lookups |
| Memory climbing | No disposal | Dispose geometry/material/textures on removal |
| Stuttering | GC pauses from allocations in render loop | Pre-allocate, use object pools, reuse vectors |
| Slow chunk rebuild | Full mesh regeneration | Only rebuild modified chunks, use web workers |

## Instructions

When checking performance for $ARGUMENTS:
1. Identify which metrics are relevant
2. Check existing benchmark tests in `src/games/void-raiders/perf/`
3. If benchmarks exist, run them and report results vs budgets
4. If no benchmarks exist for the area, suggest what to measure and how
5. Flag any metric exceeding 80% of its budget as a warning
