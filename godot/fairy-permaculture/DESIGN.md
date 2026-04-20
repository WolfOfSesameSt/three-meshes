# Fairy Permaculture — Design Architecture

Not a GDD. A working architecture for the Godot port covering the
simulation, resource graph, lighting, and AI. Every chunk below ships
visually-verified with paired audio + visual feedback and a parallel
world-building action (per the locked design principles — see memory).

## Core design pillars

1. **Soil is the real currency.** Every other system funnels into soil-building.
2. **No waste.** Every output — manure, pee, bones, prunings, runoff, dead animals, deconstructed buildings — is an input to another loop. No trash bucket, no rot-sink. The feeling we want is a closed circle the player can see.
3. **Paired feedback.** No silent successes. Every action + every state change = visual + audio.
4. **No dead time.** Slow-cooking systems always pair with a parallel action.
5. **Everything you see is yours to work with.** Trees, rocks, ruins, water — all are raw materials or microclimate features, never set-dressing.
6. **Easy to manage, hard to master.** Good defaults run themselves; depth is optional optimization.

## Soil engine (the core)

Soil is tracked per tile with many dimensions — not a single OM stat.
Plants tier by soil quality; animals + plants + player actions shift
the dimensions; every amendment is a permaculture-accurate by-product
of another loop on the farm.

**Per-tile state:**
`om` % · `n_avail` · `p_avail` · `k_avail` · `ca` · `mg` · `s` · `micros` (Fe/Zn/Cu/Mn/B/Mo) · `ph` · `biology` 0–1 · `fb` fungal:bacterial · `moisture` % · `cec` · `worms`.

**Soil tiers (plants gate by this):**

| Tier | OM | What grows | Look |
|---|---|---|---|
| Barren | < 1 % | Nettle, dandelion, yarrow, plantain | gray-brown bare |
| Poor | 1–2 % | + legumes (clover, vetch), coriander | pale sage |
| Developing | 2–3 % | Salmonberry, brassicas, lettuces, onions | meadow green |
| Rich | 3–5 % | Apple, pear, most veg | olive green |
| Abundant | 5–10 % | Nut canopy, food-forest shrub, grape | lush dark |
| Climax | 10 % + | Old-growth forest, truffles | deep |

**NPK production routes** — every one a by-product of something else:

**N** — biologically fixed or animal-derived:
Legume cover crops (Rhizobium) · chicken manure (fastest) · cow/horse/goat manure · **urine** (10:1 dilute liquid N) · fish emulsion / FAA (fish trim + brown sugar ferment, KNF) · blood meal · nettle tea · compost tea · coffee grounds.

**P** — bone- or rock-derived:
Bone meal (crushed culled-animal bones) · WCP (roasted bones + vinegar, KNF) · fish bones · rock phosphate (from quarried outcrops) · bat / seabird guano · compost (slow) · chicken manure.

**K** — plant-accumulated or mineral:
**Comfrey tea** (THE permaculture K source, dynamic accumulator) · wood ash (from hearth / biochar kiln — raises pH too) · kelp / seaweed · banana-peel tea (kitchen scrap) · alfalfa meal (K + N) · granite dust / greensand (long-release).

**Ca**: crushed eggshells · WCA (roasted shells + vinegar, KNF) · oyster shells · limestone · gypsum (Ca without pH shift) · wood ash.

**Mg**: dolomite lime · Epsom salts · seaweed.

**S**: gypsum · elemental S (lowers pH) · compost.

**Micros**: kelp / SEA (KNF diluted seawater) · rock dust · diverse compost · hyperaccumulator plants.

**pH**: lime raises · sulfur lowers · wood ash raises · pine needles + oak leaves slowly acidify (blueberries thrive).

**Biology**: IMO (KNF indigenous microorganisms, from old-growth duff) · mycorrhizal inoculant · LAB (rice-wash + milk) · worm castings · Johnson-Su bioreactor (fungal-dominant, 12-mo) · compost tea · living cover-crop roots.

## Water & moisture retention

Moisture is the limiting factor through BC's dry summer and the mechanic that rewards every earthwork, mulch, shade, and OM investment. Retention isn't one stat — it's a **stack of modifiers that compound**. A climax tile holds ~5× the water of a barren tile from the same inch of rain.

**Per-tile water state:** `moisture` % · `field_capacity` (derived) · `wilting_point` (derived) · `infiltration_rate` · `evap_rate` · `slope`/`aspect`.

**Field-capacity multipliers (stack additively):**

| Source | Bonus |
|---|---|
| Sandy base | 5 % FC |
| Loam base | 15 % FC |
| Clay base | 22 % FC |
| Each 1 % OM | +3 % FC |
| Mulch cover | +5 % FC |
| Hugelkultur core | +8 % FC (10-yr duration) |
| Charged biochar | +10 % FC (permanent) |
| Mycorrhizae + glomalin aggregates | +3 % FC |
| No-till structure | +2 % FC |

*A Rich-tier orchard with mulch + hugel + biochar holds ~45 % FC vs. barren sand's 5 %.*

**Daily losses:** surface evap 2–8 %/day (halved by mulch, halved again by shade, cut 30 % by windbreak) · transpiration 5–10 %/day fruiting crops · runoff 20–80 % on bare slope / ~0 % on swaled · wind +30–50 % evap exposed.

**Daily gains:** rainfall · stream or pond sub-irrigation within 6 m · swale infiltration · keyline redistribution · dew condensation (cool nights + thick mulch) · manual/fairy/piped irrigation.

**Crop water bands:** drought-tolerant (yarrow, lavender, rosemary, olive, mature grape) · moderate (apple, pear, squash, corn, goat pasture) · thirsty (lettuce, celery, brassicas, berries, salmonberry) · aquatic (rice, taro, cattail, reed, duck/fish integration).

**The retention flywheel:** More OM → more water held → happier mycorrhizae → more glomalin → aggregates → porosity → infiltration instead of runoff → roots go deeper → thriving plants → more biomass → more OM. Break any link (bare soil, compaction, tillage, overgrazing) and the flywheel reverses — drought exposes skipped work.

**Drought mechanic:** 10+ rain-free days triggers banner. Tiles drop daily. Sub-wilting tiles droop and halt growth; prolonged = death. Mitigation leverage (best → worst): pre-built earthworks (swaled tiles barely notice) → mulch chop-and-drop → shade trees → healer-fairy watering → pond draw-down → drought-tolerant plantings on ridges.

## Plant-animal synergies (stacking patterns)

- **Cow → Chicken (5-day lag)** — Salatin mob-then-sanitize; chicken scratches cow manure + eats fly larvae; +300 % OM vs. cow alone.
- **Pig → Chicken → Fruit tree** — pig rootle clears forest, chicken sanitizes, tree plants into enriched bed.
- **Duck ↔ Rice paddy** — aigamo: duck eats slugs/pests, manures, Azolla N-fixer floats.
- **Three Sisters** — bean fixes N for corn · squash ground-covers · corn trellises bean.
- **Apple guild** — comfrey at drip line mines K · yarrow insectary · clover matrix N-fixer · alliums deter pests.
- **Chop-and-drop + mycorrhizae** — comfrey drops K onto tile · fungal network shares P with tree · tree exudes sugar to fungi.
- **Cover crop → mob graze → chop-and-drop** — soil-build triple stack.

## Automation ladder

| L | Who / what | Example |
|---|---|---|
| L1 | Manual player | click bush → harvest |
| L2 | Role fairy | Composter auto-feeds nearest pile |
| L3 | Route fairy | Forager chops → delivers to pile → returns |
| L4 | Animal system | Chicken tractor clears a zone weekly |
| L5 | Stacked animal cascade | Cow→chicken→pig rotation across paddocks |
| L6 | Mature ecosystem | Food forest self-mulches from leaf drop |

## Resource graph

The world is the only source. Everything you build comes from somewhere visible.

```
Trees          ─fell──▶  wood + twigs + deadwood
Rocks          ─quarry▶  stone + pebbles
Deadwood       ─pick──▶  wood (free, rare)
Wild plants    ─chop──▶  biomass
Ruins          ─salvage▶ seeds + scrap tools
Stream         ─draw──▶  water
Animals        ─pasture▶ manure
Forest edge    ─forage▶  IMO + wild seeds + mushrooms

biomass + time + balance ─────▶  compost
wood + pyrolysis kiln    ─────▶  biochar
compost + biochar + soil ─────▶  enriched soil  ← THE CURRENCY
manure + grazing         ─────▶  enriched soil
chop-and-drop + cover    ─────▶  enriched soil
```

**Storage container** holds: wood, stone, twigs, biomass, compost, seeds,
water, manure, biochar, enriched-soil-bags. HUD reads its contents.

**Buildable blueprints** (each consumes from storage):

| Structure | Cost | Unlocks |
|---|---|---|
| Storage Shed | tutorial gift | inventory UI |
| Compost Pile | wood × 3 + stone × 1 | soil-building loop |
| Sprouting Bed | wood × 5 | fast-propagate seeds |
| Chicken Coop | wood × 8, straw × 3 | chickens, eggs, manure |
| Hive (Warré) | wood × 4 | bees, honey, pollination |
| Goat Shed | wood × 12, stone × 4 | milk, brush-clear, manure |
| Fence segment | wood × 2 | paddock boundaries |
| Swale marker | labor only | water retention |
| Biochar kiln | wood × 6, stone × 6 | late-game soil amendment |
| Seed vault | wood × 10, stone × 8 | landrace preservation |

## Terrain, elevation & water flow

**The ground is not flat.** Every tile has an `elevation` (meters, integer cm precision), derived from seeded procgen at worldgen and mutable afterward by player earthworks. Slope gates water movement, soil stability, erosion, and microclimate.

**Godot implementation:**
- A 2D array `Tile[z][x]` is the source of truth (elevation, moisture, surface_water, material...).
- Terrain renders as chunked `ArrayMesh` (64×64 tiles per chunk, LOD-ready).
- A companion `water_mesh` is regenerated each day-tick from tiles with `surface_water > 1 cm`. Translucent shader + normal-map ripples for streams, caustic for ponds.
- Collision: flat-tile `HeightMapShape3D` per chunk, rebuilt only when player edits terrain.
- No third-party terrain plugin required; staying in-engine keeps exports clean.

**Slope mechanics:**
- `slope` derived from 4-neighbor elevation delta. Steep tiles (> 15°): erosion risk, reduced buildable, can terrace.
- Steep bare tiles in heavy rain events lose OM (runoff) and can develop gullies.
- Terraces, check dams, contour swales cancel the erosion.

**Water flow (cellular automaton, per day-tick, not per frame):**

Each tile has `surface_water` (depth, cm) and `moisture` (soil saturation, 0–1). Per tick:
1. **Rain phase** — climate adds mm to every tile's surface_water.
2. **Infiltration** — surface_water drains into soil until field_capacity reached. Rate depends on OM, compaction, mulch, biology.
3. **Flow phase** — any tile with surface_water > 1 cm tries to spill to its lowest (elevation + water_depth) neighbor. Flow volume proportional to the head difference, capped so one tile can't drain in a single tick.
4. **Accumulation** — tiles with no lower neighbor pool up → natural ponds form in low points.
5. **Evaporation** — sun-exposed surface water evaporates (modified by shade, mulch, wind).
6. **Stream renderer** — continuously-wet connected tiles render as flowing channel (scrolling UV).

This model is deterministic and fast — ~5 ms for a 500×500 grid per tick. It gives water realistic behavior without fluid sim.

**Player earthworks that route water:**

| Earthwork | Effect on grid | Why player builds it |
|---|---|---|
| **Swale (on-contour trench + downhill berm)** | Drops elevation of trench tiles by 30 cm, raises berm tiles by 30 cm. Captures uphill runoff, sediment collects, planting into the berm gets constant water. | Keeps summer rain on your land instead of running off |
| **Keyline plow (off-contour slot)** | Shallow elevation channels steering water from wet valleys toward dry ridges | Spreads water laterally across the farm |
| **Pond (dug depression)** | Drops tile elevation 1–3 m below water table, fills permanently. Adjacent tiles gain sub-irrigation. | Storage, frost buffer, duck habitat, drought insurance |
| **Check dam (across gully)** | Raises one tile's elevation, pools water behind it, sediment turns former gully into swale | Gully-erosion reversal |
| **Terrace (flattened slope segment)** | Zeroes slope across N tiles, retains runoff | Turns steep land into growable land |
| **Hugelkultur mound** | Raises tile +50 cm, enormous field_capacity boost (+8 %), 10-yr OM release | Drought-proof raised bed |
| **Diversion channel** | Narrow cut routing stream | Move water to where you want it |

All earthworks cost fairy-labor time (see task system). They show as visible cuts and berms in the mesh — the landscape literally changes.

**Sub-irrigation zone:** tiles within 6 m of a water surface (stream or pond) with elevation within 1 m of the water gain automatic +moisture each tick via capillary action. Makes pond-adjacent orchards thrive.

## World-state visual progression (the landscape is the scoreboard)

The farm itself is the primary progress display. A fresh game spawns **untamed and visibly barren** — thin pioneer scrub on grey-brown soil, little movement, low saturation. A climax farm is **overwhelmingly alive** — vibrant summer greens, fruit glow, visible pollinator clouds, and permaculture design features (swales, guilds, terraces, hedgerows, keyline patterns, chop-and-drop rings) **tattoo'd across the land** like the signature of a mature practitioner.

**Global `farm_vitality` stat** (0–1) is a weighted roll-up of average OM %, species count, animal diversity, biomass stock, and biology index across all tiles. It drives a world-wide color grade / LUT:

| Vitality | Mood | Shader effect |
|---|---|---|
| 0.0 – 0.2 | Barren / untamed | Desaturated 40 %, cool grey-brown, muted sky, low contrast |
| 0.2 – 0.5 | Waking | Saturation climbs; first greens visible; pioneer species dot the ground |
| 0.5 – 0.8 | Thriving | Full palette saturation; flowers + fruit visible; pollinators animate |
| 0.8 – 1.0 | Vibrant climax | Hyper-saturated summer; aurora flourish moments; bloom on fruit + fairy trails; visible butterfly/bee clouds |

**Per-tile ground paint** tells the local story (bare grey-brown → patchy green → lush grass → flower-dotted herb layer → multi-layer foliage with night-time mycelial glow).

**Design features render as *visible signatures* on the mesh:**
- Swales: on-contour lines across slope
- Guilds: recognizable center-tree + satellite-plant arrangement
- Hedgerows: continuous species-rich bands along property edges
- Hugelkultur mounds: raised berms with layered planting
- Keyline patterns: faint contour scarring that greens over time
- Terraces: visible stepped slopes
- Ponds: sky-reflecting water, rain-ring ripples
- Chop-and-drop: small mulch rings at tree drip lines
- Paddocks: fence lines + grazing footprint

**Seasonal amplification.** Spring bloom is dramatic (cherry, apple, salmonberry simultaneously). Summer is peak saturation. Autumn drops leaves visibly into mulch layers. Winter desaturates but reveals structure (snow highlights swales, bare branches show guild geometry).

**Night mode.** Moonlit blue-hour baseline; climax farms add bioluminescent mushroom clusters, fairy-trail cone lights, fireflies (appear at vitality > 0.7), and an aurora shader at full climax.

**No silent progression.** Every OM bump is visible (tile shader tween). Every new species arrival is a scripted reveal. Every earthwork paints a fresh permanent line on the landscape. Every season transition is a 3-second juicy reveal.

## Self-balancing wildlife ecology

Wildlife runs itself. Species auto-immigrate when their conditions are met; predator/prey cycles emerge from population arithmetic. The player's lever is **habitat placement** — put up an owl box, build a rock pile, leave a brush pile, dig a pond — and the creatures come.

**No commanding predators. No assigning snakes to mice.** The player builds conditions; ecology responds.

**Each species has an arrival formula:**
```
arrival_probability = f(
  food_availability,       // prey biomass or plant mast
  habitat_presence,        // structures / plant communities it requires
  neighbor_suitability,    // forest edge, water, elevation
  season,                  // breeding windows
  existing_population      // density-dependent
)
```
Checked on the day-tick. Crossing the threshold fires an **arrival event**: banner, camera cue, species-card reveal, bestiary entry.

**Habitat buildables (each a fairy task):**

| Buildable | Cost | Invites |
|---|---|---|
| Owl box | wood × 3 | Barn owl, screech owl (rodent control) |
| Bat box | wood × 2 | Brown bat (moth control) |
| Rock pile | stone × 6 (labor only) | Garter snake, gopher snake, salamander (slug, rodent) |
| Brush pile | wood scraps (free) | Ground beetle, salamander, small birds, overwinter lacewing |
| Hedgerow segment | 5 × perennial plantings | Bumble queens, songbirds, ground beetle |
| Pond margin | earthworks | Dragonfly, tree frog, salamander, ducks |
| Insectary strip | flowering diverse plantings | Ladybug, lacewing, hoverfly, parasitic wasp |
| Bare-ground patches | leave unmulched | Native solitary bees (70 % nest in soil) |
| Hollow-stem bundle | pruning scraps | Leafcutter bees, stem-nesting natives |

**Predator-prey cycles tick autonomously.** Populations of mobile species have `population`, `birth_rate`, `death_rate`, `food_consumption`. Each day: predators eat available prey → prey decreases → predators starve or leave → prey rebounds → cycle continues. Amplitude dampens as biodiversity rises.

**Outbreaks are the trigger for the player:**
- Aphid outbreak in monoculture patch → bushes visibly wilting → nudge "consider an insectary strip"
- Mouse population boom in a pantry-rich farm → visible damage to seedlings → nudge "consider an owl box"
- Slug boom in wet year → seedlings chewed → nudge "consider a pond or duck patrol or rock pile"

The nudges are contextual tooltips, not quests. The player fixes the pressure by providing habitat — the predator arrives within days and the cycle self-stabilizes.

**Arrival events (paired feedback):**
- Full-screen parchment banner: "A barn owl has moved into your box."
- Camera pans briefly to the habitat
- Species audio cue
- Bestiary card added (with species stats, diet, habitat requirements, how long since arrival)
- Parchment log entry: "Day 83 — Barn owl, Tyto alba"

**Indicator species are soft achievements:**
- Firefly arrives at biology > 0.6
- Native bumblebee queen overwinters at untouched-edge-habitat > 0.3
- Western tanager arrives at bird-diversity > 8 species
- Salamander in wood pile at moisture + no-pesticide conditions
- Pacific treefrog chorus at pond-and-tall-grass
These quietly appear — the bestiary logs them. They're the **soft proof the farm is healing.**

**Wildlife as ecosystem engineers:**
- Beaver (if allowed on-stream) builds its own dam, floods a zone, creates a new habitat niche
- Bear trail through orchard spreads seeds
- Deer browse line reveals what's inside vs. outside fencing
- Salmon run (climax-tier, Branch D + G) deposits massive marine-nutrient pulse in stream bed, fertilizes riparian zone for years

## Sun + microclimate

**Real time-of-day.** A `DirectionalLight3D` traces an arc over
60 s per in-game day (at 1×). Seasonal sun angle: steep summer, low
autumn/winter. LUT / sky color tweens across dawn → day → dusk → night.
Shadows are cast from actual tree positions — the shade isn't cosmetic.

**Per-tile microclimate:**
- `sun_exposure` 0.0–1.0 — sampled at noon against tree shadows
- `moisture` 0–100 — rain + evap, shaded tiles evap slower
- `temp` °C — season baseline ± shade ± thermal mass (rocks)

**Plant affinity:**
- Sun-loving (berries, herbs) — reduced growth in < 0.6 sun_exposure
- Shade-loving (mushrooms, understory) — thrive in < 0.4
- Drought-tolerant (yarrow, alfalfa) — shrug off low moisture
- Moisture-loving (watercress, salmonberry) — need > 40

**Design consequence:** the tall tree you don't fell gives you shade
for wild ginger, lion's-mane logs, and drought buffer on nearby
moisture-loving plants. Felling it = wood now, but loses that
microclimate. Meaningful trade-off.

## Interaction model: hover → right-click → task queue

Every world object is interactable. The player points, right-clicks, picks an action from a radial/parchment menu, and the game assigns a fairy to the job. Fairies do the work over time; the player does the directing.

**Interaction states:**

| State | Visual | Input |
|---|---|---|
| Idle | object rendered normally | — |
| Hover | 2-band rim light on silhouette + cursor shows the primary action icon | mouse-over |
| Right-click active | object locked-on with gold rim sparkle, menu opens at cursor | RMB |
| Task queued | small task-ring with progress % above object, fairy count badge | action selected |
| In-progress | assigned fairies visible working on it (animation), progress advances | — |
| Completed | paired visual + audio success, yield particle burst, task ring dissolves | — |

**Left-click vs. right-click:**
- **Left-click** = player-direct (harvest ripe berry instantly with fairy-dust burst, open pile inspector, select tile to plant on).
- **Right-click** = delegate to fairies (chop tree, build pile, dig swale, salvage ruin).

Left-click is for frictionless harvests and UI. Right-click is for labor the player is shaping but not doing.

### Right-click context menu

Appears at cursor, parchment themed. Header = object name + state. Actions are filtered by:
- what the object supports (a bush doesn't offer "quarry")
- player unlocks (no "biochar burn" before kiln built)
- resource availability (build options greyed out if storage lacks wood)
- fairy availability (shown with estimated time; grey if no fairy of required role exists)

Each action row shows:
- Icon + label
- Cost (e.g., "–3 wood from storage")
- Yield preview (e.g., "+6 blueberries (fruit)")
- **Estimated time** (solo fairy): "~12 s" OR "~4 s with 3 fairies"
- Role gate (if any): "🎩 composter only"

Click an action → task queued. Menu closes. Nearest idle fairy of the required role flies to the object. If multiple assignments happen, multiple fairies stack.

### Labor model

**Task cost in fairy-seconds.** Each task has a `base_labor_seconds` scaled by the size/maturity of the target.

| Task example | Base labor |
|---|---|
| Pick one ripe berry | 2 s |
| Harvest all ripe berries on small bush | 10 s |
| Harvest all ripe berries on mature bush | 25 s |
| Chop-and-drop small plant (pioneer) | 8 s |
| Chop-and-drop mature comfrey | 20 s |
| Fell small tree | 40 s |
| Fell mature tree | 120 s |
| Salvage felled trunk → logs/twigs/deadwood | 60 s |
| Quarry rock | 80 s |
| Build Storage Shed | 120 s |
| Build Compost Pile | 45 s |
| Build Chicken Coop | 150 s |
| Build Sprouting Bed | 60 s |
| Build Hive | 50 s |
| Build Kiln | 180 s |
| Dig 5-tile swale segment | 150 s |
| Dig 8×8 pond | 600 s |
| Salvage small ruin | 120 s |
| Water one stressed tile | 8 s |
| Turn compost pile | 20 s |

**Stacking fairies — diminishing returns.** Time = `base / √workers`. Clamp workers to `max_workers_per_task` (varies: 1 for bee-inspection, 2 for small tasks, up to 6 for swale digging, up to 8 for a barn-raising).

- 1 fairy digging swale = 150 s
- 2 fairies = 106 s
- 4 fairies = 75 s
- 6 fairies (cap) = 61 s

This rewards coordination without becoming "throw 20 fairies = instant."

**Role gating (soft):**
- Most tasks any fairy can do at their novice base rate.
- Role-specialists get +speed + +yield: composter turning compost × 1.5, beekeeper inspecting hive × 2.0, digger on swale × 1.6, builder raising a structure × 1.4, forager gathering IMO × 1.5, harvester picking fruit × 1.3, shepherd milking × 1.8, healer watering × 1.6.
- A non-specialist **can** attempt anything (so an all-composter team isn't blocked from emergency repairs) — they just work slower and yield less.
- A few tasks are **specialist-only** (hive inspection → beekeeper, animal healing → healer, biodynamic prep → trained-composter-L5). Menu greys out for others.

### Plant maturity → yield curve

Every plant has `age_days` and a species `maturity_curve`. Yield per action scales by where the plant is on its curve.

| Stage | Biomass yield × | Fruit yield × | Wood yield × |
|---|---|---|---|
| Sapling / seedling | 0.1 | 0 | 0.1 |
| Juvenile | 0.4 | 0.3 | 0.3 |
| Young productive | 0.8 | 0.7 | 0.6 |
| Mature | 1.0 | 1.0 | 1.0 |
| Old-growth (decades) | 0.9 | 1.2 | 2.5 |

**Why it matters:** "chop that apple sapling for 2 biomass now" vs. "wait 4 game-seasons and get 40 fruit/year forever" is the real permaculture choice. Felling a mature cedar rewards with a massive wood drop but that spot needs decades to rebuild shade.

### Task queue + assignment

A global `TaskQueue` autoload holds all queued tasks. Each tick:
1. Idle fairies pull the highest-priority task from the queue whose `required_role` they satisfy.
2. Player-right-click tasks are priority 10 (explicit orders).
3. Role-default behaviors generate priority-5 "ambient" tasks (composter: "this pile needs turning"; healer: "this tile is stressed").
4. Emergency tasks (predator attack, fire, dry-crop alert) are priority 20.
5. Fairies can be pulled off a priority-5 task for a priority-10 or 20 override.

The player never sees the queue — they see fairies quietly self-organizing. Right-clicking is how they override it.

### Interaction taxonomy

| Object | Left-click | Right-click menu offers |
|---|---|---|
| Ripe berry on bush | instant pick (fairy-dust burst) | "harvest all ripe", "chop-and-drop" |
| Bush (unripe) | info tooltip | "chop-and-drop", "water", "mulch" |
| Mature tree | info | "fell", "coppice", "prune", "graft scion" |
| Sapling | info | "transplant", "water", "mulch" |
| Deadwood log | instant +wood | — |
| Rock outcrop | info | "quarry", "carve check-dam" |
| Ruin structure | info | "salvage", "clear site" |
| Stream tile | info | "dig pond here", "check-dam here", "divert" |
| Any ground tile | open soil inspector | "plant seed", "spread compost", "plant cover crop", "dig swale", "terrace", "build N here" |
| Compost pile | inspector panel | "turn now", "empty scoop", "add biomass" |
| Animal | info | "move to paddock X", "milk", "shear", "cull" |
| Fairy | info + role | "swap role", "follow camera", "assign default zone" |
| Storage shed | inventory panel | "build adjacent", "expand" |
| Kiln | kiln panel | "burn biochar (needs wood × 6)", "ash collect" |

### Paired feedback per task phase

Each task fires feedback at three moments:
1. **Queued** — click sound + task-ring appears over target + fairy acknowledgment chirp
2. **In-progress** — per-hit animation (axe strikes, pitchfork lifts, shovel digs) + paced sfx + vibration on target + progress ring fills
3. **Completed** — success chord + particle burst + yield number-pop + world state visibly changes (tree falls, pile fills, bush empty)

Never silent. The juice budget applies: ≤ 16 ms from action-click to first feedback frame.

## Animal AI (keep simple, real consequences)

Each animal ticks once per day. State machine:
`idle → foraging → resting → (predator event: escape | caught) → idle`

Per-day decision tree:
1. Hunger > threshold? Move to nearest valid forage tile for my species.
2. At forage tile? Eat + deposit manure (raises tile OM by species-specific amount).
3. Evening? Return to coop/shed if one exists; else sleep where I am (predator risk ↑).

**Soil impact by species (Salatin / Savory references):**

| Species | OM/day | Other effect |
|---|---|---|
| Chicken | +0.01 % | scratches seedbed, eats bugs |
| Duck | +0.015 % | best in wet tiles, eats slugs |
| Goat | +0.02 % | clears brush (removes weeds) |
| Sheep | +0.025 % | excellent mob-grazer |
| Cow | +0.05 % | hoof pressure presses seed into soil (germination bonus) |
| Pig | +0.04 % | rootle-clears saplings, good for forest-reset |

**Mob-grazing bonus:** ≥ 3 cows on same tile for 1 day, then moved
to a different tile the next = +200 % OM that day. The system rewards
rotation discipline the same way real regenerative grazing does.

**Predators (event-driven, already have framework):**
- Hawk → chicken (no coop / no canopy cover)
- Coyote → chicken / duck at night (no fence)
- Cougar → goat / sheep (no guardian animal)
- Black bear → orchard + beehive + uncovered goat pen
- Fox → small poultry at dawn

Guardian animals (LGD dog, guard goose, llama) placed in the paddock
reduce predator-event success rate to zero for covered species.

## Progression rings

| Ring | Unlocks / accomplishments | Real-time |
|---|---|---|
| **0. Tutorial** | Harvest, chop, feed pile, scoop compost, enrich plot | first 5 min |
| **1. Resources** | Fell deadwood + trees → wood. Quarry rock → stone. Storage shed. | 5–15 min |
| **2. Infrastructure** | Build additional compost piles, sprouting bed, coop, hive (costs wood) | 15–45 min |
| **3. Production** | First chickens, first hive, fruit trees on enriched soil, first goat | 45 min – 2 hr |
| **4. Soil mastery** | Rotational grazing, cover-crop rotations, mycoremediation of ruins, biochar | 2–6 hr |
| **5. Climax** | Food-forest 7-layer, biodynamic preps, seed vault, watershed restoration | 6 hr+ |

Depth is optional — rings can be stair-stepped or cherry-picked.
Mastery emerges from discovering synergies (e.g., pigs clearing forest
→ chickens following → chickens sanitizing → soil ready for apples).

## Chunk breakdown (implementation order)

Each chunk keeps the game playable and adds one coherent system.

- **C1. Sun cycle + real shadows.** Animated DirectionalLight3D arc + sky color tween + tree shadows land on the ground. Verify: sit in the scene for 60 s and watch a tree's shadow travel. *(done)*
- **C2. Tile-grid terrain + elevation.** Flat ground replaced with `ArrayMesh` chunked heightfield driven by a Tile[][] data layer. Seeded procgen produces gentle BC-coastal slope toward a stream valley. Collision via HeightMapShape3D.
- **C3. Water flow CA + water mesh.** Per-day-tick water flow across the grid. Translucent water mesh renders pond+stream tiles. Rain events fill. Evaporation drains. Verify: seed a low spot → rain → pond forms naturally.
- **C4. Right-click action menu + task queue.** Generic interactable component on every world object. Hover rim-light (exists). RMB opens parchment menu. Click action → fairy assigned. Progress ring + completion feedback. Stacking multiple fairies scales time by `base / √N`.
- **C5. Interactable trees + deadwood + rocks.** All scatter-decor becomes interactable via C4 system. Deadwood → instant pick. Trees/rocks → fairy-assigned tasks. Plant-maturity yield curve applies.
- **C6. Storage container + wood/stone resources.** FarmTotals extended (wood, stone, twigs, seeds). Storage Shed tutorial gift. Inventory panel.
- **C7. Fairy-built structures.** Every buildable structure (pile, coop, kiln, storage, hive, shed, seedling bed) is a right-click → build site → fairy-task. Consumes from storage. Placement preview. Progress visible as they raise it.
- **C8. Swale + pond earthworks.** Dig-swale and dig-pond tasks mutate the tile grid (elevation changes) which feeds back into the C3 water flow. Verify: swale on slope catches a rain event.
- **C9. Animal AI v1 (chicken).** Chicken wanders daily, forages, manures, retreats to coop at night. Click → info panel. Predator events can take it.
- **C10. Soil fertility visibility + tiering.** Ground color shows fertility zones. Plants gate by soil OM. Compost application brightens the tile.
- **C11. More animals (duck, goat, cow, pig).** Each with distinct behavior + soil impact. Coop / shed / paddock required.
- **C12. Predator + wildlife ecology.** Hawks, coyotes, bears, foxes as event-driven threats. Guardian animals neutralize.
- **C13. Shade-aware planting.** Plants query their tile's sun exposure. Trees cast shade that unlocks understory species.
- **C14. Mob-grazing + rotation UI.** Drag fence segments to define paddocks. Set animal groups. Rotation timer.
- **C15. Biochar + late-game soil.** Kiln builds from wood + stone. Pyrolysis step. Charged biochar as premium amendment.
- **C16. Dev Lab + ecosystem preview.** "Visit Lab" button in HUD opens developer mode scene — browse biomes, scrub animations, preview every plant/animal/fungus entity in all its states, test shaders and LUTs.

Every chunk ends with: a short screenshot + one-line description of what the player can now do that they couldn't before. Closed against the 8 locked hard rules in `fp-game-director`.

## Not in scope (yet)

- Multiplayer
- Export to HTML5 (will happen late if at all)
- Modding
- Story / quest-writer framework (the goals panel scales into this)
- Additional biomes (BC only; other biomes are later content packs)
