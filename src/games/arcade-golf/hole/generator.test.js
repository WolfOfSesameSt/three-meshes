import { describe, expect, it } from "vitest";
import { WORLD } from "../config.js";
import { findTeeTier, generateHole, listArchetypeOptions, listTeeTierOptions } from "./generator.js";
import { listRequiredElementKinds } from "./preview-hole.js";

const REQUIRED = [
  "tee",
  "pin",
  "fairway",
  "cart-path",
  "short-rough",
  "tall-rough",
  "sand",
  "water",
  "trees",
  "rocks",
  "out-of-bounds",
  "green-contours",
];

describe("generateHole", () => {
  it("is deterministic for the same seed", () => {
    expect(generateHole("AG-042")).toEqual(generateHole("AG-042"));
  });

  it("creates meaningfully different holes for different seeds", () => {
    const a = generateHole("AG-101");
    const b = generateHole("AG-102");
    expect({
      par: a.par,
      tee: a.tee.position,
      pin: a.pin.position,
      fairway: a.paths.fairway,
    }).not.toEqual({
      par: b.par,
      tee: b.tee.position,
      pin: b.pin.position,
      fairway: b.paths.fairway,
    });
  });

  it("supports only par 3, 4, and 5 in the initial scope", () => {
    const pars = new Set(Array.from({ length: 40 }, (_, i) => generateHole(`AG-${i}`).par));
    expect([...pars].every((par) => [3, 4, 5].includes(par))).toBe(true);
    expect(pars.size).toBeGreaterThan(1);
  });

  it("preserves all approved structural element kinds", () => {
    const kinds = listRequiredElementKinds(generateHole("AG-required", { par: 5 }));
    expect(kinds).toEqual(REQUIRED);
  });

  it("keeps generated play geometry inside the visual board envelope", () => {
    const hole = generateHole("AG-bounds", { par: 5 });
    const xs = [
      hole.tee.position.x,
      hole.pin.position.x,
      ...hole.paths.fairway.map((p) => p.x),
      ...hole.paths.cartPath.map((p) => p.x),
      ...hole.hazards.map((h) => h.position.x),
      ...hole.trees.map((t) => t.x),
      ...hole.rocks.map((r) => r.x),
      ...hole.surfaces.fairway.points.map((p) => p.x),
      ...hole.surfaces.firstCut.points.map((p) => p.x),
      ...hole.surfaces.shortRough.points.map((p) => p.x),
    ];
    const zs = [
      hole.tee.position.z,
      hole.pin.position.z,
      ...hole.paths.fairway.map((p) => p.z),
      ...hole.paths.cartPath.map((p) => p.z),
      ...hole.hazards.map((h) => h.position.z),
      ...hole.trees.map((t) => t.z),
      ...hole.rocks.map((r) => r.z),
      ...hole.surfaces.fairway.points.map((p) => p.z),
      ...hole.surfaces.firstCut.points.map((p) => p.z),
      ...hole.surfaces.shortRough.points.map((p) => p.z),
    ];
    expect(Math.max(...xs)).toBeLessThanOrEqual(WORLD.width / 2 + 8);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-WORLD.width / 2 - 8);
    expect(Math.max(...zs)).toBeLessThanOrEqual(WORLD.length / 2 + 8);
    expect(Math.min(...zs)).toBeGreaterThanOrEqual(-WORLD.length / 2 - 8);
  });

  it("stores future physics inputs for rough, trees, elevation, and greens", () => {
    const hole = generateHole("AG-physics", { par: 4 });
    expect(hole.roughBands.map((band) => band.heightBand).sort()).toEqual(["short", "tall"]);
    expect(hole.trees.every((tree) => tree.height > 0)).toBe(true);
    expect(hole.landingZones.every((zone) => typeof zone.position.elevation === "number")).toBe(true);
    expect(hole.greenContours.every((contour) => typeof contour.slope.x === "number")).toBe(true);
  });

  it("emits continuous fairway, first-cut, and short-rough surface polygons", () => {
    const hole = generateHole("AG-surfaces", { par: 4, template: "dogleg-left" });
    expect(hole.surfaces.fairway.points.length).toBeGreaterThan(hole.paths.fairway.length);
    expect(hole.surfaces.firstCut.points.length).toBe(hole.surfaces.fairway.points.length);
    expect(hole.surfaces.shortRough.points.length).toBe(hole.surfaces.fairway.points.length);
    expect(hole.surfaces.fairway.kind).toBe("fairway");
    expect(hole.surfaces.firstCut.kind).toBe("first-cut");
  });

  it("labels each generated hole with an architected template and strategy", () => {
    const hole = generateHole("AG-template", { par: 5, template: "creek-carry" });
    expect(hole.architecture.template).toBe("creek-carry");
    expect(hole.architecture.concept).toBe("creek carry");
    expect(hole.architecture.strategy).toContain("carry water");
  });

  it("places hazards with strategic roles rather than decoration-only metadata", () => {
    const hole = generateHole("AG-hazards", { par: 4, template: "dogleg-right" });
    expect(hole.hazards.every((hazard) => hazard.role && hazard.strategy)).toBe(true);
    expect(hole.hazards.some((hazard) => hazard.role === "risk-reward-corner")).toBe(true);
    expect(hole.hazards.some((hazard) => hazard.role === "guarded-green")).toBe(true);
  });

  it("keeps cart path on a consistent side of the designed route", () => {
    const hole = generateHole("AG-cart", { par: 4, template: "dogleg-right" });
    const offsets = hole.paths.cartPath.map((point, index) => point.x - hole.paths.fairway[index].x);
    const sign = Math.sign(offsets[0]);
    expect(sign).not.toBe(0);
    expect(offsets.every((offset) => Math.sign(offset) === sign || Math.abs(offset) < 1)).toBe(true);
  });

  it("emits the Course Engine 2C composition schema", () => {
    const hole = generateHole("AG-2c", { par: 5, template: "par5-sweeping-lake" });
    expect(hole.archetype).toBe("par5-sweeping-lake");
    expect(hole.shotPlan.length).toBe(3);
    expect(hole.routingIntent.riskSide).toBeDefined();
    expect(hole.surfacePolygons.fairway.polygon.length).toBeGreaterThan(0);
    expect(hole.greenComplex.polygon.length).toBeGreaterThan(0);
    expect(hole.greenComplex.tiers.length).toBeGreaterThanOrEqual(3);
    expect(hole.cartPathRibbon.points.length).toBeGreaterThan(hole.cartPathRibbon.centerline.length);
    expect(hole.treeFrames.length).toBe(hole.trees.length);
    expect(hole.forestBelts).toEqual(expect.objectContaining({ left: expect.any(Array), right: expect.any(Array), back: expect.any(Array) }));
  });

  it("stores tee tiers for baseline and maxed-out driving distances", () => {
    const hole = generateHole("AG-tees", { par: 4, template: "dogleg-left" });
    expect(hole.teeTiers.map((tee) => tee.id)).toEqual(["forward", "standard", "champion"]);
    expect(hole.teeTiers.some((tee) => tee.recommendedPowerBand === "baseline" && tee.intendedDriveYards >= 240)).toBe(true);
    expect(hole.teeTiers.some((tee) => tee.recommendedPowerBand === "maxed" && tee.intendedDriveYards >= 350 && tee.intendedDriveYards <= 400)).toBe(true);
  });

  it("emits deterministic terrain samples and slope metadata for future physics", () => {
    const hole = generateHole("AG-terrain", { par: 5, template: "split-bailout" });
    expect(hole.terrain.heightField.samples.length).toBe(hole.terrain.heightField.resolution.x * hole.terrain.heightField.resolution.z);
    expect(hole.terrain.tiers.length).toBeGreaterThanOrEqual(3);
    expect(hole.terrain.slopeVectors.every((entry) => entry.direction && typeof entry.direction.grade === "number")).toBe(true);
    expect(generateHole("AG-terrain", { par: 5, template: "split-bailout" }).terrain.heightField.samples).toEqual(hole.terrain.heightField.samples);
  });

  it("attaches lie physics to surfaces and hazards for future shot types", () => {
    const hole = generateHole("AG-lies", { par: 3, template: "par3-island-green" });
    expect(hole.surfacePolygons.fairway.physics.lie).toBe("fairway");
    expect(hole.surfacePolygons.firstCut.physics.lie).toBe("first-cut");
    expect(hole.surfacePolygons.shortRough.physics.lie).toBe("short-rough");
    expect(hole.surfacePolygons.tallRough.physics.lie).toBe("tall-rough");
    expect(hole.hazards.every((hazard) => hazard.physics?.lie)).toBe(true);
    expect(hole.greenComplex.physics.lie).toBe("green");
  });

  it("supports reference-style archetypes without enabling par 6 by default", () => {
    const par3 = generateHole("AG-p3", { par: 3, template: "par3-island-green" });
    const par4 = generateHole("AG-p4", { par: 4, template: "dogleg-right" });
    const par5 = generateHole("AG-p5", { par: 5, template: "par5-sweeping-lake" });
    expect(par3.architecture.concept).toBe("island green");
    expect(par4.architecture.concept).toBe("dogleg right");
    expect(par5.architecture.concept).toBe("sweeping lake");
    const pars = new Set(Array.from({ length: 80 }, (_, i) => generateHole(`AG-default-${i}`).par));
    expect(pars.has(6)).toBe(false);
  });

  it("filters archetype options by selected par", () => {
    const par3 = listArchetypeOptions(3).map((item) => item.id);
    const par5 = listArchetypeOptions(5).map((item) => item.id);
    expect(par3).toContain("par3-island-green");
    expect(par3).not.toContain("par5-sweeping-lake");
    expect(par5).toContain("par5-sweeping-lake");
    expect(par5).not.toContain("par3-island-green");
  });

  it("lists and resolves preview tee tiers", () => {
    const options = listTeeTierOptions();
    expect(options.map((tee) => tee.id)).toEqual(["forward", "standard", "champion"]);
    const hole = generateHole("AG-preview-tees", { par: 4 });
    expect(findTeeTier(hole, "champion").recommendedPowerBand).toBe("maxed");
    expect(findTeeTier(hole, "missing").id).toBe("standard");
  });
});
