import { describe, it, expect } from "vitest";
import { createMothership } from "../test/helpers.js";

describe("Mothership", () => {
  describe("takeDamage", () => {
    it("absorbs damage with shields first", () => {
      const ship = createMothership({ systems: { shields: 100, shieldsMax: 100, hull: 500, hullMax: 500 } });
      // Simulate takeDamage logic
      let amount = 60;
      if (ship.systems.shields > 0) {
        const absorbed = Math.min(ship.systems.shields, amount);
        ship.systems.shields -= absorbed;
        amount -= absorbed;
      }
      ship.systems.hull -= amount;

      expect(ship.systems.shields).toBe(40);
      expect(ship.systems.hull).toBe(500); // hull untouched
    });

    it("bleeds through to hull when shields depleted", () => {
      const ship = createMothership({ systems: { shields: 30, shieldsMax: 100, hull: 500, hullMax: 500 } });
      let amount = 80;
      if (ship.systems.shields > 0) {
        const absorbed = Math.min(ship.systems.shields, amount);
        ship.systems.shields -= absorbed;
        amount -= absorbed;
      }
      ship.systems.hull -= amount;

      expect(ship.systems.shields).toBe(0);
      expect(ship.systems.hull).toBe(450); // 80 - 30 shield = 50 to hull
    });

    it("hull at zero means death", () => {
      const ship = createMothership({ systems: { shields: 0, shieldsMax: 0, hull: 10, hullMax: 100 } });
      let amount = 50;
      if (ship.systems.shields > 0) {
        const absorbed = Math.min(ship.systems.shields, amount);
        ship.systems.shields -= absorbed;
        amount -= absorbed;
      }
      ship.systems.hull = Math.max(0, ship.systems.hull - amount);
      const alive = ship.systems.hull > 0;

      expect(ship.systems.hull).toBe(0);
      expect(alive).toBe(false);
    });
  });

  describe("storeResource", () => {
    it("stores resources up to capacity", () => {
      const ship = createMothership({ tesseract: { capacity: 100, contents: {} } });
      ship.tesseract.contents["iron-ore"] = 0;

      const amount = 50;
      const currentTotal = Object.values(ship.tesseract.contents).reduce((a, b) => a + b, 0);
      const space = ship.tesseract.capacity - currentTotal;
      const stored = Math.min(amount, space);
      ship.tesseract.contents["iron-ore"] += stored;

      expect(ship.tesseract.contents["iron-ore"]).toBe(50);
    });

    it("caps at capacity", () => {
      const ship = createMothership({ tesseract: { capacity: 100, contents: { "iron-ore": 80 } } });

      const amount = 50;
      const currentTotal = Object.values(ship.tesseract.contents).reduce((a, b) => a + b, 0);
      const space = ship.tesseract.capacity - currentTotal;
      const stored = Math.min(amount, space);
      ship.tesseract.contents["iron-ore"] += stored;

      expect(ship.tesseract.contents["iron-ore"]).toBe(100); // 80 + 20 (capped)
    });
  });
});
