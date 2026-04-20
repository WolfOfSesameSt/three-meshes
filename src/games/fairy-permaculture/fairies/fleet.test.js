import { describe, it, expect } from "vitest";
import { createFleet } from "./fleet.js";

describe("fleet assignment + tick", () => {
  it("spawns unassigned fairies", () => {
    const fleet = createFleet();
    fleet.spawn("A");
    fleet.spawn("B");
    expect(fleet.count).toBe(2);
    expect(fleet.unassignedCount).toBe(2);
  });

  it("assigns a role", () => {
    const fleet = createFleet();
    const f = fleet.spawn("Willow");
    expect(fleet.assignRole(f, "composter")).toBe(true);
    expect(fleet.unassignedCount).toBe(0);
    expect(f.role).toBe("composter");
  });

  it("rejects unknown role", () => {
    const fleet = createFleet();
    const f = fleet.spawn("X");
    expect(() => fleet.assignRole(f, "wizard")).toThrow();
  });

  it("swap adds cooldown", () => {
    const fleet = createFleet();
    const f = fleet.spawn("X");
    fleet.assignRole(f, "composter");
    fleet.assignRole(f, "harvester");
    expect(f.role).toBe("harvester");
    expect(f.cooldownDaysLeft).toBeGreaterThan(0);
  });

  it("composter adds biomass to a filling pile", () => {
    const fleet = createFleet();
    const f = fleet.spawn("Willow");
    fleet.assignRole(f, "composter");

    let added = null;
    const fakePile = {
      state: "filling",
      x: f.x,
      z: f.z,
      addIngredient(i) { added = i; },
    };
    fleet.tick(1, {}, { piles: [fakePile] });
    expect(added).toMatchObject({ id: "fresh-grass" });
    expect(f.xp).toBeGreaterThan(0);
  });

  it("composter turns a pile in turn-window", () => {
    const fleet = createFleet();
    const f = fleet.spawn("Willow");
    fleet.assignRole(f, "composter");
    let turned = false;
    const fakePile = {
      state: "turn-window",
      x: f.x,
      z: f.z,
      turn() { turned = true; return true; },
    };
    fleet.tick(1, {}, { piles: [fakePile] });
    expect(turned).toBe(true);
  });

  it("serialize → hydrate", () => {
    const fleet = createFleet();
    fleet.spawn("A");
    fleet.spawn("B");
    const f2 = fleet.all[1];
    fleet.assignRole(f2, "composter");
    f2.xp = 50;
    const saved = fleet.serialize();

    const fleet2 = createFleet();
    fleet2.hydrate(saved);
    expect(fleet2.count).toBe(2);
    expect(fleet2.all[1].role).toBe("composter");
    expect(fleet2.all[1].xp).toBe(50);
  });
});
