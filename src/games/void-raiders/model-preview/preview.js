import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// ── Arena imports ──
// The sandbox arena runs the real in-game combat loop against test enemies
// so balance tuning uses the same shaders + damage paths as a mission. All
// of these come from the live game code so there's no drift.
import { TurretSystem } from '../ship/turret-system.js';
import { buildBallTurret, buildMissileLauncher, applyTurretSkin, loadActiveTurretSkins } from '../ship/turret-rigger.js';
import { getAttack } from '../combat/attack-defs.js';
import { ENEMY_TYPES } from '../combat/enemy.js';

// One-shot escape hatch: visit ?reset=1 to wipe all saved hardpoints before
// the page touches them. Recovers from bad localStorage state without devtools.
if (new URL(location.href).searchParams.get('reset')) {
  const removed = Object.keys(localStorage).filter(k => k.startsWith('ship-hp-'));
  for (const k of removed) localStorage.removeItem(k);
  console.log(`[reset] Cleared ${removed.length} ship hardpoint entries from localStorage`);
}

// Debug surface for the QA harness — exposes live state to page.evaluate
window.__qa = {};

// ============================================================
// MODEL CATALOG
// ============================================================
const MODELS = [
  { id: 'star-destroyer-lowpoly', name: 'Star Destroyer (Low Poly)', path: '/models/star-destroyer-lowpoly/scene.gltf', faces: 6194, author: 'rubaun', license: 'CC-BY' },
  { id: 'star-destroyer', name: 'Star Destroyer (Detailed)', path: '/models/star-destroyer/scene.gltf', faces: 44634, author: 'Todor', license: 'CC-BY' },
  { id: 'eclipse-class', name: 'Eclipse Class Star Destroyer', path: '/models/eclipse-class-star-destroyer/scene.gltf', faces: 8970, author: 'Anthony Schmidt', license: 'CC-BY' },
  { id: 'venator', name: 'Venator Class Star Destroyer', path: '/models/venator-class-star-destroyer/scene.gltf', faces: 39754, author: 'Digital Sock', license: 'CC-BY' },
  { id: 'alien-mothership', name: 'Alien Mothership', path: '/models/alien-mothership/scene.gltf', faces: 7312, author: 'vandoughairyhunx', license: 'CC-BY' },
  { id: 'overlord-mothership', name: 'Overlord Mothership 451', path: '/models/overlord-mothership-451/scene.gltf', faces: 5312, author: 'Trockk', license: 'CC-BY' },
  { id: 'sky-cruiser', name: 'Sky Cruiser', path: '/models/sky-cruiser/scene.gltf', faces: 11636, author: 'R-LAB', license: 'CC-BY' },
  { id: 'dreadnought', name: 'Dreadnought', path: '/models/dreadnought/scene.gltf', faces: 39944, author: 'gavinpgamer1', license: 'CC-BY' },
];

// ============================================================
// THREE.JS SETUP
// ============================================================
const viewport = document.getElementById('viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a14);

const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
camera.position.set(5, 3, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

// Lighting
scene.add(new THREE.AmbientLight(0x4444aa, 0.6));
const keyLight = new THREE.DirectionalLight(0xccccff, 1.2);
keyLight.position.set(5, 8, 5);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x4444ff, 0.4);
fillLight.position.set(-5, 2, -3);
scene.add(fillLight);
scene.add(new THREE.DirectionalLight(0x7777ff, 0.3).translateZ(-5));

// Starfield
const starGeom = new THREE.BufferGeometry();
const starPos = new Float32Array(6000);
for (let i = 0; i < 6000; i++) starPos[i] = (Math.random() - 0.5) * 200;
starGeom.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starGeom, new THREE.PointsMaterial({ color: 0x888899, size: 0.15, sizeAttenuation: true })));

// Grid
const grid = new THREE.GridHelper(20, 40, 0x1a1a3a, 0x12122a);
grid.material.transparent = true;
grid.material.opacity = 0.3;
scene.add(grid);

// ============================================================
// STATE
// ============================================================
const loader = new GLTFLoader();
let currentModel = null;
let currentModelId = null;
let activeCard = null;

// Mesh inspector
const meshEntries = [];
let highlightedEntry = null;
const highlightMat = new THREE.MeshStandardMaterial({ color: 0x7b7bf7, emissive: 0x3333aa, roughness: 0.4, metalness: 0.3, transparent: true, opacity: 0.8 });

// Hardpoints
let hardpoints = [];
let selectedHp = null;
let placeMode = false;
let showArcs = true;
const hpGroup = new THREE.Group();
hpGroup.name = 'hardpoints';
scene.add(hpGroup);

// Turret rig flow (click barrel, click base)
let rigMode = false;
let rigPendingBarrel = null;       // mesh waiting for its base
let rigPendingBarrelOrigMat = null; // original material to restore on cancel
const rigBarrelMat = new THREE.MeshStandardMaterial({
  color: 0x7bf77b, emissive: 0x227722,
  roughness: 0.4, metalness: 0.3,
  transparent: true, opacity: 0.85,
});

// Auto-rig flow (one click splits a batched mesh into N turrets)
let autoRigMode = false;
const AUTO_RIG_MIN_FACES = 5; // islands below this many faces are treated as decoration

// Drone bay placement flow (one click on the ship places a drone_bay hardpoint)
let bayMode = false;

// Raycaster
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// ============================================================
// UI ELEMENTS
// ============================================================
const loadingEl = document.getElementById('loading');
const statFaces = document.getElementById('stat-faces');
const statVerts = document.getElementById('stat-verts');
const statMeshes = document.getElementById('stat-meshes');
const statAuthor = document.getElementById('stat-author');
const rightPanel = document.getElementById('right-panel');
const meshListEl = document.getElementById('mesh-list');
const hpListEl = document.getElementById('hp-list');
const hpCountEl = document.getElementById('hp-count');
const hpEditor = document.getElementById('hp-editor');

// Tab switching
document.querySelectorAll('.panel-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

// ============================================================
// LEFT SIDEBAR — MODEL LIST
// ============================================================
const modelList = document.getElementById('model-list');
for (const model of MODELS) {
  const card = document.createElement('div');
  card.className = 'model-card';
  card.innerHTML = `<div class="name">${model.name}</div><div class="meta"><span>${model.faces.toLocaleString()}f</span><span>${model.license}</span></div><div class="author">by ${model.author}</div>`;
  card.addEventListener('click', () => loadModel(model, card));
  modelList.appendChild(card);
}

// ============================================================
// MODEL LOADING
// ============================================================
function loadModel(model, card) {
  if (activeCard) activeCard.classList.remove('active');
  card.classList.add('active');
  activeCard = card;

  if (currentModel) {
    scene.remove(currentModel);
    currentModel.traverse(c => {
      if (c.isMesh) {
        c.geometry.dispose();
        if (c.material?.dispose) c.material.dispose();
      }
    });
  }

  clearMeshInspector();
  clearHardpoints();
  taggedTurrets = [];
  splitUndoStack = [];
  splitIslands = [];
  splitControlsEl.style.display = 'none';
  splitUndoBtn.style.display = 'none';
  // Drop any in-progress rig pick (no material restore — old model is gone)
  rigPendingBarrel = null;
  rigPendingBarrelOrigMat = null;
  if (rigMode) setRigMode(false);
  if (autoRigMode) setAutoRigMode(false);
  if (bayMode) setBayMode(false);
  currentModelId = model.id;

  loadingEl.textContent = `Loading ${model.name}...`;
  loadingEl.classList.remove('hidden');

  loader.load(model.path, (gltf) => {
    const root = gltf.scene;
    currentModel = root;

    // Auto-center and scale
    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 5 / maxDim;
    root.scale.setScalar(scale);
    root.position.sub(center.multiplyScalar(scale));
    scene.add(root);

    camera.position.set(5.5, 3, 5.5);
    controls.target.set(0, 0, 0);
    controls.update();

    // Stats
    let faces = 0, verts = 0, meshCount = 0;
    root.traverse(c => {
      if (!c.isMesh) return;
      meshCount++;
      const g = c.geometry;
      faces += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      verts += g.attributes.position.count;
    });
    statFaces.textContent = Math.round(faces).toLocaleString();
    statVerts.textContent = verts.toLocaleString();
    statMeshes.textContent = meshCount;
    statAuthor.textContent = `${model.author} (${model.license})`;

    buildMeshInspector(root);
    rightPanel.classList.add('visible');
    loadingEl.classList.add('hidden');

    // Auto-load saved hardpoints
    const saved = localStorage.getItem(`ship-hp-${model.id}`);
    if (saved) {
      try { importHardpoints(JSON.parse(saved)); } catch (e) { console.warn('Failed to load saved hardpoints', e); }
    }
  }, (p) => {
    if (p.total > 0) loadingEl.textContent = `Loading ${model.name}... ${Math.round(p.loaded / p.total * 100)}%`;
  }, (err) => {
    console.error(err);
    loadingEl.textContent = `Failed to load ${model.name}`;
  });
}

// ============================================================
// MESH INSPECTOR
// ============================================================
function clearMeshInspector() {
  meshEntries.length = 0;
  highlightedEntry = null;
  meshListEl.innerHTML = '';
}

function buildMeshInspector(root) {
  clearMeshInspector();
  let idx = 0;
  root.traverse(child => {
    if (!child.isMesh) return;
    const g = child.geometry;
    const fc = g.index ? Math.round(g.index.count / 3) : Math.round(g.attributes.position.count / 3);

    const entry = { idx, mesh: child, origMaterial: child.material, isHidden: false };
    meshEntries.push(entry);

    const row = document.createElement('div');
    row.className = 'mesh-item';
    row.dataset.idx = idx;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'mesh-name';
    nameSpan.textContent = child.name || `mesh_${idx}`;

    const faceSpan = document.createElement('span');
    faceSpan.className = 'mesh-faces';
    faceSpan.textContent = `${fc.toLocaleString()}f`;

    const isIsland = child.name.includes('_island');
    const isTaggedBase = taggedTurrets.some(t => t.baseMeshes.includes(child));
    const isTaggedBarrel = taggedTurrets.some(t => t.barrelMeshes.includes(child));
    const isTagged = isTaggedBase || isTaggedBarrel;

    const hideBtn = document.createElement('button');
    hideBtn.className = 'small-btn';
    hideBtn.textContent = 'hide';

    if (isIsland) row.classList.add('island');
    if (isTaggedBarrel) row.classList.add('turret-tagged');
    if (isTaggedBase) row.classList.add('turret-base-tagged');

    // Hover highlight
    row.addEventListener('mouseenter', () => {
      if (!entry.isHidden && highlightedEntry !== entry && !isTagged) child.material = highlightMat;
    });
    row.addEventListener('mouseleave', () => {
      if (!entry.isHidden && highlightedEntry !== entry && !isTagged) child.material = entry.origMaterial;
    });

    // Click to lock highlight
    row.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      if (highlightedEntry && highlightedEntry !== entry) {
        highlightedEntry.mesh.material = highlightedEntry.origMaterial;
        meshListEl.querySelector(`.mesh-item[data-idx="${highlightedEntry.idx}"]`)?.classList.remove('highlighted');
      }
      if (highlightedEntry === entry) {
        entry.mesh.material = entry.origMaterial;
        row.classList.remove('highlighted');
        highlightedEntry = null;
      } else {
        entry.mesh.material = highlightMat;
        row.classList.add('highlighted');
        highlightedEntry = entry;
      }
    });

    // Hide toggle
    hideBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      entry.isHidden = !entry.isHidden;
      child.visible = !entry.isHidden;
      hideBtn.textContent = entry.isHidden ? 'show' : 'hide';
      hideBtn.classList.toggle('danger', entry.isHidden);
      row.classList.toggle('dimmed', entry.isHidden);
    });

    row.appendChild(nameSpan);
    row.appendChild(faceSpan);

    // Split button (only for non-island, non-fragment meshes with index buffers)
    if (!isIsland && !child.name.includes('_fragment') && child.geometry.index) {
      const splitBtn = document.createElement('button');
      splitBtn.className = 'small-btn';
      splitBtn.textContent = 'split';
      splitBtn.addEventListener('click', (e) => { e.stopPropagation(); performSplit(entry); });
      row.appendChild(splitBtn);
    }

    // Turret tag buttons — only on split islands, not whole hull meshes
    if (isIsland && !isTagged) {
      const baseBtn = document.createElement('button');
      baseBtn.className = 'small-btn';
      baseBtn.textContent = 'base';
      baseBtn.title = 'Tag as turret base (yaw only)';
      baseBtn.style.color = '#7bf7f7';
      baseBtn.addEventListener('click', (e) => { e.stopPropagation(); tagTurretPart(entry, 'base'); });
      row.appendChild(baseBtn);

      const barrelBtn = document.createElement('button');
      barrelBtn.className = 'small-btn';
      barrelBtn.textContent = 'barrel';
      barrelBtn.title = 'Tag as turret barrel (yaw + pitch)';
      barrelBtn.style.color = '#7bf77b';
      barrelBtn.addEventListener('click', (e) => { e.stopPropagation(); tagTurretPart(entry, 'barrel'); });
      row.appendChild(barrelBtn);
    }

    row.appendChild(hideBtn);
    meshListEl.appendChild(row);
    idx++;
  });
}

// ============================================================
// MESH SPLITTING (connected component extraction)
// ============================================================
let splitUndoStack = []; // { parent, originalMesh, parts[] }
let splitThreshold = 20;
let splitIslands = []; // { mesh, faceCount, center, entry } for current split
const splitControlsEl = document.getElementById('split-controls');
const splitThresholdSlider = document.getElementById('split-threshold');
const splitThresholdVal = document.getElementById('split-threshold-val');
const splitUndoBtn = document.getElementById('split-undo');

splitThresholdSlider.addEventListener('input', (e) => {
  splitThreshold = parseInt(e.target.value);
  splitThresholdVal.textContent = splitThreshold;
});

splitUndoBtn.addEventListener('click', () => {
  if (splitUndoStack.length === 0) return;
  const { parent, originalMesh, parts } = splitUndoStack.pop();
  for (const p of parts) { parent.remove(p); p.geometry.dispose(); }
  parent.add(originalMesh);
  buildMeshInspector(currentModel);
  splitUndoBtn.style.display = splitUndoStack.length > 0 ? '' : 'none';
});

function splitMeshByIslands(mesh, threshold) {
  const geom = mesh.geometry;
  const index = geom.index;
  if (!index) return null;

  const positions = geom.attributes.position;
  const normals = geom.attributes.normal;
  const uvs = geom.attributes.uv;
  const indexArr = index.array;
  const triCount = indexArr.length / 3;

  // Union-Find
  const parent = new Int32Array(positions.count);
  const rank = new Uint8Array(positions.count);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(a, b) {
    a = find(a); b = find(b);
    if (a === b) return;
    if (rank[a] < rank[b]) [a, b] = [b, a];
    parent[b] = a;
    if (rank[a] === rank[b]) rank[a]++;
  }

  for (let t = 0; t < triCount; t++) {
    const i0 = indexArr[t * 3], i1 = indexArr[t * 3 + 1], i2 = indexArr[t * 3 + 2];
    union(i0, i1); union(i1, i2);
  }

  // Group triangles by component root
  const componentTris = new Map();
  for (let t = 0; t < triCount; t++) {
    const root = find(indexArr[t * 3]);
    if (!componentTris.has(root)) componentTris.set(root, []);
    componentTris.get(root).push(t);
  }

  // Separate significant vs fragment islands
  const significant = [];
  const fragmentTris = [];
  for (const [, tris] of componentTris) {
    if (tris.length >= threshold) {
      significant.push(tris);
    } else {
      fragmentTris.push(...tris);
    }
  }

  if (significant.length <= 1 && fragmentTris.length === 0) return null;

  // Build a triangle → island-index map so callers can resolve "which island
  // owns the triangle the raycaster hit". -1 means a fragment (no island).
  const triangleToIsland = new Int32Array(triCount).fill(-1);
  for (let i = 0; i < significant.length; i++) {
    for (const t of significant[i]) triangleToIsland[t] = i;
  }

  // Build meshes from triangle lists
  function buildIslandMesh(tris) {
    const vertMap = new Map();
    let newIdx = 0;
    const newIndices = [];
    for (const t of tris) {
      for (let j = 0; j < 3; j++) {
        const vi = indexArr[t * 3 + j];
        if (!vertMap.has(vi)) vertMap.set(vi, newIdx++);
        newIndices.push(vertMap.get(vi));
      }
    }
    const vc = vertMap.size;
    const pos = new Float32Array(vc * 3);
    const nrm = normals ? new Float32Array(vc * 3) : null;
    const uv = uvs ? new Float32Array(vc * 2) : null;
    let cx = 0, cy = 0, cz = 0;
    for (const [oldVi, newVi] of vertMap) {
      const x = positions.getX(oldVi), y = positions.getY(oldVi), z = positions.getZ(oldVi);
      pos[newVi * 3] = x; pos[newVi * 3 + 1] = y; pos[newVi * 3 + 2] = z;
      cx += x; cy += y; cz += z;
      if (nrm) { nrm[newVi * 3] = normals.getX(oldVi); nrm[newVi * 3 + 1] = normals.getY(oldVi); nrm[newVi * 3 + 2] = normals.getZ(oldVi); }
      if (uv) { uv[newVi * 2] = uvs.getX(oldVi); uv[newVi * 2 + 1] = uvs.getY(oldVi); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (nrm) g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(newIndices), 1));
    const m = new THREE.Mesh(g, mesh.material.clone());
    const center = new THREE.Vector3(cx / vc, cy / vc, cz / vc);
    return { mesh: m, faceCount: tris.length, center };
  }

  const results = significant.map((tris, i) => {
    const r = buildIslandMesh(tris);
    r.mesh.name = `${mesh.name}_island${i}`;
    return r;
  });

  // Merge fragments
  if (fragmentTris.length > 0) {
    const r = buildIslandMesh(fragmentTris);
    r.mesh.name = `${mesh.name}_fragments`;
    r.isFragments = true;
    results.push(r);
  }

  // Attach triangle → island map for raycast-precise island lookup
  results.triangleToIsland = triangleToIsland;
  results.significantCount = significant.length;
  return results;
}

function performSplit(entry) {
  const results = splitMeshByIslands(entry.mesh, splitThreshold);
  if (!results) return;

  const par = entry.mesh.parent;
  par.remove(entry.mesh);
  const parts = results.map(r => r.mesh);
  for (const p of parts) par.add(p);

  splitUndoStack.push({ parent: par, originalMesh: entry.mesh, parts });
  splitIslands = results;

  buildMeshInspector(currentModel);
  splitControlsEl.style.display = '';
  splitUndoBtn.style.display = '';
}

// ============================================================
// TURRET TAGGING (two-level: base = yaw only, barrel = yaw + pitch)
// ============================================================
// Each tagged turret: { baseMeshes: [], barrelMeshes: [], pivot, normal, hpRef }
let taggedTurrets = [];

// Pending turret assembly — user builds up a turret by tagging parts, then confirms
let pendingTurret = { baseMeshes: [], barrelMeshes: [] };

function tagTurretPart(entry, role) {
  const mesh = entry.mesh;
  // Don't double-tag
  if (taggedTurrets.some(t => t.baseMeshes.includes(mesh) || t.barrelMeshes.includes(mesh))) return;
  if (pendingTurret.baseMeshes.includes(mesh) || pendingTurret.barrelMeshes.includes(mesh)) return;

  if (role === 'base') {
    pendingTurret.baseMeshes.push(mesh);
  } else {
    pendingTurret.barrelMeshes.push(mesh);
  }

  // Auto-finalize: once we have at least one barrel tagged, create the turret
  // (base is optional — turret works without a separate base)
  if (pendingTurret.barrelMeshes.length > 0) {
    // Also auto-grab nearby untagged meshes of the same role
    autoGroupNearby(pendingTurret);
    finalizeTurret();
  }

  buildMeshInspector(currentModel);
}

function autoGroupNearby(pending) {
  // For each tagged part, find nearby untagged meshes and add as base
  const allParts = [...pending.baseMeshes, ...pending.barrelMeshes];
  if (allParts.length === 0) return;

  const center = new THREE.Vector3();
  for (const m of allParts) {
    const c = new THREE.Vector3();
    new THREE.Box3().setFromObject(m).getCenter(c);
    center.add(c);
  }
  center.divideScalar(allParts.length);

  // Look for nearby meshes that could be the base (within 0.3 units)
  for (const entry of meshEntries) {
    const m = entry.mesh;
    if (allParts.includes(m)) continue;
    if (m.name.includes('_fragment')) continue;
    if (taggedTurrets.some(t => t.baseMeshes.includes(m) || t.barrelMeshes.includes(m))) continue;

    const mCenter = new THREE.Vector3();
    new THREE.Box3().setFromObject(m).getCenter(mCenter);
    if (center.distanceTo(mCenter) < 0.3) {
      // Nearby untagged mesh — add as base if we don't have one
      if (pending.baseMeshes.length === 0) {
        pending.baseMeshes.push(m);
      }
    }
  }
}

function finalizeTurret() {
  const allMeshes = [...pendingTurret.baseMeshes, ...pendingTurret.barrelMeshes];
  if (allMeshes.length === 0) return;

  // Compute pivot from all parts
  const pivot = new THREE.Vector3();
  for (const m of allMeshes) {
    const c = new THREE.Vector3();
    new THREE.Box3().setFromObject(m).getCenter(c);
    pivot.add(c);
  }
  pivot.divideScalar(allMeshes.length);

  const normal = computeAverageNormal(allMeshes);

  const turret = {
    baseMeshes: [...pendingTurret.baseMeshes],
    barrelMeshes: [...pendingTurret.barrelMeshes],
    pivot, normal, hpRef: null,
  };
  // For backward compat with serialization
  turret.islands = allMeshes;

  taggedTurrets.push(turret);
  pendingTurret = { baseMeshes: [], barrelMeshes: [] };

  bindModelTurret(turret);
}

function computeAverageNormal(meshes) {
  const avg = new THREE.Vector3();
  let count = 0;
  for (const m of meshes) {
    const nrm = m.geometry.attributes.normal;
    if (!nrm) continue;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(m.matrixWorld);
    const v = new THREE.Vector3();
    for (let i = 0; i < nrm.count; i++) {
      v.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i)).applyMatrix3(normalMatrix);
      avg.add(v);
      count++;
    }
  }
  return count > 0 ? avg.divideScalar(count).normalize() : new THREE.Vector3(0, 1, 0);
}

function reparentMeshToGroup(mesh, targetGroup, pivot, invQuat) {
  // Capture the mesh's REAL world matrix before detaching it. The previous
  // implementation used currentModel.localToWorld(v), which silently assumed
  // every intermediate node had identity transforms — false for nested glTFs
  // like the Venator (Sketchfab_Scene → Sketchfab_model with 0.01 scale →
  // Object_N). That bug placed rigged meshes hundreds of units off-screen.
  mesh.updateMatrixWorld(true);
  const worldMat = mesh.matrixWorld.clone();

  mesh.removeFromParent();
  targetGroup.add(mesh);
  // Reset local transform — vertices are re-baked into the new local space
  mesh.position.set(0, 0, 0);
  mesh.quaternion.identity();
  mesh.scale.set(1, 1, 1);

  const pos = mesh.geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    v.applyMatrix4(worldMat); // mesh local → world
    v.sub(pivot);              // world → relative to turret pivot
    v.applyQuaternion(invQuat); // align with turret root frame (normal = +Y)
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  mesh.geometry.computeBoundingSphere();
  mesh.geometry.computeBoundingBox();
}

function bindModelTurret(turret) {
  const baseMeshes = turret.baseMeshes || [];
  const barrelMeshes = turret.barrelMeshes || [];
  const { pivot, normal } = turret;

  // Create hardpoint
  const hp = createHardpoint(pivot, normal);
  hp.name = `Model Turret ${taggedTurrets.indexOf(turret) + 1}`;
  hp.modelGeometry = true;
  turret.hpRef = hp;

  // Remove the procedural turret mesh
  if (hp.turretGroup) {
    hpGroup.remove(hp.turretGroup);
    hp.turretGroup.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material?.dispose) c.material.dispose(); });
  }

  // Build hierarchy:
  // root (positioned at pivot, oriented to normal)
  //   └─ yawPivot (rotates left/right)
  //       ├─ base meshes (only rotate with yaw)
  //       └─ pitchPivot (tilts up/down)
  //           └─ barrel meshes (rotate with yaw AND pitch)
  const root = new THREE.Group();
  root.position.copy(pivot);
  root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

  const yawPivot = new THREE.Group();
  root.add(yawPivot);
  const pitchPivot = new THREE.Group();
  yawPivot.add(pitchPivot);

  const invQuat = root.quaternion.clone().invert();

  // Base meshes → under yawPivot (yaw only, no pitch)
  for (const m of baseMeshes) reparentMeshToGroup(m, yawPivot, pivot, invQuat);

  // Barrel meshes → under pitchPivot (yaw + pitch)
  for (const m of barrelMeshes) reparentMeshToGroup(m, pitchPivot, pivot, invQuat);

  hp.turretGroup = root;
  hp.turretYaw = yawPivot;
  hp.turretPitch = pitchPivot;
  hpGroup.add(root);

  // Compute the barrel's natural "forward" direction in pitchPivot local space.
  // For ball turrets the first barrelMesh is the ball (centered on origin) and
  // the rest are gun/detail attachments offset toward the muzzle. Use only the
  // attachments for the centroid so it points clearly along the gun.
  const muzzleSources = barrelMeshes.length > 1 ? barrelMeshes.slice(1) : barrelMeshes;
  const muzzleLocal = new THREE.Vector3();
  let totalVerts = 0;
  for (const m of muzzleSources) {
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      muzzleLocal.x += pos.getX(i);
      muzzleLocal.y += pos.getY(i);
      muzzleLocal.z += pos.getZ(i);
    }
    totalVerts += pos.count;
  }
  if (totalVerts > 0) muzzleLocal.divideScalar(totalVerts);
  // Fallback: if centroid landed at origin (no offset), point straight along
  // local +Z so the laser still has somewhere to come out of.
  if (muzzleLocal.lengthSq() < 1e-8) muzzleLocal.set(0, 0, 0.05);

  hp.muzzleLocal = muzzleLocal;
  // Aim offsets so the BARREL forward, not the local +Z, is what aims at the target
  const muzzleHoriz = Math.sqrt(muzzleLocal.x * muzzleLocal.x + muzzleLocal.z * muzzleLocal.z);
  hp.barrelYawOffset = Math.atan2(muzzleLocal.x, muzzleLocal.z);
  hp.barrelPitchOffset = Math.atan2(muzzleLocal.y, muzzleHoriz);

  buildHpVisuals(hp);
  selectHardpoint(hp);

  // Switch to hardpoints tab
  document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('[data-tab="hardpoints"]').classList.add('active');
  document.getElementById('tab-hardpoints').classList.add('active');
}

// ============================================================
// TURRET RIG FLOW (click barrel → click base)
// ============================================================
const rigStatusEl = document.getElementById('rig-status');

function setRigMode(on) {
  rigMode = on;
  document.getElementById('hp-rig-mode').classList.toggle('active', rigMode);
  rigStatusEl.classList.toggle('visible', rigMode);
  renderer.domElement.style.cursor = (rigMode || placeMode || autoRigMode || bayMode) ? 'crosshair' : '';
  if (!rigMode) {
    cancelRigPick();
    rigStatusEl.innerHTML = 'Click the <b>barrel</b> mesh in the viewport. ESC to cancel.';
  } else {
    // Mutually exclusive with place / auto-rig / bay modes
    if (placeMode) {
      placeMode = false;
      document.getElementById('hp-place-mode').classList.remove('active');
    }
    if (autoRigMode) {
      autoRigMode = false;
      document.getElementById('hp-auto-mode').classList.remove('active');
    }
    if (bayMode) {
      bayMode = false;
      document.getElementById('hp-bay-mode').classList.remove('active');
    }
    rigStatusEl.innerHTML = 'Click the <b>barrel</b> mesh in the viewport. ESC to cancel.';
  }
}

function cancelRigPick() {
  if (rigPendingBarrel && rigPendingBarrelOrigMat) {
    rigPendingBarrel.material = rigPendingBarrelOrigMat;
  }
  rigPendingBarrel = null;
  rigPendingBarrelOrigMat = null;
}

function rigPickMesh(mesh) {
  // Reject already-tagged meshes (they belong to another turret)
  if (taggedTurrets.some(t => t.baseMeshes.includes(mesh) || t.barrelMeshes.includes(mesh))) {
    return;
  }

  if (!rigPendingBarrel) {
    // First click: barrel
    rigPendingBarrel = mesh;
    rigPendingBarrelOrigMat = mesh.material;
    mesh.material = rigBarrelMat;
    rigStatusEl.innerHTML = 'Now click the <b>base</b> mesh (or click the same mesh again for a single-piece turret).';
    return;
  }

  // Second click: base. Restore the barrel's original material before
  // finalizeTurret reparents it (otherwise the highlight sticks).
  const barrel = rigPendingBarrel;
  barrel.material = rigPendingBarrelOrigMat;
  rigPendingBarrel = null;
  rigPendingBarrelOrigMat = null;

  pendingTurret = { baseMeshes: [], barrelMeshes: [] };
  pendingTurret.barrelMeshes.push(barrel);
  // Same-mesh case: barrel and base are one mesh — only put it in barrelMeshes
  // so it gets the full yaw + pitch hierarchy. baseMeshes stays empty.
  if (mesh !== barrel) pendingTurret.baseMeshes.push(mesh);
  finalizeTurret();

  // Done — exit rig mode so accidental clicks don't start a new rig
  setRigMode(false);
}

document.getElementById('hp-rig-mode').addEventListener('click', () => setRigMode(!rigMode));

// ============================================================
// AUTO-RIG FLOW (click one barrel → split + rig every turret on the ship)
// ============================================================
function setAutoRigMode(on) {
  autoRigMode = on;
  document.getElementById('hp-auto-mode').classList.toggle('active', autoRigMode);
  renderer.domElement.style.cursor = (autoRigMode || rigMode || placeMode || bayMode) ? 'crosshair' : '';

  if (autoRigMode) {
    // Mutually exclusive with other modes
    if (rigMode) {
      rigMode = false;
      document.getElementById('hp-rig-mode').classList.remove('active');
      cancelRigPick();
    }
    if (placeMode) {
      placeMode = false;
      document.getElementById('hp-place-mode').classList.remove('active');
    }
    if (bayMode) {
      bayMode = false;
      document.getElementById('hp-bay-mode').classList.remove('active');
    }
    rigStatusEl.innerHTML = 'Click any <b>turret barrel</b> — every turret on the ship will be rigged automatically. ESC to cancel.';
    rigStatusEl.classList.add('visible');
  } else if (!rigMode && !bayMode) {
    rigStatusEl.classList.remove('visible');
  }
}

function computeShipCenter() {
  if (!currentModel) return new THREE.Vector3();
  return new THREE.Box3().setFromObject(currentModel).getCenter(new THREE.Vector3());
}

function autoRigFromMesh(clickedMesh, hitPoint, hitFaceIndex) {
  // Reject already-rigged
  if (taggedTurrets.some(t => t.baseMeshes.includes(clickedMesh) || t.barrelMeshes.includes(clickedMesh))) {
    rigStatusEl.innerHTML = 'That mesh is already part of a rigged turret.';
    return;
  }

  const results = splitMeshByIslands(clickedMesh, AUTO_RIG_MIN_FACES);

  let islandToRig;
  // Two "single mesh" cases: either splitMeshByIslands returned null (already
  // one connected component), or it returned an array but every component was
  // below the fragment threshold. The latter happens with unwelded geometry
  // (vertices not shared between triangles) — common in glTF exports that
  // bake flat shading. In both cases the right thing is to rig the whole
  // mesh as a single turret without splitting it.
  if (!results || results.length === 0 || results.significantCount === 0) {
    islandToRig = clickedMesh;
  } else {
    // Replace original with its islands in the scene. Fragments stay as static
    // decoration so we don't leave holes in the hull where small decals were.
    const par = clickedMesh.parent;
    par.remove(clickedMesh);
    const allParts = results.map(r => r.mesh);
    for (const m of allParts) par.add(m);
    splitUndoStack.push({ parent: par, originalMesh: clickedMesh, parts: allParts });

    // PRECISE PICK: use the actual hit triangle's island, not a distance heuristic.
    // results.triangleToIsland[faceIndex] gives the island index in [0, significantCount).
    if (typeof hitFaceIndex === 'number' && results.triangleToIsland) {
      const islandIdx = results.triangleToIsland[hitFaceIndex];
      if (islandIdx >= 0 && islandIdx < results.significantCount) {
        islandToRig = results[islandIdx].mesh;
      }
    }

    // Fallback only if precise lookup failed (e.g., hit a fragment triangle):
    // pick the island closest to the hit point.
    if (!islandToRig) {
      const tempBox = new THREE.Box3();
      const tempCenter = new THREE.Vector3();
      let bestDist = Infinity;
      for (let i = 0; i < results.significantCount; i++) {
        const m = results[i].mesh;
        tempBox.setFromObject(m);
        tempBox.getCenter(tempCenter);
        const d = tempCenter.distanceTo(hitPoint);
        if (d < bestDist) { bestDist = d; islandToRig = m; }
      }
    }
  }

  // Rig the single island as one turret
  const box = new THREE.Box3().setFromObject(islandToRig);
  const pivot = box.getCenter(new THREE.Vector3());
  const shipCenter = computeShipCenter();
  const normal = pivot.clone().sub(shipCenter);
  if (normal.lengthSq() < 1e-6) normal.set(0, 1, 0);
  else normal.normalize();

  const turret = {
    baseMeshes: [],
    barrelMeshes: [islandToRig],
    pivot, normal, hpRef: null,
  };
  turret.islands = [islandToRig];
  taggedTurrets.push(turret);
  bindModelTurret(turret);

  // Refresh the mesh list — the rigged island has moved out of currentModel
  buildMeshInspector(currentModel);

  // Stay in auto mode so user can click another turret
  const count = taggedTurrets.length;
  rigStatusEl.innerHTML = `Rigged <b>${count}</b> turret${count !== 1 ? 's' : ''}. Click another barrel, or ESC to stop.`;
  rigStatusEl.classList.add('visible');
}

document.getElementById('hp-auto-mode').addEventListener('click', () => setAutoRigMode(!autoRigMode));

// ============================================================
// DRONE BAY PLACEMENT (click ship → drone_bay hardpoint)
// ============================================================
function setBayMode(on) {
  bayMode = on;
  document.getElementById('hp-bay-mode').classList.toggle('active', bayMode);
  renderer.domElement.style.cursor = (bayMode || autoRigMode || rigMode || placeMode) ? 'crosshair' : '';
  if (bayMode) {
    // Mutually exclusive with the other click modes
    if (rigMode) {
      rigMode = false;
      document.getElementById('hp-rig-mode').classList.remove('active');
      cancelRigPick();
    }
    if (autoRigMode) {
      autoRigMode = false;
      document.getElementById('hp-auto-mode').classList.remove('active');
    }
    if (placeMode) {
      placeMode = false;
      document.getElementById('hp-place-mode').classList.remove('active');
    }
    rigStatusEl.innerHTML = 'Click on the <b>bottom of the ship</b> to place a drone bay. ESC to cancel.';
    rigStatusEl.classList.add('visible');
  } else if (!rigMode && !autoRigMode) {
    rigStatusEl.classList.remove('visible');
  }
}
document.getElementById('hp-bay-mode').addEventListener('click', () => setBayMode(!bayMode));

// Detect & rig all ball turrets in one click
document.getElementById('hp-detect').addEventListener('click', () => {
  if (!currentModel) return;
  const r = autoRigBallTurrets();
  if (!r.ok) {
    rigStatusEl.innerHTML = `Detect failed: ${r.error || 'no turrets found'}`;
    rigStatusEl.classList.add('visible');
    setTimeout(() => { if (!autoRigMode && !rigMode) rigStatusEl.classList.remove('visible'); }, 4000);
    return;
  }
  rigStatusEl.innerHTML = `Detected and rigged <b>${r.rigged}</b> ball turret${r.rigged !== 1 ? 's' : ''} (${r.faceCountBucket}-face family). Click <b>Sim</b> to test.`;
  rigStatusEl.classList.add('visible');
  setTimeout(() => { if (!autoRigMode && !rigMode) rigStatusEl.classList.remove('visible'); }, 6000);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (rigMode) setRigMode(false);
    if (autoRigMode) setAutoRigMode(false);
    if (bayMode) setBayMode(false);
  }
});

// ============================================================
// HARDPOINT SYSTEM
// ============================================================

const HP_COLORS = {
  turret: 0x7b7bf7,
  missile_launcher: 0xf77b7b,
  drone_bay: 0x7bf77b,
  point_defense: 0xf7f77b,
};

// Turret geometry templates (shared across instances)
const TURRET_GEOM = {
  turret: { baseR: 0.07, baseH: 0.05, barrelR: 0.02, barrelL: 0.25, barrels: 2, spacing: 0.05 },
  missile_launcher: { baseR: 0.08, baseH: 0.04, barrelR: 0.025, barrelL: 0.15, barrels: 4, spacing: 0.04 },
  drone_bay: { baseR: 0.1, baseH: 0.03, barrelR: 0, barrelL: 0, barrels: 0, spacing: 0 },
  point_defense: { baseR: 0.05, baseH: 0.04, barrelR: 0.015, barrelL: 0.18, barrels: 1, spacing: 0 },
  // Ball turret = full sphere head with one short barrel. Sized small so it
  // fits visually into a "ball turret slot" detected by autoRigBallTurrets.
  ball_turret: {
    baseR: 0.025, baseH: 0.012,
    barrelR: 0.008, barrelL: 0.075,
    barrels: 1, spacing: 0,
    ballHead: true,
    headR: 0.035,
  },
  // Heavy cannon — chunky ball head + long thick barrel. Mirrors the
  // in-game heavy-railgun hardware (turret-rigger.js applyMothershipConfig
  // `isHeavy` branch). Sized to match the preview scale.
  heavy_cannon: {
    baseR: 0.06, baseH: 0.02,
    barrelR: 0.02, barrelL: 0.18,
    barrels: 1, spacing: 0,
    ballHead: true,
    headR: 0.08,
  },
};

// HP_COLORS lookup also needs ball_turret + heavy_cannon to render the head color
HP_COLORS.ball_turret = 0x9b9bff;
HP_COLORS.heavy_cannon = 0xffaa55;

// Default attackId for each hardpoint type, used by the arena when the hp
// hasn't overridden it via the editor dropdown. Keeps a sensible mapping
// even on freshly placed turrets.
const DEFAULT_ATTACK_BY_TYPE = {
  turret: "point-defense-pulse",
  point_defense: "point-defense-pulse",
  ball_turret: "point-defense-pulse",
  heavy_cannon: "heavy-railgun",
  missile_launcher: "guided-missile",
  drone_bay: null,
};
function resolveAttackId(hp) {
  return hp.attackId || DEFAULT_ATTACK_BY_TYPE[hp.type] || "point-defense-pulse";
}

let hpIdCounter = 0;
let simulating = false;
let simTime = 0;
// Multiple sim targets so we can verify hemisphere line-of-sight gating:
// one orbits above the ship, one below, one zigzags through both halves.
const simTargets = [];

function createHardpoint(position, normal, type = 'turret') {
  const id = `hp_${hpIdCounter++}`;
  const cfg = TURRET_GEOM[type] || TURRET_GEOM.turret;
  const hp = {
    id,
    name: `Hardpoint ${hardpoints.length + 1}`,
    type,
    position: position.clone(),
    normal: normal.clone(),
    yawMin: -180, yawMax: 180,
    pitchMin: -10, pitchMax: 60,
    // Arena attack def ID — null means "auto-pick from hp.type". Set via
    // the hp editor dropdown when you want to test a specific weapon on a
    // specific turret. Serialized in the saved config so the sandbox can
    // reload a tuning session.
    attackId: null,
    // Per-hardpoint size + position + rotation OVERRIDES. These let the
    // player tune the look of each turret from the model-preview UI
    // without having to hand-edit the TURRET_GEOM config. The in-game
    // applyMothershipConfig reads these and passes them into the
    // procedural turret builder.
    //   scale       — uniform multiplier on the whole turret (base + barrel).
    //                 1.0 = default catalog size.
    //   offsetX/Y/Z — extra translation applied to the turret ROOT in the
    //                 slot's local frame (local +Y is the surface normal).
    //                 Use offsetY > 0 to lift a turret out of hull, or
    //                 offsetZ > 0 to shift it forward along the barrel axis.
    //   yawOffset   — extra yaw rotation (radians). Applied after the
    //                 normal-alignment quaternion so you can spin a turret
    //                 to face a specific direction at rest.
    //   pitchOffset — extra pitch rotation (radians).
    scale: 1,
    offsetX: 0, offsetY: 0, offsetZ: 0,
    yawOffset: 0, pitchOffset: 0,
    // 3D objects
    marker: null,
    arcMesh: null,
    turretGroup: null,  // the whole turret assembly (positioned + oriented to normal)
    turretYaw: null,    // yaw pivot (rotates around normal)
    turretPitch: null,  // pitch pivot (tilts barrels)
    currentYaw: 0,
    currentPitch: 0,
    // Muzzle position in pitchPivot local space — derived from procedural cfg.
    // For ballHead turrets it sits at the front of the sphere; for default
    // turrets it's at the end of the barrel (z = barrelL).
    muzzleLocal: cfg.ballHead
      ? new THREE.Vector3(0, (cfg.headR || cfg.baseR * 0.8) * 0.6, (cfg.headR || cfg.baseR * 0.8) * 0.7 + cfg.barrelL)
      : new THREE.Vector3(0, 0, cfg.barrelL),
    barrelYawOffset: 0,
    barrelPitchOffset: 0,
  };

  buildHpVisuals(hp);
  hardpoints.push(hp);
  rebuildHpList();
  selectHardpoint(hp);
  autoSave();
  return hp;
}

function buildTurretMesh(hp) {
  // Skip for model-geometry turrets — they're managed by bindModelTurret
  if (hp.modelGeometry) return;

  // Remove old turret
  if (hp.turretGroup) {
    hpGroup.remove(hp.turretGroup);
    hp.turretGroup.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material?.dispose) c.material.dispose(); });
  }

  const cfg = TURRET_GEOM[hp.type] || TURRET_GEOM.turret;
  const color = HP_COLORS[hp.type] || 0xffffff;

  // Root group: positioned at hardpoint, oriented so local Y = surface normal.
  // Per-hardpoint overrides applied here so the preview reflects the saved
  // tuning: extra translation in slot-local space, extra yaw/pitch rotation,
  // uniform scale. The in-game applyMothershipConfig applies the same
  // transforms to the procedural turret at mission start.
  const root = new THREE.Group();
  root.position.copy(hp.position);
  const up = new THREE.Vector3(0, 1, 0);
  root.quaternion.setFromUnitVectors(up, hp.normal);

  // Holder group sits under root and carries the override transforms so
  // the marker (which attaches to the root) doesn't get scaled/shifted.
  const holder = new THREE.Group();
  const s = hp.scale ?? 1;
  holder.scale.setScalar(s);
  holder.position.set(hp.offsetX ?? 0, hp.offsetY ?? 0, hp.offsetZ ?? 0);
  holder.rotation.set(hp.pitchOffset ?? 0, hp.yawOffset ?? 0, 0);
  root.add(holder);

  // Base (cylinder sitting on the surface)
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x444466, roughness: 0.4, metalness: 0.7 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(cfg.baseR, cfg.baseR * 1.1, cfg.baseH, 12), baseMat);
  base.position.y = cfg.baseH / 2;
  holder.add(base);

  // Yaw pivot (rotates around Y / normal axis)
  const yawPivot = new THREE.Group();
  yawPivot.position.y = cfg.baseH;
  holder.add(yawPivot);

  // Pitch pivot (tilts up/down)
  const pitchPivot = new THREE.Group();
  yawPivot.add(pitchPivot);

  if (cfg.barrels > 0) {
    // Turret head — full sphere for ball turrets, half-dome otherwise
    const headMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.6, emissive: new THREE.Color(color).multiplyScalar(0.15) });
    const headRadius = cfg.headR || cfg.baseR * 0.8;
    const headGeom = cfg.ballHead
      ? new THREE.SphereGeometry(headRadius, 14, 10)
      : new THREE.SphereGeometry(headRadius, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const head = new THREE.Mesh(headGeom, headMat);
    if (cfg.ballHead) head.position.y = headRadius * 0.6; // raise so the sphere sits on the base
    pitchPivot.add(head);

    // Barrels
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x888899, roughness: 0.3, metalness: 0.8 });
    const barrelGeom = new THREE.CylinderGeometry(cfg.barrelR, cfg.barrelR, cfg.barrelL, 8);
    barrelGeom.rotateX(Math.PI / 2); // point along Z

    const barrelStartZ = cfg.ballHead ? headRadius * 0.7 : 0;
    const barrelY = cfg.ballHead ? headRadius * 0.6 : 0;
    for (let i = 0; i < cfg.barrels; i++) {
      const barrel = new THREE.Mesh(barrelGeom, barrelMat);
      const offset = (i - (cfg.barrels - 1) / 2) * cfg.spacing;
      barrel.position.set(offset, barrelY, barrelStartZ + cfg.barrelL / 2);
      pitchPivot.add(barrel);
    }
  } else {
    // Drone bay: flat open hangar
    const bayMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3, emissive: new THREE.Color(color).multiplyScalar(0.3) });
    const bay = new THREE.Mesh(new THREE.BoxGeometry(cfg.baseR * 1.5, 0.02, cfg.baseR * 1.5), bayMat);
    bay.position.y = 0.01;
    pitchPivot.add(bay);
  }

  hp.turretGroup = root;
  hp.turretYaw = yawPivot;
  hp.turretPitch = pitchPivot;
  hpGroup.add(root);
}

function buildHpVisuals(hp) {
  // Remove old marker
  if (hp.marker) hpGroup.remove(hp.marker);
  if (hp.arcMesh) hpGroup.remove(hp.arcMesh);

  const color = HP_COLORS[hp.type] || 0xffffff;

  // Small marker sphere (clickable)
  const marker = new THREE.Group();
  marker.position.copy(hp.position);

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 8, 6),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthTest: false })
  );
  sphere.renderOrder = 999;
  marker.add(sphere);

  marker.userData.hpId = hp.id;
  hpGroup.add(marker);
  hp.marker = marker;

  // Build turret mesh
  buildTurretMesh(hp);

  // Build arc visualization
  buildArcVisual(hp);
}

function buildArcVisual(hp) {
  if (hp.arcMesh) {
    hpGroup.remove(hp.arcMesh);
    hp.arcMesh.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material?.dispose) c.material.dispose(); });
  }

  if (!showArcs) return;

  const color = HP_COLORS[hp.type] || 0xffffff;
  const arcGroup = new THREE.Group();
  arcGroup.position.copy(hp.position);

  // Orient arc along the surface normal
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(up, hp.normal);
  arcGroup.quaternion.copy(quat);

  const range = 1.5; // visual arc length
  const yawMin = THREE.MathUtils.degToRad(hp.yawMin);
  const yawMax = THREE.MathUtils.degToRad(hp.yawMax);
  const pitchMin = THREE.MathUtils.degToRad(hp.pitchMin);
  const pitchMax = THREE.MathUtils.degToRad(hp.pitchMax);

  // Draw arc outline as line segments
  const points = [];
  const segments = 32;

  // Outer boundary at max pitch
  for (let i = 0; i <= segments; i++) {
    const yaw = yawMin + (yawMax - yawMin) * (i / segments);
    const x = Math.sin(yaw) * Math.cos(pitchMax) * range;
    const y = Math.sin(pitchMax) * range;
    const z = Math.cos(yaw) * Math.cos(pitchMax) * range;
    points.push(new THREE.Vector3(x, y, z));
  }

  // Outer boundary at min pitch
  const pointsLow = [];
  for (let i = 0; i <= segments; i++) {
    const yaw = yawMin + (yawMax - yawMin) * (i / segments);
    const x = Math.sin(yaw) * Math.cos(pitchMin) * range;
    const y = Math.sin(pitchMin) * range;
    const z = Math.cos(yaw) * Math.cos(pitchMin) * range;
    pointsLow.push(new THREE.Vector3(x, y, z));
  }

  // Build lines: top arc, bottom arc, side edges, radial lines from origin
  const linePoints = [];

  // Top arc
  for (let i = 0; i < points.length - 1; i++) {
    linePoints.push(points[i], points[i + 1]);
  }
  // Bottom arc
  for (let i = 0; i < pointsLow.length - 1; i++) {
    linePoints.push(pointsLow[i], pointsLow[i + 1]);
  }
  // Side edges connecting top to bottom
  linePoints.push(points[0], pointsLow[0]);
  linePoints.push(points[points.length - 1], pointsLow[pointsLow.length - 1]);

  // Radial lines from origin to corners
  const origin = new THREE.Vector3();
  linePoints.push(origin.clone(), points[0]);
  linePoints.push(origin.clone(), points[points.length - 1]);
  linePoints.push(origin.clone(), pointsLow[0]);
  linePoints.push(origin.clone(), pointsLow[pointsLow.length - 1]);

  const lineGeom = new THREE.BufferGeometry().setFromPoints(linePoints);
  const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35, depthTest: false });
  const lines = new THREE.LineSegments(lineGeom, lineMat);
  lines.renderOrder = 998;
  arcGroup.add(lines);

  // Semi-transparent fill for the arc surface
  const fillPoints = [];
  for (let i = 0; i < segments; i++) {
    // Quad from top[i], top[i+1], bottom[i+1], bottom[i]
    fillPoints.push(points[i], points[i + 1], pointsLow[i]);
    fillPoints.push(points[i + 1], pointsLow[i + 1], pointsLow[i]);
  }
  // Side triangles to origin
  for (let i = 0; i < segments; i++) {
    fillPoints.push(origin.clone(), points[i], points[i + 1]);
    fillPoints.push(origin.clone(), pointsLow[i + 1], pointsLow[i]);
  }
  // Left/right walls
  fillPoints.push(origin.clone(), points[0], pointsLow[0]);
  fillPoints.push(origin.clone(), pointsLow[pointsLow.length - 1], points[points.length - 1]);

  const fillGeom = new THREE.BufferGeometry().setFromPoints(fillPoints);
  const fillMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthTest: false });
  const fill = new THREE.Mesh(fillGeom, fillMat);
  fill.renderOrder = 997;
  arcGroup.add(fill);

  hpGroup.add(arcGroup);
  hp.arcMesh = arcGroup;
}

function disposeHpVisuals(hp) {
  if (hp.marker) { hpGroup.remove(hp.marker); hp.marker = null; }
  if (hp.arcMesh) {
    hpGroup.remove(hp.arcMesh);
    hp.arcMesh.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material?.dispose) c.material.dispose(); });
    hp.arcMesh = null;
  }
  if (hp.turretGroup) {
    // For model geometry turrets, don't dispose the island meshes — just remove from hierarchy
    if (hp.modelGeometry) {
      // Detach island meshes back (they'll be cleaned up when model reloads)
      hp.turretGroup.traverse(c => { if (c.isMesh) c.removeFromParent(); });
    } else {
      hp.turretGroup.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material?.dispose) c.material.dispose(); });
    }
    hpGroup.remove(hp.turretGroup);
    hp.turretGroup = null;
  }
  hp.turretYaw = hp.turretPitch = null;
}

function unhideSlotMeshes(hp) {
  // Restore visibility on any model meshes this hardpoint was hiding
  if (!hp.modelSlot || !hp.hiddenMeshNames || !currentModel) return;
  const names = new Set(hp.hiddenMeshNames);
  currentModel.traverse(c => { if (c.isMesh && names.has(c.name)) c.visible = true; });
}

function removeHardpoint(hp) {
  unhideSlotMeshes(hp);
  disposeHpVisuals(hp);
  hardpoints = hardpoints.filter(h => h !== hp);
  taggedTurrets = taggedTurrets.filter(t => t.hpRef !== hp);
  if (selectedHp === hp) { selectedHp = null; hpEditor.classList.remove('visible'); }
  rebuildHpList();
  autoSave();
}

function clearHardpoints() {
  for (const hp of hardpoints) {
    unhideSlotMeshes(hp);
    disposeHpVisuals(hp);
  }
  hardpoints = [];
  selectedHp = null;
  hpEditor.classList.remove('visible');
  rebuildHpList();
}

// ============================================================
// HARDPOINT UI
// ============================================================
function rebuildHpList() {
  hpListEl.innerHTML = '';
  hpCountEl.textContent = `${hardpoints.length} hardpoint${hardpoints.length !== 1 ? 's' : ''}`;

  for (const hp of hardpoints) {
    const item = document.createElement('div');
    item.className = `hp-item${selectedHp === hp ? ' selected' : ''}`;
    item.innerHTML = `
      <div class="hp-header">
        <span class="hp-name">${hp.name}</span>
        <span class="hp-type hp-type-${hp.type}">${hp.type.replace('_', ' ')}</span>
        <button class="hp-row-delete" title="Delete this hardpoint" data-hp-id="${hp.id}">×</button>
      </div>
    `;
    // Select on row click (but not on the delete × button)
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('hp-row-delete')) return;
      selectHardpoint(hp);
    });
    const delBtn = item.querySelector('.hp-row-delete');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeHardpoint(hp);
    });
    hpListEl.appendChild(item);
  }
}

function selectHardpoint(hp) {
  selectedHp = hp;
  rebuildHpList();

  // Populate editor
  document.getElementById('hp-name').value = hp.name;
  document.getElementById('hp-type').value = hp.type;
  document.getElementById('hp-attack-id').value = hp.attackId || "";
  document.getElementById('hp-yaw-min').value = hp.yawMin;
  document.getElementById('hp-yaw-max').value = hp.yawMax;
  document.getElementById('hp-pitch-min').value = hp.pitchMin;
  document.getElementById('hp-pitch-max').value = hp.pitchMax;
  document.getElementById('hp-yaw-min-val').textContent = hp.yawMin;
  document.getElementById('hp-yaw-max-val').textContent = hp.yawMax;
  document.getElementById('hp-pitch-min-val').textContent = hp.pitchMin;
  document.getElementById('hp-pitch-max-val').textContent = hp.pitchMax;
  // Override sliders — mirror the hp's current override values into the UI.
  const scale = hp.scale ?? 1;
  const offsetX = hp.offsetX ?? 0;
  const offsetY = hp.offsetY ?? 0;
  const offsetZ = hp.offsetZ ?? 0;
  const yawOff = hp.yawOffset ?? 0;
  const pitchOff = hp.pitchOffset ?? 0;
  document.getElementById('hp-scale').value = scale;
  document.getElementById('hp-scale-val').textContent = scale.toFixed(2);
  document.getElementById('hp-offsetX').value = offsetX;
  document.getElementById('hp-offsetX-val').textContent = offsetX.toFixed(2);
  document.getElementById('hp-offsetY').value = offsetY;
  document.getElementById('hp-offsetY-val').textContent = offsetY.toFixed(2);
  document.getElementById('hp-offsetZ').value = offsetZ;
  document.getElementById('hp-offsetZ-val').textContent = offsetZ.toFixed(2);
  // Yaw/pitch offsets stored as radians, displayed as degrees
  document.getElementById('hp-yawOffset').value = Math.round(yawOff * 180 / Math.PI);
  document.getElementById('hp-yawOffset-val').textContent = Math.round(yawOff * 180 / Math.PI) + '°';
  document.getElementById('hp-pitchOffset').value = Math.round(pitchOff * 180 / Math.PI);
  document.getElementById('hp-pitchOffset-val').textContent = Math.round(pitchOff * 180 / Math.PI) + '°';
  hpEditor.classList.add('visible');

  // Highlight marker
  hardpoints.forEach(h => {
    const sphere = h.marker?.children[0];
    if (sphere) sphere.material.opacity = h === hp ? 1.0 : 0.5;
  });
}

// Editor bindings
document.getElementById('hp-name').addEventListener('input', (e) => {
  if (!selectedHp) return;
  selectedHp.name = e.target.value;
  rebuildHpList();
  autoSave();
});

document.getElementById('hp-type').addEventListener('change', (e) => {
  if (!selectedHp) return;
  selectedHp.type = e.target.value;
  buildHpVisuals(selectedHp);
  buildTurretMesh(selectedHp);
  rebuildHpList();
  autoSave();
});
document.getElementById('hp-attack-id').addEventListener('change', (e) => {
  if (!selectedHp) return;
  selectedHp.attackId = e.target.value || null;
  autoSave();
});

for (const field of ['hp-yaw-min', 'hp-yaw-max', 'hp-pitch-min', 'hp-pitch-max']) {
  document.getElementById(field).addEventListener('input', (e) => {
    if (!selectedHp) return;
    const val = parseInt(e.target.value);
    document.getElementById(`${field}-val`).textContent = val;
    if (field === 'hp-yaw-min') selectedHp.yawMin = val;
    if (field === 'hp-yaw-max') selectedHp.yawMax = val;
    if (field === 'hp-pitch-min') selectedHp.pitchMin = val;
    if (field === 'hp-pitch-max') selectedHp.pitchMax = val;
    buildArcVisual(selectedHp);
    autoSave();
  });
}

// Override sliders (scale + offset + rotation). On change, rebuild the
// turret mesh so the preview reflects the new tuning immediately, then
// autoSave so the in-game applyMothershipConfig picks it up next mission.
function wireOverrideSlider(id, hpKey, { radians = false } = {}) {
  const input = document.getElementById(id);
  const label = document.getElementById(id + '-val');
  input.addEventListener('input', (e) => {
    if (!selectedHp) return;
    const raw = parseFloat(e.target.value);
    const value = radians ? raw * Math.PI / 180 : raw;
    selectedHp[hpKey] = value;
    if (radians) label.textContent = Math.round(raw) + '°';
    else label.textContent = raw.toFixed(2);
    buildTurretMesh(selectedHp);
    autoSave();
  });
}
wireOverrideSlider('hp-scale', 'scale');
wireOverrideSlider('hp-offsetX', 'offsetX');
wireOverrideSlider('hp-offsetY', 'offsetY');
wireOverrideSlider('hp-offsetZ', 'offsetZ');
wireOverrideSlider('hp-yawOffset', 'yawOffset', { radians: true });
wireOverrideSlider('hp-pitchOffset', 'pitchOffset', { radians: true });

document.getElementById('hp-reset-overrides').addEventListener('click', () => {
  if (!selectedHp) return;
  selectedHp.scale = 1;
  selectedHp.offsetX = 0;
  selectedHp.offsetY = 0;
  selectedHp.offsetZ = 0;
  selectedHp.yawOffset = 0;
  selectedHp.pitchOffset = 0;
  buildTurretMesh(selectedHp);
  autoSave();
  selectHardpoint(selectedHp); // refresh the sliders
});

document.getElementById('hp-delete').addEventListener('click', () => {
  if (selectedHp) removeHardpoint(selectedHp);
});

// Place mode toggle — now supports per-weapon-type placement. Clicking a
// "+Ball"/"+Heavy"/"+Missile" button arms place mode with that specific
// type; clicking the generic "Place" button uses "turret" as before. The
// click handler on the canvas reads `placeType` to decide what kind of
// hardpoint to create at the hit point.
let placeType = "turret";
const placeTypeButtons = Array.from(document.querySelectorAll('.hp-place-type'));
for (const btn of placeTypeButtons) {
  btn.addEventListener('click', () => {
    const wantedType = btn.dataset.placeType;
    // Clicking the active placement type toggles it off
    if (placeMode && placeType === wantedType) {
      placeMode = false;
      placeType = "turret";
    } else {
      placeMode = true;
      placeType = wantedType;
    }
    // Update button highlights — only the active one is lit
    for (const b of placeTypeButtons) {
      b.classList.toggle('active', placeMode && b.dataset.placeType === placeType);
    }
    renderer.domElement.style.cursor = placeMode ? 'crosshair' : '';
    // Mutually exclusive with rig / auto-rig / bay modes
    if (placeMode && rigMode) setRigMode(false);
    if (placeMode && autoRigMode) setAutoRigMode(false);
    if (placeMode && bayMode) setBayMode(false);
  });
}
const placeModeBtn = document.getElementById('hp-place-mode');

// Arc visibility toggle
const showArcsBtn = document.getElementById('hp-show-arcs');
showArcsBtn.addEventListener('click', () => {
  showArcs = !showArcs;
  showArcsBtn.classList.toggle('active', showArcs);
  for (const hp of hardpoints) buildArcVisual(hp);
});

// Three sim targets with distinct flight patterns.
// Target 0 (red)    — orbits above the ship: tests TOP turrets
// Target 1 (cyan)   — orbits below the ship: tests BOTTOM turrets
// Target 2 (yellow) — zigzags through the hull plane: tests the handoff
const TARGET_COLORS = [0xff3344, 0x44ddff, 0xffdd33];
for (let i = 0; i < 3; i++) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 14, 10),
    new THREE.MeshBasicMaterial({ color: TARGET_COLORS[i], transparent: true, opacity: 0.9, depthTest: false })
  );
  mesh.renderOrder = 1000;
  simTargets.push({ position: new THREE.Vector3(), mesh });
}

function updateSimTargets(t) {
  // Above
  simTargets[0].position.set(
    Math.sin(t * 0.5) * 4,
    Math.sin(t * 0.7) * 0.8 + 1.8,
    Math.cos(t * 0.3) * 4
  );
  // Below — mirrored figure-8 down low
  simTargets[1].position.set(
    Math.sin(t * 0.45 + 2.1) * 3.5,
    Math.sin(t * 0.6) * 0.8 - 1.8,
    Math.cos(t * 0.35 + 2.1) * 3.5
  );
  // Through — bobs from well above to well below the hull plane
  simTargets[2].position.set(
    Math.sin(t * 0.25) * 4.5,
    Math.sin(t * 0.9) * 2.5,
    Math.cos(t * 0.4) * 4
  );
  for (const s of simTargets) s.mesh.position.copy(s.position);
}

// Pick the closest sim target that this turret can actually see (target on
// the OUTWARD side of the slot's surface normal). Returns null if every
// target is on the wrong side of the hull from this turret.
const _candLocal = new THREE.Vector3();
function chooseTargetForTurret(hp) {
  if (!hp.turretYaw || !hp.turretGroup) return null;
  _tempMatrix.copy(hp.turretGroup.matrixWorld).invert();
  let best = null;
  let bestDistSq = Infinity;
  for (const s of simTargets) {
    _candLocal.copy(s.position).applyMatrix4(_tempMatrix);
    if (_candLocal.y > 0.05) {
      const d = _candLocal.lengthSq();
      if (d < bestDistSq) { bestDistSq = d; best = s; }
    }
  }
  return best;
}

// Simulate toggle
const simulateBtn = document.getElementById('hp-simulate');
simulateBtn.addEventListener('click', () => {
  simulating = !simulating;
  simulateBtn.classList.toggle('active', simulating);
  if (simulating) {
    for (const s of simTargets) scene.add(s.mesh);
  } else {
    for (const s of simTargets) scene.remove(s.mesh);
    // Reset turret rotations
    for (const hp of hardpoints) {
      if (hp.turretYaw) hp.turretYaw.rotation.y = 0;
      if (hp.turretPitch) hp.turretPitch.rotation.x = 0;
      hp.currentYaw = 0;
      hp.currentPitch = 0;
    }
    clearAllLasers();
  }
});

// --- Turret aiming logic ---
const _targetLocal = new THREE.Vector3();
const _tempMatrix = new THREE.Matrix4();

function aimTurretAtTarget(hp, target, dt) {
  if (!hp.turretYaw || !hp.turretGroup) return;

  // Get target position in turret's local space (relative to turretGroup)
  _tempMatrix.copy(hp.turretGroup.matrixWorld).invert();
  _targetLocal.copy(target).applyMatrix4(_tempMatrix);

  // Line-of-sight gate: only fire if the target is on the OUTWARD side of
  // the turret (local +Y is the surface normal). For a bottom-mounted turret
  // this prevents firing through the hull at a target above the ship.
  hp.canFire = _targetLocal.y > 0.05;

  // Calculate desired yaw/pitch in the turret's local frame, then subtract
  // the barrel's natural orientation offset so that the BARREL (not the
  // arbitrary local +Z) ends up pointing at the target.
  const barrelYawOffset = hp.barrelYawOffset || 0;
  const barrelPitchOffset = hp.barrelPitchOffset || 0;

  let desiredYaw = Math.atan2(_targetLocal.x, _targetLocal.z) - barrelYawOffset;
  const horizDist = Math.sqrt(_targetLocal.x * _targetLocal.x + _targetLocal.z * _targetLocal.z);
  let desiredPitch = Math.atan2(_targetLocal.y, horizDist) - barrelPitchOffset;

  // Clamp to firing arc
  const yawMin = THREE.MathUtils.degToRad(hp.yawMin);
  const yawMax = THREE.MathUtils.degToRad(hp.yawMax);
  const pitchMin = THREE.MathUtils.degToRad(hp.pitchMin);
  const pitchMax = THREE.MathUtils.degToRad(hp.pitchMax);

  desiredYaw = THREE.MathUtils.clamp(desiredYaw, yawMin, yawMax);
  desiredPitch = THREE.MathUtils.clamp(desiredPitch, pitchMin, pitchMax);

  // Smooth rotation (turret tracking speed)
  const trackSpeed = hp.type === 'point_defense' ? 8.0 : hp.type === 'turret' ? 3.0 : 2.0;
  hp.currentYaw = THREE.MathUtils.lerp(hp.currentYaw, desiredYaw, 1 - Math.exp(-trackSpeed * dt));
  hp.currentPitch = THREE.MathUtils.lerp(hp.currentPitch, desiredPitch, 1 - Math.exp(-trackSpeed * dt));

  hp.turretYaw.rotation.y = hp.currentYaw;
  hp.turretPitch.rotation.x = -hp.currentPitch; // negative because pitch up = negative X rotation
}

// ============================================================
// WEAPON FX — pooled laser pulses, fired during simulation
// ============================================================
const LASER_POOL_SIZE = 80;
const LASER_LIFETIME = 0.18; // seconds — short pulse
const LASER_COLOR = 0x66ff88;
const lasers = [];
// Thicker beam (was 0.006) so it's clearly visible at typical camera distances
const laserGeom = new THREE.CylinderGeometry(0.022, 0.022, 1, 8, 1, true);
laserGeom.rotateX(Math.PI / 2); // axis along +Z so we can stretch with scale.z
for (let i = 0; i < LASER_POOL_SIZE; i++) {
  const mat = new THREE.MeshBasicMaterial({
    color: LASER_COLOR, transparent: true, opacity: 0.95, depthWrite: false,
  });
  const m = new THREE.Mesh(laserGeom, mat);
  m.visible = false;
  m.renderOrder = 1500;
  scene.add(m);
  lasers.push({ mesh: m, lifetime: 0 });
}

const _fireMid = new THREE.Vector3();
const _muzzlePos = new THREE.Vector3();

function fireLaser(fromPos, toPos) {
  let laser = null;
  for (const l of lasers) if (l.lifetime <= 0) { laser = l; break; }
  if (!laser) return; // pool exhausted, drop the shot
  laser.lifetime = LASER_LIFETIME;
  laser.mesh.visible = true;
  laser.mesh.material.opacity = 0.95;
  // Stretch a unit cylinder along its Z axis between the two points
  _fireMid.copy(fromPos).add(toPos).multiplyScalar(0.5);
  const dist = fromPos.distanceTo(toPos);
  laser.mesh.position.copy(_fireMid);
  laser.mesh.scale.set(1, 1, dist);
  laser.mesh.lookAt(toPos);
}

function updateLasers(dt) {
  for (const l of lasers) {
    if (l.lifetime <= 0) continue;
    l.lifetime -= dt;
    if (l.lifetime <= 0) {
      l.mesh.visible = false;
    } else {
      l.mesh.material.opacity = 0.95 * (l.lifetime / LASER_LIFETIME);
    }
  }
}

function clearAllLasers() {
  for (const l of lasers) {
    l.lifetime = 0;
    l.mesh.visible = false;
  }
}

// ============================================================
// SAVE / LOAD / EXPORT
// ============================================================
function serializeHardpoints() {
  return {
    modelId: currentModelId,
    splitThreshold,
    hardpoints: hardpoints.map(hp => {
      const entry = {
        name: hp.name,
        type: hp.type,
        position: { x: hp.position.x, y: hp.position.y, z: hp.position.z },
        normal: { x: hp.normal.x, y: hp.normal.y, z: hp.normal.z },
        yawMin: hp.yawMin, yawMax: hp.yawMax,
        pitchMin: hp.pitchMin, pitchMax: hp.pitchMax,
        // Per-hardpoint size/position/rotation overrides — only written
        // when they differ from defaults to keep the save file small.
      };
      if (hp.attackId) entry.attackId = hp.attackId;
      if ((hp.scale ?? 1) !== 1) entry.scale = hp.scale;
      if ((hp.offsetX ?? 0) !== 0) entry.offsetX = hp.offsetX;
      if ((hp.offsetY ?? 0) !== 0) entry.offsetY = hp.offsetY;
      if ((hp.offsetZ ?? 0) !== 0) entry.offsetZ = hp.offsetZ;
      if ((hp.yawOffset ?? 0) !== 0) entry.yawOffset = hp.yawOffset;
      if ((hp.pitchOffset ?? 0) !== 0) entry.pitchOffset = hp.pitchOffset;
      // Save model turret binding info (old click-Rig flow that reparents
      // the model meshes under turret pivots)
      if (hp.modelGeometry) {
        const turret = taggedTurrets.find(t => t.hpRef === hp);
        if (turret) {
          entry.modelTurret = {
            islandNames: turret.islands.map(m => m.name),
          };
        }
      }
      // Save slot info (new Detect flow that hides the model meshes and uses
      // a procedural turret)
      if (hp.modelSlot) {
        entry.modelSlot = {
          hiddenMeshNames: hp.hiddenMeshNames || [],
        };
      }
      return entry;
    }),
  };
}

function importHardpoints(data) {
  clearHardpoints();
  taggedTurrets = [];
  if (!data.hardpoints) return;

  if (data.splitThreshold) {
    splitThreshold = data.splitThreshold;
    splitThresholdSlider.value = splitThreshold;
    splitThresholdVal.textContent = splitThreshold;
  }

  // Re-split any batched meshes whose island children are referenced in the save.
  // Both modelTurret and modelSlot use island names like `foo_islandN`, so we
  // need to find `foo` and split it before the lookup below can find islands.
  if (currentModel) {
    const parentsToSplit = new Set();
    for (const hpData of data.hardpoints) {
      const islandNames = hpData.modelTurret?.islandNames || hpData.modelSlot?.hiddenMeshNames || [];
      for (const name of islandNames) {
        const m = /^(.+)_island\d+$/.exec(name);
        if (m) parentsToSplit.add(m[1]);
      }
    }
    for (const parentName of parentsToSplit) {
      let target = null;
      currentModel.traverse(c => {
        if (!target && c.isMesh && c.name === parentName) target = c;
      });
      if (!target) continue;
      const results = splitMeshByIslands(target, AUTO_RIG_MIN_FACES);
      if (!results) continue;
      const par = target.parent;
      par.remove(target);
      for (const r of results) par.add(r.mesh);
    }
  }

  for (const hpData of data.hardpoints) {
    if (hpData.modelTurret) {
      // Model turret — look up each island BY NAME in order so the first
      // saved island stays first (it's the ball / pivot reference for ball
      // turret rigs).
      const islandMeshes = [];
      for (const name of hpData.modelTurret.islandNames) {
        let found = null;
        if (currentModel) currentModel.traverse(c => { if (!found && c.isMesh && c.name === name) found = c; });
        if (!found) hpGroup.traverse(c => { if (!found && c.isMesh && c.name === name) found = c; });
        if (found) islandMeshes.push(found);
      }

      if (islandMeshes.length > 0) {
        const pos = new THREE.Vector3(hpData.position.x, hpData.position.y, hpData.position.z);
        const norm = new THREE.Vector3(hpData.normal.x, hpData.normal.y, hpData.normal.z);
        const turret = {
          baseMeshes: [],
          barrelMeshes: islandMeshes,  // bindModelTurret needs this to actually rig
          islands: islandMeshes,
          pivot: pos, normal: norm,
        };
        taggedTurrets.push(turret);
        bindModelTurret(turret);
        const hp = turret.hpRef;
        hp.name = hpData.name;
        hp.type = hpData.type;
        hp.yawMin = hpData.yawMin ?? -180;
        hp.yawMax = hpData.yawMax ?? 180;
        hp.pitchMin = hpData.pitchMin ?? -10;
        hp.pitchMax = hpData.pitchMax ?? 60;
        buildArcVisual(hp);
      }
    } else if (hpData.modelSlot) {
      // Slot mode (Detect-style ball turret): hide the original meshes and
      // create a procedural turret at the saved position/normal.
      const hiddenNames = hpData.modelSlot.hiddenMeshNames || [];
      const hiddenMeshes = [];
      for (const name of hiddenNames) {
        let found = null;
        if (currentModel) currentModel.traverse(c => { if (!found && c.isMesh && c.name === name) found = c; });
        if (found) {
          found.visible = false;
          hiddenMeshes.push(found);
        }
      }
      const pos = new THREE.Vector3(hpData.position.x, hpData.position.y, hpData.position.z);
      const norm = new THREE.Vector3(hpData.normal.x, hpData.normal.y, hpData.normal.z);
      const hp = createHardpoint(pos, norm, hpData.type || 'ball_turret');
      hp.name = hpData.name;
      hp.yawMin = hpData.yawMin ?? -180;
      hp.yawMax = hpData.yawMax ?? 180;
      hp.pitchMin = hpData.pitchMin ?? -10;
      hp.pitchMax = hpData.pitchMax ?? 60;
      hp.attackId = hpData.attackId || null;
      hp.scale = hpData.scale ?? 1;
      hp.offsetX = hpData.offsetX ?? 0;
      hp.offsetY = hpData.offsetY ?? 0;
      hp.offsetZ = hpData.offsetZ ?? 0;
      hp.yawOffset = hpData.yawOffset ?? 0;
      hp.pitchOffset = hpData.pitchOffset ?? 0;
      hp.modelSlot = true;
      hp.hiddenMeshNames = hiddenNames;
      buildTurretMesh(hp); // rebuild with overrides applied
      taggedTurrets.push({
        hpRef: hp,
        islands: hiddenMeshes,
        baseMeshes: [],
        barrelMeshes: [],
        slotMode: true,
      });
      buildArcVisual(hp);
    } else {
      // Regular procedural hardpoint
      const pos = new THREE.Vector3(hpData.position.x, hpData.position.y, hpData.position.z);
      const norm = new THREE.Vector3(hpData.normal.x, hpData.normal.y, hpData.normal.z);
      const hp = createHardpoint(pos, norm, hpData.type);
      hp.name = hpData.name;
      hp.type = hpData.type;
      hp.yawMin = hpData.yawMin ?? -180;
      hp.yawMax = hpData.yawMax ?? 180;
      hp.pitchMin = hpData.pitchMin ?? -10;
      hp.pitchMax = hpData.pitchMax ?? 60;
      hp.attackId = hpData.attackId || null;
      hp.scale = hpData.scale ?? 1;
      hp.offsetX = hpData.offsetX ?? 0;
      hp.offsetY = hpData.offsetY ?? 0;
      hp.offsetZ = hpData.offsetZ ?? 0;
      hp.yawOffset = hpData.yawOffset ?? 0;
      hp.pitchOffset = hpData.pitchOffset ?? 0;
      buildHpVisuals(hp);
      buildTurretMesh(hp);
    }
  }
  rebuildHpList();
  if (hardpoints.length > 0) selectHardpoint(hardpoints[0]);
}

function autoSave() {
  if (!currentModelId) return;
  localStorage.setItem(`ship-hp-${currentModelId}`, JSON.stringify(serializeHardpoints()));
}

// Save to file
document.getElementById('hp-save').addEventListener('click', () => {
  const data = JSON.stringify(serializeHardpoints(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentModelId || 'ship'}-hardpoints.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// Load from file
document.getElementById('hp-load').addEventListener('click', () => {
  document.getElementById('hp-file-input').click();
});
document.getElementById('hp-file-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      importHardpoints(JSON.parse(reader.result));
      autoSave();
    } catch (err) { console.error('Invalid hardpoint file', err); }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// Copy to clipboard
document.getElementById('hp-export').addEventListener('click', () => {
  const data = JSON.stringify(serializeHardpoints(), null, 2);
  navigator.clipboard.writeText(data).then(() => {
    const btn = document.getElementById('hp-export');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
  });
});

// Clear all hardpoints + wipe localStorage + reload current model
document.getElementById('hp-clear-all').addEventListener('click', () => {
  if (hardpoints.length > 0 && !confirm(`Delete all ${hardpoints.length} hardpoint(s) and reload the model?`)) return;
  if (currentModelId) localStorage.removeItem(`ship-hp-${currentModelId}`);
  const idx = MODELS.findIndex(m => m.id === currentModelId);
  if (idx >= 0) loadModel(MODELS[idx], modelList.children[idx]);
});

// ============================================================
// VIEWPORT CLICK HANDLING
// ============================================================
let mouseDownPos = null;

renderer.domElement.addEventListener('mousedown', (e) => {
  mouseDownPos = { x: e.clientX, y: e.clientY };
});

renderer.domElement.addEventListener('click', (e) => {
  if (!currentModel) return;
  // Ignore if this was a drag (orbit)
  if (mouseDownPos && (Math.abs(e.clientX - mouseDownPos.x) > 4 || Math.abs(e.clientY - mouseDownPos.y) > 4)) return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  // Check if clicking a hardpoint marker first (unless rigging, auto-rigging, placing, or bay-placing)
  const markerMeshes = [];
  hpGroup.traverse(c => { if (c.isMesh && c.geometry.type === 'SphereGeometry') markerMeshes.push(c); });
  const markerHits = raycaster.intersectObjects(markerMeshes, false);
  if (markerHits.length > 0 && !placeMode && !rigMode && !autoRigMode && !bayMode) {
    const markerId = markerHits[0].object.parent?.userData?.hpId;
    const hp = hardpoints.find(h => h.id === markerId);
    if (hp) {
      selectHardpoint(hp);
      // Switch to hardpoints tab
      document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('[data-tab="hardpoints"]').classList.add('active');
      document.getElementById('tab-hardpoints').classList.add('active');
      return;
    }
  }

  // Raycast against model meshes
  const modelMeshes = [];
  currentModel.traverse(c => { if (c.isMesh) modelMeshes.push(c); });
  const hits = raycaster.intersectObjects(modelMeshes, false);

  // Auto-rig owns the click before anything else
  if (autoRigMode) {
    if (hits.length > 0) {
      autoRigFromMesh(hits[0].object, hits[0].point, hits[0].faceIndex);
    } else {
      // Empty-space click → cancel auto-rig
      setAutoRigMode(false);
    }
    return;
  }

  // Rig mode owns this click before anything else
  if (rigMode) {
    if (hits.length > 0) {
      rigPickMesh(hits[0].object);
    } else {
      // Click on empty space → cancel in-progress rig
      cancelRigPick();
      rigStatusEl.innerHTML = 'Click the <b>barrel</b> mesh in the viewport. ESC to cancel.';
    }
    return;
  }

  if (hits.length > 0) {
    if (bayMode) {
      // Place a drone bay at the hit point. The face normal is the surface
      // normal — for a click on the bottom of the ship that points DOWN, so
      // drones spawning from the bay will exit "outward" through the hull.
      const hit = hits[0];
      const surfaceNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
      const bay = createHardpoint(hit.point, surfaceNormal, 'drone_bay');
      bay.name = `Drone Bay ${hardpoints.filter(h => h.type === 'drone_bay').length}`;
      rebuildHpList();
      setBayMode(false);
      // Switch to hardpoints tab
      document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('[data-tab="hardpoints"]').classList.add('active');
      document.getElementById('tab-hardpoints').classList.add('active');
    } else if (placeMode) {
      // Place a hardpoint of the currently-armed type at the hit point.
      // The face normal is transformed into world space so the turret's
      // local +Y aligns with the outward-pointing hull direction.
      const hit = hits[0];
      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
      createHardpoint(hit.point, normal, placeType);
      // Switch to hardpoints tab
      document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('[data-tab="hardpoints"]').classList.add('active');
      document.getElementById('tab-hardpoints').classList.add('active');
    } else {
      // Mesh highlighting (when on meshes tab)
      const activeTab = document.querySelector('.panel-tab.active')?.dataset.tab;
      if (activeTab === 'meshes') {
        const hitMesh = hits[0].object;
        const entry = meshEntries.find(e => e.mesh === hitMesh);
        if (entry) {
          const row = meshListEl.querySelector(`.mesh-item[data-idx="${entry.idx}"]`);
          if (row) row.click();
        }
      }
    }
  }
});

// Double-click to reset camera
renderer.domElement.addEventListener('dblclick', () => {
  camera.position.set(5.5, 3, 5.5);
  controls.target.set(0, 0, 0);
  controls.update();
});

// ============================================================
// RESIZE
// ============================================================
function resize() {
  const rect = viewport.getBoundingClientRect();
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
  renderer.setSize(rect.width, rect.height);
}
window.addEventListener('resize', resize);
resize();

// ============================================================
// RENDER LOOP
// ============================================================
const clock = new THREE.Clock();
// ============================================================
// TEST ARENA — runs the real in-game TurretSystem against sandbox
// hardpoints so balance tuning uses the same shaders + damage paths
// as a mission. Toggle with Run/Stop; hit the spawn buttons to add
// test enemies from the real ENEMY_TYPES catalog.
// ============================================================

const arena = {
  running: false,
  turretSystem: null,
  // Fake mothership object shaped like the real one so TurretSystem can
  // consume it. mesh is an Object3D we create when arena starts; turrets
  // is the adapter list built from hardpoints[].
  fakeMothership: null,
  // Arena-owned container for real turret meshes + enemy meshes
  sceneGroup: null,
  // Built turret records: { hp, built, turretObj } — turretObj is the
  // entry inserted into fakeMothership.turrets.
  builtTurrets: [],
  // Test enemies — simple { type, position, velocity, stats, mesh, alive }
  // objects. TurretSystem's _pickTarget + applyDamage consume this shape.
  enemies: [],
  motionMode: "static",
  // Stats keyed by attackId — populated by the TurretSystem hooks
  stats: new Map(),
  startTime: 0,
};

function arenaResolveMothershipCenter() {
  // Use the origin of the currentModel as the arena center. Enemies spawn
  // at a fixed radius from here; turrets pick them up via their hemisphere
  // checks against the turret-local frame.
  if (!currentModel) return new THREE.Vector3(0, 0, 0);
  const box = new THREE.Box3().setFromObject(currentModel);
  return box.getCenter(new THREE.Vector3());
}

function arenaBuildFakeTurretFromHp(hp) {
  // Pick the matching real builder based on the hp's resolved attackId.
  // Missile launchers use buildMissileLauncher; everything else uses
  // buildBallTurret with cfg matching the in-game tier assignment.
  const attackId = resolveAttackId(hp);
  const attackDef = getAttack(attackId);
  if (!attackDef) return null;

  let built;
  let weaponType;
  // Route by attack def's shape, mirroring turret-rigger.js applyMothershipConfig.
  // Guided missile + flak-burst-missile use the revolver launcher. Flak burst
  // (slow projectile) and heavy railgun (hitscan) use the ball-turret shape.
  const isMissile = attackDef.shaderStyle === undefined && attackId === "guided-missile";
  if (isMissile) {
    built = buildMissileLauncher(hp.position, hp.normal, {
      baseR: 0.10, baseH: 0.04,
      revolverR: 0.16, revolverL: 0.30,
      tubeR: 0.045, tubeOffsetR: 0.10, tipL: 0.06,
      color: 0x556677, accentColor: 0xff8844,
    });
    weaponType = "missile_launcher";
  } else if (attackId === "heavy-railgun") {
    built = buildBallTurret(hp.position, hp.normal, {
      baseR: 0.18, baseH: 0.07,
      barrelR: 0.06, barrelL: 0.55,
      headR: 0.24,
      color: 0xddddee,
    });
    weaponType = "laser";
  } else if (attackId === "flak-burst") {
    built = buildBallTurret(hp.position, hp.normal, {
      baseR: 0.06, baseH: 0.020,
      barrelR: 0.018, barrelL: 0.18,
      headR: 0.06,
      color: 0xffbb33,
    });
    weaponType = "heavy_cannon";
  } else if (attackId === "shield-breaker") {
    built = buildBallTurret(hp.position, hp.normal, {
      baseR: 0.06, baseH: 0.020,
      barrelR: 0.018, barrelL: 0.18,
      headR: 0.06,
      color: 0x66ffff,
    });
    weaponType = "laser";
  } else if (attackId === "arc-emitter") {
    built = buildBallTurret(hp.position, hp.normal, {
      baseR: 0.040, baseH: 0.016,
      barrelR: 0.012, barrelL: 0.12,
      headR: 0.040,
      color: 0xcc66ff,
    });
    weaponType = "laser";
  } else {
    // Default PD pulse ball
    built = buildBallTurret(hp.position, hp.normal, {
      baseR: 0.035, baseH: 0.014,
      barrelR: 0.010, barrelL: 0.10,
      headR: 0.035,
      color: 0x66ddff,
    });
    weaponType = "laser";
  }

  built.barrelYawOffset = 0;
  built.barrelPitchOffset = 0;

  // Apply per-hp overrides via the adjuster group wrapper — same trick
  // as applyMothershipConfig so the overrides match between sandbox
  // preview, arena, and in-game.
  const adjuster = new THREE.Group();
  adjuster.scale.setScalar(hp.scale ?? 1);
  adjuster.position.set(hp.offsetX ?? 0, hp.offsetY ?? 0, hp.offsetZ ?? 0);
  adjuster.rotation.set(hp.pitchOffset ?? 0, hp.yawOffset ?? 0, 0);
  const rootChildren = [...built.group.children];
  for (const c of rootChildren) adjuster.add(c);
  built.group.add(adjuster);

  // Construct the turret object TurretSystem expects
  const turretObj = {
    name: hp.name,
    type: hp.type,
    weaponType,
    attackId,
    position: hp.position.clone(),
    normal: hp.normal.clone(),
    yawArc: [hp.yawMin, hp.yawMax],
    pitchArc: [hp.pitchMin, hp.pitchMax],
    group: built.group,
    yawPivot: built.yawPivot,
    pitchPivot: built.pitchPivot,
    muzzleLocal: built.muzzleLocal,
    barrelYawOffset: 0,
    barrelPitchOffset: 0,
    hideTransform: built.hideTransform,
    revolver: built.revolver,
    tubes: built.tubes,
    missileTips: built.missileTips,
    active: true,
  };
  return { hp, built, turretObj };
}

async function arenaStart() {
  if (arena.running || !currentModel) return;
  arena.running = true;
  arena.startTime = performance.now();
  arena.stats.clear();

  // Scene container for everything the arena owns (turrets + enemies +
  // shader pool meshes all live in scene, but we need a way to know what
  // to tear down on stop).
  arena.sceneGroup = new THREE.Group();
  arena.sceneGroup.name = "arena-root";
  scene.add(arena.sceneGroup);

  // Load the saved turret skins so the arena turrets wear the same
  // textures the in-game mothership does. Baked defaults are used when
  // the lab hasn't saved a custom skin. loadActiveTurretSkins returns
  // { small, heavy } Three textures (or null per slot).
  const skins = await loadActiveTurretSkins();

  // Build real turrets for each hp. Hide the sandbox editor preview
  // turrets while the arena is live so we're not showing two turrets
  // per hardpoint.
  arena.builtTurrets = [];
  for (const hp of hardpoints) {
    if (hp.turretGroup) hp.turretGroup.visible = false;
    if (hp.type === "drone_bay") continue;
    const entry = arenaBuildFakeTurretFromHp(hp);
    if (!entry) continue;
    arena.sceneGroup.add(entry.built.group);
    // Apply the skin — missile launchers and heavy cannons wear the heavy
    // skin, lighter weapons wear the small skin. Mirrors the in-game
    // applyMothershipConfig branching.
    const isHeavySkin = entry.turretObj.weaponType === "missile_launcher" ||
      entry.turretObj.attackId === "heavy-railgun" ||
      entry.turretObj.attackId === "flak-burst";
    applyTurretSkin(entry.built, isHeavySkin ? skins.heavy : skins.small);
    arena.builtTurrets.push(entry);
  }

  // Fake mothership: TurretSystem calls mothership.mesh.updateMatrixWorld
  // and reads mothership.turrets. Our sceneGroup is at identity and
  // sceneGroup.updateMatrixWorld propagates to the turret roots.
  arena.fakeMothership = {
    mesh: arena.sceneGroup,
    turrets: arena.builtTurrets.map(e => e.turretObj),
  };

  // Instrument TurretSystem with the per-attackId stats hooks
  const getStats = (attackId) => {
    let s = arena.stats.get(attackId);
    if (!s) {
      s = { fires: 0, hits: 0, damage: 0 };
      arena.stats.set(attackId, s);
    }
    return s;
  };

  arena.turretSystem = new TurretSystem(scene, {
    audioManager: null,
    combatEffects: null,
    getEnemies: () => arena.enemies.filter(e => e.alive),
    screenShake: null,
    onFire: (_turret, attackDef) => {
      if (attackDef?.id) getStats(attackDef.id).fires++;
    },
    onHit: (_turret, attackDef, _target, dealt) => {
      if (attackDef?.id && dealt > 0) {
        const s = getStats(attackDef.id);
        s.hits++;
        s.damage += dealt;
      }
    },
  });

  document.getElementById("arena-run").style.display = "none";
  document.getElementById("arena-stop").style.display = "";
}

function arenaStop() {
  if (!arena.running) return;
  arena.running = false;

  if (arena.turretSystem) {
    arena.turretSystem.dispose();
    arena.turretSystem = null;
  }
  // Remove arena-built turrets + enemy meshes from the scene
  if (arena.sceneGroup) {
    arena.sceneGroup.traverse(c => {
      if (c.geometry && c.geometry.dispose) c.geometry.dispose();
      if (c.material && c.material.dispose) c.material.dispose();
    });
    scene.remove(arena.sceneGroup);
    arena.sceneGroup = null;
  }
  arena.builtTurrets = [];
  arena.fakeMothership = null;

  // Dispose enemy meshes (parented to sceneGroup which is already removed,
  // but make sure geometry/material are released so the GPU doesn't leak)
  for (const e of arena.enemies) arenaDisposeEnemy(e);
  arena.enemies = [];

  // Unhide sandbox editor preview turrets
  for (const hp of hardpoints) {
    if (hp.turretGroup) hp.turretGroup.visible = true;
  }

  document.getElementById("arena-run").style.display = "";
  document.getElementById("arena-stop").style.display = "none";
  // Clear HUD
  const hud = document.getElementById("arena-hud");
  if (hud) hud.innerHTML = "";
}

function arenaDisposeEnemy(e) {
  if (!e.mesh) return;
  // Enemy meshes are parented to arena.sceneGroup, not scene. Walk up to
  // whichever parent they're on and detach.
  e.mesh.removeFromParent();
  e.mesh.geometry?.dispose?.();
  e.mesh.material?.dispose?.();
}

function arenaReset() {
  // Clear enemies, clear stats, keep arena running if it was running
  for (const e of arena.enemies) arenaDisposeEnemy(e);
  arena.enemies = [];
  arena.stats.clear();
  arena.startTime = performance.now();
}

function arenaSpawn(type, overridePos) {
  if (!arena.running) return;
  const def = ENEMY_TYPES[type];
  if (!def) return;
  const center = arenaResolveMothershipCenter();
  // Pick a spawn position on a sphere around the model, random angle.
  const radius = 3 + Math.random() * 2; // 3-5 units in 5-unit fit space
  const theta = Math.random() * Math.PI * 2;
  const phi = (Math.random() - 0.5) * Math.PI; // -90°..+90°
  const pos = overridePos || {
    x: center.x + radius * Math.cos(phi) * Math.cos(theta),
    y: center.y + radius * Math.sin(phi),
    z: center.z + radius * Math.cos(phi) * Math.sin(theta),
  };

  // Simple colored box mesh sized from def.size
  const [sx, sy, sz] = def.size || [1, 0.5, 1];
  // Scale down — def.size is in-game meters, sandbox is 5-unit fit space.
  // The SD model is ~5 units long here vs ~40m in-game, so divide by 8.
  const scale = 1 / 8;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sx * scale, sy * scale, sz * scale),
    new THREE.MeshStandardMaterial({ color: def.color, emissive: new THREE.Color(def.color).multiplyScalar(0.3) }),
  );
  mesh.position.set(pos.x, pos.y, pos.z);
  arena.sceneGroup.add(mesh);

  // Enemy object shaped for TurretSystem's target API
  const enemy = {
    type,
    position: { x: pos.x, y: pos.y, z: pos.z },
    velocity: { x: 0, y: 0, z: 0 },
    stats: { ...def.stats },
    color: def.color,
    size: def.size,
    alive: true,
    mesh,
    // Orbit state (filled in if motionMode === "orbit")
    orbitAngle: theta,
    orbitRadius: radius,
    orbitHeight: Math.sin(phi) * radius,
    orbitSpeed: (def.stats?.speed ?? 5) / 50, // rad/s scaled down
    takeDamage(amount, _impactPos) {
      if (!this.alive) return;
      let remaining = amount;
      if (this.stats.shields > 0) {
        const absorbed = Math.min(this.stats.shields, remaining);
        this.stats.shields -= absorbed;
        remaining -= absorbed;
      }
      this.stats.hull = Math.max(0, (this.stats.hull ?? 0) - remaining);
      if (this.stats.hull <= 0) {
        this.alive = false;
        if (this.mesh) this.mesh.visible = false;
      }
    },
  };
  arena.enemies.push(enemy);
}

function arenaSpawnCluster() {
  if (!arena.running) return;
  const center = arenaResolveMothershipCenter();
  const clusterCenter = {
    x: center.x + (Math.random() - 0.5) * 4,
    y: center.y + 1 + Math.random() * 2,
    z: center.z + (Math.random() - 0.5) * 4,
  };
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    arenaSpawn("scout-fighter", {
      x: clusterCenter.x + Math.cos(angle) * 0.2,
      y: clusterCenter.y + (Math.random() - 0.5) * 0.2,
      z: clusterCenter.z + Math.sin(angle) * 0.2,
    });
  }
}

function arenaUpdate(dt) {
  if (!arena.running) return;

  // Update enemy positions (orbit mode moves them around the ship)
  if (arena.motionMode === "orbit") {
    const center = arenaResolveMothershipCenter();
    for (const e of arena.enemies) {
      if (!e.alive) continue;
      e.orbitAngle += e.orbitSpeed * dt;
      const newX = center.x + Math.cos(e.orbitAngle) * e.orbitRadius;
      const newZ = center.z + Math.sin(e.orbitAngle) * e.orbitRadius;
      const newY = center.y + e.orbitHeight;
      e.velocity.x = (newX - e.position.x) / Math.max(dt, 0.0001);
      e.velocity.y = 0;
      e.velocity.z = (newZ - e.position.z) / Math.max(dt, 0.0001);
      e.position.x = newX;
      e.position.y = newY;
      e.position.z = newZ;
      if (e.mesh) e.mesh.position.set(newX, newY, newZ);
    }
  } else {
    // Static mode — zero out velocity so PID homing treats them as still.
    for (const e of arena.enemies) {
      e.velocity.x = 0;
      e.velocity.y = 0;
      e.velocity.z = 0;
    }
  }

  // Run the real TurretSystem
  arena.turretSystem.update(dt, arena.fakeMothership, arena.enemies);

  // Update HUD (throttled to ~10 Hz)
  arena._hudTimer = (arena._hudTimer ?? 0) + dt;
  if (arena._hudTimer >= 0.1) {
    arena._hudTimer = 0;
    arenaRenderHud();
  }
}

function arenaRenderHud() {
  const hud = document.getElementById("arena-hud");
  if (!hud) return;
  const elapsed = (performance.now() - arena.startTime) / 1000;
  const parts = [];
  parts.push(`<div class="arena-hud-section">Elapsed ${elapsed.toFixed(1)}s · Enemies ${arena.enemies.filter(e => e.alive).length}/${arena.enemies.length}</div>`);

  // Enemy rows
  for (const e of arena.enemies) {
    const hull = e.stats.hull ?? 0;
    const hullMax = e.stats.hullMax ?? 1;
    const shields = e.stats.shields ?? 0;
    const shieldsMax = e.stats.shieldsMax ?? 0;
    const hullPct = Math.round((hull / hullMax) * 100);
    const shieldPct = shieldsMax > 0 ? Math.round((shields / shieldsMax) * 100) : 0;
    parts.push(
      `<div class="arena-hud-row${e.alive ? '' : ' dead'}">` +
      `<span>${e.type}</span>` +
      `<span>` +
      `<span class="arena-hull-bar"><span style="width:${hullPct}%"></span></span>${hull}` +
      (shieldsMax > 0 ? ` <span class="arena-hull-bar arena-shield-bar"><span style="width:${shieldPct}%;background:#44aaff"></span></span>${shields}` : '') +
      `</span></div>`
    );
  }

  // Per-attack stats
  if (arena.stats.size > 0) {
    parts.push(`<div class="arena-hud-section">Weapon stats</div>`);
    for (const [attackId, s] of arena.stats) {
      const dps = elapsed > 0 ? (s.damage / elapsed).toFixed(1) : "0.0";
      const acc = s.fires > 0 ? Math.round((s.hits / s.fires) * 100) : 0;
      parts.push(
        `<div class="arena-hud-row">` +
        `<span>${attackId}</span>` +
        `<span>${s.fires}f ${s.hits}h ${acc}% ${Math.round(s.damage)}dmg ${dps}DPS</span>` +
        `</div>`
      );
    }
  }

  hud.innerHTML = parts.join("");
}

// ── Arena UI bindings ──
document.getElementById("arena-run").addEventListener("click", arenaStart);
document.getElementById("arena-stop").addEventListener("click", arenaStop);
document.getElementById("arena-reset").addEventListener("click", arenaReset);
document.getElementById("arena-spawn-scout").addEventListener("click", () => arenaSpawn("scout-fighter"));
document.getElementById("arena-spawn-patrol").addEventListener("click", () => arenaSpawn("patrol-cruiser"));
document.getElementById("arena-spawn-shielded").addEventListener("click", () => arenaSpawn("shielded-cruiser"));
document.getElementById("arena-spawn-bomber").addEventListener("click", () => arenaSpawn("bomber"));
document.getElementById("arena-spawn-interceptor").addEventListener("click", () => arenaSpawn("interceptor"));
document.getElementById("arena-spawn-cluster").addEventListener("click", arenaSpawnCluster);
document.getElementById("arena-clear-enemies").addEventListener("click", () => {
  for (const e of arena.enemies) arenaDisposeEnemy(e);
  arena.enemies = [];
});
for (const input of document.querySelectorAll('input[name="arena-motion"]')) {
  input.addEventListener("change", (e) => {
    arena.motionMode = e.target.value;
  });
}

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  // Arena runs its own combat tick when active
  if (arena.running) arenaUpdate(dt);

  if (simulating) {
    simTime += dt;
    updateSimTargets(simTime);

    // For each turret: pick the closest target it can actually see, aim at
    // it, fire at it on cooldown. Top turrets naturally pick the "above"
    // targets, bottom turrets pick the "below" targets, and the zig-zag
    // target gets handed off as it crosses the hull plane.
    for (const hp of hardpoints) {
      const target = chooseTargetForTurret(hp);
      if (target) {
        aimTurretAtTarget(hp, target.position, dt);
      } else {
        hp.canFire = false;
      }
      if (hp.fireCooldown === undefined) {
        hp.fireCooldown = Math.random() * 0.6;
        hp.fireRate = 0.35 + Math.random() * 0.45;
      }
      hp.fireCooldown -= dt;
      if (hp.fireCooldown <= 0 && hp.canFire && target && hp.turretPitch && hp.muzzleLocal) {
        // Muzzle world position via the rotated pitch pivot
        _muzzlePos.copy(hp.muzzleLocal);
        hp.turretPitch.localToWorld(_muzzlePos);
        fireLaser(_muzzlePos, target.position);
        hp.fireCooldown = hp.fireRate;
      }
    }
  }

  // Lasers fade out even when sim toggles off mid-pulse
  updateLasers(dt);

  controls.update();
  renderer.render(scene, camera);
}
animate();

// ============================================================
// QA DEBUG SURFACE
// ============================================================
window.__qa.snapshot = () => hardpoints.map(hp => {
  const pitchMesh = hp.turretPitch?.children?.find(c => c.isMesh);
  let geomBox = null, worldBox = null, geomCenter = null, worldCenter = null;
  if (pitchMesh) {
    pitchMesh.updateMatrixWorld(true);
    pitchMesh.geometry.computeBoundingBox();
    const gb = pitchMesh.geometry.boundingBox;
    geomBox = { min: gb.min.toArray(), max: gb.max.toArray() };
    const gc = gb.getCenter(new THREE.Vector3());
    geomCenter = gc.toArray();
    const wb = new THREE.Box3().setFromObject(pitchMesh);
    worldBox = { min: wb.min.toArray(), max: wb.max.toArray() };
    worldCenter = wb.getCenter(new THREE.Vector3()).toArray();
  }
  return {
    id: hp.id,
    name: hp.name,
    modelGeometry: !!hp.modelGeometry,
    hasYawPivot: !!hp.turretYaw,
    hasPitchPivot: !!hp.turretPitch,
    hasGroup: !!hp.turretGroup,
    yawRotY: hp.turretYaw?.rotation?.y ?? null,
    pitchRotX: hp.turretPitch?.rotation?.x ?? null,
    currentYaw: hp.currentYaw,
    currentPitch: hp.currentPitch,
    position: { x: hp.position.x, y: hp.position.y, z: hp.position.z },
    normal: { x: hp.normal.x, y: hp.normal.y, z: hp.normal.z },
    yawArc: [hp.yawMin, hp.yawMax],
    pitchArc: [hp.pitchMin, hp.pitchMax],
    pitchMesh: pitchMesh ? pitchMesh.name : null,
    geomBox, geomCenter,
    worldBox, worldCenter,
  };
});

// Also expose the model's hierarchy so QA can see if there are nested transforms
window.__qa.modelHierarchy = () => {
  const out = [];
  if (!currentModel) return out;
  function walk(obj, depth) {
    out.push({
      depth,
      name: obj.name || '(anon)',
      type: obj.type,
      pos: obj.position.toArray(),
      scale: obj.scale.toArray(),
      hasRotation: obj.rotation.x !== 0 || obj.rotation.y !== 0 || obj.rotation.z !== 0,
    });
    if (depth < 4) for (const c of obj.children) walk(c, depth + 1);
  }
  walk(currentModel, 0);
  return out;
};

// Inspect each leaf mesh: face count + connected-component breakdown.
// Used to find "what does this batched mesh actually contain".
window.__qa.inspectMeshes = (threshold = 5) => {
  if (!currentModel) return [];
  const out = [];
  currentModel.traverse(c => {
    if (!c.isMesh || !c.geometry?.index) return;
    c.updateMatrixWorld(true);
    const faceCount = c.geometry.index.count / 3;
    const split = splitMeshByIslands(c, threshold);
    let islands = [];
    if (split) {
      for (let i = 0; i < split.significantCount; i++) {
        const m = split[i].mesh;
        // Compute world bbox by applying parent's matrix to vertices
        const tempMesh = new THREE.Mesh(m.geometry);
        tempMesh.applyMatrix4(c.matrixWorld);
        tempMesh.updateMatrixWorld(true);
        const wb = new THREE.Box3().setFromObject(tempMesh);
        const wc = wb.getCenter(new THREE.Vector3());
        const ws = wb.getSize(new THREE.Vector3());
        islands.push({
          idx: i,
          faceCount: split[i].faceCount,
          worldCenter: [wc.x, wc.y, wc.z],
          worldSize: [ws.x, ws.y, ws.z],
        });
      }
      // IMPORTANT: don't actually mutate the scene — splitMeshByIslands
      // builds new geometries but we never attach them, so they're GCed.
    }
    out.push({
      name: c.name,
      faceCount,
      islandCount: split ? split.significantCount : 1,
      islandsBySize: islands.sort((a, b) => b.faceCount - a.faceCount).slice(0, 12),
    });
  });
  return out.sort((a, b) => b.faceCount - a.faceCount);
};
window.__qa.activeLaserCount = () => lasers.filter(l => l.lifetime > 0).length;
window.__qa.fireStats = () => hardpoints.map(hp => ({
  name: hp.name,
  canFire: hp.canFire,
  fireCooldown: hp.fireCooldown,
  hasMuzzle: !!hp.muzzleLocal,
  muzzleLocal: hp.muzzleLocal ? [hp.muzzleLocal.x, hp.muzzleLocal.y, hp.muzzleLocal.z] : null,
  barrelYawOffset: hp.barrelYawOffset,
  barrelPitchOffset: hp.barrelPitchOffset,
}));
window.__qa.simulating = () => simulating;
window.__qa.simTarget = () => simTargets[0] ? { x: simTargets[0].position.x, y: simTargets[0].position.y, z: simTargets[0].position.z } : { x: 0, y: 0, z: 0 };
window.__qa.simTargets = () => simTargets.map(s => ({ x: s.position.x, y: s.position.y, z: s.position.z }));
window.__qa.forceRotate = (yawDeg, pitchDeg) => {
  for (const hp of hardpoints) {
    if (!hp.turretYaw || !hp.turretPitch) continue;
    hp.currentYaw = THREE.MathUtils.degToRad(yawDeg);
    hp.currentPitch = THREE.MathUtils.degToRad(pitchDeg);
    hp.turretYaw.rotation.y = hp.currentYaw;
    hp.turretPitch.rotation.x = -hp.currentPitch;
  }
};
// Auto-rig instanced "ball-turret" islands: scans every leaf mesh, splits any
// with multiple connected components, finds cubic islands (aspect ≈ 1), groups
// them by face count (instances of the same authored object), picks the
// largest such group (the turret family), and rigs each instance.
function autoRigBallTurrets(opts = {}) {
  const {
    minFaceCount = 50,         // skip greebles smaller than this
    maxFaceCount = 2000,       // skip hull-sized chunks
    maxAspect = 1.8,           // perfect cube = 1.0; allow some flattening
    minIslandFaces = 5,
    minInstancesInGroup = 3,   // group needs at least this many to count
    faceCountTolerance = 4,    // group islands whose face counts differ by < this
  } = opts;
  if (!currentModel) return { ok: false, error: 'no model' };

  // Pass 1: collect every cubic island across the whole model
  const candidates = [];
  const meshesToSplit = [];
  currentModel.traverse(c => {
    if (!c.isMesh || !c.geometry?.index) return;
    c.updateMatrixWorld(true);
    const split = splitMeshByIslands(c, minIslandFaces);
    if (!split) return;
    let usedAny = false;
    for (let i = 0; i < split.significantCount; i++) {
      const fc = split[i].faceCount;
      if (fc < minFaceCount || fc > maxFaceCount) continue;
      // Compute world bbox for shape filter
      const tempInst = new THREE.Mesh(split[i].mesh.geometry);
      tempInst.applyMatrix4(c.matrixWorld);
      tempInst.updateMatrixWorld(true);
      const wb = new THREE.Box3().setFromObject(tempInst);
      const sz = wb.getSize(new THREE.Vector3());
      const dims = [sz.x, sz.y, sz.z].sort((a, b) => b - a);
      const aspect = dims[2] > 1e-6 ? dims[0] / dims[2] : Infinity;
      if (aspect > maxAspect) continue;
      candidates.push({
        sourceMesh: c,
        islandIndex: i,
        faceCount: fc,
        aspect,
        center: wb.getCenter(new THREE.Vector3()),
      });
      usedAny = true;
    }
    if (usedAny) meshesToSplit.push(c);
  });

  if (candidates.length === 0) return { ok: false, error: 'no cubic islands found', candidates: 0 };

  // Pass 2: group candidates by approximate face count
  const groups = new Map(); // key = bucket, value = array of candidates
  for (const cand of candidates) {
    const bucket = Math.round(cand.faceCount / faceCountTolerance) * faceCountTolerance;
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket).push(cand);
  }
  // Sort groups by size (largest = most likely turret family)
  const ranked = [...groups.entries()]
    .filter(([, arr]) => arr.length >= minInstancesInGroup)
    .sort((a, b) => b[1].length - a[1].length);

  if (ranked.length === 0) return { ok: false, error: 'no instance groups found', candidates: candidates.length };

  // Pick the LARGEST group as the turret family
  const [bucketFc, turretCandidates] = ranked[0];

  // Now actually split the source meshes (mutating the scene) and rig each
  // selected island. Group candidates by source mesh first to split each once.
  const bySource = new Map();
  for (const cand of turretCandidates) {
    if (!bySource.has(cand.sourceMesh)) bySource.set(cand.sourceMesh, []);
    bySource.get(cand.sourceMesh).push(cand.islandIndex);
  }

  const shipCenter = new THREE.Box3().setFromObject(currentModel).getCenter(new THREE.Vector3());
  let rigged = 0;

  for (const [sourceMesh, islandIndices] of bySource) {
    const split = splitMeshByIslands(sourceMesh, minIslandFaces);
    if (!split) continue;
    const par = sourceMesh.parent;
    par.remove(sourceMesh);
    const allParts = split.map(r => r.mesh);
    for (const m of allParts) par.add(m);
    splitUndoStack.push({ parent: par, originalMesh: sourceMesh, parts: allParts });

    // Pre-compute world centers + sizes for every island in this source mesh
    const tempBox = new THREE.Box3();
    const islandData = []; // index → { center, size }
    for (let i = 0; i < split.significantCount; i++) {
      split[i].mesh.updateMatrixWorld(true);
      tempBox.setFromObject(split[i].mesh);
      islandData[i] = {
        center: tempBox.getCenter(new THREE.Vector3()),
        size: tempBox.getSize(new THREE.Vector3()).length(),
      };
    }

    // Assign every NON-ball island to its nearest ball island, capped by
    // 2 × that ball's diagonal so we don't sweep up unrelated greebles.
    const ballSet = new Set(islandIndices);
    const ballAttachments = new Map();
    for (const idx of islandIndices) ballAttachments.set(idx, []);
    for (let j = 0; j < split.significantCount; j++) {
      if (ballSet.has(j)) continue;
      const otherCenter = islandData[j].center;
      let bestBall = -1, bestDist = Infinity;
      for (const ballIdx of islandIndices) {
        const ballCenter = islandData[ballIdx].center;
        const ballSize = islandData[ballIdx].size;
        const d = otherCenter.distanceTo(ballCenter);
        if (d < ballSize * 2.0 && d < bestDist) {
          bestDist = d; bestBall = ballIdx;
        }
      }
      if (bestBall >= 0) ballAttachments.get(bestBall).push(j);
    }

    for (const idx of islandIndices) {
      const ballMesh = split[idx].mesh;
      const pivot = islandData[idx].center.clone();

      // Clean Y-based normal: ball turrets in the upper half of the ship aim
      // up; lower half aim down. Avoids the wonky off-axis normals that the
      // (pivot - shipCenter).normalize() heuristic produced for slots near the
      // centerline. Side-mounted turrets aren't handled here yet.
      const normal = new THREE.Vector3(0, pivot.y >= shipCenter.y ? 1 : -1, 0);

      const attachedMeshes = ballAttachments.get(idx).map(j => split[j].mesh);
      const slotMeshes = [ballMesh, ...attachedMeshes];

      // Hide the model geometry for this slot — the original ball + gun
      // becomes invisible so the procedural ball turret takes over visually.
      // The meshes stay in the scene tree so save/load can find them again.
      for (const m of slotMeshes) m.visible = false;

      // Create a procedural ball-turret hardpoint at the slot
      const hp = createHardpoint(pivot, normal, 'ball_turret');
      hp.modelSlot = true;
      hp.hiddenMeshNames = slotMeshes.map(m => m.name);
      hp.name = `Ball Turret ${rigged + 1}`;

      // Track for serialization (so save/load knows about the slot meshes).
      // Empty baseMeshes/barrelMeshes so other code paths that iterate them
      // (buildMeshInspector, autoRigFromMesh dup-check) don't crash.
      taggedTurrets.push({
        hpRef: hp,
        islands: slotMeshes,
        baseMeshes: [],
        barrelMeshes: [],
        slotMode: true,
      });
      rebuildHpList();
      rigged++;
    }
  }

  buildMeshInspector(currentModel);

  // createHardpoint() calls autoSave() before autoRigBallTurrets has a chance
  // to set modelSlot/hiddenMeshNames/name on the just-created hp. The LAST
  // turret in the loop never gets a follow-up autoSave, so its localStorage
  // entry is missing the modelSlot flag and the in-game loader silently
  // skips it. Re-save once now that every hp is fully populated.
  autoSave();

  return { ok: true, rigged, faceCountBucket: bucketFc, totalCandidates: candidates.length, groupCount: ranked.length };
}
window.__qa.autoRigBallTurrets = autoRigBallTurrets;

// Detect "ball-turret-like" islands: meshes with >=5 internal connected
// components, where most islands are small and roughly cubic.
window.__qa.detectBallTurrets = (opts = {}) => {
  const {
    minIslandsPerMesh = 5,    // mesh must have at least this many islands to count
    maxIslandLongest = 0.4,   // skip islands bigger than this (panels/wings)
    maxAspect = 3.0,           // skip elongated islands (barrels, antennas)
    minIslandFaces = 5,        // smaller than this is debris
  } = opts;
  if (!currentModel) return { ok: false };

  const found = [];
  const tempBox = new THREE.Box3();
  currentModel.traverse(c => {
    if (!c.isMesh || !c.geometry?.index) return;
    c.updateMatrixWorld(true);
    const split = splitMeshByIslands(c, minIslandFaces);
    if (!split || split.significantCount < minIslandsPerMesh) return;

    // Examine each island's shape
    const cubicIslands = [];
    for (let i = 0; i < split.significantCount; i++) {
      const islandMesh = split[i].mesh;
      // Compute world-space bbox by transforming through the source mesh's matrix
      const tempInst = new THREE.Mesh(islandMesh.geometry);
      tempInst.applyMatrix4(c.matrixWorld);
      tempInst.updateMatrixWorld(true);
      tempBox.setFromObject(tempInst);
      const size = tempBox.getSize(new THREE.Vector3());
      const center = tempBox.getCenter(new THREE.Vector3());
      const dims = [size.x, size.y, size.z].sort((a, b) => b - a);
      const longest = dims[0];
      const shortest = dims[2];
      const aspect = shortest > 1e-6 ? longest / shortest : Infinity;
      if (longest <= maxIslandLongest && aspect <= maxAspect) {
        cubicIslands.push({
          islandIdx: i,
          faceCount: split[i].faceCount,
          longest, aspect,
          center: [center.x, center.y, center.z],
          size: [size.x, size.y, size.z],
        });
      }
    }
    if (cubicIslands.length > 0) {
      found.push({
        meshName: c.name,
        totalIslands: split.significantCount,
        cubicCount: cubicIslands.length,
        sample: cubicIslands.slice(0, 6),
      });
    }
  });
  return { ok: true, found, totalCubic: found.reduce((s, m) => s + m.cubicCount, 0) };
};

// Find every leaf mesh + its bounding box. Used to spot groups of geometrically
// similar meshes (e.g. arrays of ball turrets the artist instanced).
window.__qa.meshShapes = () => {
  if (!currentModel) return [];
  const out = [];
  currentModel.traverse(c => {
    if (!c.isMesh || !c.geometry?.index) return;
    c.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(c);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const dims = [size.x, size.y, size.z].sort((a, b) => b - a);
    const longest = dims[0];
    const shortest = dims[2];
    const aspect = shortest > 1e-6 ? longest / shortest : Infinity;
    const faceCount = c.geometry.index.count / 3;
    // Also count connected components so we can prefer single-piece meshes
    const split = splitMeshByIslands(c, 5);
    const islandCount = split ? split.significantCount : 1;
    out.push({
      name: c.name,
      faceCount,
      islandCount,
      center: [center.x, center.y, center.z],
      size: [size.x, size.y, size.z],
      aspect, // 1 = perfect cube, larger = more elongated
      longest, shortest,
    });
  });
  return out;
};

// Highlight a list of meshes by name (replaces material with bright emissive)
const __qaHighlightMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.9 });
const __qaOriginalMats = new Map();
window.__qa.highlightMeshes = (names) => {
  if (!currentModel) return 0;
  // Restore previous highlights first
  for (const [m, mat] of __qaOriginalMats) m.material = mat;
  __qaOriginalMats.clear();
  let count = 0;
  currentModel.traverse(c => {
    if (c.isMesh && names.includes(c.name)) {
      __qaOriginalMats.set(c, c.material);
      c.material = __qaHighlightMat;
      count++;
    }
  });
  return count;
};
window.__qa.clearHighlights = () => {
  for (const [m, mat] of __qaOriginalMats) m.material = mat;
  __qaOriginalMats.clear();
};

// Direct camera control for QA — useful for top-down / side views
window.__qa.setCamera = (px, py, pz, tx = 0, ty = 0, tz = 0) => {
  camera.position.set(px, py, pz);
  controls.target.set(tx, ty, tz);
  camera.lookAt(controls.target);
  controls.update();
};

// Programmatically rig a mesh by name (bypasses the click/raycast path)
window.__qa.rigByName = (meshName) => {
  if (!currentModel) return { ok: false, error: 'no model' };
  let target = null;
  currentModel.traverse(c => { if (!target && c.isMesh && c.name === meshName) target = c; });
  if (!target) return { ok: false, error: `mesh "${meshName}" not found` };
  // Use the mesh's world bbox center as the hit point
  target.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(target);
  const center = box.getCenter(new THREE.Vector3());
  // Use face index 0 so the precise picker resolves to island 0 if split happens
  autoRigFromMesh(target, center, 0);
  return { ok: true, meshName, hardpointCount: hardpoints.length };
};
