# Replayability — mechanics for repeat value

**Thesis:** the BC coastal farm is a *place*, not a script. The game's core loop (soil → plants → animals → soil) is deep enough to run for dozens of hours on one farm, but the things that make it *worth starting a new farm* are: a different seed, a different climate, a different challenge constraint, and a different **personal goal**. This doc specs the systems that make the second, fifth, and twentieth run feel fresh.

## 1. Seed system

The world seed governs every procgen roll at worldgen: stream path, ridge placement, starting plant scatter, ruin coordinates, initial rocky outcrops, biome variance.

- Seed is an int displayed on the HUD inspector (hidden by default, expandable).
- Default: `randi()` at New Farm time, unless user provides one.
- **Challenge seeds** — a curated set in `data/challenge_seeds.json`:
  - `42` — "The Quiet Valley" — default / tutorial-friendly, gentle slope, easy stream, rich ruin.
  - `1871` — "Cascade Pass" — steep slopes, forced terracing play.
  - `2077` — "Desert-Me" — dry variance spike, drought-every-summer.
  - `1906` — "The Great Flood" — wet variance, frequent storms.
  - `3141` — "Ridge-Line" — no stream — must dig well / rain-catch early.
  - `9001` — "The Rock Garden" — triple stone outcrops, weak soil — stone-heavy play.
- **Seed sharing:** top-right "Share seed" button copies `seed#config` to clipboard (e.g. `42#bc-coastal#challenge-drought`). Paste in New Farm's seed field → identical farm.
- Implementation: `Game.world_seed: int`. All procgen uses a seeded `RandomNumberGenerator`. Each system owns a sub-seed (`seed + hash("terrain")`) so adding new procgen systems doesn't shift existing ones.

## 2. Biome variants (future)

BC Coastal ships. Each future biome overrides climate, starting species, ambient art. Stubbed on intro screen as "Coming in Content Pack 2".

| Biome | Climate delta | Starting plants | Hero mechanic |
|---|---|---|---|
| Boreal Forest | shorter season (90 days), harsh winter, late spring | pine, blueberry, fireweed, yarrow | permafrost-pocket microclimate play; moose as megafauna |
| Tropical Lowland | 2 harvests/year, year-round bugs | banana, sweet potato, taro, moringa | alley-cropping + rot-heavy compost; chickens thrive |
| Inland Prairie | low rainfall, wide-open terrain, heat | bunchgrasses, sunflower, amaranth | swale + keyline emphasis; bison mob-grazing; dust storms |

Each biome is a JSON pack under `data/biomes/<id>.json` + a `data/ecosystem/<id>.json` (species pool).

## 3. Daily events (spice)

On the day-tick, a low-probability event roll (one of ~25 entries, 10 % chance/day, cooldown 3 days between). Event examples:

- **Travelling merchant** — a merchant cart appears at the road tile for 2 days; trades meat/eggs for rare seed packets or bee queens.
- **Stray animal** — a feral chicken / semi-wild goat wanders in. Adopt (+stock) or chase off (+5 morale).
- **Dead log discovery** — forest edge drops a 40-wood deadfall. Free wood if claimed within 3 days before a woodpecker starts eating it.
- **Seed discovery** — foraging fairy finds a rare heritage seed (unlocks a plant from a future tier for one planting).
- **Wandering fairy** — an unaffiliated fairy offers to join (+1 to fairy count bypassing normal growth).
- **Old letter** — a parchment scrap found in the ruin hints at a buried tool / seed cache (pin revealed on map).
- **Lost duckling** — save it for a free duck pair next spring, or let it go.
- **Bear visit** — passes through, eats 2 apples, leaves scat (+manure on path tiles).
- **Salmon scout** — a single coho appears in the stream; promises a run if riparian health stays above threshold.
- **First frost whisper** — 2-day warning banner before autumn frost.
- **Rainbow over ruin** — cosmetic only, fairies crowd around; +5 morale.
- **Windfall apples** — wild crabapple drops a burst of fruit on the ground tiles.
- **Comfrey bloom** — wild comfrey patch is K-charged today; chop-and-drop yields double.
- **Hummingbird arrival** — indicator species banner; requires flower diversity ≥ 6.
- **Neighbor's lost goat** — return for trade favor; keep for guilt debuff.
- **Moss bloom** — moisture + shade hits a threshold, moss carpet spreads one tile (looks beautiful).
- ...(continue to 25+)

Events fire as paired feedback: parchment banner, camera pan, audio cue, optional player choice dialog. `data/daily_events.json` stores entries. Implementation: `autoload/event_system.gd` rolls daily, filtered by conditions (season, vitality, built structures).

## 4. Challenge modes

Toggleable at New Farm time. Can stack.

- **Drought Year** — rainfall × 0.4 all summer, +20 % evap. Mitigation: pre-build earthworks.
- **Abundant Year** — rainfall × 1.3, species arrival rate × 1.5. Easier, but pest-pressure also rises.
- **Cold Snap** — 5 extra frost days in spring + autumn. Row-cover / greenhouse critical.
- **Late Spring** — growing season starts 10 days later. Forces early-compost + sprouting-bed focus.
- **No Stream** — spawns without the freshwater stream; must dig a well or rely 100 % on rain.
- **Ruin-rich** — doubles the ruin POI count; more salvage seeds + stone, harder initial cleanup.
- **Old-Growth-Close** — forest edge starts 20 tiles closer; more wood + shade + predators.
- **Single-Fairy** — you control one fairy forever (no population growth). Pure puzzle mode.
- **Hurricane Year** — one guaranteed major storm in autumn. Prep matters.

UI: checklist on the New Farm biome card. Each toggle shows an estimated "difficulty delta" (+0.3 / -0.2).

## 5. Achievements (target: 25+)

Parchment-bound journal opens from HUD. Each achievement a stamp icon.

1. **First Dig** — place first compost pile.
2. **The Compost Trinity** — harvest compost 3 times.
3. **Sapling to Sanctuary** — plant first tree.
4. **Fairy Dozen** — reach 12 fairies.
5. **Full Swarm** — reach 100 fairies (end-state).
6. **Bronze Soil** — push any tile to OM 3 %.
7. **Silver Soil** — push any tile to OM 5 %.
8. **Gold Soil** — push any tile to OM 10 % (climax).
9. **Honeymaker** — produce first honey (a4 unlocked).
10. **The Milkmaid** — produce first milk (c3 unlocked).
11. **Orchard Day** — first fruit from a planted tree.
12. **Salatin Cascade** — rotate cow → chicken → pig in one week.
13. **Three Sisters** — plant corn + bean + squash in one plot.
14. **Food Forest Climax** — unlock cx-food-forest.
15. **Watershed Regenerated** — unlock cx-watershed.
16. **Salmon Return** — first coho spawns in restored stream.
17. **Biodynamic Initiate** — first BD500 prep.
18. **Seed Vault** — unlock e6.
19. **Firefly Night** — vitality > 0.7 at night with fireflies visible.
20. **Truffle** — spawn a truffle (requires 10 % OM oak/hazel guild, 5+ game-years).
21. **Zero Waste Year** — end a year with zero expired compost / wasted fruit.
22. **Bear-Proof** — no bear-caused losses for 3 game-years.
23. **No-Till Hero** — reach climax with no-till only (never break soil).
24. **Winter Alive** — keep vitality > 0.5 through a winter.
25. **Comfrey Monk** — apply 50 comfrey-tea doses.
26. **Mycoremediator** — clear all ruin tiles via fungi.
27. **Hundred-Year Oak** — raise an oak to age 100 (decades mode).
28. **Chanterelle Wild** — wild chanterelle spawns on your farm.
29. **Cat Savior** — 1 full in-game year with a cat, zero seed loss.
30. **LGD Loyal** — LGD dog prevents ≥ 5 predator events in its lifetime.

Saved in `user://achievements.json`. Unlocked stamps persist across runs — a global player profile, not per-farm.

## 6. Decades mode

At climax, a parchment dialog: "The farm has climaxed. Do you want to close this chapter, or keep watching?" Choosing **Keep** enters **Decades mode**:

- Time-step accelerates 4× available (day = 15 s instead of 60).
- Rare species colonize over long stretches: truffle (year 10+), chanterelle (year 15+), pileated woodpecker (year 8+), marbled murrelet (year 20+ at >80 % old-growth neighbor cover), bobcat (year 12+).
- Trees hit old-growth stats (yield × 1.2 fruit, wood × 2.5).
- Achievements for century-old trees, multi-generation seed breeding.
- Ambient "gentle decay + renewal" events — lightning strikes a tree → snag → cavity-nester bird arrives → new niche.

This is the "zen garden" endgame — no pressure, just watch it mature.

## 7. Mentor run (NG+)

After your first climax, unlock **Mentor Run**. Start a new farm with:

- Some Ring 1 unlocks pre-unlocked.
- A "wisdom" resource that grants +1 starting fairy, +1 starting seed pack of a chosen plant, a bound journal with hints.
- Challenge gauge bumped one tier — base difficulty harder.
- Achievement tracking transfers, but farm-local progress does not.
- Optional: choose a "mentor focus" (Orchardist, Beekeeper, Aquaculturist, Herbalist) that gives +25 % to that branch's starting yield and +10 % labor efficiency for related tasks.

Implementation sketch: `Game.mentor_level: int` tracked in player profile. At New Farm, if mentor_level > 0, branch off into the mentor setup flow.

## Implementation summary

- `Game.world_seed: int` + seeded RNG subclasses.
- `data/challenge_seeds.json` + `data/daily_events.json`.
- `autoload/event_system.gd` — rolls daily events.
- `user://achievements.json` + `user://profile.json` — global player state.
- `Game.challenge_flags: Dictionary` — checked at worldgen + runtime.
- Biome-pack loaders — already in `data/biomes/` pattern; new biomes drop in as JSON files.
- Decades-mode is a runtime flag on `Scheduler` that changes day-length.

Sources consulted: `DESIGN.md §Progression rings`, `data/biomes/bc-coastal.json`, `data/branches.json`, feedback_visceral_world_progression.md, project_animal_system.md, Savory / Sepp Holzer / Mollison on long-horizon landscape change.
