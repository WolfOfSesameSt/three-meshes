import { WORLD } from "../config.js";

export function createPreviewHole(seed = "ag-unit-1") {
  return {
    id: "preview-hole-01",
    seed,
    par: 4,
    world: { ...WORLD },
    tee: {
      position: { x: -18, z: 48, elevation: 2.2 },
      size: { width: 16, depth: 10 },
    },
    pin: {
      position: { x: 18, z: -45, elevation: 5.1 },
    },
    paths: {
      fairway: [
        { x: -18, z: 42 },
        { x: -25, z: 18 },
        { x: -13, z: -4 },
        { x: 6, z: -21 },
        { x: 17, z: -38 },
      ],
      cartPath: [
        { x: 30, z: 52 },
        { x: 23, z: 25 },
        { x: 30, z: -5 },
        { x: 27, z: -34 },
        { x: 14, z: -56 },
      ],
    },
    landingZones: [
      { kind: "fairway", position: { x: -21, z: 19, elevation: 1.5 }, radius: 15 },
      { kind: "fairway", position: { x: -3, z: -12, elevation: 3.2 }, radius: 18 },
      { kind: "green", position: { x: 18, z: -45, elevation: 5.1 }, radius: 13 },
    ],
    roughBands: [
      {
        kind: "short-rough",
        heightBand: "short",
        playPenalty: "future-light-roll-resistance",
        position: { x: -7, z: 5, elevation: 2.4 },
        size: { width: 58, depth: 94 },
      },
      {
        kind: "tall-rough",
        heightBand: "tall",
        playPenalty: "future-heavy-lie-and-distance-penalty",
        position: { x: 0, z: -2, elevation: 2.0 },
        size: { width: 68, depth: 118 },
      },
    ],
    hazards: [
      { kind: "water", position: { x: 22, z: 2, elevation: 0.4 }, size: { width: 24, depth: 20 } },
      { kind: "sand", position: { x: 3, z: -40, elevation: 4.2 }, size: { width: 15, depth: 9 } },
      { kind: "sand", position: { x: 31, z: -40, elevation: 4.5 }, size: { width: 13, depth: 10 } },
    ],
    trees: [
      { x: -34, z: 26, height: 12 },
      { x: -35, z: 7, height: 18 },
      { x: -31, z: -17, height: 14 },
      { x: 34, z: 22, height: 16 },
      { x: 38, z: -7, height: 22 },
      { x: 32, z: -28, height: 13 },
      { x: 0, z: 29, height: 10 },
    ],
    rocks: [
      { x: -8, z: 34, radius: 1.9 },
      { x: 28, z: 12, radius: 2.6 },
      { x: -27, z: -42, radius: 2.2 },
    ],
    outOfBounds: [
      { x: -40, z: 56 },
      { x: -43, z: 28 },
      { x: -43, z: 0 },
      { x: -40, z: -28 },
      { x: -34, z: -58 },
      { x: 40, z: 56 },
      { x: 43, z: 28 },
      { x: 43, z: 0 },
      { x: 40, z: -28 },
      { x: 34, z: -58 },
    ],
    greenContours: [
      { radius: 12, elevation: 5.1, slope: { x: -0.02, z: 0.03 } },
      { radius: 8, elevation: 5.45, slope: { x: 0.01, z: -0.02 } },
      { radius: 4, elevation: 5.25, slope: { x: 0.03, z: 0.01 } },
    ],
  };
}

export function listRequiredElementKinds(hole) {
  return [
    hole.tee && "tee",
    hole.pin && "pin",
    hole.paths?.fairway?.length && "fairway",
    hole.paths?.cartPath?.length && "cart-path",
    hole.roughBands?.some((band) => band.kind === "short-rough") && "short-rough",
    hole.roughBands?.some((band) => band.kind === "tall-rough") && "tall-rough",
    hole.hazards?.some((hazard) => hazard.kind === "sand") && "sand",
    hole.hazards?.some((hazard) => hazard.kind === "water") && "water",
    hole.trees?.length && "trees",
    hole.rocks?.length && "rocks",
    hole.outOfBounds?.length && "out-of-bounds",
    hole.greenContours?.length && "green-contours",
  ].filter(Boolean);
}
