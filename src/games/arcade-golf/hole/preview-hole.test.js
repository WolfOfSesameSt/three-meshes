import { describe, expect, it } from "vitest";
import { createPreviewHole, listRequiredElementKinds } from "./preview-hole.js";

describe("Arcade Golf preview hole", () => {
  it("contains the approved Unit 1 structural golf elements", () => {
    const hole = createPreviewHole("test-seed");
    expect(listRequiredElementKinds(hole)).toEqual([
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
    ]);
  });

  it("keeps initial par scope inside par 3, 4, or 5", () => {
    const hole = createPreviewHole();
    expect([3, 4, 5]).toContain(hole.par);
  });

  it("models future physics inputs before shot physics exists", () => {
    const hole = createPreviewHole();
    expect(hole.greenContours.every((contour) => typeof contour.elevation === "number")).toBe(true);
    expect(hole.greenContours.every((contour) => contour.slope && typeof contour.slope.x === "number")).toBe(true);
    expect(hole.trees.some((tree) => tree.height >= 18)).toBe(true);
    expect(hole.roughBands.map((band) => band.heightBand).sort()).toEqual(["short", "tall"]);
  });
});
