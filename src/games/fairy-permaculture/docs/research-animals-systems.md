> Background research on insects, pollinators, livestock, poultry, aquaculture, integrated whole-farm systems, manure/humanure/biogas loops, and atmospheric-scale feedbacks. Source material for the food-chain branches (A pollinators, C livestock, D aquaculture), climax convergences, and yearly output accounting. Curated by research agent during plan mode.

# Permaculture Simulation — Animals, Integrated Systems, and Atmospheric Scale

Design reference material for a permaculture / biodynamic / regenerative agriculture simulation game.
Focus: animals (insects through large livestock), whole-farm stacking, climate-scale feedback loops.

Each entry is formatted, where relevant, with:
1. **Mechanism** — what actually happens ecologically/biologically
2. **Timescales** — ticks, days, seasons, years
3. **Inputs / Outputs** — game-resource model (feed, water, labor → meat, eggs, fiber, manure, ecosystem service)
4. **Interaction with plants & soil** — the coupling below
5. **Failure modes** — what breaks it
6. **Labor / skill** — player cost

Numbers are canonical mid-range figures usable as defaults; cite the source links at the bottom when tuning.

---

## 1. INSECTS & POLLINATORS

### 1.1 Honeybees — Hive Systems

| Hive | Annual honey yield | Wax yield | Labor | Intervention style |
|---|---|---|---|---|
| Langstroth (movable frames) | 40–80 lb (5–10 gal) | low (frames reused) | moderate — periodic inspections, super-stacking, extractor | high management, maximum production |
| Top-bar (horizontal) | 24–40 lb (3–5 gal) | high (combs destroyed at harvest) | low — single-comb handling, no heavy lifting | natural comb, minimal intervention |
| Warré (vertical, nadired) | 15–25 lb typical | moderate | very low — one nadiring per year | "bee-friendly", colony stress minimized |

- **Mechanism**: Workers forage 1–3 km radius (effective ~0.5 km). 1 lb honey ≈ 2 M flower visits. Queen lays 1,500–2,000 eggs/day in peak season.
- **Timescales**: Colony cycle annual. First-year establishment rarely yields surplus; year 2+ productive. Winter die-off 10–30% normal; >40% = stress signal.
- **Inputs**: nectar flow (dependent on floral resource map), ~30–60 lb stored honey for winter, optional sugar supplement.
- **Outputs**: honey, beeswax, propolis, pollen, royal jelly, swarms (new colonies), **pollination service** (the critical game multiplier — radius buff to nearby fruit/veg yields).
- **Interactions**: Tight feedback with orchard, cover crops, pollinator strips. Competes with native bees at feeder saturation.
- **Failure modes**: Varroa mite infestation (exponential if untreated), Colony Collapse Disorder trigger from pesticide exposure within forage radius, starvation (late cold spring), absconding, pesticide drift, small hive beetle, American foulbrood (quarantine/destroy).
- **Labor/skill**: seasonal peaks (spring inspections, honey flow, winter prep). Skill tree: queen-rearing, splits, swarm capture.

### 1.2 Native Bees (Solitary)

- **Mason bees (Osmia)**: spring-only (3–4 weeks adult), pollinate orchards 60× more efficiently per bee than honeybees. Use mud to seal holes.
- **Leafcutter bees (Megachile)**: June–August, cut circular leaf pieces to line cells. Pollinate alfalfa, summer vegetables.
- **Housing**: bundled reeds, cardboard tubes, drilled blocks. Replace tubes yearly (parasite/disease hygiene).
- **Inputs**: bare soil patches (mud), host plants, undisturbed nesting material. Very low labor.
- **Outputs**: concentrated spring or summer pollination radius buff. Little/no honey.
- **Failure**: parasitic wasps, pollen mites, tube reuse → disease load, urban pesticide.
- **Timescales**: 1 generation/year, adult 3–4 weeks only.

### 1.3 Beneficial Predatory Insects

| Predator | Prey | Plants to attract | Notes |
|---|---|---|---|
| Ladybugs (Coccinellidae) | aphids (50/day adult) | dill, fennel, yarrow, alyssum | larvae are more voracious than adults |
| Green lacewings (Chrysopidae) | aphids, caterpillars, whitefly | umbellifers (fennel, Queen Anne's lace) | larvae = "aphid lions" |
| Parasitic wasps (Braconid, Ichneumonid, Trichogramma) | caterpillars, aphids, whitefly | tiny-flowered plants: alyssum, sweet alyssum, buckwheat | host-specific → need pest present |
| Hover flies | aphids | composites, umbellifers | double duty: pollinator + predator |
| Ground beetles (Carabidae) | slugs, snails, caterpillars, weed seeds | beetle banks, hedgerow | overwinter in tussocky grass |

- **Game model**: pollinator strips and beetle banks = persistent tiles generating a "beneficial insect" pool that reduces pest damage stochastically in a radius. Threshold density matters — too sparse and pests outrun predators.
- **Beetle banks**: 2-m-wide raised grass strips ≤150 m apart in fields; overwinter refuge for polyphagous predators.

### 1.4 Silkworms & Black Soldier Fly Larvae

**Silkworms (Bombyx mori)**
- Monofeed obligate on white mulberry (Morus alba) — requires mulberry tile/tree resource.
- Life cycle 25–30 days from egg to cocoon.
- Output: silk cocoon (~1 km of silk thread each), pupa (feed or food), frass (plant fertilizer).
- Labor: **very high** during feeding stage (constant fresh leaves, clean trays).

**Black Soldier Fly Larvae (BSFL, Hermetia illucens)**
- **Mechanism**: Bioconvert organic waste to protein. Each larva eats up to 200 mg food waste/day.
- **Feed Conversion Ratio**: ~1.78 on high-protein substrates, ~2.51 on mixed kitchen waste. Biomass conversion 14–19% typical, up to 85% waste reduction.
- **Inputs**: kitchen waste, manure, spoiled fruit, aquaculture sludge.
- **Outputs**: larvae (35–45% protein, feed for chickens/fish/pigs), frass (compost amendment).
- **Timescales**: larval stage 14–28 days; self-harvesting (mature larvae climb ramps when ready).
- **Failure**: too wet → anaerobic, too hot (>40°C) → die, cold climates → dormancy. Requires >20°C for active conversion.
- **Game integration**: converts the "waste stream" resource into "high-protein feed" with ~6× multiplier vs. feeding waste directly to animals.

---

## 2. AQUACULTURE

### 2.1 Chinese Carp Polyculture (The Canonical Integrated Pond)

Four species, four niches:
- **Grass carp** — surface / macrophytes (eats aquatic plants, manures pond)
- **Silver carp** — mid-water / phytoplankton filter feeder
- **Bighead carp** — mid-water / zooplankton filter feeder
- **Mud (black) carp / common carp** — bottom / benthic invertebrates, detritus

- **Mechanism**: "One grass carp feeds three silver carp" — grass carp manure fertilizes pond → plankton bloom → silver+bighead eat the plankton → bottom detritus → mud carp. Closes the loop; each nutrient is used ~3×.
- **Timescales**: 1–2 year grow-out to market size; drained/restocked annually or semi-annually.
- **Inputs**: pond (native vegetation, manure), sometimes supplemental grain/bran, duck or pig pens stacked over the pond.
- **Outputs**: 3,000–8,000 kg/ha/year at intensive; 500–1,500 kg/ha/year at low-input polyculture.
- **Failure**: oxygen crash on hot still nights (kill), over-fertilization, disease when overstocked.
- **Integration**: pig-over-pond, duck-over-pond, mulberry dike → silkworm → silkworm waste → pond.

### 2.2 Aigamo Integrated Rice–Duck–Fish

- **Mechanism** (Furuno system): 20–30 ducklings released into flooded rice paddy at 2 weeks post-transplant. Ducks eat weeds, insects, golden apple snails. Droppings fertilize rice. Loaches (fish) eat duck droppings and larvae. Azolla cover fixes nitrogen + feeds ducks.
- **Yield boost**: rice +10–20%, eliminates herbicide & insecticide, saves ~240 person-hours/ha of hand weeding.
- **Inputs**: ducklings, Azolla starter, fry (loaches). Fence around paddy (prevent predation).
- **Outputs**: rice, duck meat, duck eggs, fish, azolla (green manure/feed).
- **Timescales**: ducklings removed from paddy at grain-fill stage (birds will eat the rice once heads form) → finish on pond or yard.
- **Failure**: predation (weasel, hawk, snake), ducks trample young transplants if introduced too early, cold climates rare (system is tropical/temperate).
- **Adoption**: 75,000+ farmers across Japan, Korea, China, SE Asia.

### 2.3 Aquaponics (Closed-Loop Fish + Plant)

- **Fish-to-water**: 2–6 gal/lb fish depending on filtration. Beginners: 6 gal/lb.
- **Fish-to-plant**: 25 L grow-bed media per fish grown to 500 g; 6.6 gal wet media per 1-lb fish.
- **Species**: tilapia (warm, fast, hardy, 6–9 month grow-out), trout (cold water <20°C, picky), bass (slow), koi (ornamental), catfish, crayfish.
- **Nitrogen cycle**: fish → ammonia → *Nitrosomonas* → nitrite → *Nitrobacter* → nitrate → plants. System must be cycled 4–6 weeks before heavy stocking.
- **Inputs**: fish feed (or BSFL!), electricity (pump + sometimes heater), makeup water for evapotranspiration.
- **Outputs**: fish, leafy greens (lettuce, basil, kale excel), fruiting crops if nitrate is high enough (tomato, pepper).
- **Failure**: pump/power loss (fish die in hours), ammonia spike (cycling crash), pH drift, disease jumps between fish & crops rare but possible, winter heating costs.

### 2.4 Other Aquaculture Species

| Species | Water | Grow-out | Notes |
|---|---|---|---|
| Tilapia | warm (>20°C) | 6–9 mo | herbivorous, 2 gal/lb at max density |
| Trout (rainbow/brown) | cold (<20°C), high DO | 12–16 mo | needs flowing/oxygenated, high protein feed |
| Largemouth bass | temperate | 18–24 mo | carnivore, slow |
| Catfish (channel) | warm | 16–18 mo | bottom, hardy |
| Crayfish (red swamp) | warm pond | 6–9 mo | scavenger; good rice-paddy species |
| Freshwater prawn (Macrobrachium) | warm, clean | 6–9 mo | high-value, territorial |

---

## 3. POULTRY

### 3.1 Chickens — Layers, Broilers, Dual-Purpose

- **Layers** (e.g., Leghorn, Rhode Island Red, Australorp): 250–300 eggs/hen/year, feed 3–4 lb per dozen eggs.
- **Broilers** (Cornish Cross): 8–10 weeks to 5–6 lb dressed; FCR ~2.0 (feed:weight). Freedom Ranger/Red Ranger: 10–12 weeks, more active, better on pasture.
- **Dual-purpose heritage** (Plymouth Rock, Sussex, Orpington): 180–220 eggs, slower to meat (16–20 wk).

### 3.2 Chicken Tractor & Pastured Poultry (Salatin Model)

- **Shelter**: 10 × 12 × 2 ft floorless pen housing ~75–80 Cornish Cross broilers.
- **Move**: once/day first 3 weeks, twice/day after — pasture utilization cap ~50%.
- **Density**: ~500 birds/acre/season (sustainable).
- **Inputs**: chicks, supplemental grain (~50% of diet from pasture in best cases), water.
- **Outputs**: dressed meat, concentrated manure deposit (in strips — fertilizes pasture), pest reduction (grasshoppers, caterpillars).
- **Labor**: one person can manage 1,000 birds on pasture if tractors are well designed.

### 3.3 Eggmobile (Layers Following Cattle)

- **Mechanism**: mobile roost moves 3 days after cattle. Hens scratch through cow pats → kill fly larvae, parasites → spread manure thinly → deposit nitrogen. Salatin: 300–400 hens per eggmobile.
- **Each pasture patch rests ~364 days** between chicken passes.
- **Integration outputs**: eggs + parasite break for cattle (fewer ivermectin treatments) + faster manure incorporation.

### 3.4 Ducks

- **Slug control**: Indian Runner & Khaki Campbell ducks devour slugs/snails without trampling veg (unlike chickens which scratch).
- **Egg-layers**: Khaki Campbell 280–340/year (rivals chickens); richer egg.
- **Pond-based**: Muscovy (quiet, eats mosquito larvae/flies, also excellent meat).
- **Timescales**: meat ducks (Pekin) 7–9 weeks to 6–7 lb.
- **Failure**: require water source, muddy footprints in wet climates, predation.

### 3.5 Geese

- **Weeding**: "weeder geese" (Chinese, African) selectively eat grasses over broadleaves → used in strawberry, cotton, orchard understories.
- **Guarding**: noisy, territorial — useful alarm animals.
- **Inputs**: grass (90%+ forage), water.
- **Outputs**: meat (10–14 lb), down, eggs (40–50/year), guard service.
- **Labor**: low once established; aggressive during breeding.

### 3.6 Turkeys, Quail, Guinea Fowl

- **Turkeys (heritage)**: Bourbon Red, Narragansett — pastured 18–24 wk to 14–25 lb. Blackhead disease transmitted by chickens' cecal worms (don't house together).
- **Quail (Coturnix)**: 6–8 wk to butcher, 45 g eggs, 6 eggs/day peak, small footprint (cage-stacked).
- **Guinea fowl**: 4,000+ ticks/day consumed, Lyme-disease reduction, loud alarm call. 100+ eggs/year, seasonal March–October. 1/acre minimum for tick control; 6–12 birds typical homestead flock. Failure: wander, roost in trees (hard to protect), very noisy.

---

## 4. SMALL LIVESTOCK

### 4.1 Rabbits

| Mode | Pros | Cons |
|---|---|---|
| Hutch (cages) | sanitary, predator-safe, easy breeding control | labor cleaning, welfare concerns |
| Colony | natural behavior, less labor, young learn from adults | coccidiosis risk, one buck or fighting, digging escapes |

- **Production**: single commercial doe yields 125–300 lb meat/year depending on breeding cycle (4–8 litters/year × 6–10 kits).
- **Hutch size**: 30×30×18 in per doe minimum.
- **FCR**: 3–4:1 at 16–18% protein.
- **Timescales**: 31-day gestation, 8-wk grow-out to fryer.
- **Inputs**: hay (60–70%), pellets, garden greens, clean water, weeds/forage.
- **Outputs**: meat (fine-grained, low fat), pelt, manure (cold-compost-ready, 25:1–35:1 C:N, very nitrogen-rich but non-burning).
- **Failure**: heat stroke above 85°F, ear mites, enterotoxemia (coccidia bloom in hot/wet colony), predation.

### 4.2 Cuy / Guinea Pig (Andean traditional meat)

- Small (1–2 lb market), 90-day grow-out, prolific (2–4/litter × 4 litters/year).
- Houseable in floor pens in kitchen (Andean tradition — body heat + waste warmth).
- Forage: grasses, alfalfa, kitchen scraps.

### 4.3 Squab (Pigeons)

- 28-day squab (unfledged young) is tender, high-value.
- Loft housing, monogamous pairs breed year-round.
- Fly-out: self-forage grain in rural context, return to loft.
- Output: ~12–14 squabs/pair/year; guano (very high N-P — historical Inca resource).

---

## 5. GOATS & SHEEP

### 5.1 Goats

| Breed | Purpose | Milk (peak gal/day) | Notes |
|---|---|---|---|
| Saanen | dairy | 1.5–3 | top producer, heat-sensitive |
| Alpine | dairy | 1.0–2.5 | hardy, good browser |
| Nubian | dairy | 0.75–2 | high butterfat, heat-tolerant |
| Nigerian Dwarf | dairy (miniature) | 0.25–0.5 | high butterfat, small footprint |
| Boer | meat | — | fast-growing, heavy kids |
| Angora | fiber (mohair) | — | 2 shearings/year |
| Cashmere | fiber | — | undercoat combed/sheared |

- **Lactation**: ~10 months, peak 6–8 wk postpartum. Must be bred annually to keep milking.
- **Browsing**: goats eat browse (shrubs, brambles, young trees) >60% of intake — ideal for **land clearing** rotations. Will kill trees by debarking.
- **Stocking**: 6–10 goats/acre intensive, 2–3/acre extensive.
- **Failure**: parasite load (barber pole worm — FAMACHA scoring), fence escape (they WILL test everything), bloat on fresh legumes.
- **Integration**: brush clearance → followed by sheep/cattle on regrowth → chickens for sanitation.

### 5.2 Sheep

| Breed | Purpose |
|---|---|
| Icelandic | dual meat+fiber (dual coat) |
| Dorset | meat+wool, out-of-season lambing |
| Perendale, Polypay, Finnsheep | dual |
| Merino | fine wool (mostly specialized) |
| Katahdin, Dorper (hair sheep) | meat only, no shearing |
| East Friesian | dairy (500 lb milk/lactation) |

- **Grazing**: strict grazers (grass/forbs), less on browse than goats.
- **Stocking**: 3–7/acre temperate; 1–2/acre dryland.
- **Rotational grazing synergy**: sheep eat what cattle reject (thistles, weeds); cattle eat tall grass sheep leave — 30–40% stocking increase with mixed herd.
- **Parasite management**: sheep and cattle break each other's parasite cycles (different species of gastrointestinal worms).
- **Fiber**: 4–12 lb wool/sheep/year; shearing annually (spring).
- **Dairy sheep**: 150–300 lb milk/year, excellent for high-value cheese (pecorino, feta, manchego).

---

## 6. PIGS

### 6.1 Silvopasture / Woodland Pigs

- **Acorn finishing (Iberian/dehesa model)**: 0.76 pigs/ha (≈1/3 pig/acre) at pure acorn finish — stocking set so acorn supply lasts the fattening window (montanera: Oct–Feb).
- **General silvopasture**: 10–20 pigs/acre in short rotation, moved every 3–7 days to prevent soil churn/compaction.
- **Breeds**: Iberian, Mangalitsa, Berkshire, Tamworth, Gloucestershire Old Spots — foraging ability prioritized.
- **Mechanism**: pigs dig (natural rototiller) → convert tree mast & roots to protein → disturbance favors seedling succession.

### 6.2 Nose Rings Debate

- **Pro-ring**: prevents pasture destruction, allows tight grazing rotation on thin soils.
- **Anti-ring**: violates natural behavior, reduces rooting service (which you often WANT for land-clearing).
- **Game design**: toggle per paddock — ringed = pasture preservation, unringed = earthworks/clearing service, mutual exclusive.

### 6.3 Pig Rotation Integration

- Pigs after cattle: finish pasture, till, break parasite cycle.
- Pigs on compost (Salatin "pigaerator"): pigs layered into hay-bedded winter cow shed, root for corn buried in bedding → aerates compost → finished compost in spring.
- **Inputs**: grain supplementation needed for full growth (acorns/forage alone = slow finish).
- **Outputs**: 250–350 lb pig in 6–8 months pasture/woodland, 5–6 months conventional. Manure very "hot" (6:1 C:N).

---

## 7. CATTLE

### 7.1 Breeds & Role

| Breed | Type | Notes |
|---|---|---|
| Dexter | dual (mini, Irish) | 700–900 lb cow, 1–2 gal milk/day, finishes on grass 18–24 mo, 50–60% dress |
| Jersey | dairy | high butterfat, high % A2 genetics |
| Guernsey | dairy | A2 common, golden milk |
| Holstein | dairy (volume) | high A1 genetic frequency, intensive feed |
| Angus | beef | good grass finisher |
| Hereford | beef | hardy, docile |
| Highland | beef | cold-hardy, long horns, browses brush |
| Belted Galloway, Red Poll, Shorthorn | dual/heritage | homestead-friendly |

- **A2 milk**: β-casein A1 vs A2 variant differs by one amino acid (proline→histidine mutation ~5–10 k years ago). Heritage Jersey/Guernsey have higher A2 frequency. Actual human health benefit is contested in peer-reviewed studies.

### 7.2 Mob Grazing / Holistic Planned Grazing (Savory)

- **Definition**: high stock density (100,000+ lb/acre instantaneously), short graze (hours to 1 day), long recovery (60–90+ days, even 364 days on some Polyface pastures).
- **Mechanism**: mimics predator-driven herd behavior. Trampling presses plant litter onto soil (armor + carbon input). Dung/urine deposition evenly distributed. Plants grazed once then fully regrow → root mass expands → soil carbon deposited.
- **Key vs. simple rotational**: recovery period is **plant-responsive**, not calendar-fixed. In wet springs: 30 days. In drought: 120+ days.
- **Sequestration rate**: 0.5–3 tons C/acre/year in best cases (mid estimate ~1.5 t/acre in holistic grazing, 0.13–0.64 t CO₂e/acre in conservative peer-reviewed studies).

### 7.3 Greg Judy Leader-Follower

- Cattle graze first (skim top 40%), followed 1–3 days later by sheep (weeds, short grass), followed by hair-sheep lambs or chickens (finish + sanitation).
- Multi-species increases stocking 20–40% on same acreage.
- 1,620 acres, 13 leased farms — scalable to lease model (important game economic mode: lease vs own).

### 7.4 Salatin Mob-Stocker-Herbivore-Sanitation Integration

**The canonical cascade** (Polyface Farm):
1. Cows — 1 day paddock, move daily
2. Wait 3 days (fly larvae mature in cow pats)
3. Eggmobile layers — scratch pats apart, eat larvae, spread manure, add N
4. Pigaerator in winter (bedded compost)
5. Broiler tractors on separate pasture blocks (500/acre/season)
6. Rabbits → worms → chickens consume worms

Claim: 3× typical pasture productivity without external inputs.

---

## 8. DRAFT ANIMALS

| Animal | Plow rate | Strengths | Weaknesses |
|---|---|---|---|
| Horse (team of 2) | ~2 acres/day; cultivate 7 ac row crops/day | fast, responsive, 27 hp peak | heat-intolerant, requires grain, expensive |
| Ox (team) | ~1 acre/day | max torque (sod-breaking), cheap feed, long-lived (15–20 yr) | slow, no resale value |
| Mule | ~1.5 ac/day | heat-tolerant, frugal feed, surefooted | sterile (no breeding), stubborn without trust |
| Donkey | small plots, pack, cart | tiny feed, long-lived, guard animal (coyote-killer) | limited pull power |

- **Farm size**: draft-only farms historically capped ~80–200 acres.
- **Game mechanics**: draft animals = "low-carbon tractor" — convert pasture to field work, manure output as byproduct, but consume paddock area.

---

## 9. MANURE MANAGEMENT

### 9.1 Manure Comparison

| Source | C:N ratio | Heat | Plant-safe fresh? | Notes |
|---|---|---|---|---|
| Rabbit | 25–35:1 | cold | **Yes** (rare) | the "magic" manure — high N without burning |
| Cow (fresh) | 15:1 | cold | No, rest 3–6 mo | bulk; improves structure |
| Horse | 25:1 | warm | partial (weed seeds!) | good compost starter |
| Sheep/goat | 15–18:1 | warm | mostly | pelleted, easy to handle |
| Chicken (aged) | 7:1 | **hot** | no — burns | compost 4–8 wk minimum |
| Pig | 6:1 | hot | no; pathogen risk | high N, best digested in biogas |
| Human (humanure) | ~8:1 | hot (if managed) | no — thermophilic + 1–2 yr age | Jenkins method below |

### 9.2 Composting Methods

- **Hot (thermophilic)**: turned pile >130°F (55°C) kills pathogens, weed seeds, fly larvae. 4–8 weeks. Needs C:N ~25–30:1, moisture ~50%, oxygen (turn weekly).
- **Cold (static)**: 6 mo – 2 yr. Keeps more nutrients (no gaseous loss) but no pathogen kill.
- **Deep litter (in-situ)**: chicken coop or cow shed. 4–6 inches carbon base (pine shavings, straw), build to 8–12 in over season, chickens turn it by scratching, finished compost yearly. Benefits: coop warms itself, probiotic microbiome on birds, single annual muck-out.

### 9.3 Humanure (Jenkins Method)

- Bucket + sawdust cover → thermophilic outdoor bin → 1 yr active pile + 1 yr aging.
- Hits 131–160°F core → kills pathogens.
- Output: safe compost for orchard/ornamental (food crop use is legally and culturally touchy).
- Failure: insufficient cover material → odor, flies; pile too cold → not safe.

### 9.4 Biogas Digester

- **Cow**: 250–500 L methane/cow/day; ~1.2 m³ biogas (60% CH₄) per cow/day.
- **Pig manure alone**: high N, low C — **needs co-substrate** (straw, corn stover) or will sour.
- **Chicken**: high NH₃, inhibits digester — dilute heavily.
- **Family scale**: 3–5 pigs OR 1 cow + kitchen waste → 1–2 hours cooking gas/day.
- **Outputs**: biogas (cooking/lighting/generator), slurry (liquid fertilizer, higher plant-available-N than raw manure).
- **Failure**: cold climate (mesophilic 35°C optimum), feed-rate spikes, toxic batch.

### 9.5 Urine Fertilizer

- 90%+ of the nitrogen in human waste is in urine (sterile when fresh).
- Diluted 1:10 → direct fertilizer on non-edible or row crops.
- Key mineral: phosphorus — globally constrained resource, urine = closed loop.

---

## 10. LIVESTOCK GUARDIAN ANIMALS

| Guardian | Good against | Weakness | Notes |
|---|---|---|---|
| Great Pyrenees | coyote, fox, bobcat | heat, fence-digger, night barker | stays with flock, 5 dogs / 350 sheep ratio |
| Anatolian Shepherd | bear, mountain lion | heat-tolerant, more active patroller | aggressive with strangers |
| Maremma, Akbash, Karakachan, Kangal | predators up to bear | each breed specializes | import/registry cost |
| Donkey (single, gelded/jenny) | coyote, fox | gelded only (not with sheep lambs) | 1–2/pasture, eats what goats won't |
| Llama | coyote, fox | useless vs multi-predator | gelded male best; pairs bond to each other, not flock |

- **Game mechanic**: predator pressure map (coyote density varies by region/season); guardian radius reduces predation probability. Wrong guardian for threat = no effect. LGDs need bonding from puppyhood (skill/time investment).

---

## 11. WILDLIFE INTEGRATION

- **Hedgerows**: linear wooded strips → corridors, birds (pest control), parasitoid wasps, pollinators. 10–30% of farm in hedge → maximize biodiversity without major yield hit.
- **Beetle banks**: 2-m raised tussock-grass strips through fields, ≤150 m spacing; overwinter refuge for Carabidae (ground beetles) — slug, caterpillar, snail predators.
- **Bat boxes**: 1 bat eats 600–1,000 mosquitoes/hour; major night-moth predator (codling moth, cutworm).
- **Owl boxes**: barn owl pair eats ~2,000 rodents/year → orchard/grain-store game multiplier.
- **Riparian buffer**: 10–30 m wooded strip along watercourses → filters nitrate, stabilizes banks, shades water (fish habitat).
- **Wildlife corridor**: ≥30 m wide continuous native vegetation linking habitat fragments.

---

## 12. ATMOSPHERIC / CLIMATE SCALE

### 12.1 Soil Carbon Sequestration (tuning numbers)

| Practice | C sequestration (t/acre/yr) | Notes |
|---|---|---|
| Cover cropping | 0.22–0.64 (median 0.55 CO₂e) | 90% of plots sequester positively, 28% >1 t/ac |
| Regenerative grazing | 0.5–3 | wide range, mid ~1.5 |
| Holistic planned grazing | 0.13–1.45 | conservative peer-reviewed |
| Silvopasture | 2–5 | high because trees + soil stacked |
| Agroforestry (alley cropping) | 1–4 | |
| Biochar application | 5–10 (one-time, 500–1000 yr stable) | front-loaded |
| No-till | 0.1–0.5 | lower than claimed if not combined with other practices |
| Compost application | 0.2–1 per application | scales with tons applied |

**Game model**: each practice tile produces ongoing atmospheric C-drawdown score + soil organic matter increase; soil OM increases water-holding capacity (drought buffer) and CEC (nutrient storage).

### 12.2 Biotic Pump (Makarieva)

- **Theory**: forests generate continental-scale winds by condensation-driven pressure drops. Water vapor → liquid = 2000× volume collapse → partial vacuum → sucks moist ocean air inland.
- **Evidence**: rainforests maintain constant precipitation hundreds of km inland; deforestation correlates with inland drying (Amazon, Congo).
- **Game implication**: forest cover at continental scale modulates downwind precipitation. Clearing coastal forest can reduce interior rainfall on a decadal scale — a macro-scale feedback worth simulating as a global map variable.
- **Controversy**: contested by mainstream meteorology; directional but not well-quantified.

### 12.3 Evapotranspiration & Microclimate

- One mature oak evapotranspires ~40,000 gal/year → localized cooling 2–5°C under canopy.
- Pond-adjacent plants gain 1–2 frost-free weeks each side of season (water's thermal mass).
- Rock outcrop: stores day heat, re-radiates at night, creates microclimate 1 USDA zone warmer (Holzer documented this).
- South-facing stone wall: apricot/fig possible 2 zones north of mapped range.

### 12.4 Windbreak / Shelterbelt

- **Protected zone**: 10–20× windbreak height downwind at 50% permeability.
- **Yield increase**: wheat +22%, oats +22%, lupins +30%, dairy milk +10–20%, crop yield average +30% in protected zone. Greater in arid/dry years.
- **Design**: 40–60% permeability (solid walls cause turbulence on the lee), 3+ rows (shrub–tall shrub–tree), perpendicular to prevailing wind.
- **Footprint cost**: shelter uses 5–10% of field area but delivers net yield gain.

### 12.5 Frost Management with Water Bodies

- 1 m³ water cooling 1°C releases ~1.16 kWh heat.
- Pond upwind of orchard → delays spring bud-break; downwind → frost protection at flowering.
- Holzer Krameterhof uses 70 ponds at 1100–1500 m elevation to grow citrus and kiwi well outside their zone.

---

## 13. WHOLE-SYSTEM FRAMEWORKS

### 13.1 Holistic Management (Savory)

- Goal-setting → decision matrix (testing questions: root cause, weak link, sustainability, energy/money, cause/effect, society/culture, gut check).
- Holistic Planned Grazing chart (paddock grid × calendar months).
- Core claim: "brittle environments" (seasonally dry grasslands) require herd impact to cycle litter.
- Scientific status: contested — field trials mixed; claimed climate solution overstated, but land-level regeneration well documented on managed ranches.

### 13.2 Keyline Design (Yeomans)

- Reads landscape topography: identify **keyline** (point where valley slope changes from concave to convex).
- Cultivate **parallel to keyline** with slight 1% fall toward ridges — reverses natural water concentration in valleys, spreads moisture onto dry ridges.
- **Yeomans plow** (subsoiler): lifts and fractures subsoil without inversion → breaks hardpan → allows roots + organic matter downward → 1–3 cm topsoil deepening per year possible.
- Layout sequence: ridge-planting pattern → tree lines → dams on keyline → roads → fences → soil → trees → pasture → crops.

### 13.3 Fukuoka (Natural Farming)

- **Four principles**: no tillage, no fertilizer (no compost even), no weeding (chop-and-drop), no pesticides.
- **Seed balls** (*tsuchi dango*): clay+compost+seed — broadcast over uncultivated ground, clay protects from birds/insects until rain.
- **Relay cropping**: rice into barley stubble, barley seeded into rice stubble — continuous cover year-round.
- Yields comparable to intensive Japanese conventional after 20+ years of soil-building.
- Game caveat: very long timescale to reach equilibrium — years of lower yield before the system matches conventional.

### 13.4 Korean Natural Farming (Cho Han Kyu)

Core fermented inputs (player can craft):

| Input | Recipe | Use |
|---|---|---|
| IMO (Indigenous Microorganisms) | cooked rice under forest leaf litter → culture stages 1–5 | foundational inoculant |
| FPJ (Fermented Plant Juice) | 1:1 plant tops : brown sugar, 7 days | growth stimulant (vegetative) |
| FFJ (Fermented Fruit Juice) | 1:1 ripe fruit : brown sugar | flowering/fruiting stimulant |
| FAA (Fish Amino Acid) | 1:1 fish waste : brown sugar, 7–10 days | nitrogen source |
| OHN (Oriental Herbal Nutrient) | alcohol extract: garlic, ginger, licorice, cinnamon, angelica | disease resistance |
| WCA (Water-soluble Calcium) | vinegar + roasted eggshells/bones | calcium foliar |
| WCP (Water-soluble Calcium Phosphate) | vinegar + roasted bones | flowering phosphate |
| LAB (Lactic Acid Bacteria) | rice wash water + milk culture | gut health + soil flora |

- Minimal external input; all from on-farm or kitchen waste.
- Emphasis on **nutritive cycle stages** matched to plant growth stage — game mechanic: applying the wrong input to the wrong growth stage wastes it or harms the plant.

### 13.5 Mark Shepard — Restoration Agriculture

- **Temperate oak savanna mimic** = 30–60% canopy closure (the biome with highest mammal biomass globally).
- 106-acre New Forest Farm: ~6 million cal/acre/year (>2× conventional corn), no replanting after establishment, no fossil fuel.
- **STUN**: Strategic Total Utter Neglect — plant at very high density (10× final target), select survivors. "Nature selects for you."
- **Chestnut, hazelnut, apple, pear, grape, currant** + pasture + pigs/cattle/chickens → all stacked on same acre.
- Game mechanic: **establishment phase (5–10 years)** of low yield before STUN-selected perennial canopy becomes productive; long ROI but then very low-labor output.

### 13.6 Sepp Holzer (Krameterhof)

- 45 ha @ 1100–1500 m altitude (harsh alpine).
- **Raised beds (Hügelkultur)** — wood buried in mounds, decomposes over 20 yr providing nutrients + water retention.
- **70 unlined ponds** — natural clay sealing via construction technique (sift fine soil, compact). Fish, duck, geese, crayfish, microclimate reflectors.
- **Rock stacks** — thermal mass extends growing season, microclimate Zone shift.
- **Animals**: pigs (land clearing), highland cattle, chickens, ducks.
- Motto: "less labor, more thinking."

### 13.7 Geoff Lawton Design Methodology

- **Zone 0–5** (house → wilderness) — intensity of visits decreases outward.
- **Swale**: level earthwork on contour — captures runoff, infiltrates to recharge groundwater.
- **Dam on keyline**: store water at highest usable elevation.
- Chicken tractor moves weekly through orchards.
- Greywater → reed bed → infiltration.

---

## 14. HISTORICAL & INDIGENOUS SYSTEMS

### 14.1 Terra Preta (Amazonian Dark Earth)

- **Composition**: charcoal (from low-temp smoldering), pottery shards (porous ceramic — microbial housing), bones, ash, manure, food waste, fish scraps.
- **Mechanism**: biochar surface area (~300 m²/g) hosts microbes, binds cations, retains water. Self-regenerates: 1 cm/year in some sites even without further inputs.
- **Creation window**: 450 BCE – 950 CE.
- **Depth**: 1–2+ m deep in patches, 10–40% charcoal by weight.
- **Modern analog**: biochar agriculture. Biochar pyrolysis (400–600°C, low O₂) → stable C for 500–1000 yr.
- **Game**: terra preta as endgame soil tier — requires sustained kitchen-midden activity + charcoal production over decades.

### 14.2 Chinampas (Aztec Floating Gardens)

- **Construction**: rectangular beds 6–10 m wide × 100–200 m long built of alternating layers of lake mud + vegetation on braided reed frames in shallow lakes.
- **Productivity**: **7 harvests/year** — 13× typical rainfed land productivity.
- **Sustained Tenochtitlán** (pop. 200,000+).
- **Mechanism**: capillary rise keeps soil moisture constant, canal water carries nutrients, edges planted with willow (ahuejote) stabilize + provide timber, small fish live in canals (polyculture).
- **Crops**: maize, beans, squash, amaranth, tomato, chile, flowers.
- **Failure**: salinization if lake chemistry changes; modern Xochimilco threatened by urban runoff.

### 14.3 Milpa (Three Sisters)

- **Corn** — vertical pole.
- **Beans** — nitrogen fixation via *Rhizobium* root nodules; climbs corn.
- **Squash** — ground cover, suppresses weeds, spiny leaves deter browsers.
- **Yield**: intercrop out-produces each monoculture; soil respiration +24%, N-cycling +32% C:N, salt-extractable nitrate −54%.
- **Rotation**: 2–4 years milpa → 7–15 year fallow (forest regrowth); the long fallow is the sustainability key.
- **Extensions**: chia, amaranth, chili, tomato, tobacco sometimes added as 4th/5th sisters.

### 14.4 Oak Savanna Fire Management

- Indigenous N. American practice: annual low-intensity burns keep savanna open, acorn & hazelnut yield high, forage for deer/elk.
- Fire-tolerant oak seedlings selected; fire-intolerant mesic species excluded.
- Game: fire-tool with player-skill risk (escape, too hot = kills mature trees).

### 14.5 Zai Pits (Sahel)

- **Design**: 20–40 cm dia × 10–15 cm deep holes on degraded land; filled with 0.5–1 kg manure/compost; millet or sorghum sown.
- **Mechanism**: pits capture rain (runoff), termites (*Trinervitermes*) are attracted to the manure and dig galleries → deep water infiltration → restores hardpan soils.
- **Scale**: 6 M ha restored in Burkina Faso, 200 M trees planted, food security for 3 M people.
- **Labor**: extremely high — ~60 person-days/ha to dig, but lasts years.
- **Yacouba Sawadogo** — "the man who stopped the desert" UN Champion of the Earth.

### 14.6 Qanat (Persian subterranean aqueduct)

- Gently sloping tunnel from aquifer at foothill to village — gravity-fed, evaporation-free.
- Maintenance: vertical shafts every 20–50 m for air + spoil removal.
- Lifetime: >1000 years in some cases.
- Game: capital-intensive one-time build, ~0 operating cost, massive water resource.

### 14.7 Paddy Rice Terraces

- **Banaue (Philippines)**, **Longji (China)**, **Bali (subak)** — 1000–2000 year old continuous production.
- Terraces = water-level platforms; water cascades through system, arriving warm and siltier to lower fields (nutrient distribution).
- Integrated with fish, ducks, water buffalo, shrimp.
- **Subak** is a spiritual + irrigation governance system — water-sharing precedence.

---

## 15. ECONOMICS / YIELD BENCHMARKS

### 15.1 Market Channels (Revenue per Unit Acre)

| Channel | Typical $/ac range | Labor intensity | Notes |
|---|---|---|---|
| Commodity grain | $500–1,500 | low | price-taker |
| CSA vegetable | $15,000–40,000 | very high | ~$400–700/share/yr × 50–200 shares |
| Farmers market | $10,000–50,000 | high | 60% of day lost to market |
| U-pick berry | $5,000–20,000 | medium | value on agritourism |
| Wholesale organic veg | $5,000–15,000 | medium | |
| Salatin-style pastured (multi-enterprise) | $3,000–8,000 stacked | high | per-acre sum of stacked enterprises |
| Tree-crop perennial (est'd) | $2,000–10,000 | low after establishment | decade-long ROI |
| Value-added (cheese, mead) | 3–10× raw commodity | skill-gated | license/regulatory hurdle |

### 15.2 Value-Added Products

- **Cheese**: raw milk → aged cheese 5–15× milk value, 60–120 day minimum aging for legal raw-milk cheese (US).
- **Mead / cider / beer**: 3–8× honey/fruit value, fermentation cellar needed.
- **Dried goods**: herbs, mushrooms, tomatoes — shelf-stable, off-season income, low barrier.
- **Fermented**: sauerkraut, kimchi, kvass, kombucha — probiotic health claim premium.
- **Medicinal herbs**: tinctures, salves — very high margin, regulatory care.
- **Meat cuts**: 2–3× "whole animal" value if butcher-skilled.

### 15.3 Agritourism

- Farm stays, workshops, weddings, pumpkin patches, farm-to-table dinners.
- Can be 20–50% of farm revenue without occupying any new acres — revenue from story, not calories.

---

## 16. INTEGRATED STACKING — KEY PATTERNS

**"Stack function per element"** (Mollison). Each animal tile should perform ≥3 services. Examples:

| Element | Primary | Secondary | Tertiary | Quaternary |
|---|---|---|---|---|
| Chicken | eggs/meat | pest control | manure | compost turner (deep litter) |
| Duck | eggs/meat | slug control | pond maintenance | fly larvae eater |
| Pig | meat | land-clearing | compost-aerator | tree-mast cycler |
| Goose | meat/down | weeding (grass-selective) | guard | mower |
| Sheep | fiber/meat | fine-grazing (cattle follower) | parasite break (vs. cattle) | lawn-mower |
| Cow | meat/milk | mob-grazing trigger | hide/bone | manure bulk |
| Horse | draft | manure (hot) | meat (rare) | recreation/tourism |
| Bee | honey | pollination (>> honey in $) | wax | bee-venom/propolis |
| Rabbit | meat | cold manure | fiber (angora) | vermi-compost source |
| LGD | guard | companion | early-warning | deterrent scent |

**Game mechanic idea**: each animal tile has a "stacking score" displayed — more stacked services = more efficient use of land. The game rewards systems where one tile benefits multiple adjacent tiles.

---

## 17. FAILURE MODES CATALOG (systemic)

- **Parasite accumulation** — if rotation breaks, worm/mite/flea loads spike. Multi-species rotation is the main defense.
- **Oxygen crash** (pond) — overstocked pond, hot still night → fish kill by morning.
- **Bloat** (ruminant) — sudden legume-heavy forage → gas cannot escape rumen → lethal within hours.
- **Heat stroke** (rabbit, pig, dairy cow) — >85°F with no shade/mister.
- **Frost kill** — ignored frost warning destroys orchard bloom (yearly crop lost in hours).
- **Predator break-in** — single fox can kill 30 chickens in a night; LGD absent = catastrophe.
- **Disease outbreak** — density-dependent; pastured systems have much lower floor but still vulnerable to avian flu, FMD, CWD.
- **Water loss** — broken waterline in summer = emergency.
- **Fence failure** — animals into neighbor's field, road, garden.
- **Burn-out (labor)** — CSA season-5 collapse pattern; farmer quits despite profit.

---

## 18. LABOR / SKILL TREE SUGGESTION

Tier 1 (chore): daily feed/water, egg collection, milking.
Tier 2 (craft): fence-building, compost management, sheep shearing, hoof trimming.
Tier 3 (husbandry): breeding, dystocia assistance, disease diagnosis, bee swarm capture, artificial insemination.
Tier 4 (design): rotation planning, keyline survey, watershed restoration, grafting, value-added processing.
Tier 5 (systems): multi-species integration, holistic management chart, agritourism business, landrace breed development.

Each animal adds daily chore-load (minutes/day) independent of its benefit. Player is rewarded for designing systems where animals do most of the work (chicken tractor auto-tills, pig auto-composts, geese auto-weed).

---

## 19. SUGGESTED RESOURCE / CYCLE SUMMARY (for engine design)

**Core resources**: water, sunlight, nutrients (N/P/K/Ca), organic matter, forage biomass, grain, labor-hours, money, knowledge points.

**Key cycles to model**:
- Carbon: atmosphere ↔ biomass ↔ soil OM ↔ decomposition → atmosphere
- Nitrogen: legume fix / lightning / manure → soil → plant → animal → manure; losses via leaching, denitrification
- Water: rain → infiltration (affected by OM %, keyline plow) → soil storage → ET → cloud → rain (local and biotic-pump mediated)
- Pollination: flower availability × pollinator population × weather window
- Pest/predator: prey population × predator population × habitat heterogeneity
- Pathogen load: per-species, per-tile, decaying with rest days

**Atmospheric slow variables** (global over decades):
- soil carbon stock
- continental forest cover → biotic pump strength
- albedo (vegetation type)
- evapotranspiration → cloud formation

---

## 20. CORE REFERENCE URLS (for sourcing follow-up research)

**Grazing & whole systems**
- Savory — holistic planned grazing: https://savory.global/holistic-planned-grazing/ and https://savory.global/wp-content/uploads/2017/02/about-holistic-planned-grazing.pdf
- Savory vs high-density contrast: https://savory.global/high-stock-density-grazing-holistic-planned-grazing/
- Joel Salatin pasture model: https://www.westonaprice.org/health-topics/farm-ranch/pastured-poultry-the-polyface-farm-model/
- Salatin animal rotation discussion: https://permies.com/t/56664/Joel-salatin-animal-rotation
- Greg Judy multi-species: https://www.stockmangrassfarmer.digital/blog/multi-species-adds-income-and-soil-wealth-to-farms-by-greg-judy and podcast episodes https://podcasts.apple.com/us/podcast/the-pros-and-cons-of-multi-species-grazing-with-greg/id1597385678?i=1000545758214
- Mark Shepard / Restoration Agriculture: https://permacultureapprentice.com/mark-shepard-new-forest-farm/ and https://www.actionecology.com/journal/?post=mark-shepard
- Sepp Holzer Krameterhof: https://krameterhof.at/en/krameterhof-farm/ and https://www.permaculture.co.uk/articles/sepp-holzers-permaculture/
- Yeomans keyline: https://yeomansplow.com.au/8-yeomans-keyline-systems-explained/ and https://en.wikipedia.org/wiki/Keyline_design
- Fukuoka: https://en.wikipedia.org/wiki/Masanobu_Fukuoka and https://www.undp.org/sites/g/files/zskgke326/files/migration/tl/DARDC-Fukuoka-Technique_English-compressed.pdf
- Korean Natural Farming: https://en.wikipedia.org/wiki/Korean_natural_farming and https://ilcasia.files.wordpress.com/2012/02/chos-global-natural-farming-sarra.pdf and https://growingformarket.com/articles/an-introduction-to-Korean-Natural-Farming

**Bees & insects**
- Hive comparison: https://beekeepclub.com/langstroth-top-bar-and-warre-beehive-comparison/ and https://www.motherearthnews.com/homesteading-and-livestock/the-difference-between-top-bar-vs-warre-vs-langstroth-hives-zbcz1608/
- Mason/leafcutter: https://www.canr.msu.edu/news/mason_and_leafcutter_beekeeping and https://news.vt.edu/articles/2020/03/ext-entomologists-tips-for-installing-and-maintaining-native-bee-houses.html
- Beneficials: https://www.almanac.com/beneficial-insects-garden and https://savanagarden.com/blogs/raised-beds-gardening-blog/ladybugs-lacewings-parasitoid-wasps-your-garden-s-top-protectors
- Beetle banks: https://conservationevidence.com/actions/651 and https://news.oregonstate.edu/news/farmers-bank-beetles-pesticide-free-approach-pest-management
- BSFL composting: https://extension.entm.purdue.edu/publications/E-276/E-276.html and https://www.nature.com/articles/s41598-023-48061-0

**Aquaculture**
- Chinese carp polyculture: https://en.wikipedia.org/wiki/Aquaculture_in_China and https://www.fao.org/4/ac264e/AC264E05.htm
- Aigamo: https://en.wikipedia.org/wiki/Takao_Furuno and https://kokorocares.com/blogs/blog/rice-farming-with-ducks-the-art-of-aigamo-in-japan and https://theazollafoundation.org/features/rice-duck-azolla-loach-cultivation/
- Aquaponics: https://gogreenaquaponics.com/blogs/news/the-fish-to-plant-ratio-in-aquaponics and https://www.howtoaquaponic.com/fish/tilapia-aquaponics/

**Poultry / livestock**
- Pastured poultry: https://www.westonaprice.org/health-topics/farm-ranch/pastured-poultry-the-polyface-farm-model/ and https://rodaleinstitute.org/blog/how-to-establish-a-small-scale-pastured-poultry-operation/
- Deep litter: https://the-chicken-chick.com/the-deep-litter-method-of-waste/ and https://www.motherearthnews.com/homesteading-and-livestock/deep-litter-method-zb0z1208zmat/
- Guinea fowl: https://thepeasantsdaughter.net/guinea-fowl-for-tick-control-eggs-meat/ and https://pmc.ncbi.nlm.nih.gov/articles/PMC11279834/
- Silvopasture pigs: https://attra.ncat.org/working-the-woods-with-pigs-practical-tips-for-silvopasture-success/ and https://cdn.intechopen.com/pdfs/34866/InTech-Consumption_of_acorns_by_finishing_iberian_pigs_and_their_function_in_the_conservation_of_the_dehesa_agroecosystem.pdf
- Dexter cattle: https://livestockconservancy.org/dexter-cattle/ and https://www.dexterstoday.com/about-dexter-cattle
- Goat breeds: https://cals.cornell.edu/nys-4-h-animal-science-programs/livestock/goats/goat-fact-sheets/dairy-goat-breeds and https://www.bivatec.com/blog/the-top-10-goat-breeds-for-milk-production
- Sheep dual-purpose: https://www.iamcountryside.com/sheep/sheep-breeds-for-fiber-meat-or-dairy/ and https://www.woolwise.com/wp-content/uploads/2017/07/WOOL-412-512-12-T-29.pdf
- Rabbit colony/production: https://homesteadingfamily.com/raising-rabbits-for-meat/ and https://morningchores.com/raising-rabbits/
- LGD: https://www.akc.org/expert-advice/dog-breeds/get-to-know-the-livestock-guardian-dog-breeds/ and https://en.wikipedia.org/wiki/Livestock_guardian_dog
- Draft animals: https://attra.ncat.org/publication/draft-animal-power-for-farming/ and https://grownorthwest.com/2010/08/draft-power-using-horses-oxen-and-mules-on-the-farm/

**Manure / humanure / biogas**
- C:N comparison: https://www.ndsu.edu/agriculture/extension/publications/composting-animal-manures-guide-process-and-management-animal-manure-compost and https://homesteadontherange.com/2018/08/27/cn-ratios-of-common-organic-materials/
- Jenkins humanure: https://humanurehandbook.com/ and https://humanurehandbook.com/instructions.html
- Biogas: https://extension.psu.edu/biogas-from-manure and https://attra.ncat.org/publication/micro-scale-biogas-production-a-beginners-guide/

**Atmospheric / climate**
- Soil C sequestration: https://www.frontiersin.org/journals/sustainable-food-systems/articles/10.3389/fsufs.2023.1234108/full and https://rodaleinstitute.org/wp-content/uploads/Rodale-Soil-Carbon-White-Paper_v11-compressed.pdf
- Biotic pump (Makarieva): https://en.wikipedia.org/wiki/Biotic_pump and https://hess.copernicus.org/articles/11/1013/2007/ and https://www.science.org/content/article/controversial-russian-theory-claims-forests-don-t-just-make-rain-they-make-wind
- Windbreak: https://www.mdpi.com/2077-0472/15/11/1204 and https://www.montana.edu/extension/lila_extn/WindbreaksandShelterbeltsArthereallyworthit.html

**Historical / indigenous**
- Terra preta: https://en.wikipedia.org/wiki/Terra_preta and https://www.biochar-journal.org/en/ct/4
- Chinampas: https://en.wikipedia.org/wiki/Chinampa and https://www.britannica.com/topic/chinampa
- Milpa / Three Sisters: https://www.nal.usda.gov/collections/stories/three-sisters and https://en.wikipedia.org/wiki/Three_Sisters_(agriculture) and https://pmc.ncbi.nlm.nih.gov/articles/PMC9288846/
- Zai pits: https://www.weforum.org/stories/2023/08/zai-technique-sahel-farmers-adapt-climate-change/ and https://e-catalogs.taat-africa.org/gov/technologies/zai-pits-water-harvesting-and-soil-improvement

**Fungi / whole-system**
- Paul Stamets: https://paulstamets.com/mycorestoration/helping-the-ecosystem-through-mushroom-cultivation and https://www.biohabitats.com/newsletter/fungi/expert-qa-paul-stamets/

---

*Document intended as design reference for the permaculture simulation. Numbers are canonical defaults tuned to real-world ranges; the model should allow breed/climate/soil modifiers on top of these.*
