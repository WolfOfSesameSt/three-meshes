import * as THREE from "three";
import { CAMERA, PALETTE } from "./config.js";
import { findTeeTier, generateHole, listArchetypeOptions, listTeeTierOptions } from "./hole/generator.js";

const root = document.querySelector("#game");
const seedEl = document.querySelector("#seed");
const parEl = document.querySelector("#par");
const metaEl = document.querySelector("#hole-meta");
const seedInput = document.querySelector("#seed-input");
const parSelect = document.querySelector("#par-select");
const archetypeSelect = document.querySelector("#archetype-select");
const teeSelect = document.querySelector("#tee-select");
const applyHoleButton = document.querySelector("#apply-hole");
const nextHoleButton = document.querySelector("#next-hole");

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
root.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(PALETTE.sky, 280, 620);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 600);
const cameraTarget = new THREE.Vector3(0, 0, -4);

const sun = new THREE.DirectionalLight(0xfff3d6, 1.35);
sun.position.set(-70, 130, 45);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -95;
sun.shadow.camera.right = 95;
sun.shadow.camera.top = 95;
sun.shadow.camera.bottom = -95;
scene.add(sun);
scene.add(new THREE.AmbientLight(0xd7ecff, 0.82));

const animated = [];
let currentHoleIndex = 1;
let holeGroup = null;
let currentTeeTierId = "standard";
const reusable = {
  waterUniforms: { uTime: { value: 0 }, uColorA: { value: new THREE.Color(0x2e8ac7) }, uColorB: { value: new THREE.Color(0x64d3d2) } },
};

initializeControls();
renderFromControls();
nextHoleButton.addEventListener("click", () => {
  currentHoleIndex += 1;
  seedInput.value = seedForIndex(currentHoleIndex);
  renderFromControls();
});
applyHoleButton.addEventListener("click", renderFromControls);
parSelect.addEventListener("change", () => {
  populateArchetypes(parSelect.value);
  renderFromControls();
});
archetypeSelect.addEventListener("change", renderFromControls);
teeSelect.addEventListener("change", () => {
  currentTeeTierId = teeSelect.value;
  renderFromControls();
});
seedInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") renderFromControls();
});

function seedForIndex(index) {
  return `AG-${String(index).padStart(3, "0")}`;
}

function initializeControls() {
  populateArchetypes("");
  teeSelect.replaceChildren(...listTeeTierOptions().map((tee) => option(tee.id, tee.label)));
  teeSelect.value = currentTeeTierId;
}

function populateArchetypes(parValue) {
  const previous = archetypeSelect.value;
  const options = [option("", "Auto"), ...listArchetypeOptions(parValue || null).map((item) => option(item.id, item.concept))];
  archetypeSelect.replaceChildren(...options);
  if ([...archetypeSelect.options].some((item) => item.value === previous)) {
    archetypeSelect.value = previous;
  }
}

function option(value, label) {
  const el = document.createElement("option");
  el.value = value;
  el.textContent = label;
  return el;
}

function renderFromControls() {
  const options = {};
  if (parSelect.value) options.par = Number(parSelect.value);
  if (archetypeSelect.value) options.template = archetypeSelect.value;
  const seed = seedInput.value.trim() || seedForIndex(currentHoleIndex);
  seedInput.value = seed;
  renderHole(generateHole(seed, options));
}

function renderHole(hole) {
  scene.children
    .filter((child) => child.name?.startsWith("hole-"))
    .forEach((child) => {
      scene.remove(child);
      disposeObject(child);
    });
  if (holeGroup) {
    scene.remove(holeGroup);
    disposeObject(holeGroup);
  }
  animated.length = 0;
  holeGroup = new THREE.Group();
  holeGroup.name = `hole-${hole.seed}`;
  buildHole(holeGroup, hole, animated);
  scene.add(holeGroup);
  const teeTier = findTeeTier(hole, currentTeeTierId);
  seedEl.textContent = hole.seed;
  parEl.textContent = String(hole.par);
  metaEl.textContent = `${hole.architecture.concept} | ${teeTier.label} tee | ${hole.shotPlan.length} shot plan`;
}

function buildHole(target, data, animatedObjects) {
  addTerrainBase(target, data);

  addRoughBands(target, data, animatedObjects);
  addTerrainFacets(target, data);
  addHazards(target, data.hazards.filter((hazard) => hazard.kind === "water"), animatedObjects);
  addCourseSurfaces(target, data);
  addCartPath(target, data);
  addLandingZones(data.landingZones);
  addTeeBox(target, data.tee, data.teeTiers);
  addGreen(target, data.pin, data.greenContours, data.greenComplex);
  addHazards(target, data.hazards.filter((hazard) => hazard.kind !== "water"), animatedObjects);
  addTrees(target, data.trees, animatedObjects);
  addRocks(target, data.rocks);
  addOutOfBounds(target, data.outOfBounds);
  addFlag(target, data.pin, animatedObjects);
  addElevationCues(data);
}

function addTerrainBase(target, data) {
  const lower = roundedBox(data.world.width + 22, data.world.length + 22, 1.4, 0x244a15, 0, -1.18, 0);
  const upper = roundedBox(data.world.width + 14, data.world.length + 14, 1.1, PALETTE.deepRough, 0, -0.55, 0);
  lower.receiveShadow = true;
  upper.receiveShadow = true;
  lower.name = "terrain-lower-step";
  upper.name = "terrain-upper-step";
  target.add(lower, upper);
}

function addRoughBands(target, data, animatedObjects) {
  const tall = data.roughBands.find((band) => band.kind === "tall-rough");
  const short = data.roughBands.find((band) => band.kind === "short-rough");
  const tallMesh = roundedBox(tall.size.width, tall.size.depth, 0.2, PALETTE.tallRough, tall.position.x, y(tall.position.elevation), tall.position.z);
  const shortShadow = createPolygonMesh(scalePolygon(short.points, 1.015), 0x356c1e, y(short.position.elevation) + 0.12, "short-rough-terrace-edge");
  const shortMesh = createPolygonMesh(short.points, PALETTE.shortRough, y(short.position.elevation) + 0.22, "short-rough-band");
  tallMesh.name = "tall-rough-band";
  target.add(tallMesh, shortShadow, shortMesh);
}

function addCourseSurfaces(target, data) {
  const firstCutEdge = createPolygonMesh(scalePolygon(data.surfaces.firstCut.points, 1.015), 0x5b9b25, y(data.surfaces.firstCut.elevation) + 0.18, "first-cut-terrace-edge");
  const firstCut = createPolygonMesh(data.surfaces.firstCut.points, PALETTE.firstCut, y(data.surfaces.firstCut.elevation) + 0.26, "continuous-first-cut");
  const fairwayEdge = createPolygonMesh(scalePolygon(data.surfaces.fairway.points, 1.012), 0x7fc428, y(data.surfaces.fairway.elevation) + 0.34, "fairway-terrace-edge");
  const fairway = createPolygonMesh(data.surfaces.fairway.points, PALETTE.fairway, y(data.surfaces.fairway.elevation) + 0.42, "continuous-fairway");
  target.add(firstCutEdge, firstCut, fairwayEdge, fairway);
}

function addLandingZones() {
  // Landing-zone data remains in the course engine for future shot physics, but
  // the reference art direction should not show debug target overlays.
}

function addGreen(target, pin, contours, greenComplex) {
  const baseY = y(pin.position.elevation);
  const collar = ellipsePoints(pin.position, 32, 24, 12);
  const putting = ellipsePoints(pin.position, 24, 18, 12);
  const crown = ellipsePoints({ x: pin.position.x + contours[0].slope.x * 18, z: pin.position.z + contours[0].slope.z * 18 }, 12, 9, 10);
  target.add(
    createPolygonMesh(scalePolygon(collar, 1.06), 0x315f20, baseY + 0.76, "green-platform-shadow"),
    createPolygonMesh(collar, 0x5fa92f, baseY + 0.88, "distinct-green-collar"),
    createPolygonMesh(scalePolygon(putting, 1.045), 0x336f25, baseY + 1.0, "putting-surface-edge"),
    createPolygonMesh(putting, 0x8ef331, baseY + 1.12, "distinct-putting-surface"),
    createPolygonMesh(crown, 0xc4ff39, baseY + 1.25, "green-top-tier")
  );

  const cup = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.62, 0.08, 16),
    new THREE.MeshBasicMaterial({ color: 0x12320e })
  );
  cup.position.set(pin.position.x, baseY + 1.37, pin.position.z);
  cup.name = "golf-cup";
  target.add(cup);

  contours.slice(0, 1).forEach((contour, index) => {
    const contourMesh = new THREE.Mesh(
      new THREE.RingGeometry(contour.radius * 0.68, contour.radius * 0.72, 10),
      new THREE.MeshBasicMaterial({ color: 0x3f852d, transparent: true, opacity: 0.26, side: THREE.DoubleSide })
    );
    contourMesh.rotation.x = -Math.PI / 2;
    contourMesh.scale.set(1.2, 0.82, 1);
    contourMesh.position.set(pin.position.x + contour.slope.x * 30, baseY + 1.38 + index * 0.05, pin.position.z + contour.slope.z * 30);
    contourMesh.name = "green-contour-band";
    target.add(contourMesh);
  });
}

function addTeeBox(target, tee) {
  const base = roundedBox(tee.size.width + 5, tee.size.depth + 4, 0.82, 0x5f7d29, tee.position.x, y(tee.position.elevation) - 0.22, tee.position.z);
  base.name = "tiered-tee-platform";
  const side = roundedBox(tee.size.width + 2, tee.size.depth + 1.4, 0.24, 0x3f651f, tee.position.x, y(tee.position.elevation) + 0.18, tee.position.z);
  side.name = "tee-box-side";
  const mesh = roundedBox(tee.size.width, tee.size.depth, 0.24, 0xa9e92a, tee.position.x, y(tee.position.elevation) + 0.36, tee.position.z);
  mesh.name = "tee-box";
  target.add(base, side, mesh);

  [-4, 4].forEach((offset) => {
    const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.4, 16), new THREE.MeshStandardMaterial({ color: 0xf2f2e9 }));
    marker.position.set(tee.position.x + offset, y(tee.position.elevation) + 0.7, tee.position.z - 2.8);
    marker.name = "tee-marker";
    target.add(marker);
  });
}

function addHazards(target, hazards, animatedObjects) {
  hazards.forEach((hazard) => {
    if (hazard.kind === "water") {
      const bankPoints = hazard.polygon ?? [];
      const waterY = 1.16;
      const shelf = bankPoints.length
        ? createPolygonMesh(scalePolygon(bankPoints, 1.1), 0x0a6c95, waterY - 0.1, "water-cut-bank")
        : roundedPlane(hazard.size.width + 4, hazard.size.depth + 4, new THREE.MeshStandardMaterial({ color: 0x0b6f91, roughness: 0.82 }), hazard.position.x, waterY - 0.1, hazard.position.z);
      shelf.name = "water-cut-bank";
      const mesh = hazard.polygon?.length
        ? createPolygonMesh(hazard.polygon, PALETTE.water, waterY, "water-hazard")
        : roundedPlane(hazard.size.width, hazard.size.depth, createWaterMaterial(), hazard.position.x, waterY, hazard.position.z);
      if (hazard.polygon?.length) {
        mesh.material = new THREE.MeshStandardMaterial({ color: PALETTE.water, roughness: 0.34, metalness: 0.02, side: THREE.DoubleSide });
      } else {
        mesh.material = createWaterMaterial();
        animatedObjects.push({ type: "water", material: mesh.material });
      }
      mesh.name = "water-hazard";
      target.add(shelf, mesh);
      addWaterFacets(target, hazard, waterY);
      addShoreFoam(target, hazard, waterY);
      return;
    }
    const sandY = Math.max(y(hazard.position.elevation) + 0.2, 1.36);
    const lip = hazard.polygon?.length
      ? createPolygonMesh(scalePolygon(hazard.polygon, 1.16), 0xa76637, sandY - 0.08, "sand-bunker-lip")
      : roundedPlane(hazard.size.width + 2.4, hazard.size.depth + 2.4, new THREE.MeshStandardMaterial({ color: 0xb87948, roughness: 0.92 }), hazard.position.x, sandY - 0.08, hazard.position.z);
    const mesh = hazard.polygon?.length
      ? createPolygonMesh(hazard.polygon, PALETTE.sand, sandY, "sand-bunker")
      : roundedPlane(hazard.size.width, hazard.size.depth, new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.96 }), hazard.position.x, sandY, hazard.position.z);
    const highlight = hazard.polygon?.length
      ? createPolygonMesh(scalePolygon(hazard.polygon, 0.72), 0xf7d79a, sandY + 0.03, "sand-bunker-highlight")
      : null;
    lip.name = "sand-bunker-lip";
    mesh.name = "sand-bunker";
    target.add(lip, mesh);
    if (highlight) target.add(highlight);
  });
}

function addCartPath(target, data) {
  if (data.archetype === "par3-island-green") return;
  const path = data.cartPathRibbon;
  if (path?.points?.length) {
    const edge = createPolygonMesh(scalePolygon(path.points, 1.08), PALETTE.cartPathEdge, 1.1, "cart-path-edge");
    const mesh = createPolygonMesh(path.points, PALETTE.cartPath, 1.2, "cart-path");
    target.add(edge, mesh);
    addCartPathDashes(target, path.centerline);
    return;
  }
  data.paths.cartPath.forEach((point, index) => {
    const next = data.paths.cartPath[index + 1] ?? point;
    const angle = Math.atan2(next.x - point.x, next.z - point.z);
    const mesh = roundedBox(7, 18, 0.2, PALETTE.cartPath, point.x, 1.08, point.z);
    mesh.rotation.y = angle;
    mesh.name = "cart-path";
    target.add(mesh);
  });
}

function addTrees(target, trees, animatedObjects) {
  trees.forEach((tree, index) => {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.65, tree.height * 0.42, 8),
      new THREE.MeshStandardMaterial({ color: PALETTE.trunk, roughness: 0.8 })
    );
    trunk.position.set(tree.x, tree.height * 0.21 + 1, tree.z);
    trunk.castShadow = true;
    trunk.name = "tree-trunk";
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(tree.height * 0.23, tree.height * 0.68, 7),
      new THREE.MeshStandardMaterial({ color: tree.height > 18 ? PALETTE.treeDark : index % 4 === 0 ? PALETTE.treeGold : PALETTE.tree, roughness: 0.78 })
    );
    crown.position.set(tree.x, tree.height * 0.62 + 1, tree.z);
    crown.castShadow = true;
    crown.name = "tree-crown";
    crown.userData.swayPhase = index * 0.9;
    target.add(trunk, crown);
    animatedObjects.push({ type: "sway", object: crown });
  });
}

function addRocks(target, rocks) {
  rocks.forEach((rock, index) => {
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(rock.radius, 0),
      new THREE.MeshStandardMaterial({ color: PALETTE.rock, roughness: 0.92 })
    );
    mesh.scale.set(1.25, 0.62, 0.9);
    mesh.rotation.set(0.2, index * 0.7, -0.15);
    mesh.position.set(rock.x, 1.35, rock.z);
    mesh.castShadow = true;
    mesh.name = "rock";
    target.add(mesh);
  });
}

function addOutOfBounds(target, markers) {
  markers.forEach((marker, index) => {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 2.8, 8),
      new THREE.MeshStandardMaterial({ color: index % 2 ? PALETTE.ob : PALETTE.markerRed })
    );
    post.position.set(marker.x, 2.1, marker.z);
    post.name = "out-of-bounds-marker";
    target.add(post);
  });
}

function addFlag(target, pin, animatedObjects) {
  const poleHeight = 1.6;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, poleHeight, 10), new THREE.MeshStandardMaterial({ color: 0xf7f4e8 }));
  pole.position.set(pin.position.x, y(pin.position.elevation) + poleHeight * 0.5 + 0.2, pin.position.z);
  pole.name = "flag-pole";
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.85, 8, 1), new THREE.MeshBasicMaterial({ color: 0xffdf4d, side: THREE.DoubleSide }));
  flag.position.set(pin.position.x + 0.85, y(pin.position.elevation) + 1.55, pin.position.z);
  flag.name = "animated-flag";
  target.add(pole, flag);
  animatedObjects.push({ type: "flag", object: flag });
}

function addElevationCues() {
  // Elevation remains in the hole schema; visual terraces now carry the height read.
}

function addWaterFacets(target, hazard, waterY) {
  for (let i = 0; i < 16; i += 1) {
    const facet = new THREE.Mesh(
      new THREE.CircleGeometry(1, 3),
      new THREE.MeshBasicMaterial({ color: i % 2 ? 0x75e9ff : PALETTE.waterDark, transparent: true, opacity: 0.2 })
    );
    facet.scale.set(hazard.size.width * (0.055 + (i % 3) * 0.012), hazard.size.depth * 0.04, 1);
    facet.rotation.x = -Math.PI / 2;
    facet.rotation.z = i * 0.7;
    facet.position.set(
      hazard.position.x + ((i % 4) - 1.5) * hazard.size.width * 0.11,
      waterY + 0.04,
      hazard.position.z + (Math.floor(i / 4) - 1.5) * hazard.size.depth * 0.11
    );
    facet.name = "water-facet";
    target.add(facet);
  }
}

function addShoreFoam(target, hazard, waterY) {
  if (!hazard.polygon?.length) return;
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, side: THREE.DoubleSide });
  hazard.polygon.forEach((point, index) => {
    if (index % 4 !== 1) return;
    const next = hazard.polygon[(index + 1) % hazard.polygon.length];
    const foam = new THREE.Mesh(new THREE.CircleGeometry(1, 3), material);
    foam.rotation.x = -Math.PI / 2;
    foam.rotation.z = index * 0.65;
    foam.scale.set(1.9, 0.42, 1);
    foam.position.set((point.x + next.x) * 0.5, waterY + 0.08, (point.z + next.z) * 0.5);
    foam.name = "water-foam";
    target.add(foam);
  });
}

function addTerrainFacets(target, data) {
  const points = data.paths.fairway;
  const palette = [0x3f7a22, 0x2f671d, 0x4f8829, 0x285b19];
  points.forEach((point, index) => {
    if (index === 0) return;
    const side = index % 2 === 0 ? 1 : -1;
    const facet = createTriangleFacet(
      [
        { x: point.x + side * 22, z: point.z - 10 },
        { x: point.x + side * 38, z: point.z + 4 },
        { x: point.x + side * 19, z: point.z + 14 },
      ],
      palette[index % palette.length],
      0.82,
      `rough-low-poly-facet-${index}`
    );
    target.add(facet);
  });
}

function addCartPathDashes(target, centerline) {
  centerline.forEach((point, index) => {
    if (index % 2 !== 1) return;
    const next = centerline[index + 1] ?? centerline[index - 1] ?? point;
    const angle = Math.atan2(next.x - point.x, next.z - point.z);
    const dash = roundedBox(0.42, 3.4, 0.08, 0xffffff, point.x, 1.3, point.z);
    dash.rotation.y = angle;
    dash.name = "cart-path-dash";
    target.add(dash);
  });
}

function createPolygonMesh(points, color, yPos, name) {
  const shape = new THREE.Shape();
  points.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, point.z);
    else shape.lineTo(point.x, point.z);
  });
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, roughness: 0.82, side: THREE.DoubleSide })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = yPos;
  mesh.receiveShadow = true;
  mesh.name = name;
  return mesh;
}

function createTriangleFacet(points, color, yPos, name) {
  const shape = new THREE.Shape();
  points.forEach((point, index) => {
    const x = Math.max(-42, Math.min(42, point.x));
    const z = Math.max(-66, Math.min(66, point.z));
    if (index === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  });
  shape.closePath();
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = yPos;
  mesh.name = name;
  return mesh;
}

function ellipsePoints(center, width, depth, segments) {
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return {
      x: center.x + Math.cos(angle) * width * 0.5,
      z: center.z + Math.sin(angle) * depth * 0.5,
    };
  });
}

function scalePolygon(points, scale) {
  const center = points.reduce((acc, p) => ({ x: acc.x + p.x / points.length, z: acc.z + p.z / points.length }), { x: 0, z: 0 });
  return points.map((point) => ({
    x: center.x + (point.x - center.x) * scale,
    z: center.z + (point.z - center.z) * scale,
  }));
}

function roundedBox(width, depth, height, color, x, yPos, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth, 4, 1, 4),
    new THREE.MeshStandardMaterial({ color, roughness: 0.86 })
  );
  mesh.position.set(x, yPos, z);
  mesh.receiveShadow = true;
  return mesh;
}

function roundedPlane(width, depth, material, x, yPos, z) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 64), material);
  mesh.scale.set(width * 0.5, depth * 0.5, 1);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, yPos, z);
  mesh.receiveShadow = true;
  return mesh;
}

function createWaterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: reusable.waterUniforms.uTime, uColorA: reusable.waterUniforms.uColorA, uColorB: reusable.waterUniforms.uColorB },
    vertexShader: `
      varying vec2 vUv;
      uniform float uTime;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.z += sin((uv.x + uTime * 0.18) * 14.0) * 0.035;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform float uTime;
      void main() {
        float wave = sin((vUv.x + vUv.y) * 22.0 + uTime * 1.7) * 0.5 + 0.5;
        vec3 color = mix(uColorA, uColorB, wave * 0.35);
        gl_FragColor = vec4(color, 0.88);
      }
    `,
    transparent: true,
  });
}

function disposeObject(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose());
    } else {
      child.material?.dispose();
    }
  });
}

function y(elevation) {
  return elevation * 0.32;
}

function resize() {
  const width = root.clientWidth;
  const height = root.clientHeight;
  renderer.setSize(width, height, false);

  const aspect = width / Math.max(height, 1);
  const isMobile = width < 760;
  const size = isMobile ? CAMERA.orthoMobile : CAMERA.orthoDesktop;
  camera.left = (-size * aspect) / 2;
  camera.right = (size * aspect) / 2;
  camera.top = size / 2;
  camera.bottom = -size / 2;
  camera.updateProjectionMatrix();

  const pitch = THREE.MathUtils.degToRad(CAMERA.pitchDeg);
  const yaw = THREE.MathUtils.degToRad(CAMERA.yawDeg);
  camera.position.set(
    cameraTarget.x + Math.sin(yaw) * CAMERA.distance,
    cameraTarget.y + Math.sin(pitch) * CAMERA.distance,
    cameraTarget.z + Math.cos(yaw) * CAMERA.distance
  );
  camera.lookAt(cameraTarget);
}

window.addEventListener("resize", resize);
resize();

const clock = new THREE.Clock();
function animate() {
  const t = clock.getElapsedTime();
  reusable.waterUniforms.uTime.value = t;
  for (const item of animated) {
    if (item.type === "sway") {
      item.object.rotation.z = Math.sin(t * 1.2 + item.object.userData.swayPhase) * 0.035;
    } else if (item.type === "flag") {
      item.object.rotation.y = Math.sin(t * 2.4) * 0.16;
    }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
