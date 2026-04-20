# Fairy Permaculture — Game Design Document

---

## Context

Build a permaculture/regenerative-ag simulation game in the three-meshes sandbox (Three.js + Vite). The player is a **fairy** who flies around procedurally generated biomes, starts with a degraded patch of land and a compost pile, and progressively rebuilds a living ecosystem — unlocking an expanding food chain from soil microbes up to large animals and atmosphere-scale effects. BC coastal permaculture is the first biome.

Outcome target: a visually beautiful, dopamine-rich farming loop where progress is measured in **accumulated biomass** and **annual yield**, and where the farm's appearance evolves through shaders as the ecosystem matures. Fairy population (1 → 100) acts as a labor + progression metric, fed by honey, milk, and fruit.

Background research is captured in three companion files under `docs/`:
- `docs/research-soil.md` — Soil & micro-scale
- `docs/research-plants-water.md` — Plants & water (placeholder until inline research is re-captured)
- `docs/research-animals-systems.md` — Animals & whole systems

---

## Captured Brainstorm Notes

### Premise
- Procedurally generated 3D worlds; biomes vary (climate / vegetation / animal set).
- **First biome: BC coastal permaculture** (Pacific Northwest wet winter / dry summer).
- Player character: a **farming fairy** that flies. Camera follows fairy.
- Game loop: pick farm location → bootstrap from poor soil → grow the food chain → accumulate biomass & annual yield.
- Every run starts with: a small patch of poor soil, usually (not always) some water source, and the fairy.
- First structure: **composting station**.

### Fairy Economy
- Fairy count scales 1 → 100 over the life of a farm.
- **Fairy food:** honey, milk, fruit. Producing any of these grows the fairy population.
- New fairy unlock is a marquee dopamine moment — it should *feel big*.
- More fairies = more parallel work: digging (swales/ponds), moving & turning compost, accelerating growth of a chosen plant/animal, harvesting, planting.
- End-game target: ~100 fairies.

### Core Loop & Feel
- **Click-harvest dopamine**: clicking a ripe honey pot / ripe berry / full compost bin should feel juicy — particles, sound, squash-and-stretch, chunky numbers popping up.
- Compost in particular should feel **fun to make and very valuable** — the highest-leverage action early.
- Visceral acts: collecting biomass and dumping it in the compost; scooping finished compost and spreading it.

### Ecosystem Snowball
- Enrich soil → new life appears → new life unlocks new benefits or solves old problems.
- Emergent effects as soil improves: plants grow faster, less disease, water holds longer, food tastes better (higher Brix → bonus fairy food), more bugs → more birds arrive, etc.
- Beauty emerges: the farm should look progressively more alive (shader effects on grass, water, mycelium glow at night, pollinator clouds, fruit bloom).

### Progress Metrics
- **Total biomass** accumulated on the farm (soil OM + standing biomass + livestock).
- **Annual yield** (seasonal output tally).
- Milestones gate the next tier of the food chain.

### Challenges
- New challenges introduced as the farm grows (pests, disease cycles, climate events, predators, nutrient imbalance).
- Challenges should scale so early-game isn't punishing; late-game is tense.

### Visuals
- Shader-driven beauty: wind on grass/trees, water caustics on pond, mycelial glow, pollinator haze, aurora on climax-tier farms.
- Biome-specific aesthetic palettes.

---

## Design Decisions (locked)

| Question | Decision |
|---|---|
| Progression shape | **Fully branching tree** with a forced common root and a climax convergence |
| Biome variance | **Unique tree per biome** — BC is the shipped tree; other biomes are future content |
| Fairy labor model | **Hybrid: roles + nudges** — fairies have chosen roles and work autonomously; player can nudge any fairy to a specific job temporarily |
| Time model | **Day-tick** — the world advances one discrete day per tick; player can fast-forward/pause; seasons ≈ 30 days each |
| Player identity | **Disembodied overseer** — tycoon/RTS camera; no hero fairy; player directs from above |
| Role permanence | **Swappable with cooldown** — 1 day cooldown + small fairy-food cost per reassignment |
| Fairy mastery | **Meaningful XP** — 5 levels per role with tangible efficiency + ability bonuses |
| Role visuals | **Hat + tool only** — same body/wings; role shows as hat sprite + tool in hand |
| Art — toon | Crisp 2-band cel shading |
| Art — outlines | None |
| Art — night | Moonlit blue-hour base + fairy-light amplification |
| Year length | **~2 hours real-time** — 120 days × 60 s each; 4 seasons × 30 days; climax in ~15–20 h play |
| Juice tone | **Mid-juicy Stardew-like** — chunky pops, mid numbers, mild camera bob, no maximalist screen-shake |
| Challenge tone | **Tense — real losses possible** — droughts can kill orchards, predators can wipe a herd; recoverable but painful |
| Onboarding | **Minimal tooltips + discovery** — contextual hints only; no scripted mentor; respect the player |
| Platform | **Decide later** — browser-first build; defer Godot/Electron/Steam decisions until after playable prototype |
| Fail state | **No hard loss** — losses are painful and recoverable; run never ends from defeat |
| UI theme | **Rustic wood + parchment** — warm wood-plank panels, hand-drawn icons, parchment popups over the 2-band cel world |
| Music | **Zelda-inspired** — sparse piano field music (BOTW), ocarina/flute leads, harp, strings for milestones, short recurring motifs per branch & biome; generated via ElevenLabs |
| MVP scope | **Fairy-food trio** — Root + Branch A (honey) + B (fruit) + C (milk) + fairy pop to ~25. Proves the snowball loop. ~15 chunks. |
| Starting world | **Always a water source** — every BC farm spawns with a stream or pond; Branch G remains valuable for expansion but never blocks start |
| Farm size | **Sprawling homestead** — ~500 × 500 tiles; watershed scale; distinct zones; requires chunked rendering + LOD + aggressive instancing |
| Autosave | **Every game-day** — 60 s cadence; versioned schema with migration tests; localStorage primary |
| Navigation | **Camera + placeable waypoints** — free-flying overseer camera plus player-named waypoints on hotkeys 1–9 (pile, orchard, pond, etc.) |
| Tile scale | **3 m / tile** — 500 × 500 = 225 hectares; one tile ≈ one fruit-tree root zone or a garden-bed cluster; matches permaculture guild granularity |
| Asset sourcing | **Hybrid** — plants procedurally generated (consistent wind-shader cohesion, L-system-ish); animals + buildings sourced from Sketchfab CC, toon-shaded + palette-remapped |
| Goal system | **Soft suggestion goals** — a dismissible parchment "this season" list gently points toward the next food-chain node; no forced objectives |
| Day visuals | **Subtle LUT tween** — dawn→day→dusk→night color grade tween; no dramatic sun arc (60 s day is short); readability first |
| Season visuals | **Dramatic full-world change** — spring blossoms, summer greens, autumn orange+falling-leaves shader, winter snow accumulation + bare branches. Stardew-tier transition moments |
| Accessibility | **Rebindable keys + reduced-motion mode** locked in; colorblind palettes + text scaling deferred to polish chunk C6.3 |
| BC POIs | **All 4: old-growth forest edge, freshwater stream, rocky outcrop + cave hint, abandoned farmstead ruin** — every biome seed places all four |
| MVP challenges | **Summer drought, aphid outbreak, wet pile failure, hawk on chickens** — the four MVP events |
| Camera pitch | **Isometric 45°** — fixed angle; simpler shadow/shader pipeline; Stardew-tier strong read; unified with rustic-wood UI |
| Tree UI metaphor | **Classic tech-tree grid** on parchment panel — nodes + lines; pragmatic and implementable in MVP; can evolve to organic illustration later |

---

## Food Chain Progression — BC Branching Tree

**Shape:** A common Root (everyone starts here), seven Branches (player freely mixes investment), and a Climax Convergence that requires crossover between branches. Getting all 3 fairy foods (honey/milk/fruit) requires at minimum **three specific branches**, which guarantees a diverse ecosystem without forcing a rigid order.

### Root — The Starter Patch (unavoidable, same for all runs)
The forced shared opening. The camera/tutorial drapes over this.
- **R1. Compost Pile** — first build; cold compost starts heating after enough biomass + N balance.
- **R2. Pioneer Plants** — clover, vetch, comfrey, yarrow, nettle, dandelion take the bare ground.
- **R3. Red-Wiggler Worm Bin** — vermicompost node; unlocks castings input.
- **R4. First Swale / Water Capture** — small earthworks; first multi-fairy job.
- **Branch gate:** any of the seven branches unlocks after R1–R4 complete. Player picks freely from there.

### Branch A — Pollinators  (gates HONEY 🍯)
A1 Mason-bee tubes (BC-native) → A2 Bumblebee nest boxes → A3 Native-bee corridor → A4 **Honeybee hive (Warré)** → A5 Hive multiplication / splits → A6 Queen breeding & landrace-bee resilience
- **Milestone product:** Honey (fairy food).
- **Problems solved:** fruit set on orchard branch, flower seed set on grain branch.
- **Challenge emerges:** mite pressure (Varroa), colony collapse, late-summer dearth.

### Branch B — Berries & Orchard  (gates FRUIT 🍎)
B1 Berry patch — salmonberry, thimbleberry, saskatoon, strawberry → B2 Cane-fruit rows (raspberry, blackberry) → B3 Blueberry beds (ericoid mycorrhizae) → B4 Stone-fruit & Pacific crabapple guild → B5 Apple/pear mature orchard → B6 Nut canopy (hazelnut, chestnut, walnut)
- **Milestone product:** Fruit (fairy food) — starts at B1 (low), scales massively by B5–B6.
- **Problem solved:** fairy food pipeline, wildlife attraction.
- **Challenge emerges:** fire blight, codling moth, apple maggot, black-bear raids late.

### Branch C — Livestock  (gates MILK 🥛)
C1 Chicken tractor (eggs + pest scratch) → C2 Duck patrol (slugs, aphids) → C3 **Dairy goat** OR Rabbit colony → C4 Dexter cattle → C5 Silvopasture pigs → C6 Salatin cascade (rotational stacking)
- **Milestone product:** Milk (fairy food), eggs, meat.
- **Problem solved:** nutrient export closure (manure loop); pest patrol.
- **Challenge emerges:** predators (hawks early, cougar/black-bear late), parasite cycling, winter forage.

### Branch D — Aquaculture
D1 Pond excavation → D2 Reed-bed filter → D3 Rainbow trout / crayfish → D4 Watercress + aquatic forage → D5 Duck-fish integration → D6 Constructed wetland / salmon-run restoration (BC flavor)
- **Milestone product:** Fish, waterfowl, wetland biomass; massive water-storage + frost-buffer bonus.
- **Problem solved:** drought resilience, microclimate stability, fire break.
- **Challenge emerges:** herons, eutrophication, dry-summer draw-down.

### Branch E — Grain & Annuals
E1 Cover-crop mixes → E2 Three-Sisters-equivalent (quinoa/bean/squash for BC) → E3 Root cellar crops (potato, carrot, turnip, parsnip) → E4 Buckwheat & hulless barley → E5 Landrace seed breeding → E6 Seed vault
- **Milestone product:** Grain, staple calories, seed stock (tradable).
- **Problem solved:** caloric density (human/fairy surplus), genetic resilience.
- **Challenge emerges:** weed pressure, cross-pollination, storage pests.

### Branch F — Fungi & Remediation
F1 IMO collection from old-growth forest → F2 Wine-cap path mulch → F3 Oyster logs on red alder → F4 Shiitake on bigleaf maple → F5 Mycoremediation of contaminated edges → F6 Johnson-Su bioreactor (12-mo slow build, premium bio-inoculant)
- **Milestone product:** Mushrooms, high-power inoculants, contamination cleanup.
- **Problem solved:** soil biology acceleration, damaged-ground recovery.
- **Challenge emerges:** contamination events, fungal pathogens crossing to trees.

### Branch G — Water & Earthworks
G1 Contour swale network → G2 Keyline subsoiling → G3 Hugelkultur beds → G4 Rain garden + greywater → G5 Dam / reservoir → G6 Watershed-level intervention
- **Milestone product:** Water storage, microclimate moderation, accelerated tree establishment.
- **Problem solved:** drought, erosion, tree root-zone water.
- **Challenge emerges:** atmospheric-river overflow events, beaver conflict.

### Climax Convergence (requires crossover)
Only reachable with investment in multiple branches; gates 100-fairy end state and biome-mastery.
- **Biodynamic Atelier** — BD500–508 preparations; unlocks lunar-calendar overlay. Requires A + C + E.
- **Mature Food Forest** — 7-layer climax. Requires B + F + G.
- **Mob-Grazing Mastery** — leader-follower rotation at farm scale. Requires C + E + G.
- **Watershed Regeneration** — whole-catchment health. Requires any 5+ branches.
- **Seed Vault & Landrace Network** — export-quality genetics. Requires B + E + F.
- **End-state:** 100 fairies, ecosystem climax, biome-mastery achievement → unlocks the next procedurally generated biome (future content).

### Tree Design Rules
- **Fairy-food minimum:** to hit 100 fairies you must invest in A (honey), B (fruit), and C (milk). Hard minimum of 3 branches.
- **Diminishing returns per branch** encourages spread; full branch-A mastery alone can't take you past ~40 fairies.
- **Problem → Solution → New Problem** rhythm is **per branch**, not per tier — each branch node solves something and introduces something.
- **Nothing becomes obsolete** — R-tier comfrey chop-and-drop still charges F6 biochar and fuels D2 reed-beds late-game.
- **Biomass is universal currency.** Every branch produces and consumes it.
- **Each fairy unlock** is a visual+audio moment (shader bloom, harp sting, little egg hatch).

---

## Compost Mini-System

The compost pile is the **first and longest-lived** mechanic in the game — it's present from minute one through 100-fairy climax. It's a physical object, a state machine, an ingredient-mixing puzzle, and a multiplier on every other system. It must feel **fun to feed** and **valuable to empty**.

### Pile Variants (unlock timeline)

| Variant | Unlocks at | Footprint | Throughput | Output | Role |
|---|---|---|---|---|---|
| **Cold Pile** | Root R1 | 1 tile | Slow (60–120 d) | Low-Q compost, fungal-leaning | Starter |
| **Hot Pile** | After first Cold batch finishes | 2×2 tiles | Fast (30–60 d) | Mid–High-Q compost, bacterial-leaning | Workhorse |
| **Worm Bin** | Root R3 | 1 tile | Continuous | Vermicast (premium) + worm tea; grows worm pop | Kitchen scraps |
| **Bokashi Bucket** | Branch C node 2 (unlocks with kitchen meat/dairy scraps) | 0.5 tile | Fast (14 d seal + 28 d bury = 42 d) | Pre-compost, very acidic | Handles meat/dairy/oil |
| **Johnson-Su Tower** | Branch F node 6 | 2 tiles | 12 months, static | Premium fungal bio-inoculant | Late-game tier-3 input |
| **Compost Tea Brewer** | After first Hot Pile Q3+ batch | 0.5 tile | 24–36 h brew | Liquid spray (1-day buff on target tile) | Accessory |

### Ingredient Taxonomy

Every biomass item the world produces has four hidden stats the compost pile reads: **biomass weight**, **C:N ratio**, **moisture %**, **quality modifiers** (weed-seed risk, pathogen risk, N-loss volatility).

Categories surfaced to the player:
- **Greens** (🟢, C:N 10–25:1) — fresh grass, comfrey chop, kitchen scraps, fresh manure, coffee grounds, fish trim
- **Browns** (🟤, C:N 50–500:1) — dry leaves, straw, wood chips, cardboard, dead corn stalks
- **Bulkers** (⬜, structural air) — wood chips, straw, twigs
- **Inoculants** (✨) — forest duff (IMO), finished-compost seed, worm castings, BD preparations
- **Accelerators** (⚡) — urine, molasses water, seaweed, LAB culture

### Pile State Machine (ticks on day-tick)

```
Empty → Filling → Triggered → Hot → Turn-Window → Cooling → Curing → Finished
                      ↓            ↓           ↓           ↓
                   Stalled     Anaerobic   Stalled    Left-alone-
                      ↓            ↓           ↓       too-long
                  (fix or cold-compost fallback)   (quality cap)
```

- **Empty** — waits for ingredients.
- **Filling** — player/fairy adds over N days; the pile shows a live composition gauge (C:N bar, moisture bar, volume gauge).
- **Triggered** — crosses thresholds (volume ≥ 1 m³, C:N ∈ [20, 40], moisture 50–65 %) → enters Hot.
- **Hot** — temp ramps 3–5 days to 55–65 °C; steam shader + warm-glow lighting; decomposition runs fast; moisture drops daily.
- **Turn-Window** — every 5–7 days a turn prompt appears. If a composter fairy turns it (or player nudges one), it rebounds to Hot. If missed, drops to Cooling.
- **Cooling** — temp falls, volume collapses ~50 %, N/K locked into biomass.
- **Curing** — 2–4 weeks of mellow fungal activity; no user action required.
- **Finished** — harvestable compost; quality 1–5 stamped in.

### Quality (1–5 stars)

Finished compost earns stars from:
- C:N stayed in ideal band (strong)
- Moisture stayed in band (strong)
- Number of turns (0–1 → fungal bias; 3–6 → balanced; 7+ → bacterial bias)
- Inoculant diversity (BD + IMO + seed compost all present → +1)
- Cured for full time (early harvest caps at Q3)

Quality drives **application power** — Q5 compost applied to a tile gives a bigger OM bump, a microbial transfer, and can push the tile's F:B ratio toward the plant type already growing.

### Failure Modes (visible, recoverable)

| Failure | Visual tell | Cause | Fix |
|---|---|---|---|
| **Anaerobic / stinks** | Green slime shader + fly particles + sour icon | Too wet, no air | Add browns; turn. Salvageable to Q1–Q2. |
| **Stalled** | No steam, cool blue tint | Too dry, or C:N off | Water, add greens or browns. Salvageable. |
| **Ammonia loss** | Yellow haze + sharp-nose icon | C:N too low (all greens) | Add browns fast. Some N already lost (-Q). |
| **Too small** | Icon "won't heat" | Under 1 m³ | Keep feeding. Stays cold-compost. |
| **Rodent raid** | Scurry particles at night | Unbalanced food scraps | Add browns + cover; LGD fairy role deters. |

No failure is terminal; the pile always produces **something**, even if only Q1 cold compost over 4 months. This removes punishment, adds learning.

### Compost Economy (application sinks)

1. **Top-dress garden tile** → +OM %, +biology, +F:B nudge.
2. **Side-dress tree** → +growth rate multiplier for a season.
3. **Brew compost tea** → 1-tile foliar/soil buff for 3–5 days.
4. **Charge biochar** → combine with pyrolized char for tier-3 mega-amendment (Branch F5 unlock).
5. **Feed worm bin** → boosts worm population growth rate.
6. **Trade/gift** (climax-tier) → fairy-village surplus, future economy.

**Rough volume target:** 1 m³ Q3 compost → +1 % OM over ~10 m². Tune during playtest.

### Fairy Labor Integration

- **Composter** fairies handle the pile autonomously: haul biomass, monitor state, turn on cadence, harvest when finished.
- Player can **nudge** any fairy onto the pile for a one-off task ("turn this pile NOW", "empty it NOW").
- Seeing a cluster of 3–4 fairies turning a pile in coordinated animation is a **visual hero moment**.

### Click-Harvest Juice

- **Feeding biomass in** — chunky *thud*, dust burst, pile wobble, green/brown counter ticks up.
- **Pile goes Hot** — screen-wide warmth shader pulse, satisfying bell/whistle, pile emits visible steam plume, tooltip "🔥 Hot Compost!".
- **Turning** — pitchfork animation, volumetric crumble, compost texture cycles through layers.
- **Harvesting finished** — scoop reveals dark, glittery finished compost; number pop "+X bags Q4"; particle sparkle; fairies celebrate (tiny bow or wing flutter).

### Day-Tick Integration

- **Per day:** moisture -2 %, temp drifts toward target for current state, decomposition advances, microbe populations update.
- **Turn-window:** every 5–7 days during Hot state.
- **Per season:** an untended cold pile auto-progresses at season boundaries (e.g., winter freezes a pile into dormant Curing).

---

## Art Direction

### Constraints (from user)
- **Procgen-friendly** — must be easy to generate/texturize geometry at runtime.
- **Mesh-library-compatible** — must gracefully absorb cheap/free meshes from texture/asset libraries later.
- **Mystical fantasy feel** — dreamy, magical, wondrous.
- **Happy color system** — palette should make the player feel good.

### Proposed Direction: **"Ghibli-lite Stylized Low-Poly with Toon Atmospherics"**

A flat-shaded low-poly base coat, a lightweight toon shader for unified lighting, and heavy shader-driven atmospherics doing the mystical heavy lifting. This hits all four constraints.

**Why this fits:**
- **Procgen-friendly:** low-poly hides geometry imperfections; flat color fills don't need UV-mapped textures; plants/terrain can be generated algorithmically and still look intentional.
- **Mesh-library-compatible:** a toon shader applies cleanly to nearly any mesh; swap-in cheap assets will blend with procgen content if they share the palette + toon ramp.
- **Mystical:** the magic comes from **shaders and particles**, not expensive art — volumetric fog on dewy mornings, soft bloom on fruit, sparkle trails behind fairies, mycelium glow at night, pollinator haze, aurora at climax tier.
- **Happy colors:** a centrally controlled palette guarantees cohesion.

### Reference Touchstones
- **Studio Ghibli** (My Neighbor Totoro, Princess Mononoke) — the mystical-bucolic mood
- **A Short Hike, Ooblets, Alba** — low-poly + happy + readable
- **Slime Rancher** — soft outlines, vibrant palette, crisp UI
- **Book of Travels / Sable** — toon-shaded, painterly-adjacent
- **Tunic** — stylized with huge personality via light, color, shader

### Base Palette (subject to iteration)
A warm-pastel core with cool-mystic accents. All colors in a shared linear-space palette file so they compose correctly under any lighting.

| Role | Hex | Use |
|---|---|---|
| Meadow green | `#8BC47A` | Healthy grass, clover |
| Sage | `#B7D1A0` | Pioneer plants, ground cover |
| Olive-dark | `#5A7A4B` | Forest shadow |
| Honey gold | `#F2C14E` | Sunlight, honey, ripe grain |
| Warm coral | `#F28E74` | Fruit, warmth, sunset |
| Berry purple | `#A178B5` | Berries, flowers, twilight |
| Sky pastel | `#B8D8E8` | Sky, water highlights |
| Mist cyan | `#D6EEF0` | Fog, dew, mystical wash |
| Moonlight silver | `#E8E6D8` | Night rim-light, fairy trails |
| Earth brown | `#7A5C48` | Soil, bark |
| Compost rich | `#3E2F23` | Finished compost, loam |

### Shader Stack (high-level)
- **Toon ramp** on all solid geometry (2–3 band cel-shading, soft edges)
- **Hand-painted-feel normal break** on grass/tree sprites (cross-billboards with subtle wind vertex shader)
- **Water shader** — stylized caustics, shallow-water gradient, ripple ring on drop
- **Fog / atmosphere** — distance fog in palette cool-tone; morning mist volumetric at dawn tick
- **Bloom** — selective on honey, fruit, fairy trails, glowing mycelium (HDR threshold)
- **Color grading LUT** per time-of-day (warm dawn, bright mid-day, amber sunset, cool night)
- **Fairy sparkle trail** — additive particles, time-of-day tinted
- **Climax-tier flourishes** — aurora shader, bioluminescent mushrooms, pollinator cloud godrays

### Mesh Strategy
- Terrain: chunked low-poly heightfield with vertex colors from soil/vegetation layer (no textures required)
- Plants: procedural L-system-ish generators producing low-poly meshes; toon-shaded
- Animals: cheap library meshes (Sketchfab CC / existing VR model-preview pipeline), toon-shaded, palette-remapped at load
- Buildings/props: hand-placed + some procgen (compost piles, fences, hive boxes)

### Season & Mood Shifts
Color grading + palette shifts per season:
- **Spring** — fresh greens pushed saturated; cherry-blossom coral accents
- **Summer** — honey-gold dominant; hazy warm grade
- **Autumn** — coral→berry→gold; smoky atmospheric fog
- **Winter** — desaturate 30 %; sky pastel dominant; silver rim on snow

### Art Decisions (locked)
- **Toon shading: crisp 2-band cel.** Hard lit/shadow transitions. Cheapest on GPU, strongest stylized read.
- **Outlines: none.** Shapes carry through color, palette, and 2-band contrast. Keeps the look clean and modern.
- **Night: moonlit blue-hour base with fairy lights amplifying.** The scene stays readable under a cool-moonlight wash; each fairy carries a small point-light + bloomed sparkle. Clusters of fairies create warm glow pools that contrast against the cool moonlight — composed, cinematic, and gameplay-fair (player never loses their work in the dark).

### Pending Decisions
- **Time-of-day length** — real-time (~4 min day) vs tied-to-day-tick
- **Moon phases** — cosmetic only, or tied to biodynamic calendar overlay (Branch A synergy)

---

## Fairy Role System

Eight roles, each a first-class citizen in the labor model. Roles unlock progressively as their domain opens on the food-chain tree. Fairies gain XP in their assigned role and level up with tangible bonuses. Role swap costs 1 day + 1 fairy-food unit ("re-training"). Newly spawned fairies are **Unassigned** and idle in a central "Fairy Grove" until the player drags them to a role or work-site.

### Camera & Control (overseer model)

- **No hero fairy.** Player is a disembodied overseer.
- **Camera:** 3/4 top-down free-flight with pan (WASD + edge-scroll), orbit (right-click drag), zoom (wheel), optional *follow fairy* tag.
- **Selection:** click a fairy or tile to open contextual panel (role, level, task, nudge menu).
- **Nudge:** right-click a work-site → `nudge nearest available fairy here for one-off task`, then they return to their default role behavior.

### Role Catalogue

| Role | Hat | Tool | Primary actions | Unlock gate | Default AI behavior |
|---|---|---|---|---|---|
| **Composter** | Brown sun-hat | Pitchfork | Haul biomass to pile, turn on cadence, harvest finished compost | Root R1 (first compost pile placed) | Patrol pile network; service stale piles first |
| **Digger** | Green bandana | Shovel | Dig swales, ponds, hugels, earthworks | Root R4 (first swale marker) | Work nearest active dig job |
| **Harvester** | Red kerchief | Basket | Pick fruit/berries, harvest grain, gather eggs | Tier-2 (first ripenable crop) | Ripened-crop-first priority; deposits to granary |
| **Beekeeper** | Veil hat | Honey dipper | Inspect hive, harvest honey, split colonies, pollinator corridor care | Branch A1 (first bee structure) | Rotate hives by freshness |
| **Shepherd** | Wool cap | Staff | Herd, move paddocks, milk, feed, check health | Branch C1 (first livestock) | Keep animals fed → milked → moved |
| **Forager** | Leaf crown | Satchel | Collect wild greens, IMO from forest edge, seeds, deadfall | Tier-1 (forager hut) | Travels to biome POIs; returns with biomass |
| **Builder** | Hard-hat leaf | Hammer | Construct piles, hives, coops, fences, trellises, hugels | Root R1 (first build order) | Nearest queued blueprint first |
| **Healer** | Flower crown | Watering can | Water tiles, treat pests/disease, restore animal health | Tier-2 (first pest/drought event) | Priority on lowest-health plant or animal |

### Level Progression (5 tiers per role)

| Level | Title | Bonus |
|---|---|---|
| L1 | Novice | Baseline |
| L2 | Apprentice | +10 % action speed |
| L3 | Skilled | +20 % speed + one role-unique ability (e.g., Composter can seed piles with inoculant; Beekeeper can prevent mite outbreaks) |
| L4 | Expert | +35 % speed + +50 % work-radius |
| L5 | Master | +50 % speed + passive aura that boosts nearby same-role fairies +10 % |

**XP sources are role-specific** (composter gains XP per turn + per harvest of finished compost, harvester gains per fruit picked, etc.). XP-per-level curve stored in `balance.json → fairy_xp_curve`.

### Role Swap

- **Cost:** 1 day cooldown (fairy idle in the Fairy Grove during this day) + 1 fairy-food unit spent (any of honey/milk/fruit — cheapest at current prices).
- **XP preservation:** switching role **keeps XP in the old role** (persistent per-role XP on the fairy). A fairy who was a Master Composter and swaps to Harvester returns to L1 Harvester but retains their Composter mastery for later.
- This rewards the player for gradually training a fairy across multiple roles — end-game fairies become specialist-generalists.

### Unassigned Fairies & the Fairy Grove

- Every new fairy spawns **Unassigned** and glides to the Fairy Grove (a designated spot near R1 compost pile at game start; movable later).
- Unassigned fairies do light ambient work (random biomass pickup, wandering pollinator escort) to feel alive, but produce no meaningful yield.
- Drag-drop or click-assign from the Fairy Grove to a role or work-site.

### Nudge UI

- **Left-click a fairy:** opens mini HUD with name, role, level, current task, XP bar, and three quick actions (Nudge elsewhere, Swap role, Follow with camera).
- **Right-click a work-site:** contextual nudge menu — `turn THIS pile`, `harvest THIS tree`, `heal THIS tile`, `dig HERE`. Calls nearest available fairy of the appropriate role; if none, flags the job and surfaces a subtle toast.
- Nudges last **one task** then the fairy resumes their role's default AI.

### Role & Labor Telemetry (for balance-sim)

- Labor throughput per role per day
- Unassigned-fairy time % (ought to stay low in mid-late game)
- Level distribution across the fleet
- Role churn (swap frequency) — too high = players are second-guessing; too low = roles may be imbalanced

---

## BC Biome Generation

Every fresh run places the player in a procedurally generated BC coastal farm, 500 × 500 tiles at 3 m each (~225 ha). All four core POIs are always placed (seeded positions) with variation in rotation/scale.

### Always-Present POIs

| POI | Purpose | Placement rule |
|---|---|---|
| **Old-growth forest edge** | IMO source, deadfall biomass, wild seeds, mushroom zone | Occupies one map edge (N, E, or W; never S where the homestead faces), 60–100 tile deep |
| **Freshwater stream** | Always-water guarantee; source for Branch D later | Traces from forest edge through the central third of the map; width 2–4 tiles; forms at least one natural "inner loop" |
| **Rocky outcrop + cave hint** | Stone for building; thermal-mass microclimate; aesthetic anchor; cave entrance teased for future content | A single outcrop 8–15 tiles in footprint; placed on higher ground |
| **Abandoned farmstead ruin** | Cultural texture, biomass source, seed of lore | 4–6 collapsed structures; overgrown kitchen garden that yields leftover pioneer plants on first forage |

### Terrain

- Seeded heightfield with BC coastal profile: gentle slopes, one ridge line, stream valley carved through.
- Starting homestead flat area (player-defined 20 × 20 zone) near the stream; auto-cleared for R1–R4 placement.
- Soil-quality gradient: starting pad is poor (≤ 1.5 % OM); forest edge is richer (≥ 4 % OM reachable via forager); ruin patches are mid (2–3 %).

### Climate Model (BC coastal)

- Wet winters, drier summers
- 4 seasons × 30 days each; total 120-day year
- Daily rainfall chance: 80 % winter, 50 % spring/autumn, 15 % summer
- Summer drought **event** fires if 10+ consecutive rain-free days
- Frost risk: late-spring rare, autumn early-frost rare; keep weak in MVP

### Microclimates (tile-level modifiers)

- **South-facing slope** — +1 effective zone (earlier spring, longer season)
- **North-facing slope** — –1 effective zone
- **Frost pocket** (low-elevation pooling) — late frost risk ×2
- **Near-stream** — +moisture, –drought risk, +frost buffer
- **Rocky-outcrop-shadow** — thermal mass = +frost buffer
- **Forest-edge-shade** — filtered light, good for fungi and ericoid-mycorrhizal crops (blueberry)

### Procgen Determinism

- Single seed input produces bit-identical terrain + POI placement + soil distribution.
- Biome-engineer validates via determinism tests in QA.
- Lab "Biome Preview" supports seed scrubbing.

---

## MVP Challenge / Event System

Four events are active in MVP. All events follow the rule: **painful but recoverable**; never terminal; always with a known mitigation path the player can learn.

### Event Catalogue (MVP)

| Event | Trigger | Severity | Mitigation path |
|---|---|---|---|
| **Summer drought** | 10+ rain-free days in summer | Plants lose moisture 2× daily; unwatered tiles drop yield 30–70 %; fruit-tree young saplings risk death | Swales (Branch G), pond water, healer-fairy watering, mulch |
| **Aphid outbreak** | Monoculture tile cluster ≥ 4 same-family plants during spring | Affected tiles lose 50 % yield; spreads tile-to-tile if unchecked | Insectary plants (yarrow, dill, alyssum) within 8 tiles; ladybug release; healer-fairy treatment |
| **Wet pile failure** | 3+ consecutive rain days on a Hot-state pile with no cover/bulker | Pile crashes to anaerobic; smell; salvage only as Q1 | Add browns/bulkers; cover pile (tarp unlock); site piles under tree canopy |
| **Hawk strike** | Chicken on open pasture during daytime, probability scales with flock size | Loses 1–3 chickens per strike | Tree cover ≥ 30 % overhead; guard goose (later); chicken tractor under canopy |

### Event Framework (data-driven)

All events live in `data/events.json` with a common schema:
- `id`, `name`, `description`
- `trigger` — condition function reference
- `probability` — per-day roll (or deterministic trigger)
- `affected` — tile predicate
- `effects` — array of state modifications
- `mitigation` — array of counter-conditions that reduce severity
- `duration` — days
- `ui_notification` — parchment-scroll text + icon

Adding a new event in a future patch = adding a JSON entry + optional counter-condition hook. Challenge-designer owns the catalogue.

### Balance-Sim Integration

The progression simulator runs all MVP events at their canonical probabilities. A `typical` profile must stay inside target curves even with full event load. If a single event pushes the curve out, it's over-tuned.

---

## Click-Harvest Juice Spec

Every interactive moment follows the Stardew-juicy rule set: **chunky pop, brief squash-and-stretch, particle burst, pitched audio, number pop**, no maximalist screen-shake. Four moments get full-polish MVP attention (user priority), the rest inherit the template.

### Golden Rules
- **Click-to-feedback latency ≤ 16 ms** (1 frame) — non-negotiable.
- **Particles pooled**, never allocated per click.
- **Audio voice cap** prevents stacking hell; most-recent wins on overflow.
- **Number pops** rise + fade + drift toward the HUD counter with a subtle lerp-to-target.
- **Camera bob** is mild (≤ 3 px translation); never shake.
- **Pitch variance ±5 %** on audio clip per trigger for variety.
- **Chain bonus** on rapid consecutive same-type harvests (3+): small pitch-up ladder, x2 number color, x1.25 particle size.

### MVP Priority 1 — Compost Scoop (full polish)
*The highest-leverage early action. Must feel the best.*
- **Pre-click cue:** pile's finished-compost portion glints subtly (shader wave) when hovered; parchment tooltip with Q-rating + bag count.
- **Click fires:** composter fairy animates scoop → dark glittery finished-compost swirl → compost-bag icon rises from pile → number pop **+N (QX)** → deposit *thunk* sound → fairy tips hat.
- **Sound:** earthy wooden scoop + warm chord underlay pitched to quality (Q5 = major 7th chord, Q1 = simple root).
- **Vfx:** dark-chocolate particles, soft gold sparkle, brief 2-band cel pile-collapse animation.
- **Reward loop:** HUD compost-bag counter *ticks* up with a pleasant mechanical detent; unlocks application.

### MVP Priority 2 — Berry / Fruit Pick (full polish)
*First fairy food — the snowball trigger moment.*
- **Pre-click cue:** ripe berry cluster pulses slightly via vertex shader; cursor turns into a tiny basket icon.
- **Click fires:** fruit detaches with arc-tween into basket; leaves wobble; number pop **+N FRUIT**; chime pitches up per berry in cluster.
- **Sound:** plucking "pop" + sweet bell chime; each subsequent berry in a cluster steps up a scale.
- **Vfx:** pink/red particles, brief sparkle trail on the arc, tiny leaf flutter.
- **Reward loop:** fairy-food gauge fills; when full → new-fairy trigger armed.

### MVP Priority 3 — Biomass Chop-and-Drop (full polish)
*Most frequent click in Tier 1. Must not fatigue.*
- **Pre-click cue:** plant shows chop-ready outline (subtle 2-band shadow flash).
- **Click fires:** quick sword-stroke cut animation, plant drops to ground as mulch sprite, tile gets small ring of brown ground-cover, number pop **+N BIOMASS**.
- **Sound:** crisp "snip" + soft leaf rustle; low-frequency "thump" on the drop.
- **Vfx:** green leaf particles, gentle dust, small OM-rise counter on the tile.
- **Reward loop:** every N biomass triggers a tiny "satisfying threshold" chime; encourages batching.

### MVP Priority 4 — New Fairy Unlock (full polish)
*Marquee dopamine moment. Should feel bigger than anything else.*
- **Trigger:** fairy-food pool crosses spawn threshold.
- **Sequence:**
  1. Screen **briefly dims** to ~70 % brightness; time-of-day color grade shifts warm-gold
  2. Fairy Grove center glows; seed-of-light forms, rises, **bursts** into a new fairy
  3. Particle fountain rises for 1.5 s, bloom pass spikes
  4. Camera gently pushes in (zoom +15 %) and pulls out over 2 s
  5. Parchment scroll unfurls in HUD: **"A new fairy has arrived."** + fairy's procgen name
  6. Music: brief Zelda-style discovery motif (piano triad + flute rise)
- **Sound:** full harp run + sparkle layer + soft choir "aah"
- **Vfx:** gold/silver particles, bloom spike, aurora-ribbon sweep
- **Respect:** the sequence is **skippable** after first few times (hold-to-skip); 100 unlocks over 15–20 h shouldn't fatigue.

### Template (all other harvests inherit)
- Ripeness shader + cursor icon change on hover
- One-frame squash on click + pooled particle burst (palette-appropriate)
- Pitched audio with ±5 % variance
- Number pop lerping to HUD counter
- Mild camera bob (≤ 3 px), no shake
- Chain bonus on 3+ same-type in a row

### Juice-System Performance Budget
- Particle pool caps: 1,000 active particles site-wide; per-burst ≤ 30
- Audio voice cap: 16 concurrent SFX; overflow evicts oldest
- Number-pop entity cap: 32 on screen; overflow merges (show "+N ×3" instead of three pops)
- Full-juice chain should hold 60 fps on reference scene with 100 fairies active

---

## Asset Sourcing Pipeline

Plants are generated at runtime for wind-shader cohesion and style uniformity. Animals, buildings, and structural props come from the Sketchfab CC library (existing CLI at `src/sketchfab.js`), then toon-shaded and palette-remapped in the Model Viewer lab before being promoted to the game.

### Procgen Plant Pipeline (permaculture-designer + shader-expert)
- L-system-ish generators parameterized per species (branching angle, leaf density, height, fruit cluster)
- Output: low-poly mesh + vertex-color attributes for palette remap
- Wind vertex shader drives all plants uniformly (frequency, amplitude per species)
- Season changes via vertex color tween + bloom-color swap (spring blossom, autumn fire, winter desat)
- One generator per category: grass, herbaceous, shrub, cane-fruit, small-tree, canopy-tree, vine

### Library Asset Pipeline (credits-tracker + permaculture-designer)
1. **Search** — `npm run models:search -- "chicken low poly"` filtered by `--max-faces 2000 --sort popular`
2. **Download** — top candidates into `public/models/fairy-permaculture/candidates/<name>/`
3. **Lab audition** — drop into Model Viewer, apply toon ramp + palette remap, preview under all seasons, check hat/tool sockets (for fairies)
4. **Credit** — `_meta.json` records author + license + source URL; credits-tracker validates presence
5. **Promote** — "Promote to game" button moves approved asset into `public/models/fairy-permaculture/<category>/<name>/`
6. **Reference** — add entry to `data/animals.json` or `data/buildings.json` linking the asset path

### Asset Categories (MVP coverage)
For MVP (Root + A + B + C + ~25 fairies):
- **Fairies** — 1 body mesh + 8 hat meshes + 8 tool meshes (MVP: composter, harvester, forager; others scaffold later)
- **Animals** — chicken, duck, dairy goat, honeybee (swarm sprite OK)
- **Buildings** — compost pile (multi-state), beehive Warré, chicken coop, goat shed, worm bin
- **Plants** — clover, comfrey, yarrow, salmonberry, blueberry, strawberry, apple sapling (procgen)
- **Terrain props** — deadfall logs, forest-edge indicator, stream tile

### Fallback Rule
If a library asset can't be found or licensed in time, the procgen plant generator can stand in for any botanical asset with a 1-day style-match sprint. For animals, a primitive-compose stand-in (toon-shaded box-and-sphere chicken) ships in the Model Viewer as a placeholder.

---

## Dev Lab / Sandbox

A dedicated sandbox tool (pattern borrowed from Void Raiders' `model-preview/` and `music-lab/`) for fast iteration on assets, shaders, balance, and simulation — **without running the full game**. Lives at `src/games/fairy-permaculture/lab/index.html` and is accessed in dev via `http://localhost:5173/src/games/fairy-permaculture/lab/index.html`.

### Purpose

- Let artists/designers load a model, paint on the toon shader, audition it against each season's LUT, test hat+tool attachments, and export.
- Let balance agents tweak `balance.json` and see simulator curves update in real-time.
- Let shader-expert hot-reload GLSL without bouncing the whole game.
- Let sound-designer audition and generate SFX/music (reuses existing ElevenLabs pipeline).
- Support an agent-driven feedback loop where a chunk's QA fixtures run inside the lab.

### Tabs / Views

**1. Model Viewer**
- Load GLB / GLTF / FBX / OBJ from drag-drop or URL
- Apply project toon shader (2-band cel); palette-remap the model to the 11-color palette
- Preview under each season's LUT (spring/summer/autumn/winter) + time-of-day (dawn/noon/dusk/night)
- Attachment slots: hat socket + tool socket for fairy role preview
- Scrub animations; export rigged metadata
- Export: save remapped model + thumbnail to `public/models/fairy-permaculture/<name>/`

**2. Texture & Shader Lab**
- Live-editor for GLSL with hot-reload (no page refresh)
- Preview against a stock mesh (sphere, plant, fairy, terrain tile)
- LUT editor (season color grades)
- Bloom threshold/intensity sliders
- Fog density / color tuning
- Save resulting shader + constants to `src/games/fairy-permaculture/shaders/`

**3. Biome Preview**
- Enter a seed → generate BC biome terrain on the fly
- Inspect heightfield, water features, POI placement
- Visualize soil-quality distribution, starting vegetation seeds
- Reroll, fine-tune procgen params, export seed for reference use in tests

**4. Balance Tuning**
- Live-edit `balance.json` in a schema-aware form
- See target-curve panel update as you drag sliders
- "Run sim now" button: triggers headless sim with current values; updates curve overlays
- Save proposal to `balance/proposals/<ts>.md` (follows the balance-coordinator loop)
- Diff view against canonical `balance.json`

**5. Progression Simulator (front-end)**
- Run the headless progression simulator from the lab
- Pick seed, profile (ideal / typical / naive / chaotic), years, biome
- Real-time curve output: fairy count, biomass, yearly yield, branch investment, stall events
- Compare multiple runs side-by-side
- Export CSV + PNG

**6. Audio Lab** (reuse VR pattern)
- Audition SFX (click-harvest, compost heat-up, fairy-unlock, season transition)
- Audition/swap music tracks per situation (default / night / tense-event / milestone / climax)
- Generate new SFX/music via ElevenLabs (`npm run sfx`, `npm run music`)
- Persist choices to a shared `audio/audio-config.js` module the main game reads at runtime
- **Music direction: Zelda-inspired** — sparse piano field music à la BOTW, ocarina/flute leads, harp for night, orchestral swells for milestones. Each food-chain branch gets a signature short motif that plays on first unlock. Each biome has a theme. BOTW's "mostly silence with piano motifs fading in/out" is the model — avoid thick wall-to-wall scoring.

**7. Fairy Workshop**
- Preview each of the 8 roles with its hat + tool
- Scrub role XP visuals (L1 → L5 visual progression if any)
- Audition sparkle trail, light cone, per-role idle and work animations
- Inspector for role AI behavior trees

### Lab Build Chunk

Owner: **ux-engineer + shader-expert + game-director**
Inserted into the build order after **C0.2 Data Schemas**, as **C0.3 Dev Lab Scaffold**.

- Deliverable: lab entry page with tabs 1 (Model Viewer), 2 (Texture & Shader), and 4 (Balance Tuning) functional. Other tabs scaffolded but empty.
- QA gates: lab loads < 3 s; model drag-drop works with GLB + GLTF; toon shader applied to any loaded mesh; balance.json form round-trips to file; hot-reload GLSL works.

### Persistence Rules

- Lab edits write to a staging area (`lab-staging/`) by default
- "Promote to game" button copies staged assets into the live game directories with QA gate validation
- Never commit `lab-staging/` — gitignored

### Agent Usage

Agents can drive the lab programmatically:
- `permaculture-designer` uses it to preview new plant/animal entries before merging to `plants.json`/`animals.json`
- `shader-expert` uses it for iterating toon/water/fog/sparkle shaders
- `balance-coordinator` runs the simulator from the lab on every tuning proposal
- `sound-designer` auditions generated audio before committing

---

## Agentic Build System

An existing agent team at `.claude/agents/` (built for Void Raiders) is ~70 % reusable. The hierarchy, QA gates, Vitest test pattern, and data-schema skill all transfer directly. The GDD-first / game-director-orchestrates / qa-gate-before-next-chunk discipline is what this project needs.

### Agent Team Mapping

**Transfers as-is (rewrite GDD pointers only):**
- `qa-engineer` — same Vitest stack, same test categories (unit, data-val, integration, determinism, perf, regression, balance smoke)
- `perf-optimizer` — same budgets discipline, different targets (100 fairies, N biome tiles)
- `shader-expert` — directly relevant (toon ramp, fog, bloom, sparkle)
- `sound-designer` — directly relevant (ElevenLabs SFX/music pipeline)
- `ux-engineer` — directly relevant (HUD, branch-tree panel, nudge UI)
- `credits-tracker` — directly relevant (CC asset compliance for library meshes)
- `balance-coordinator` — directly relevant; takes on the **progression simulator** ownership

**Reframe (new game context, same skill):**
- `realm-engineer` → `biome-engineer` for fairy-perma: BC terrain, water, POI, climate system
- `economy-designer` → `farm-economy-designer`: biomass/yield/fairy-food flows, yearly output accounting
- `combat-designer` → `challenge-designer`: pest/disease/weather/predator/climate events
- `game-director` → new director file specific to fairy-permaculture GDD

**Retire (not relevant):**
- `drone-commander` (no drones), `ship-architect` (no ships)

**New agents required:**
- `permaculture-designer` — owns food-chain tree data (plants.json, animals.json, branches.json, guilds.json); gatekeeper on species accuracy against the three research docs
- `fairy-behavior-engineer` — owns fairy roles, task queue, nudge system, flocking, population sim
- `compost-system-engineer` — owns compost state machine, pile variants, ingredient taxonomy

**New skills required:**
- `compost-sim` — validate pile state transitions against target distributions
- `progression-sim` — run headless N-year simulations, emit CSV + curve deltas
- `species-validator` — cross-check species entries against the three research docs

### Project Path

```
src/games/fairy-permaculture/
  GDD.md                — this document; canonical game design
  index.html
  main.js
  data/
    branches.json       — 7 branches + root + climax nodes
    plants.json         — species (BC pool first)
    animals.json        — species (BC pool first)
    guilds.json         — plant-guild templates
    compost.json        — pile variants, ingredient taxonomy
    fairies.json        — roles, tool/animation refs, tuning
    balance.json        — master tuning knobs
    events.json         — challenge/event definitions
    biomes/
      bc-coastal.json   — first biome config
  biome/                — procgen terrain, water, POI, climate
  fairies/              — behavior, roles, nudge, population
  farm/                 — soil, plants, animals, tiles
  compost/              — pile logic, state machine
  progression/          — branch tree state, unlock logic, simulator
  events/               — pest/weather/predator events
  ui/                   — HUD, branch-tree panel, fairy nudge UI
  shaders/              — toon ramp, fog, water, sparkle, aurora
  utils/
  test/                 — shared helpers, mocks
  perf/                 — benchmarks
  regression/           — accumulated regression tests
  balance/              — simulator + smoke tests
  docs/
    research-soil.md
    research-plants-water.md
    research-animals-systems.md
```

---

## Atomic Build Chunks with QA Gates

Each chunk is scoped to ~1 dev-day of work, independently testable, has pass/fail criteria, and **must pass QA before the next chunk starts**. The game-director enforces order; qa-engineer enforces gates. Agents run the loop without human supervision; the human reviews chunk completion reports only.

### Phase 0 — Foundation

**C0.1 Scaffolding & Test Harness**
- Owner: game-director → qa-engineer
- Deliverable: index.html, main.js, empty Three.js scene, Vitest wired, data-schema skill active, CI script.
- **QA gates:** dev server loads in < 3 s; `npm test` runs with 0 failures; empty scene > 60 fps.

**C0.2 Data Schemas**
- Owner: permaculture-designer + qa-engineer
- Deliverable: JSON schemas for plants, animals, branches, guilds, compost, fairies, balance, events.
- **QA gates:** all schemas validated; data-val test auto-discovers any `data/**/*.json`; reference integrity (no orphaned IDs).

### Phase 1 — Core Simulation

**C1.1 BC Biome Procgen**
- Owner: biome-engineer
- Deliverable: seeded heightfield, vertex-colored terrain, water feature placement, POI seeds.
- **QA gates:** same seed → bit-identical terrain (determinism); < 5 ms per chunk rebuild; reference scene > 60 fps.

**C1.2 Soil Model**
- Owner: farm-economy-designer + permaculture-designer
- Deliverable: per-tile soil state (OM, pH, N, P, K, moisture, F:B, biology index); day-tick update functions.
- **QA gates:** unit tests on nutrient-cycle math; 365-day tick sim shows no memory growth; conservation-of-mass sanity check.

**C1.3 Day-Tick Loop**
- Owner: game-director + farm-economy-designer
- Deliverable: central day-tick scheduler, speed controls (pause/1×/2×/4×), season boundary hooks.
- **QA gates:** 10,000 ticks deterministic; frame rate stable across speed levels; season events fire on schedule.

### Phase 2 — Fairy + Compost

**C2.1 Fairy Character & Flight**
- Owner: fairy-behavior-engineer + shader-expert
- Deliverable: flying fairy mesh, sparkle trail, toon shader, camera follow, input.
- **QA gates:** fairy renders with 2-band cel shader; sparkle particle pool capped; 60 fps with 100 fairies in stress test.

**C2.2 Compost System v1 (Cold Pile + Hot Pile)**
- Owner: compost-system-engineer
- Deliverable: pile state machine, ingredient intake, C:N + moisture + temp simulation, quality stamping.
- **QA gates:** state-transition unit tests (all 8 states + 4 failure branches); balanced-input pile reaches Hot within 5 sim-days; Q5 achievable under ideal inputs.

**C2.3 Click-Harvest Juice v1**
- Owner: ux-engineer + shader-expert + sound-designer
- Deliverable: click handler on harvestable; particles + audio + number-pop on harvest types (biomass, berry, compost scoop).
- **QA gates:** click-to-feedback latency < 16 ms; particle pool doesn't leak over 10,000 clicks; audio doesn't stack beyond cap.

**C2.4 Fairy Role v1 (Composter)**
- Owner: fairy-behavior-engineer
- Deliverable: task-queue, composter behavior tree, pile-turn on cadence, nudge override.
- **QA gates:** composter fairy correctly executes full compost lifecycle; nudge preempts role; no stuck/orphaned tasks.

### Phase 3 — Plants & Growth

**C3.1 Plant System v1 (Pioneer Plants)**
- Owner: permaculture-designer
- Deliverable: plant schema + grow cycle, soil feedback, chop-and-drop.
- **QA gates:** species from `plants.json` load; growth cycle matches data-driven timing; chop-and-drop returns biomass to soil.

**C3.2 Root Nodes R1–R4 Unlock Logic**
- Owner: permaculture-designer + ux-engineer
- Deliverable: branch-tree data driven; R1–R4 unlock as prerequisites are met; tree-view UI.
- **QA gates:** unlock logic unit-tested across sequences; state serializes + restores; UI reflects real state.

### Phase 4 — Fairy Foods (the honey/milk/fruit trio)

**C4.1 Branch B (Fruit)** — Berries → Orchard
- Owner: permaculture-designer
- Deliverable: berry bush + first fruit tree; ripen cycle; fruit harvest.
- **QA gates:** yields match balance.json; ripening visual state matches sim; click-harvest juice fires.

**C4.2 Branch A (Honey)** — Pollinators → Hives
- Owner: permaculture-designer + fairy-behavior-engineer
- Deliverable: native bees auto-spawn on flowering plants; hive building; honey production.
- **QA gates:** bee spawn requires flowering plants; honey yield tied to pollinator-bloom match; fairy food counter increments.

**C4.3 Branch C (Milk)** — Chickens → Goats
- Owner: permaculture-designer + fairy-behavior-engineer
- Deliverable: first animals (chicken, duck, goat), feeding, milking/eggs.
- **QA gates:** animal health/feed sim; milk/egg production rate; predator-event survival path exists.

**C4.4 Fairy Population System**
- Owner: fairy-behavior-engineer + balance-coordinator
- Deliverable: 3-food-driven spawn curve; "new fairy" unlock moment (shader bloom + audio + animation).
- **QA gates:** spawn curve matches balance.json target; spawn event fires exactly once per fairy; curve tuned with progression-sim.

### Phase 5 — Depth Branches + Labor Full

**C5.1 Fairy Roles Full Set**
- Owner: fairy-behavior-engineer + ux-engineer
- Deliverable: all 8 roles (composter, digger, harvester, beekeeper, shepherd, forager, builder, healer); role assignment UI; nudge UI.
- **QA gates:** each role unit-tested; assignment persists; nudge UI accessibility.

**C5.2 Branch D (Aquaculture)** | **C5.3 Branch E (Grain)** | **C5.4 Branch F (Fungi)** | **C5.5 Branch G (Water)**
- Owner: permaculture-designer + biome-engineer (for G) + farm-economy-designer
- Each its own chunk with its own QA gates against `branches.json` targets.

### Phase 6 — Challenge + Climax + Polish

**C6.1 Challenge/Event System**
- Owner: challenge-designer
- Deliverable: pest, drought, frost, fire, predator, climate events; day-tick probabilistic triggers; resolution paths.
- **QA gates:** events fire at expected rates over 10-year sim; every event has a known mitigation; no event is unrecoverable.

**C6.2 Climax Convergence**
- Owner: permaculture-designer + balance-coordinator
- Deliverable: BD atelier, mature food forest, mob-grazing, seed vault, watershed convergences; 100-fairy end state.
- **QA gates:** convergence unlocks only when prerequisites met; end-state fires deterministically given sim input.

**C6.3 Visual Polish**
- Owner: shader-expert
- Deliverable: toon-ramp final, fog, moonlight-night + fairy-light amplification, sparkle, bloom, aurora, climax shaders, season color grade LUTs.
- **QA gates:** shaders compile in Chrome/Firefox/Safari; full scene > 60 fps; bloom HDR pass < 2 ms.

**C6.4 Onboarding**
- Owner: ux-engineer + game-director
- Deliverable: first-20-min scripted beats walking through R1–R4 + first fairy-food milestone.
- **QA gates:** synthetic-input playback completes onboarding with zero errors; clarity playtest loop (5 internal testers) passes.

**C6.5 Save/Load**
- Owner: farm-economy-designer + qa-engineer
- Deliverable: localStorage serialization; round-trip state.
- **QA gates:** save → reload → deep-equal; versioned schema; migration test for schema bumps.

**C6.6 Credits & Asset Audit**
- Owner: credits-tracker
- Deliverable: CREDITS.md with all meshes/audio/textures attributed per CC license.
- **QA gates:** no unattributed asset in repo; license field present for every third-party asset.

### Global QA Discipline

- A chunk is **not done** until its QA gates pass in CI.
- **Regression tests accumulate** — any bug found becomes a permanent test.
- **Balance smoke tests** run on every numeric change in `balance.json`.
- **Performance budget** is a hard line: chunk fails if it drops reference-scene fps below 60.
- **Determinism is sacred** — any procgen non-determinism is a P0 bug.

---

## Progression Simulator (Balance-Coordinator Owned)

The simulator is the tool that makes this design self-balancing without human supervision. It runs the entire food-chain tree headless, faster than real-time, with configurable player-skill profiles, and emits curves that agents compare against targets.

### What It Simulates

- Full day-tick loop with no renderer attached
- All branches, all species, all fairy behaviors, all events
- Tunable player profile (ideal / typical / naive / chaotic)
- Reads `balance.json`; changing a number + re-running = new curve

### Player Profiles

| Profile | Description | Use case |
|---|---|---|
| `ideal` | Always takes the optimal action next tick | Defines upper-bound pace; anchors "can 100-fairy be reached?" |
| `typical` | Chooses reasonable actions with realistic pacing, occasional sub-optimal | Target curve for balancing |
| `naive` | Ignores many systems; only does visible actions | Floor — can a lost player still progress at all? |
| `chaotic` | Randomly distributes actions | Stress test; finds unintended degenerate paths |

### Metrics Captured Per Run

- **Fairy count over time** — target: 5 by day ~30, 15 by day ~90, 40 by day ~180, 75 by day ~270, 100 by day ~365 on `typical`
- **Biomass accumulated** (standing + soil + livestock) per season
- **Yearly output** (honey, milk, fruit, grain, eggs, nuts, mushrooms)
- **Branch investment distribution** — how much each branch was touched
- **Time-in-challenge** — how long spent under active event
- **Stall events** — periods of >7 days with no measurable progress
- **Runaway growth** — periods where fairy population doubles in < 14 days
- **Dead branch detector** — any branch never invested in by > 50 % of `typical` runs

### CLI

```
npm run simulate -- \
  --seed 42 \
  --years 3 \
  --profile typical \
  --biome bc-coastal \
  --report out/sim-<timestamp>.csv \
  --chart out/sim-<timestamp>.png
```

### Target Curves (tuned during balance pass)

Stored in `balance.json → target_curves`:

```json
{
  "fairy_count": {
    "day_30": [3, 7],
    "day_90": [10, 20],
    "day_180": [30, 50],
    "day_270": [60, 85],
    "day_365": [90, 100]
  },
  "biomass_stock_kg": {
    "day_30":  [50, 300],
    "day_365": [5000, 20000]
  },
  "yearly_output_fairy_food_units": {
    "year_1": [50, 200],
    "year_3": [5000, 15000]
  }
}
```

### Balance-Coordinator Loop (runs autonomously)

1. Run sim with current `balance.json` across all profiles, 10 seeds each.
2. Compare to target curves.
3. Identify deviations > configured tolerance.
4. Propose a single minimum-change tuning adjustment.
5. Write proposal to `balance/proposals/<ts>.md` for human review (or apply + re-run if in autotune mode).
6. Stop when all profiles' curves fall inside target bands for ≥ 3 consecutive runs.

### Integration with Chunks

The simulator is **required** for these chunks and blocks their QA gate:
- C4.4 Fairy Population (curve must fit)
- C5.2–C5.5 Branch D/E/F/G (each branch must not kill the curve when added)
- C6.1 Event System (events must not push `typical` below target band)
- C6.2 Climax Convergence (end-state must be reachable by `typical` in ≤ 2 game years)

### Determinism Requirement

Simulator runs are bit-reproducible under `--seed`. Otherwise balance work can't converge.

---

## Sections Still To Design (agent-owned during implementation)

These are implementation-detail items that agents will flesh out inside their chunks, not plan-time blockers:

- **MVP species list** — exact plants.json / animals.json entries for Root + Branches A/B/C (permaculture-designer during C3.1 and C4.1–C4.3)
- **Contextual hints catalogue** — discovery-tier tooltips that appear when relevant mechanics first become useful (ux-engineer during C6.4)
- **Settings menu scope** — graphics sliders, audio sliders, rebind UI (ux-engineer during C6.4)
- **Save-schema versioning** — migration strategy detail (qa-engineer during C6.5)
- **Full-roster fairy role visuals** — hat + tool mesh set for all 8 roles (permaculture-designer + credits-tracker as Sketchfab search results come in)
- **Climax-tier flourishes** — aurora shader, biodynamic-calendar overlay UI, landrace seed genetics (shader-expert + permaculture-designer during C6.2–C6.3)
- **Game name + branding** — working title "Fairy Permaculture"; final name + logo pending

---

## Verification

End-to-end verification the implementation is working:

1. **Scaffold sanity** — `npm run dev` serves `http://localhost:5173/src/games/fairy-permaculture/index.html`; an empty BC scene renders at > 60 fps.
2. **Deterministic biome** — `npm test -- --filter biome` passes; seeded BC terrain is bit-identical across runs.
3. **Compost end-to-end** — play action: fly fairy to pile, drop biomass, skip 7 game-days; assert pile reaches Hot; skip 30 game-days; assert Q3+ finished compost.
4. **Fairy food trio** — simulate a typical-profile run for 1 game-year; assert honey ≥ X, milk ≥ Y, fruit ≥ Z.
5. **Fairy population snowball** — simulate 365 days typical; fairy count must land inside target band `[90, 100]`.
6. **Progression simulator** — `npm run simulate -- --profile typical --seed 42 --years 3`; exits 0; CSV contains no stall periods > 7 days; no dead branches > 50 %.
7. **QA pipeline** — `npm test` passes: unit, data-validation, integration, determinism, perf, regression, balance smoke.
8. **Perf budget** — 100 fairies + full BC scene at 60 fps; draw calls < target; GPU time within bloom budget.
9. **Save/load** — save mid-game, reload, deep-equal state.
10. **Credits** — `CREDITS.md` covers every third-party asset in the repo.

Each chunk has its own verification step; the above is the full-game smoke test.
