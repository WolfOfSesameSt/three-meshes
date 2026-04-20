# Weather Event System

**Purpose:** Weather is the drumbeat the permaculturist plans against. A calm farm is boring; a farm that faces drought, storm, frost, and wet-week over a year and survives on **design** (earthworks, mulch, shade, polyculture) is the core fantasy. Events apply *pressure* that the design-literate player has already planned for — and the novice learns from missing.

**Shipping in lockstep with:** `autoload/world_state.gd` (time/season), `autoload/scheduler.gd` (day-tick), `autoload/juice.gd` (paired feedback), the `soil_moisture` system (DESIGN.md §Water & moisture retention), and the pond/swale/hugel earthworks.

## Calendar context

BC Coastal year (from `data/biomes/bc-coastal.json`):
- 120 days/year, 30 days/season (Spring → Summer → Autumn → Winter).
- Baseline rainfall chance/day already set per-season.
- Frost chance baseline already set per-season.

Weather **events** are discrete multi-day modifiers layered on top of the baseline weather.

## Event catalog

### Drought
- **Trigger:** 10+ rain-free days in summer (or 7+ in a Drought-Year challenge run).
- **Duration:** rolls 5–15 extra dry days beyond trigger.
- **Effect:** `evap_rate × 1.5`. `rainfall_chance` override → 0 for duration. Unwatered plots yield -30 % to -70 % based on severity (`severity = days_into_event / 20`).
- **Mitigations (leverage order):**
  1. Pre-built swales → swaled tiles barely notice (retention from stored groundwater).
  2. Hugelkultur beds → +40 % FC absorbs the hit.
  3. Mulch cover → halves evap.
  4. Shade trees → halves evap again.
  5. Healer-fairy watering → +8 water per 8 s of labor.
  6. Pond draw-down → a pond can irrigate ~40 tiles before draining.
  7. Drought-tolerant plantings on ridges (yarrow / lavender / grape / rosemary).
- **Probability:** 0.35 in summer, 0.05 in other seasons.

### Storm
- **Trigger:** random roll (see probability table) gated on a 3-day no-rain minimum (so storms follow dry spells).
- **Duration:** 1 day heavy + 1 day overcast tail.
- **Effect:**
  - Massive rainfall pulse: +40 mm in one day (vs typical 2–8 mm).
  - Wind gusts: unripe fruit drop (5–15 % off each fruit tree), loose-thatch structures take minor damage.
  - Runoff: bare slopes lose 0.1–0.3 % OM.
  - Positive: pond tiles fill to max. Stream tiles refill. Swaled tiles soak up hugely.
- **Mitigations:** windbreaks (hedgerows), covered structures, harvested ripe fruit before the storm banner hits.
- **Probability:** 0.12 spring, 0.05 summer, 0.18 autumn, 0.10 winter.

### Early frost (autumn) / Late frost (spring)
- **Trigger:** season = autumn or spring + a 3-day cold-front roll.
- **Duration:** 1–3 nights.
- **Effect:** tender plants (tomato, squash, basil, young citrus) take frost damage → -50 % yield or death. Hardened plants (kale, brassicas, garlic, rye) unaffected. Blossom-damage wipes tree crop for the season if hit at blossom stage.
- **Mitigations:**
  - Row cover (future structure: fabric frame over plot).
  - Greenhouse (future, late-game).
  - Thermal-mass proximity: plants within 2 tiles of a rock outcrop, pond, or spiral-herb base are 2 °C warmer.
  - Smoke / smudge pots (future, biochar kiln fuel).
- **Probability:** 0.25 spring (first 10 days), 0.35 autumn (last 10 days), 0.60 winter (baseline frost, no event needed).

### Heat spike (late summer)
- **Trigger:** summer + 3-day no-rain + `temp_anomaly > +4 °C` roll.
- **Duration:** 2–5 days.
- **Effect:** evap × 1.8 for duration. Thirsty crops (lettuce, celery, brassicas) wilt → yield -40 % if not shaded. Animals (cows, pigs, ducks) drink 2× water, output -25 % milk/egg. Fire-risk banner (future — grass fires in dry biomes).
- **Mitigations:** shade cloth (future), shade trees, pond draw-down for animals, re-schedule harvest to dawn (fairy ambient priority 5 auto-shifts).
- **Probability:** 0.20 summer, 0.00 elsewhere.

### Wet week
- **Trigger:** 5+ consecutive rain days in spring, autumn, or winter.
- **Duration:** the trigger itself.
- **Effect:**
  - Swales fill to max — good.
  - Compost pile uncovered → anaerobic risk. If not turned before day 3 of wet week, pile quality -20 %, pH tilts acidic (smelly nudge).
  - Slug population +150 % (softens ground for seedlings). If no pond ducks / rock pile / insectary, seedlings eaten.
  - Clay tiles compact if walked on repeatedly (player-heavy paths develop ruts).
  - Fungal growth spikes — wine-cap / oyster logs yield +50 %.
- **Mitigations:** cover the pile (wood × 2 for a thatched roof buildable), ducks on pond, rock piles for ground beetles.
- **Probability:** 0.10 spring, 0.02 summer, 0.18 autumn, 0.25 winter.

## Probability roll (per day-tick)

```gdscript
func roll_weather_event(season: String, day: int) -> String:
    var base := EVENT_PROBS[season]  # Dict of event_id -> p
    for event_id in base.keys():
        if can_trigger(event_id, day) and rng.randf() < base[event_id]:
            return event_id
    return ""
```

`can_trigger` consults recent history (last N days) to avoid event spam (e.g. drought can't trigger 2 days after another drought ended; storm needs the 3-day dry setup).

Event cooldown: same event can't fire for `duration + 5` days.

Only one event active at a time, except: frost can overlap with wet-week; heat-spike can follow a drought (severity stacks visibly — soil cracks shader).

## Warning system (1 day ahead)

Visibly telegraph every event. **No gotchas.**

- HUD parchment banner 1 day before: "Drought approaches — 10 dry days ahead."
- Camera rim-indicator: incoming event icon in top-right, colored by type (amber for drought, navy for storm, cyan for frost, gold for heat).
- Audio cue: species-specific prelude — cicada chirp (heat), wind gust swell (storm), robin hush (frost), distant thunder roll (drought breaking).
- Right-click the rim icon → event card: duration, effect, recommended prep. Parchment tone, never alarmist.
- Ambient fairies react: on drought-warning, all idle fairies do priority-5 "water tiles" sweep automatically (role: healer preferred). On storm-warning, priority-5 "harvest ripe fruit" sweep (role: harvester preferred).

This makes the warning **actionable** not just informational — the farm autonomously prepares, player can override.

## Paired feedback during event

### Drought
- **Shader:** LUT shifts amber, saturation drops 15 % (but never below `Palette.MIN_SATURATION`). Sun baked-out but still warm.
- **Particles:** dust motes drifting, heat-shimmer over rocks.
- **Audio:** cicada layer loops, birdsong reduced, wind dry-leaf rustle.
- **Tile shader:** moisture-low tiles visibly crack texture (subtle, not ugly).
- **Plant behavior:** thirsty plants droop pose (rig blendshape).

### Storm
- **Shader:** LUT cools but stays warm-muted (no blue-grey cast — `Palette.clamp_happy`).
- **Particles:** rain sheets, leaf-blow particles horizontal, puddle splash on tiles.
- **Audio:** heavy rain loop, distant thunder, wind swell.
- **Camera:** subtle shake on wind-gust moments (2 cm at 0.8 Hz).
- **Water mesh:** stream animation 2× speed, ripple amplitude ×2.

### Frost
- **Shader:** dawn LUT; very faint blue crystalline glitter on tiles. Warm-moon tone maintained.
- **Particles:** slow frost drift flakes, breath-plumes on animals.
- **Audio:** silent air, one crow caw at dawn, subtle crunching underfoot when fairies walk.
- **Tile:** frost-rim decal on grass edges, melts at day warming.

### Heat spike
- **Shader:** honey-amber LUT, bright but not washed.
- **Particles:** heat-shimmer above rocks and pavement, pollen motes dense.
- **Audio:** cicada + drowsy bee drone + occasional distant hawk.
- **Animal:** cows + pigs huddle in shade, ducks sit in pond.

### Wet week
- **Shader:** soft misty LUT, slight green cast (`Palette.SAGE` tint at 8 %).
- **Particles:** light continuous drizzle, ground puddle glints.
- **Audio:** constant soft rain hiss, frog chorus layer.
- **Compost pile:** if uncovered, smoke-steam puff visible at day 3 (anaerobic nudge).

## Implementation sketch

```
autoload/weather_system.gd (NEW)
├── tracks: active_event, severity, days_remaining, history[]
├── signals: weather_warning(event_id, days_until), weather_started(event_id), weather_ended(event_id)
├── hooks: Scheduler.day_tick -> roll_and_advance()
└── reads: data/weather_events.json (new), data/biomes/<id>.json for season defaults
```

Integrations:
- `world_state.gd::_apply()` reads `WeatherSystem.active_event` and blends its LUT modifier onto the time-of-day base.
- `juice.gd` gets new functions: `Juice.rain(intensity)`, `Juice.wind(intensity)`, `Juice.frost_sparkle()`, `Juice.heat_shimmer()`. Weather system calls these at event-start and tails at event-end.
- `compost_pile.gd` subscribes to `weather_started` — wet-week triggers anaerobic timer unless a roof building exists.
- `hud.gd` renders the warning banner from `weather_warning` signal.
- `task_queue.gd` auto-enqueues priority-5 prep tasks on warning.

`data/weather_events.json` schema:
```json
{
  "drought": {
    "label": "Drought",
    "probability": { "spring": 0.05, "summer": 0.35, "autumn": 0.05, "winter": 0.0 },
    "duration_days": [5, 15],
    "effects": { "evap_multiplier": 1.5, "rainfall_override": 0.0 },
    "warning_days": 1,
    "audio_prelude": "distant-thunder.mp3",
    "lut": "drought",
    "auto_prep_task": "water_tiles",
    "cooldown_days": 15
  },
  ...
}
```

## Future events (stubbed)

- **Hail** — rare summer storm variant; damages fruit crops severely; requires netting.
- **Wildfire** (future biome: prairie, boreal) — burn buffer / blackline design.
- **Atmospheric river** (BC-specific) — multi-day monster storm.
- **Indian summer** — unseasonal warm week in late autumn; fruit ripens extra sweet.
- **First snow** — cosmetic + tile-cover + insulation for perennials.

## DESIGN-CHECK

- All shader LUT overrides pass through `Palette.clamp_happy()`.
- Saturation floor respected during drought (warm-amber, not grey-out).
- No black/grey vignettes during storm — blue-violet through `clamp_happy`.
- Paired feedback on **every** event-start, tick, end.
- Player-overridable warning cues (accessibility: audio-cue-only option in Settings).

Sources consulted: `DESIGN.md §Water & moisture retention / §Drought mechanic`, feedback_full_soil_engine.md (retention flywheel), `data/biomes/bc-coastal.json`, feedback_game_feedback_philosophy.md (paired feedback rule), `autoload/juice.gd`, `autoload/world_state.gd`, `autoload/scheduler.gd`.
