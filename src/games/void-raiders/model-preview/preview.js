import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
  mesh.removeFromParent();
  targetGroup.add(mesh);
  mesh.position.set(0, 0, 0);
  // Transform vertices from model space into turret local space
  const pos = mesh.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    if (currentModel) currentModel.localToWorld(v);
    v.sub(pivot);
    v.applyQuaternion(invQuat);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  mesh.geometry.computeBoundingSphere();
}

function bindModelTurret(turret) {
  const { baseMeshes, barrelMeshes, pivot, normal } = turret;

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

  buildHpVisuals(hp);
  selectHardpoint(hp);

  // Switch to hardpoints tab
  document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('[data-tab="hardpoints"]').classList.add('active');
  document.getElementById('tab-hardpoints').classList.add('active');
}

// Auto-detect: not applicable with the new 2-level system — user picks base/barrel
document.getElementById('hp-auto-detect').addEventListener('click', () => {
  console.log('Use the Meshes tab to tag parts as "base" or "barrel" for each turret.');
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
};

let hpIdCounter = 0;
let simulating = false;
let simTarget = new THREE.Vector3(); // world-space target that turrets track
let simTime = 0;

function createHardpoint(position, normal) {
  const id = `hp_${hpIdCounter++}`;
  const type = 'turret';
  const hp = {
    id,
    name: `Hardpoint ${hardpoints.length + 1}`,
    type,
    position: position.clone(),
    normal: normal.clone(),
    yawMin: -180, yawMax: 180,
    pitchMin: -10, pitchMax: 60,
    // 3D objects
    marker: null,
    arcMesh: null,
    turretGroup: null,  // the whole turret assembly (positioned + oriented to normal)
    turretYaw: null,    // yaw pivot (rotates around normal)
    turretPitch: null,  // pitch pivot (tilts barrels)
    currentYaw: 0,
    currentPitch: 0,
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

  // Root group: positioned at hardpoint, oriented so local Y = surface normal
  const root = new THREE.Group();
  root.position.copy(hp.position);
  const up = new THREE.Vector3(0, 1, 0);
  root.quaternion.setFromUnitVectors(up, hp.normal);

  // Base (cylinder sitting on the surface)
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x444466, roughness: 0.4, metalness: 0.7 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(cfg.baseR, cfg.baseR * 1.1, cfg.baseH, 12), baseMat);
  base.position.y = cfg.baseH / 2;
  root.add(base);

  // Yaw pivot (rotates around Y / normal axis)
  const yawPivot = new THREE.Group();
  yawPivot.position.y = cfg.baseH;
  root.add(yawPivot);

  // Pitch pivot (tilts up/down)
  const pitchPivot = new THREE.Group();
  yawPivot.add(pitchPivot);

  if (cfg.barrels > 0) {
    // Turret head
    const headMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.6 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(cfg.baseR * 0.8, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), headMat);
    pitchPivot.add(head);

    // Barrels
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x888899, roughness: 0.3, metalness: 0.8 });
    const barrelGeom = new THREE.CylinderGeometry(cfg.barrelR, cfg.barrelR, cfg.barrelL, 8);
    barrelGeom.rotateX(Math.PI / 2); // point along Z

    for (let i = 0; i < cfg.barrels; i++) {
      const barrel = new THREE.Mesh(barrelGeom, barrelMat);
      const offset = (i - (cfg.barrels - 1) / 2) * cfg.spacing;
      barrel.position.set(offset, 0, cfg.barrelL / 2);
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

function removeHardpoint(hp) {
  disposeHpVisuals(hp);
  hardpoints = hardpoints.filter(h => h !== hp);
  if (selectedHp === hp) { selectedHp = null; hpEditor.classList.remove('visible'); }
  rebuildHpList();
  autoSave();
}

function clearHardpoints() {
  for (const hp of hardpoints) disposeHpVisuals(hp);
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
      </div>
    `;
    item.addEventListener('click', () => selectHardpoint(hp));
    hpListEl.appendChild(item);
  }
}

function selectHardpoint(hp) {
  selectedHp = hp;
  rebuildHpList();

  // Populate editor
  document.getElementById('hp-name').value = hp.name;
  document.getElementById('hp-type').value = hp.type;
  document.getElementById('hp-yaw-min').value = hp.yawMin;
  document.getElementById('hp-yaw-max').value = hp.yawMax;
  document.getElementById('hp-pitch-min').value = hp.pitchMin;
  document.getElementById('hp-pitch-max').value = hp.pitchMax;
  document.getElementById('hp-yaw-min-val').textContent = hp.yawMin;
  document.getElementById('hp-yaw-max-val').textContent = hp.yawMax;
  document.getElementById('hp-pitch-min-val').textContent = hp.pitchMin;
  document.getElementById('hp-pitch-max-val').textContent = hp.pitchMax;
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
  rebuildHpList();
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

document.getElementById('hp-delete').addEventListener('click', () => {
  if (selectedHp) removeHardpoint(selectedHp);
});

// Place mode toggle
const placeModeBtn = document.getElementById('hp-place-mode');
placeModeBtn.addEventListener('click', () => {
  placeMode = !placeMode;
  placeModeBtn.classList.toggle('active', placeMode);
  renderer.domElement.style.cursor = placeMode ? 'crosshair' : '';
});

// Arc visibility toggle
const showArcsBtn = document.getElementById('hp-show-arcs');
showArcsBtn.addEventListener('click', () => {
  showArcs = !showArcs;
  showArcsBtn.classList.toggle('active', showArcs);
  for (const hp of hardpoints) buildArcVisual(hp);
});

// Simulate toggle
const simulateBtn = document.getElementById('hp-simulate');
simulateBtn.addEventListener('click', () => {
  simulating = !simulating;
  simulateBtn.classList.toggle('active', simulating);
  // Show/hide the target indicator
  if (simulating) {
    scene.add(simTargetMesh);
  } else {
    scene.remove(simTargetMesh);
    // Reset turret rotations
    for (const hp of hardpoints) {
      if (hp.turretYaw) hp.turretYaw.rotation.y = 0;
      if (hp.turretPitch) hp.turretPitch.rotation.x = 0;
      hp.currentYaw = 0;
      hp.currentPitch = 0;
    }
  }
});

// Target indicator (red sphere that orbits the ship)
const simTargetMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.1, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.8 })
);
simTargetMesh.renderOrder = 1000;

// --- Turret aiming logic ---
const _targetLocal = new THREE.Vector3();
const _tempMatrix = new THREE.Matrix4();

function aimTurretAtTarget(hp, target, dt) {
  if (!hp.turretYaw || !hp.turretGroup) return;

  // Get target position in turret's local space (relative to turretGroup)
  _tempMatrix.copy(hp.turretGroup.matrixWorld).invert();
  _targetLocal.copy(target).applyMatrix4(_tempMatrix);

  // Calculate desired yaw (rotation around Y in local space)
  let desiredYaw = Math.atan2(_targetLocal.x, _targetLocal.z);
  // Calculate desired pitch
  const horizDist = Math.sqrt(_targetLocal.x * _targetLocal.x + _targetLocal.z * _targetLocal.z);
  let desiredPitch = Math.atan2(_targetLocal.y, horizDist);

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
      };
      // Save model turret binding info
      if (hp.modelGeometry) {
        const turret = taggedTurrets.find(t => t.hpRef === hp);
        if (turret) {
          entry.modelTurret = {
            islandNames: turret.islands.map(m => m.name),
          };
        }
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

  for (const hpData of data.hardpoints) {
    if (hpData.modelTurret) {
      // Model turret — need split islands to exist. Find by name.
      const islandMeshes = [];
      if (currentModel) {
        currentModel.traverse(c => {
          if (c.isMesh && hpData.modelTurret.islandNames.includes(c.name)) {
            islandMeshes.push(c);
          }
        });
      }
      // Also check hpGroup for already-split islands
      hpGroup.traverse(c => {
        if (c.isMesh && hpData.modelTurret.islandNames.includes(c.name)) {
          islandMeshes.push(c);
        }
      });

      if (islandMeshes.length > 0) {
        const pos = new THREE.Vector3(hpData.position.x, hpData.position.y, hpData.position.z);
        const norm = new THREE.Vector3(hpData.normal.x, hpData.normal.y, hpData.normal.z);
        const turret = { islands: islandMeshes, pivot: pos, normal: norm };
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
    } else {
      // Regular procedural hardpoint
      const pos = new THREE.Vector3(hpData.position.x, hpData.position.y, hpData.position.z);
      const norm = new THREE.Vector3(hpData.normal.x, hpData.normal.y, hpData.normal.z);
      const hp = createHardpoint(pos, norm);
      hp.name = hpData.name;
      hp.type = hpData.type;
      hp.yawMin = hpData.yawMin ?? -180;
      hp.yawMax = hpData.yawMax ?? 180;
      hp.pitchMin = hpData.pitchMin ?? -10;
      hp.pitchMax = hpData.pitchMax ?? 60;
      buildHpVisuals(hp);
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
    setTimeout(() => { btn.textContent = 'Copy JSON'; }, 1500);
  });
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

  // Check if clicking a hardpoint marker first
  const markerMeshes = [];
  hpGroup.traverse(c => { if (c.isMesh && c.geometry.type === 'SphereGeometry') markerMeshes.push(c); });
  const markerHits = raycaster.intersectObjects(markerMeshes, false);
  if (markerHits.length > 0 && !placeMode) {
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

  if (hits.length > 0) {
    if (placeMode) {
      // Place hardpoint at hit point
      const hit = hits[0];
      createHardpoint(hit.point, hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize());
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
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  if (simulating) {
    simTime += dt;
    // Move target in a figure-8 pattern around the ship
    const r = 4;
    simTarget.set(
      Math.sin(simTime * 0.5) * r,
      Math.sin(simTime * 0.7) * 1.5 + 1.5,
      Math.cos(simTime * 0.3) * r
    );
    simTargetMesh.position.copy(simTarget);

    // Aim all turrets at the target
    for (const hp of hardpoints) {
      aimTurretAtTarget(hp, simTarget, dt);
    }
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();
