import { WORLD } from "../config.js";
import { createRng, intRange, pick, range } from "./rng.js";

const PAR_CONFIG = {
  3: { segments: 4, lateral: 10, length: 72, landingZones: 1, sandCount: [2, 2], treeCount: [12, 16], fairwayWidth: 21, plannedShots: 1 },
  4: { segments: 5, lateral: 20, length: 98, landingZones: 2, sandCount: [3, 3], treeCount: [15, 20], fairwayWidth: 23, plannedShots: 2 },
  5: { segments: 6, lateral: 26, length: 112, landingZones: 3, sandCount: [4, 4], treeCount: [18, 24], fairwayWidth: 25, plannedShots: 3 },
};

const TEMPLATES = [
  { id: "par3-island-green", concept: "island green", allowedPars: [3], dogleg: 0, riskSide: 1, water: "island" },
  { id: "par3-raised-guarded", concept: "raised guarded green", allowedPars: [3], dogleg: 0, riskSide: -1, water: "flank" },
  { id: "creek-carry", concept: "creek carry", allowedPars: [3, 4], dogleg: 0, riskSide: -1, water: "carry" },
  { id: "guarded-green", concept: "guarded green", allowedPars: [3, 4], dogleg: 0, riskSide: 1, water: "flank" },
  { id: "dogleg-left", concept: "dogleg left", allowedPars: [4, 5], dogleg: -1, riskSide: -1, water: "inside-corner" },
  { id: "dogleg-right", concept: "dogleg right", allowedPars: [4, 5], dogleg: 1, riskSide: 1, water: "inside-corner" },
  { id: "par5-sweeping-lake", concept: "sweeping lake", allowedPars: [5], dogleg: 1, riskSide: 1, water: "lake" },
  { id: "split-bailout", concept: "split fairway bailout", allowedPars: [5], dogleg: 1, riskSide: -1, water: "flank" },
];

export const TEE_TIER_OPTIONS = [
  { id: "forward", label: "Forward", offsetYards: -35, recommendedPowerBand: "baseline", intendedDriveYards: 240 },
  { id: "standard", label: "Standard", offsetYards: 0, recommendedPowerBand: "baseline", intendedDriveYards: 265 },
  { id: "champion", label: "Champion", offsetYards: 45, recommendedPowerBand: "maxed", intendedDriveYards: 375 },
];

export function listArchetypeOptions(par = null) {
  const numericPar = par === null || par === "any" || par === "" ? null : Number(par);
  return TEMPLATES
    .filter((template) => numericPar === null || template.allowedPars.includes(numericPar))
    .map((template) => ({
      id: template.id,
      concept: template.concept,
      allowedPars: [...template.allowedPars],
    }));
}

export function listTeeTierOptions() {
  return TEE_TIER_OPTIONS.map((tee) => ({ ...tee }));
}

export function findTeeTier(hole, teeTierId = "standard") {
  return hole.teeTiers.find((tee) => tee.id === teeTierId)
    ?? hole.teeTiers.find((tee) => tee.id === "standard")
    ?? hole.teeTiers[0];
}

export function generateHole(seed = "AG-001", options = {}) {
  const rng = createRng(seed);
  const par = options.par ?? pick(rng, [3, 4, 5]);
  const cfg = PAR_CONFIG[par] ?? PAR_CONFIG[4];
  const template = selectTemplate(rng, par, options.template);
  const direction = template.dogleg || (rng() > 0.5 ? 1 : -1);
  const teeZ = WORLD.length * 0.42;
  const pinZ = teeZ - cfg.length;
  const teeX = range(rng, -12, 12);
  const pinX = clamp(teeX + direction * range(rng, template.dogleg ? 16 : 8, cfg.lateral), -26, 26);

  const route = createRoute(rng, cfg, teeX, teeZ, pinX, pinZ, direction, template);
  const landingZones = createLandingZones(route, cfg, rng);
  const surfaces = createSurfaces(route, cfg, rng, template);
  const roughBands = createRoughBands(rng, route, surfaces);
  const hazards = createHazards(rng, cfg, route, pinX, pinZ, template);
  const terrain = createTerrain(route, surfaces, rng);
  const tee = createPrimaryTee(rng, par, teeX, teeZ);
  const teeTiers = createTeeTiers(tee, route, par);
  const pinElevation = elevationAt(pinX, pinZ, rng);
  const greenContours = createGreenContours(rng, pinElevation);
  const greenComplex = createGreenComplex(route, pinX, pinZ, pinElevation, greenContours, template);
  const cartPathRibbon = createCartPathRibbon(route, direction, template);
  const trees = createTrees(rng, cfg, route, hazards);
  const treeFrames = createTreeFrames(trees, route, template);
  const rocks = createRocks(rng, route);
  const outOfBounds = createOutOfBounds();
  const shotPlan = createShotPlan(par, route, landingZones, template);
  const surfacePolygons = createSurfacePolygons(surfaces, roughBands);

  return {
    id: `generated-${seed}`,
    seed,
    par,
    archetype: template.id,
    architecture: {
      template: template.id,
      concept: template.concept,
      strategy: describeStrategy(template, par),
      riskSide: template.riskSide < 0 ? "left" : "right",
    },
    shotPlan,
    routingIntent: createRoutingIntent(route, template),
    world: { ...WORLD },
    tee,
    teeTiers,
    pin: {
      position: { x: pinX, z: pinZ, elevation: pinElevation },
    },
    paths: {
      fairway: route,
      cartPath: cartPathRibbon.centerline,
    },
    surfaces,
    surfacePolygons,
    terrain,
    landingZones,
    roughBands,
    hazards,
    waterPolygons: hazards.filter((hazard) => hazard.kind === "water").map((hazard) => hazard.polygon),
    bunkerPolygons: hazards.filter((hazard) => hazard.kind === "sand").map((hazard) => hazard.polygon),
    cartPathRibbon,
    trees,
    treeFrames,
    forestBelts: createForestBelts(treeFrames),
    rocks,
    outOfBounds,
    greenComplex,
    greenContours,
  };
}

function selectTemplate(rng, par, requestedId) {
  const allowed = TEMPLATES.filter((template) => template.allowedPars.includes(par));
  if (requestedId) {
    return allowed.find((item) => item.id === requestedId)
      ?? TEMPLATES.find((item) => item.id === requestedId)
      ?? allowed[0];
  }
  return pick(rng, allowed);
}

function createRoute(rng, cfg, teeX, teeZ, pinX, pinZ, direction, template) {
  const route = [];
  for (let i = 0; i < cfg.segments; i += 1) {
    const t = i / (cfg.segments - 1);
    const doglegShape = template.id === "creek-carry"
      ? Math.sin(t * Math.PI) * direction * 5
      : Math.sin(t * Math.PI) * direction * range(rng, cfg.lateral * 0.45, cfg.lateral);
    const compositionBend = template.id === "split-bailout" && t > 0.35 && t < 0.75
      ? template.riskSide * 7
      : 0;
    const wiggle = range(rng, -1.8, 1.8);
    route.push({
      x: clamp(lerp(teeX, pinX, t) + doglegShape + compositionBend + wiggle, -30, 30),
      z: lerp(teeZ, pinZ, t),
    });
  }
  return route;
}

function createLandingZones(route, cfg, rng) {
  const zones = [];
  const usable = route.slice(1, -1);
  for (let i = 0; i < cfg.landingZones; i += 1) {
    const point = usable[Math.min(i, usable.length - 1)];
    const next = usable[Math.min(i + 1, usable.length - 1)] ?? route[route.length - 1];
    zones.push({
      kind: "fairway",
      position: { x: point.x, z: point.z, elevation: elevationAt(point.x, point.z, rng) },
      radius: range(rng, 12, 18),
      slope: slopeBetween(point, next),
      lie: "fairway",
      intendedMiss: i % 2 === 0 ? "safe-side" : "aggressive-side",
      width: range(rng, 24, 34),
    });
  }
  const greenPoint = route[route.length - 1];
  zones.push({
    kind: "green",
    position: { x: greenPoint.x, z: greenPoint.z, elevation: elevationAt(greenPoint.x, greenPoint.z, rng) },
    radius: range(rng, 12, 15),
    slope: { x: 0.01, z: -0.015, grade: 0.018 },
    lie: "green",
    intendedMiss: "short-apron",
    width: 28,
  });
  return zones;
}

function createSurfaces(route, cfg, rng, template) {
  const greenPoint = route[route.length - 1];
  const isIslandPar3 = template.id === "par3-island-green";
  const fairway = isIslandPar3
    ? ellipsePolygon(greenPoint, 35, 27, 18)
    : createRibbon(route, cfg.fairwayWidth, (i) => i === 0 ? 1.18 : i === route.length - 1 ? 1.42 : 1.08);
  const firstCut = isIslandPar3
    ? ellipsePolygon(greenPoint, 44, 36, 18)
    : createRibbon(route, cfg.fairwayWidth + 10, (i) => i === 0 ? 1.22 : i === route.length - 1 ? 1.62 : 1.14);
  const shortRough = isIslandPar3
    ? ellipsePolygon(greenPoint, 54, 44, 18)
    : createRibbon(route, cfg.fairwayWidth + 22, (i) => i === route.length - 1 ? 1.72 : 1.18);
  return {
    fairway: {
      kind: "fairway",
      points: fairway,
      elevation: routeElevation(route, rng, 0.35),
      physics: surfacePhysics("fairway"),
    },
    firstCut: {
      kind: "first-cut",
      points: firstCut,
      elevation: routeElevation(route, rng, 0.12),
      physics: surfacePhysics("first-cut"),
    },
    shortRough: {
      kind: "short-rough-surface",
      points: shortRough,
      elevation: routeElevation(route, rng, -0.1),
      physics: surfacePhysics("short-rough"),
    },
  };
}

function createRoughBands(rng, route, surfaces) {
  const center = route[Math.floor(route.length / 2)];
  const minZ = Math.min(...route.map((p) => p.z));
  const maxZ = Math.max(...route.map((p) => p.z));
  return [
    {
      kind: "short-rough",
      heightBand: "short",
      playPenalty: "future-light-roll-resistance",
      physics: surfacePhysics("short-rough"),
      points: surfaces.shortRough.points,
      position: { x: center.x * 0.2, z: (minZ + maxZ) / 2, elevation: range(rng, 1.4, 3.2) },
      size: { width: WORLD.width - 14, depth: clamp(maxZ - minZ + 24, 82, 122) },
    },
    {
      kind: "tall-rough",
      heightBand: "tall",
      playPenalty: "future-heavy-lie-and-distance-penalty",
      physics: surfacePhysics("tall-rough"),
      position: { x: 0, z: (minZ + maxZ) / 2, elevation: range(rng, 1.0, 2.6) },
      size: { width: WORLD.width - 4, depth: WORLD.length - 10 },
    },
  ];
}

function createHazards(rng, cfg, route, pinX, pinZ, template) {
  const hazards = [];
  if (template.water === "island") {
    const green = route[route.length - 1];
    const hazard = {
      kind: "water",
      type: "island-surround",
      role: "forced-carry",
      targetShot: 1,
      side: "center",
      strategy: "Commit to the carry; miss short or wide and the ball is wet.",
      position: { x: green.x, z: green.z, elevation: 0.25 },
      size: { width: 68, depth: 54 },
      physics: surfacePhysics("water"),
    };
    hazard.polygon = ellipsePolygon(hazard.position, hazard.size.width, hazard.size.depth, 18);
    hazards.push(hazard);
  } else if (template.water === "carry") {
    const p = route[Math.max(1, Math.floor(route.length * 0.38))];
    const hazard = {
      kind: "water",
      type: "creek",
      role: "forced-carry",
      targetShot: 1,
      side: "center",
      strategy: "Carry the creek for a shorter approach or bail out short.",
      position: { x: p.x + template.riskSide * 5, z: p.z, elevation: 0.35 },
      size: { width: 54, depth: 15 },
      physics: surfacePhysics("water"),
    };
    hazard.polygon = ellipsePolygon(hazard.position, hazard.size.width, hazard.size.depth, 14);
    hazards.push(hazard);
  } else if (template.water === "lake") {
    const startIndex = Math.max(1, Math.floor(route.length * 0.36));
    const lakeRoute = route.slice(startIndex);
    const mid = lakeRoute[Math.floor(lakeRoute.length / 2)];
    const side = template.riskSide;
    const hazard = {
      kind: "water",
      type: "lake",
      role: "risk-reward-corner",
      targetShot: 2,
      side: side < 0 ? "left" : "right",
      strategy: "Take on the lake edge for a shorter second shot or stay wide on the safe side.",
      position: { x: clamp(mid.x + side * 18, -28, 28), z: mid.z + 0, elevation: 0.35 },
      size: { width: 42, depth: 72 },
      physics: surfacePhysics("water"),
    };
    hazard.polygon = createOffsetRibbon(lakeRoute, side, 18, 34);
    hazards.push(hazard);
  } else {
    const p = route[Math.max(1, Math.floor(route.length * 0.48))];
    const side = template.water === "inside-corner" ? template.riskSide : -template.riskSide;
    const hazard = {
      kind: "water",
      type: template.water === "lake" ? "lake" : "pond",
      role: template.water === "inside-corner" ? "risk-reward-corner" : "flanking-hazard",
      targetShot: template.water === "lake" ? 2 : 1,
      side: side < 0 ? "left" : "right",
      strategy: template.water === "inside-corner"
        ? "Challenge the inside corner for a better angle into the green."
        : "Stay away from the water side or accept a longer approach.",
      position: { x: clamp(p.x + side * range(rng, 12, 17), -30, 30), z: p.z + range(rng, -5, 5), elevation: 0.35 },
      size: {
        width: template.water === "inside-corner" ? range(rng, 36, 48) : range(rng, 20, 30),
        depth: template.water === "inside-corner" ? range(rng, 28, 38) : range(rng, 16, 25),
      },
      physics: surfacePhysics("water"),
    };
    hazard.polygon = ellipsePolygon(hazard.position, hazard.size.width, hazard.size.depth, 16);
    hazards.push(hazard);
  }
  const [minSand, maxSand] = cfg.sandCount;
  const sandCount = intRange(rng, minSand, maxSand);
  for (let i = 0; i < sandCount; i += 1) {
    const placement = createBunkerPlacement(rng, route, cfg, i, template, pinX, pinZ);
    hazards.push({
      kind: "sand",
      role: placement.role,
      targetShot: placement.targetShot,
      side: placement.side < 0 ? "left" : "right",
      strategy: placement.strategy,
      position: {
        x: clamp(placement.position.x, -32, 32),
        z: clamp(placement.position.z, -58, 58),
        elevation: range(rng, 3.1, 5.3),
      },
      size: placement.size,
      physics: surfacePhysics("sand"),
    });
    hazards[hazards.length - 1].polygon = lobePolygon(hazards[hazards.length - 1].position, hazards[hazards.length - 1].size.width, hazards[hazards.length - 1].size.depth, rng);
  }
  return hazards;
}

function createBunkerPlacement(rng, route, cfg, index, template, pinX, pinZ) {
  const green = route[route.length - 1];
  const approach = normalizeSegment(route[route.length - 2], green);
  const left = { x: -approach.z, z: approach.x };
  const riskSide = template.riskSide || 1;
  const nearGreenCount = route.length <= 4 ? cfg.sandCount[1] : Math.min(2, cfg.sandCount[1]);
  if (index < nearGreenCount) {
    const side = index === 0 ? riskSide : -riskSide;
    const lateral = sideVector(left, side);
    const frontBack = index === 0 ? 6 : -3;
    return {
      role: "guarded-green",
      targetShot: cfg.plannedShots,
      side,
      strategy: index === 0
        ? "Guard the aggressive approach line into the front shoulder of the green."
        : "Catch long-side misses and reward the safer approach angle.",
      position: {
        x: pinX - approach.x * frontBack + lateral.x * range(rng, 20, 24),
        z: pinZ - approach.z * frontBack + lateral.z * range(rng, 15, 19),
      },
      size: { width: range(rng, 9, 13), depth: range(rng, 5.5, 8) },
    };
  }

  const landingIndex = Math.min(index - nearGreenCount + 1, route.length - 3);
  const landing = route[Math.max(1, landingIndex)];
  const next = route[Math.min(route.length - 1, landingIndex + 1)];
  const segment = normalizeSegment(landing, next);
  const side = index % 2 === 0 ? riskSide : -riskSide;
  const lateral = sideVector({ x: -segment.z, z: segment.x }, side);
  return {
    role: "landing-zone-bunker",
    targetShot: Math.max(1, Math.min(index, cfg.plannedShots - 1)),
    side,
    strategy: "Pinch the preferred landing zone and force a choice between angle and safety.",
    position: {
      x: landing.x + lateral.x * range(rng, 15, 19) + segment.x * range(rng, -2, 6),
      z: landing.z + lateral.z * range(rng, 12, 16) + segment.z * range(rng, -2, 6),
    },
    size: { width: range(rng, 11, 16), depth: range(rng, 6, 10) },
  };
}

function normalizeSegment(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.max(Math.sqrt(dx * dx + dz * dz), 0.0001);
  return { x: dx / len, z: dz / len };
}

function sideVector(v, side) {
  return { x: v.x * side, z: v.z * side };
}

function createOffsetRibbon(route, side, innerOffset, width) {
  const inner = [];
  const outer = [];
  for (let i = 0; i < route.length; i += 1) {
    const prev = route[Math.max(0, i - 1)];
    const next = route[Math.min(route.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.max(Math.sqrt(dx * dx + dz * dz), 0.0001);
    const nx = (-dz / len) * side;
    const nz = (dx / len) * side;
    const flare = Math.sin((i / Math.max(route.length - 1, 1)) * Math.PI) * 5;
    inner.push({
      x: clamp(route[i].x + nx * innerOffset, -40, 40),
      z: clamp(route[i].z + nz * innerOffset, -64, 64),
    });
    outer.unshift({
      x: clamp(route[i].x + nx * (innerOffset + width + flare), -40, 40),
      z: clamp(route[i].z + nz * (innerOffset + width + flare), -64, 64),
    });
  }
  return [...inner, ...outer];
}

function createTrees(rng, cfg, route, hazards) {
  const [minTrees, maxTrees] = cfg.treeCount;
  const trees = [];
  const count = intRange(rng, minTrees, maxTrees);
  for (let i = 0; i < count; i += 1) {
    const p = route[intRange(rng, 0, route.length - 1)];
    const side = pick(rng, [-1, 1]);
    let tree = {
      x: clamp(p.x + side * range(rng, 20, 36), -38, 38),
      z: clamp(p.z + range(rng, -14, 14), -58, 58),
      height: range(rng, 9, 24),
      canopyRadius: range(rng, 3.5, 6.5),
      role: i % 5 === 0 ? "dogleg-corner" : i % 3 === 0 ? "green-backdrop" : "perimeter-frame",
      blocksTrajectory: true,
    };
    if (tooCloseToHazard(tree, hazards)) {
      tree = { ...tree, x: clamp(tree.x + side * 8, -38, 38) };
    }
    if (tooCloseToGreen(tree, route[route.length - 1])) {
      tree = {
        ...tree,
        x: clamp(tree.x + side * 10, -38, 38),
        z: clamp(tree.z + (tree.z > route[route.length - 1].z ? 8 : -8), -58, 58),
      };
    }
    trees.push(tree);
  }
  return trees;
}

function createRocks(rng, route) {
  return Array.from({ length: intRange(rng, 2, 4) }, () => {
    const p = route[intRange(rng, 0, route.length - 1)];
    return {
      x: clamp(p.x + pick(rng, [-1, 1]) * range(rng, 10, 24), -34, 34),
      z: clamp(p.z + range(rng, -12, 12), -58, 58),
      radius: range(rng, 1.4, 2.8),
    };
  });
}

function createCartPath(route, direction, template = {}) {
  const side = template.water === "lake" ? (direction > 0 ? -1 : 1) : (direction > 0 ? 1 : -1);
  return route.map((p, index) => {
    const t = index / Math.max(route.length - 1, 1);
    const offset = 31 + Math.sin(t * Math.PI) * 5;
    const teePull = index === 0 ? -side * 5 : 0;
    const greenPull = index === route.length - 1 ? -side * 7 : 0;
    return {
      x: clamp(p.x + side * offset + teePull + greenPull, -35, 35),
      z: clamp(p.z + (index === 0 ? 7 : index === route.length - 1 ? -6 : Math.sin(t * Math.PI * 2) * 2), -60, 60),
    };
  });
}

function createCartPathRibbon(route, direction, template) {
  const centerline = createCartPath(route, direction, template);
  return {
    centerline,
    width: 5.6,
    side: centerline[0].x > route[0].x ? "right" : "left",
    points: createRibbon(centerline, 7),
    physics: surfacePhysics("cart-path"),
  };
}

function createOutOfBounds() {
  return [
    ...[-56, -28, 0, 28, 56].map((z) => ({ x: -40, z })),
    ...[-56, -28, 0, 28, 56].map((z) => ({ x: 40, z })),
  ];
}

function createGreenContours(rng, elevation) {
  return [12, 8, 4].map((radius, index) => ({
    radius,
    elevation: elevation + range(rng, -0.25, 0.35) + index * 0.12,
    slope: { x: range(rng, -0.035, 0.035), z: range(rng, -0.035, 0.035) },
  }));
}

function createPrimaryTee(rng, par, teeX, teeZ) {
  return {
    position: { x: teeX, z: teeZ, elevation: elevationAt(teeX, teeZ, rng) },
    size: { width: 14 + par, depth: 9 },
    tier: "standard",
    intendedCarryYards: par === 3 ? 165 : 240,
    recommendedPowerBand: "baseline",
  };
}

function createTeeTiers(tee, route, par) {
  const next = route[1] ?? route[route.length - 1];
  const dx = next.x - tee.position.x;
  const dz = next.z - tee.position.z;
  const len = Math.max(Math.sqrt(dx * dx + dz * dz), 0.0001);
  const ux = dx / len;
  const uz = dz / len;
  return TEE_TIER_OPTIONS.map((tier) => {
    const worldOffset = tier.offsetYards / 5;
    const intendedDriveYards = par === 3
      ? (tier.id === "champion" ? 220 : tier.id === "standard" ? 180 : 150)
      : tier.intendedDriveYards;
    return {
      ...tier,
      intendedDriveYards,
      position: {
        x: tee.position.x - ux * worldOffset,
        z: tee.position.z - uz * worldOffset,
        elevation: tee.position.elevation + tier.offsetYards * 0.004,
      },
      targetLandingZoneIndex: par === 3 ? "green" : 0,
      intendedCarryDistanceYards: intendedDriveYards,
    };
  });
}

function createShotPlan(par, route, landingZones, template) {
  if (par === 3) {
    return [{
      shot: 1,
      from: "tee",
      target: "green",
      decision: template.water === "island" ? "carry island green" : "flight to the correct tier",
      expectedCarryYards: 160,
      risk: template.water === "island" ? "water" : "guarded-green",
    }];
  }
  const plan = [];
  for (let i = 0; i < par - 3; i += 1) {
    const zone = landingZones[Math.min(i, landingZones.length - 2)];
    plan.push({
      shot: i + 1,
      from: i === 0 ? "tee" : `landing-${i}`,
      target: `landing-${i + 1}`,
      targetPosition: zone.position,
      decision: i === 0 ? "choose safe side or aggressive angle" : "choose layup distance and angle",
      expectedCarryYards: i === 0 ? 240 : 190,
      risk: i === 0 ? "driver-line" : "approach-position",
    });
  }
  plan.push({
    shot: plan.length + 1,
    from: `landing-${Math.max(1, plan.length)}`,
    target: "green",
    targetPosition: landingZones[landingZones.length - 1].position,
    decision: "attack the guarded green or use the bailout apron",
    expectedCarryYards: 145,
    risk: "green-complex",
  });
  return plan;
}

function createRoutingIntent(route, template) {
  const start = route[0];
  const end = route[route.length - 1];
  return {
    direction: "up-course",
    bend: template.dogleg < 0 ? "left" : template.dogleg > 0 ? "right" : "straight",
    preferredMiss: template.riskSide < 0 ? "right" : "left",
    riskSide: template.riskSide < 0 ? "left" : "right",
    safeSide: template.riskSide < 0 ? "right" : "left",
    approachAngle: Math.atan2(end.x - start.x, end.z - start.z),
  };
}

function createGreenComplex(route, pinX, pinZ, elevation, contours, template) {
  const greenPolygon = ellipsePolygon({ x: pinX, z: pinZ }, 28, 21, 18);
  return {
    polygon: greenPolygon,
    collarPolygon: ellipsePolygon({ x: pinX, z: pinZ }, 34, 27, 18),
    apronPolygon: createRibbon([route[route.length - 2], route[route.length - 1]], 18),
    tiers: contours.map((contour, index) => ({
      id: `tier-${index + 1}`,
      polygon: ellipsePolygon({ x: pinX + contour.slope.x * 42, z: pinZ + contour.slope.z * 42 }, contour.radius * 2.1, contour.radius * 1.55, 16),
      elevation: contour.elevation,
      slope: contour.slope,
      speed: index === 0 ? "medium" : index === 1 ? "fast" : "slow",
      rollVector: normalize2(contour.slope),
      slopeMagnitude: Math.sqrt(contour.slope.x * contour.slope.x + contour.slope.z * contour.slope.z),
    })),
    contours,
    pinZones: [{
      position: { x: pinX, z: pinZ, elevation },
      difficulty: template.id.includes("island") ? "hard" : "medium",
      legalRadius: 4,
    }],
    physics: surfacePhysics("green"),
  };
}

function createTerrain(route, surfaces, rng) {
  const bounds = { minX: -WORLD.width / 2, maxX: WORLD.width / 2, minZ: -WORLD.length / 2, maxZ: WORLD.length / 2 };
  const resolution = { x: 7, z: 9 };
  const samples = [];
  for (let zi = 0; zi < resolution.z; zi += 1) {
    for (let xi = 0; xi < resolution.x; xi += 1) {
      const x = lerp(bounds.minX, bounds.maxX, xi / (resolution.x - 1));
      const z = lerp(bounds.minZ, bounds.maxZ, zi / (resolution.z - 1));
      samples.push(Number(elevationAt(x, z, rng).toFixed(3)));
    }
  }
  return {
    heightField: { bounds, resolution, samples },
    tiers: [
      { polygon: surfaces.shortRough.points, elevation: surfaces.shortRough.elevation - 0.2, edgeStyle: "terrace" },
      { polygon: surfaces.firstCut.points, elevation: surfaces.firstCut.elevation, edgeStyle: "slope" },
      { polygon: surfaces.fairway.points, elevation: surfaces.fairway.elevation, edgeStyle: "slope" },
    ],
    slopeVectors: route.slice(0, -1).map((point, index) => {
      const next = route[index + 1];
      return { polygon: ellipsePolygon(point, 18, 12, 8), direction: slopeBetween(point, next), grade: Math.abs(next.z - point.z) / 1000 };
    }),
  };
}

function createSurfacePolygons(surfaces, roughBands) {
  const tall = roughBands.find((band) => band.kind === "tall-rough");
  return {
    fairway: { polygon: surfaces.fairway.points, physics: surfaces.fairway.physics },
    firstCut: { polygon: surfaces.firstCut.points, physics: surfaces.firstCut.physics },
    shortRough: { polygon: surfaces.shortRough.points, physics: surfaces.shortRough.physics },
    tallRough: {
      polygon: rectanglePolygon(tall.position, tall.size.width, tall.size.depth),
      physics: tall.physics,
    },
  };
}

function createTreeFrames(trees) {
  return trees.map((tree) => ({
    role: tree.role,
    species: tree.height > 18 ? "pine-tall" : tree.role === "green-backdrop" ? "round" : "pine",
    heightBand: tree.height > 18 ? "tall" : tree.height > 13 ? "medium" : "short",
    blocksTrajectory: true,
    position: { x: tree.x, z: tree.z },
    height: tree.height,
    canopyRadius: tree.canopyRadius,
  }));
}

function createForestBelts(treeFrames) {
  return {
    left: treeFrames.filter((tree) => tree.position.x < -18),
    right: treeFrames.filter((tree) => tree.position.x > 18),
    back: treeFrames.filter((tree) => tree.position.z < -38),
  };
}

function surfacePhysics(lie) {
  const table = {
    tee: { friction: 0.28, restitution: 0.48, rollResistance: 0.24, launchPenalty: 0, spinRetention: 0.9 },
    fairway: { friction: 0.34, restitution: 0.42, rollResistance: 0.32, launchPenalty: 0, spinRetention: 0.78 },
    "first-cut": { friction: 0.42, restitution: 0.36, rollResistance: 0.48, launchPenalty: 0.03, spinRetention: 0.68 },
    "short-rough": { friction: 0.52, restitution: 0.28, rollResistance: 0.66, launchPenalty: 0.08, spinRetention: 0.52 },
    "tall-rough": { friction: 0.7, restitution: 0.18, rollResistance: 0.84, launchPenalty: 0.18, spinRetention: 0.35 },
    sand: { friction: 0.82, restitution: 0.12, rollResistance: 0.9, launchPenalty: 0.26, spinRetention: 0.25 },
    green: { friction: 0.24, restitution: 0.32, rollResistance: 0.18, launchPenalty: 0, spinRetention: 0.88 },
    water: { friction: 1, restitution: 0, rollResistance: 1, launchPenalty: 1, spinRetention: 0 },
    "cart-path": { friction: 0.16, restitution: 0.76, rollResistance: 0.1, launchPenalty: -0.02, spinRetention: 0.42 },
  };
  return { lie, ...table[lie], heightAt: "terrain-heightfield", normalAt: "derived-from-heightfield" };
}

function createRibbon(route, width, scaleAt = () => 1) {
  const left = [];
  const right = [];
  for (let i = 0; i < route.length; i += 1) {
    const prev = route[Math.max(0, i - 1)];
    const next = route[Math.min(route.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.max(Math.sqrt(dx * dx + dz * dz), 0.0001);
    const nx = -dz / len;
    const nz = dx / len;
    const half = (width * scaleAt(i)) / 2;
    left.push({ x: clamp(route[i].x + nx * half, -38, 38), z: clamp(route[i].z + nz * half, -62, 62) });
    right.unshift({ x: clamp(route[i].x - nx * half, -38, 38), z: clamp(route[i].z - nz * half, -62, 62) });
  }
  return [...left, ...right];
}

function ellipsePolygon(center, width, depth, segments) {
  return Array.from({ length: segments }, (_, index) => {
    const a = (index / segments) * Math.PI * 2;
    return {
      x: clamp(center.x + Math.cos(a) * width * 0.5, -40, 40),
      z: clamp(center.z + Math.sin(a) * depth * 0.5, -64, 64),
    };
  });
}

function lobePolygon(center, width, depth, rng) {
  return Array.from({ length: 10 }, (_, index) => {
    const a = (index / 10) * Math.PI * 2;
    const wobble = 0.82 + rng() * 0.28;
    return {
      x: clamp(center.x + Math.cos(a) * width * 0.5 * wobble, -40, 40),
      z: clamp(center.z + Math.sin(a) * depth * 0.5 * wobble, -64, 64),
    };
  });
}

function rectanglePolygon(center, width, depth) {
  return [
    { x: center.x - width / 2, z: center.z - depth / 2 },
    { x: center.x + width / 2, z: center.z - depth / 2 },
    { x: center.x + width / 2, z: center.z + depth / 2 },
    { x: center.x - width / 2, z: center.z + depth / 2 },
  ];
}

function slopeBetween(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return normalize2({ x: dx * 0.01, z: dz * -0.01 });
}

function normalize2(v) {
  const len = Math.max(Math.sqrt(v.x * v.x + v.z * v.z), 0.0001);
  return { x: v.x / len, z: v.z / len, grade: Math.min(len, 0.08) };
}

function routeElevation(route, rng, offset) {
  const center = route[Math.floor(route.length / 2)];
  return elevationAt(center.x, center.z, rng) + offset;
}

function describeStrategy(template, par) {
  if (template.id === "creek-carry") return `Par ${par}: choose a safe layup or carry water for a shorter approach.`;
  if (template.id === "split-bailout") return `Par ${par}: aggressive line earns angle, bailout side stays open but longer.`;
  if (template.id.includes("dogleg")) return `Par ${par}: shape around the dogleg to avoid the guarded inside corner.`;
  return `Par ${par}: find the correct approach angle into a guarded green.`;
}

function tooCloseToHazard(tree, hazards) {
  return hazards.some((hazard) => {
    const dx = tree.x - hazard.position.x;
    const dz = tree.z - hazard.position.z;
    return Math.sqrt(dx * dx + dz * dz) < Math.max(hazard.size.width, hazard.size.depth) * 0.7;
  });
}

function tooCloseToGreen(tree, green) {
  const dx = tree.x - green.x;
  const dz = tree.z - green.z;
  return Math.sqrt(dx * dx + dz * dz) < 24;
}

function elevationAt(x, z, rng) {
  return clamp(2.8 + x * 0.035 - z * 0.018 + range(rng, -0.6, 0.6), 0.5, 6.2);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
