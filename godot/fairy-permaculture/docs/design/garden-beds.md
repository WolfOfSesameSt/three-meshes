# Garden Beds — 4 variants

**Purpose:** Give the player a *visible vocabulary* of soil-building shapes. Each bed is a small earthworks decision that writes itself onto the landscape and interacts mechanically with the soil engine (`moisture`, `om_pct`, `field_capacity`, `fb`). Research-only; implementation later.

**Shared rules:**
- All beds are built via right-click-ground → "Build" menu → fairy task (same flow as compost/coop).
- All costs are debited from `Storage` at task queue-time; fairies animate the build over `labor` seconds.
- All beds can host plants via the existing `soil_plot.gd` slot logic.
- All color calls must come from `autoload/palette.gd` — no raw Color() calls.

---

## 1. Standard Garden Plot (fenced variant)

Same as current `soil_plot.gd`, but a small wooden frame surrounds it for the "I-have-been-gardened-here" read. Acts as the baseline.

- **Cost:** wood × 3
- **Labor:** 40 s
- **Unlock tier:** Ring 1 (day-zero — just a cosmetic/organizational upgrade of the existing plot).
- **Mechanical effect:** none — same OM, moisture, growth multipliers as current plot. Fence exists purely for legibility + a tiny +2 % happiness bonus to fairies working it (morale lever).
- **Visual:** 1 × 1 tile footprint. Four low wooden posts (BoxMesh 0.08 × 0.30 × 0.08, `Palette.EARTH`), two horizontal rails (BoxMesh 1.0 × 0.04 × 0.04, `Palette.EARTH`). Soil inside is current `soil_plot` mesh.
- **Right-click actions:** plant, harvest, water, mulch, inspect, remove fence.
- **Failure modes:** none worth tracking.

---

## 2. Raised Bed

Classic wood-sided rectangular box, soil filled. Best for quick-yield annuals.

- **Cost:** wood × 6, plant_trim × 4 (soil inside uses compost from storage at plant-time, same as existing plots).
- **Labor:** 60 s
- **Unlock tier:** Ring 2 (after first compost harvest — fits the "I've built stuff" moment).
- **Mechanical effect:**
  - `growth_rate × 1.20` for plants in this bed (better drainage + aeration).
  - `moisture_decay × 1.15` — drains faster.
  - `om_pct` starts at +2 (soil inside is pre-compost-mixed).
  - Immune to slug damage (+0.4 cm off-ground).
- **Visual:** 1 × 2 tile footprint. Four wooden planks (BoxMesh 2.0 × 0.30 × 0.04, `Palette.EARTH`) forming a rectangle, raised 0.30 m. Inside top surface shows a patch of `Palette.COMPOST`-tinted soil with a subtle noise texture. Corner supports (BoxMesh 0.08 × 0.40 × 0.08, darker `Palette.COMPOST`).
- **Right-click actions:** plant, harvest, water, mulch, inspect, top-up compost, dismantle (reclaims 3 wood).
- **Soil-engine interaction:** `raised_bed` modifier feeds into `WorldGrid.tile_moisture_decay_multiplier`. Task queue gets a priority-5 ambient "water raised bed" task when `moisture_pct < 0.30`.
- **Failure modes:**
  - **Summer drought** — dries 15 % faster than a ground plot. Without mulch, wilts on day 6 of dry spell (vs day 9 for ground). Fairies get a nudge: "raised beds dry fast — try mulch or an olla."
  - **Winter wind** — exposed soil freezes 1 day earlier.

---

## 3. Hugelkultur Bed

Buried woody core. THE permaculture signature bed — a big initial labor cost for a 10-year compound return.

- **Cost:** wood × 10, twigs × 8, plant_trim × 6.
- **Labor:** 180 s (2-6 fairies, capped `max_workers = 4`).
- **Unlock tier:** Ring 2.5 / gated through branch G (g3 in `branches.json`).
- **Mechanical effect:**
  - `moisture_retention × 1.40` — +40 % field capacity modifier.
  - `field_capacity += 0.08` — stacks per soil engine spec.
  - `om_reservoir_years = 10` — tile bleeds +0.01 % OM/day for 10 in-game years before the log cores decay.
  - `growth_rate × 1.15` — not as fast as raised bed, but stays productive through drought.
  - Supports 3 plant slots (top / mid / base of mound).
- **Visual:** 2 × 2 tile footprint. Rounded-berm mound raised 0.50 m at peak, built from:
  - Base mound: CSGBox subtract → SphereMesh deformed to oval, `Palette.EARTH`.
  - Visible sticks poking out the top (6 thin CylinderMeshes, `Palette.COMPOST`, rotated random 30–60°).
  - Top crown: dense grass-mat shader patch (`Palette.MEADOW`) + 3 plant slots.
  - Leaf-mulch band around base (`Palette.OLIVE_DARK` tint, thin torus).
- **Right-click actions:** plant (slot 1/2/3), harvest, water (rarely needed), mulch, inspect, chop-and-drop on it, repair mound (+wood × 2 every 5 years).
- **Soil-engine interaction:** `hugel_core_days_remaining` tracked per tile; on expiry, the bed gracefully degrades to Raised Bed stats and fires a soft "your hugel has settled — it's a raised bed now" log entry.
- **Failure modes:**
  - **Fresh hugel year 1** — wood core ties up N as it breaks down. Plants with high-N demand (brassicas) growth × 0.6 during year 1. Nudge: "let your hugel age — plant legumes first year."
  - **Erosion** — no mulch + heavy storm event → berm loses 5 cm height, visible texture change, FC bonus drops 1 %.

---

## 4. Spiral Herb Garden

Stone-built spiral with microclimate tiers. Ornamental + functional — the showpiece of the kitchen-garden area.

- **Cost:** stone × 20, plant_trim × 4.
- **Labor:** 120 s (max_workers = 3).
- **Unlock tier:** Ring 3 (after first stone quarrying + compost loop running).
- **Mechanical effect:**
  - **5 plant slots**, each with a distinct microclimate:
    | Slot | Height | Moisture | Best for |
    |---|---|---|---|
    | 1 (peak) | +0.7 m | 0.15 (dry) | rosemary, lavender, thyme, oregano |
    | 2 (upper) | +0.5 m | 0.25 (medium-dry) | sage, dill, cilantro |
    | 3 (middle) | +0.3 m | 0.40 (medium) | parsley, basil, chive |
    | 4 (lower) | +0.1 m | 0.55 (moist) | mint, lemon balm |
    | 5 (base) | 0.0 m | 0.70 (wet) | watercress, vietnamese coriander |
  - Stone thermal mass: slot 1 gets +2 °C warmth bonus (winter-hardy + heat-loving herbs tolerate 1 zone warmer).
  - Shade side (slot 3–4) gets `sun_exposure × 0.7` automatically.
- **Visual:** 2 × 2 tile footprint. Ascending stone spiral ~2 m diameter, 0.7 m peak height. Built from ~60 small stone blocks (instanced BoxMesh 0.15 × 0.10 × 0.15, `Palette.WARM_STONE`). Soil between stones tinted `Palette.COMPOST`. Five plant-slot markers visible as subtle parchment flags at build-time (hide on first plant).
- **Right-click actions:** plant in slot N, harvest slot N, water base, inspect (shows all 5 slots' moisture), prune, remove.
- **Soil-engine interaction:** a single tile hosts 5 sub-slots with independent `moisture_pct` stored in a `Dictionary`. Base slot passively wicks moisture from the nearest wet-tile within 3 m (mini sub-irrigation). Fairy task queue treats each slot as a separate target for harvest / water.
- **Failure modes:**
  - **Freeze** — slot 1 is warmer, but slot 5 (wet) freezes first and can heave stones. Stones displace → visual "spiral is crumbling" state, -1 slot until repaired.
  - **Mint escape** — if mint planted in slot 4 isn't harvested for 10 days, it *spreads* (spawns mint plants in adjacent tiles). Feature, not bug.

---

## Why four beds?

1. **Standard plot** teaches the system.
2. **Raised bed** rewards convenience + looks tidy (urban permaculture vibe).
3. **Hugelkultur** teaches long-term thinking + drought resilience.
4. **Spiral herb** teaches microclimate + vertical design.

Together they cover the full permaculture pedagogy arc: *quick-and-dirty → tidy-annual → long-term-perennial → microclimate-design*. The player's farm eventually shows all four, each chosen for its tile.

## Task-queue notes

- All four bed types integrate with the existing `TaskQueue` (DESIGN.md §Labor model).
- Multi-worker stacking: raised bed and spiral cap at 3 workers (small footprint); hugel caps at 4 (long trench work); fenced plot caps at 2.
- Role multipliers: `builder × 1.4` for the build phase, `healer × 1.6` for watering, `composter × 1.5` for mulching.

Sources consulted: DESIGN.md §Soil engine / §Water & moisture retention / §Labor model, feedback_full_soil_engine.md, `data/branches.json` (g3 hugel-bed), `scripts/soil_plot.gd` (current plot as baseline).
