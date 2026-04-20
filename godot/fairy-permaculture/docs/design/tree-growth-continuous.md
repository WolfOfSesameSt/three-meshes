# Tree Growth — Continuous, Biology-Driven

**Supersedes the 3-tier discrete model.** Every tree's size evolves smoothly across its lifespan, with species-specific curves drawn from real BC-coastal tree biology. Each game year produces a visible growth pulse.

## Core model

Replace `tree_small / tree_mature / tree_old` as hard categories with a continuous `size_progress: float (0.0–1.0)` per tree. The three kinds remain **visual-label aliases** derived from progress:

| `size_progress` | Label | Silhouette hint |
|---|---|---|
| 0.00 – 0.25 | sapling | thin trunk, low canopy |
| 0.25 – 0.70 | mature | full canopy, branches extended |
| 0.70 – 1.00 | old-growth | peak canopy + deadwood visible on lower trunk |

Each tree spawns with an `age_days`, draws its `species_id` + `max_age_days` (normal distribution), and recomputes `size_progress` each day.

## Growth curve (logistic approximation)

```gdscript
# time_constant sets the "personality" — smaller = faster early growth.
var time_constant: float = species.growth_80pct_days / 1.6
var progress: float = 1.0 - exp(-float(age_days) / time_constant)
progress = clamp(progress, 0.0, 1.0)
size_progress = progress
size_scale = lerp(species.seedling_scale, species.max_scale, progress)
```

This yields:
- Fast growth in the first 30–40 % of lifespan
- Cruise-slow growth toward mature ceiling
- Long tail of imperceptible growth in old age (but still non-zero)

Biologically accurate: pioneers (alder, maple) reach cruise fast then hold; conifers (fir, cedar) crawl early but never really stop.

## Species biology table

Times in **game days** (1 game year = 120 days). Real-life values compressed ~4× but preserving relative ordering.

| species_id | growth_80pct_days | Longevity (mean ± σ) game-days | seedling_scale | max_scale | Foliage form | Trunk style |
|---|---|---|---|---|---|---|
| `red_alder` | 2 400 (20 yr) | 6 000 ± 900 (50 yr) | 0.25 | 2.2 | broad_crown_fast | thin, smooth |
| `pacific_crabapple` | 1 800 (15 yr) | 4 800 ± 600 (40 yr) | 0.2 | 1.4 | compact_fruit | knotted |
| `big_leaf_maple` | 3 600 (30 yr) | 9 600 ± 1 200 (80 yr) | 0.3 | 2.8 | palmate_large | thick, mossy |
| `douglas_fir` | 6 000 (50 yr) | 24 000 ± 4 800 (200 yr) | 0.2 | 4.5 | conifer_cone | straight, deep bark |
| `western_red_cedar` | 7 200 (60 yr) | 36 000 ± 6 000 (300 yr) | 0.2 | 4.2 | columnar_cedar | fibrous, red-brown |

**Forest succession reads correctly:** red alder colonizes fast and dies young, making room for big-leaf maple under its canopy, and eventually cedar / douglas fir take over as climax species. Exactly Pacific-Northwest reality.

## Year-end growth pulse (the feel)

Every 120 days (at `day_advanced` when `day % 120 == 0`):
1. Compute previous `size_scale` and new `size_scale` from `age_days += 120`
2. Tween scale over 1.2 seconds (TRANS_BACK ease) so the player sees the growth happen
3. Spawn a tiny MEADOW-tinted `◊` Juice.pop at the canopy
4. Soft chime — reuse `seedling-sprout` at -8 dB
5. Increment a global "year complete" counter (future: a HUD toast "Spring ended — 8 trees grew")

Between pulses, `size_scale` interpolates micro-steps per day so the growth isn't purely discrete — but the YEAR-END pulse is the legibility beat.

## Label transitions

When `size_progress` crosses 0.25 upward: `kind = "tree_mature"` + extra celebration (the moment a sapling becomes a real tree). At 0.70: `kind = "tree_old"` + rare flourish (old-growth achievement).

These are cosmetic; all mechanics use `size_progress` directly.

## Yield scaling

Existing decor context actions (Fell / Prune) multiply their base yields by `size_progress`:
- Sapling (0.1 progress): 10 % yield — not worth felling usually
- Mature (0.5 progress): 50 % yield
- Old growth (0.9 progress): 90 % yield + bonus old-growth-only "Heartwood" drop for high-tier crafting

Branchfall per-day chance scales too:
- `base_drop_chance = 0.02 × size_progress × size_scale / max_scale`
- Bigger older trees drop more

## Death at max_age

When `age_days >= max_age_days`:
- Tween to 50 % scale + desaturate over 5 game-days (visible decline)
- Replace with `deadwood_log` at position + Juice.pop "◊ FELL · of old age" in `Palette.COMPOST.lerp(Palette.EARTH, 0.3)`
- Spawn 2–4 `twigs_pile` around the fallen trunk
- Optionally leave a `tree_stump` decor_item (future polish)

## Replacement seeding

Each old-growth tree has a tiny per-year chance (~8 %) of spawning a new sapling within 5 m of its base — self-propagating forest. Species-matched with a small chance of a species shift (succession). Caps at 80 total active decor items to prevent runaway.

## Data model addition

Each `decor_item.gd` gains:
```gdscript
var species_id: String = ""
var age_days: int = 0
var max_age_days: int = 0
var size_progress: float = 0.0
var size_scale: float = 1.0
var _last_year_age: int = 0
```

And species biology lives in a single const dict on `decor_item.gd`:
```gdscript
const SPECIES_TABLE := {
    "red_alder": { "growth_80pct_days": 2400, "longevity_mean": 6000, "longevity_sigma": 900, "seedling_scale": 0.25, "max_scale": 2.2, "form": "broad_crown_fast", "trunk": "thin_smooth" },
    ...
}
```

## Verification (update the forest sim)

Running 30 game-years (3 600 days) at accelerated tick should show:
- Red alder: planted at age 0 → ~90 % max scale, some reaching longevity → dying
- Douglas fir: age 0 → ~35 % max scale (still young)
- Cedar: age 0 → ~30 % max scale
- Year-end pulses fire exactly `years_elapsed × trees_alive` times
- Growth is monotonic (never shrinks before death)
- Replacement sapling occurs at least 5 times across the 30-year sim

## Why this is better than 3 tiers

- **Measurable growth**: player sees size change every year, not just 2 jumps per tree-lifetime
- **Species feel**: red alder's fast burst vs cedar's crawl is *felt*, not described
- **Reward patience**: planting a douglas fir sapling is a 50-year investment — real food-forest long-term mindset
- **Succession reads correctly**: the natural ecological arc emerges from the math
- **Yield scaling**: tree age matters for what you get; old growth is genuinely precious
