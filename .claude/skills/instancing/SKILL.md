---
name: instancing
description: Set up Three.js InstancedMesh for rendering large numbers of identical objects (drone fleets, projectiles, debris) at high performance
argument-hint: [object type]
user-invocable: true
allowed-tools: Read Write Edit Grep Glob
---

# Instanced Rendering

Set up efficient instanced rendering for Void Raiders. Critical for the 200-drone target.

## Pattern

```js
import * as THREE from 'three';

// 1. Create shared geometry + material (ONE draw call for all instances)
const geometry = new THREE.BoxGeometry(1, 1, 1); // or loaded mesh geometry
const material = new THREE.MeshStandardMaterial({ color: 0x4a9eff });

// 2. Create InstancedMesh with max count
const MAX_DRONES = 200;
const mesh = new THREE.InstancedMesh(geometry, material, MAX_DRONES);
mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // will update every frame
mesh.count = 0; // start with 0 visible, increase as drones spawn
scene.add(mesh);

// 3. Update per-instance transforms each frame
const dummy = new THREE.Object3D();

function updateInstances(drones) {
  for (let i = 0; i < drones.length; i++) {
    dummy.position.copy(drones[i].position);
    dummy.rotation.copy(drones[i].rotation);
    dummy.scale.setScalar(drones[i].scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.count = drones.length;
  mesh.instanceMatrix.needsUpdate = true;
}
```

## Per-Instance Color / State

```js
// Add per-instance color for team/health indication
const color = new THREE.Color();
for (let i = 0; i < drones.length; i++) {
  color.setHex(drones[i].damaged ? 0xff4444 : 0x4a9eff);
  mesh.setColorAt(i, color);
}
mesh.instanceColor.needsUpdate = true;
```

## Per-Instance Custom Attributes

For more data per instance (health bars, animation state), use `InstancedBufferAttribute`:

```js
const healthArray = new Float32Array(MAX_DRONES);
geometry.setAttribute('aHealth',
  new THREE.InstancedBufferAttribute(healthArray, 1)
);
// Update: healthArray[i] = drone.health / drone.maxHealth;
// Then: geometry.attributes.aHealth.needsUpdate = true;
```

Access in vertex shader: `attribute float aHealth;`

## Performance Tips

- **One draw call per type** — miners, fighters, repair drones each get their own InstancedMesh
- **DynamicDrawUsage** — set on instanceMatrix if updating every frame
- **Frustum culling** — InstancedMesh culls the whole batch. For large spreads, split into spatial groups
- **LOD trick** — at distance, swap InstancedMesh geometry to simpler version
- **Count management** — set `mesh.count` to actual active drones, not max. GPU skips unused instances
- **Pool indices** — when a drone dies, swap it with the last active drone and decrement count

## When to Use

| Object | Count | Instanced? |
|--------|-------|-----------|
| Drones | 5-200 | Yes — critical |
| Projectiles | 0-500 | Yes |
| Debris particles | 0-1000 | Yes |
| Enemy ships | 0-50 | Yes if same type |
| Buildings | Varies | Maybe — static, could use merged geometry |
| Resource deposits | 10-50 | Optional |

## Instructions

When setting up instancing for $ARGUMENTS:
1. Identify the geometry and material (shared across all instances)
2. Determine max instance count (budget for worst case)
3. Set up the InstancedMesh with DynamicDrawUsage if animated
4. Create the update loop for per-frame transform changes
5. Add per-instance attributes if needed (color, health, state)
6. Profile: check `renderer.info.render.calls` — should be 1 per type
