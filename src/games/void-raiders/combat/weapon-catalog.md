# Void Raiders Mothership Weapon Catalog

Design document for the full mothership turret weapon roster. Every weapon
has a distinct damage profile, firing rule set, and visual identity so the
player instantly reads what each slot is contributing in a firefight.

## Damage Model Decision

**Option B chosen** (simpler, no enemy data migration):

- Shields absorb damage first, hull absorbs the remainder — unchanged.
- Weapons carry `damageVsShields` and `damageVsHull` multipliers (default 1.0).
- The multiplier is applied to the appropriate pool as damage is routed.
  - If a shot spills from shields into hull, each slice is multiplied separately.
- A single damage resolver (`damage-resolver.js`) handles all routing so the
  math lives in exactly one place for drones, enemies, and the turret system.

Under this model, "anti-shield" = `damageVsShields > 1, damageVsHull < 1` and
"anti-hull" = the inverse. Armor as a third stat is deferred — no enemy-side
changes are needed for this pass.

## Tier Layout (Star Destroyer, 9 slots)

The SD has 3 top bridge-cluster turrets and 6 bottom turrets arranged as 3
symmetric port/starboard pairs (positions sorted aft-to-forward on X):

| Tier | Slots            | Role                     | Assigned Weapon     |
|------|------------------|--------------------------|---------------------|
| 1    | Aft pair (2)     | Heavy main battery       | `heavy-railgun`     |
| 2    | Mid-aft pair (2) | Missile guidance         | `guided-missile`    |
| 3    | Mid pair (2)     | Specialist — flak / AS   | `flak-burst` + `shield-breaker` (port/starboard split) |
| 4    | Bridge top (3)   | PD / anti-swarm          | `point-defense-pulse` × 2 + `arc-emitter` × 1 |

The port/starboard split on tier 3 means **one side gets flak, the other
gets anti-shield**, so whichever way the ship yaws at least one specialist
faces the threat. It's deliberately asymmetric to give the ship a "combined
arms" feel without needing a full per-slot config UI.

## Weapon Entries

Numbers below are the starting point — balance coordinator owns final tuning.
Damage values are calibrated against existing enemies (scout 40 hull, patrol
cruiser 120 hull, shielded cruiser 80 shields + 150 hull).

---

### 1. `point-defense-pulse` — PD / Anti-Swarm Hitscan

- **Role**: Short-range rapid-fire point defense. Swats scouts and interceptors.
- **Damage**: 8 (×1.0 shield, ×0.8 hull — tracer rounds that don't bite hard plate)
- **Range**: 220 m
- **Fire rate**: 3.5 shots/s (very fast)
- **Energy**: 1/shot
- **Accuracy**: 0.92 (PD radar is tight)
- **Targeting rule**: `preferFast` — sort targets by `velocity.length()` descending. Always picks the fastest eligible target in range first, falling back to nearest.
- **Max engagement**: ignore targets with hull > 100 (don't waste PD on capitals)
- **Visual**: thin pale-blue beam (`0x66ddff`), 0.1 s duration, tiny sparkle impact.
- **Why unique**: the ONLY weapon that prioritises fast movers, so scouts can't buzz the bridge tower untouched.

---

### 2. `arc-emitter` — Anti-Shield Chain Beam

- **Role**: Shield shredder. Tears down shielded cruisers.
- **Damage**: 14 (×2.0 shield, ×0.4 hull — magnetics bleed shields, glance off armor)
- **Range**: 260 m
- **Fire rate**: 1.6 shots/s
- **Energy**: 4/shot
- **Accuracy**: 0.90
- **Targeting rule**: `preferShielded` — only fires at targets where `stats.shields > 0`. Falls back to nearest shielded target. If none in range, goes idle (won't waste shots on hull-only targets).
- **Visual**: purple electric beam (`0xcc66ff`), 0.25 s duration, crackling impact.
- **Why unique**: the only weapon that is USELESS against unshielded targets but MELTS shields. Forces the player to care about shield stats.

---

### 3. `flak-burst` — Anti-Swarm Flak Cannon (Mid-Air Detonation)

- **Role**: AOE flak that detonates near enemy clusters, spraying damage.
- **Damage**: 6 direct + 18 AOE in a 22 m radius (×1.0 shield, ×1.0 hull — fragments)
- **Range**: 320 m
- **Fire rate**: 0.8 shots/s
- **Projectile speed**: 170 m/s
- **Energy**: 5/shot
- **Flak detonation**: projectile arms after travelling 40 m, then detonates as soon as ANY enemy comes within `flakDetonationRange` (14 m). Detonates on lifetime expiry too.
- **Targeting rule**: `preferCluster` — scores each candidate target by the count of other alive enemies within 30 m of it, picks the highest-scoring. If no cluster of 2+, won't fire (save ammo).
- **Visual**: yellow-orange bolt (`0xffbb33`) with short trail, then a bright expanding shockwave ring on detonation.
- **Why unique**: proximity detonation + cluster scoring makes it the specialist anti-swarm weapon. Terrible vs lone cruisers (wastes the AOE), devastating vs fighter packs.

---

### 4. `guided-missile` — PID-Homing Missile

- **Role**: Single-target high-damage missile with proportional-derivative guidance. Reliable vs slow capitals, unreliable vs fast scouts.
- **Damage**: 45 direct + 18 AOE in 12 m radius (×0.6 shield, ×1.4 hull — shaped charge)
- **Range**: 450 m (long standoff)
- **Fire rate**: 0.55 shots/s per missile within a burst, 6-shot burst, then ~3 s reload animation
- **Projectile speed**: 110 m/s (moderate — gives the homing time to work)
- **Energy**: 6/shot
- **Homing**: `{ kp: 3.0, kd: 1.2, maxTurn: 1.8 rad/s }`
  - Steering = `kp × positionError + kd × targetVelocity`
  - Yaw+pitch change rate is clamped to `maxTurn`. With the target moving at
    10 m/s or less, the 1.8 rad/s turn rate is plenty to keep the nose on the
    target. At 30+ m/s the target can out-maneuver the integrator and slip
    past — that's the design intent.
- **Targeting rule**: `preferLargeSlow` — targets with `size.length() ≥ 3 m` (cruisers, bombers, shielded-cruisers, turrets) OR `hull ≥ 80`. Won't lock on scouts unless nothing else is available.
- **Visual**: bright orange projectile (`0xffaa22`) with long smoke trail, large explosion on impact.
- **Why unique**: the homing FEEL — it visibly curves through the sky and reliably kills big ships, and visibly MISSES small fast ones. This is the player's reliable "bring down the big guy" tool.

---

### 5. `flak-burst-missile` — Cluster-Detonation Missile (specialist variant)

Not in the default loadout — reserved for an upgrade slot swap. Documented
for completeness since the design brief specifically asked for both a homing
missile and a flak missile.

- **Role**: Slow missile that detonates in mid-air at proximity to a cluster.
- **Damage**: 8 direct + 22 AOE in 28 m radius (×1.0 shield, ×1.1 hull)
- **Range**: 380 m
- **Fire rate**: 0.4 shots/s
- **Projectile speed**: 75 m/s (slow so the player can see it arc in)
- **Energy**: 7/shot
- **Flak detonation**: arms after 25 m, detonates within 16 m of any enemy. **Not homing** — fires ballistic along aim vector.
- **Targeting rule**: `preferCluster` (same scoring as `flak-burst`)
- **Why unique**: bigger-radius, slower cousin of `flak-burst` — better for front-loaded AOE bursts when a swarm is already committed to a pass.

---

### 6. `heavy-railgun` — Long-Range Precision AP

- **Role**: Single-target precision anti-hull. Rips through armor from standoff range.
- **Damage**: 85 (×0.4 shield, ×1.8 hull — kinetic penetrator shrugs off shields, punches hulls)
- **Range**: 550 m (longest in the roster)
- **Fire rate**: 0.28 shots/s (very slow)
- **Energy**: 14/shot
- **Accuracy**: 0.98 (precision barrel)
- **Targeting rule**: `preferHighestHull` — picks the enemy with the most current hull in range. Ignores targets whose shields alone would absorb the shot (`shields > damage × 0.4 × 1.3`). This forces the railgun to wait for the shield-breaker to crack the target first.
- **Visual**: brilliant white beam (`0xffffff`) with short duration, massive screen shake (0.25).
- **Why unique**: the only weapon that meaningfully reaches out past 500 m AND the only weapon that waits for shields to drop before firing. Its synergy with the arc-emitter is intentional: arc-emitter cracks shields, railgun kills the hull.

---

### 7. `shield-breaker` — Burst Beam Anti-Shield

Specialist slot variant, port/starboard alternate to `arc-emitter` on the
mid pair.

- **Role**: Mid-range three-shot burst beam tuned for shields.
- **Damage**: 10/shot, 3 shots/burst (×2.2 shield, ×0.5 hull)
- **Range**: 300 m
- **Fire rate**: 0.9 bursts/s (0.1 s between shots in a burst, 1.0 s between bursts)
- **Energy**: 3/shot (9/burst)
- **Targeting rule**: `preferShielded` + same rule as arc-emitter (skip unshielded targets).
- **Visual**: three quick cyan pulses (`0x66ffff`), crackling shield hits.
- **Why unique**: 3-pulse pattern that predictably melts shields — distinct READ from the arc-emitter's continuous beam, so the player can tell which side of the ship has which specialist.

---

### 8. `gatling-pulse` — Close-Range Dakka (fallback / PD alternate)

Reserved. Not in the default loadout — intended for an upgrade swap on the
tier-4 bridge slots when the player wants hull DPS instead of AOE control.

- **Role**: Close-range, high rate, hull-focused chip damage.
- **Damage**: 5 (×0.7 shield, ×1.3 hull)
- **Range**: 180 m
- **Fire rate**: 6/s
- **Energy**: 0.5/shot
- **Accuracy**: 0.80
- **Targeting rule**: `nearest` + `preferUnshielded` (skip shielded targets, they waste the rate)

---

## Role Coverage Matrix

| Weapon                | Anti-shield | Anti-hull | Precision | AOE/Area | Anti-swarm flak | PD range | Standoff |
|-----------------------|:-----------:|:---------:|:---------:|:--------:|:---------------:|:--------:|:--------:|
| point-defense-pulse   |      .      |     .     |     .     |    .     |        X        |    X     |    .     |
| arc-emitter           |     XX      |     .     |     .     |    .     |        .        |    .     |    .     |
| flak-burst            |      .      |     .     |     .     |    X     |       XX        |    .     |    X     |
| guided-missile        |      .      |     X     |    XX     |    .     |        .        |    .     |    X     |
| flak-burst-missile    |      .      |     .     |     .     |   XX     |        X        |    .     |    X     |
| heavy-railgun         |      .      |    XX     |    XX     |    .     |        .        |    .     |    X     |
| shield-breaker        |     XX      |     .     |     X     |    .     |        .        |    .     |    .     |
| gatling-pulse         |      .      |     X     |     .     |    .     |        .        |    X     |    .     |

All six major roles are covered, with flak redundancy (two flak variants) and
anti-shield redundancy (arc-emitter + shield-breaker are different firing
patterns for the same job).

## Firing Rule Taxonomy

Implemented as a `targetingRules` object on each attack def, interpreted by
`TurretSystem._pickTarget`. Supported rules:

```js
targetingRules: {
  priority: "nearest" | "preferFast" | "preferShielded" | "preferUnshielded"
          | "preferCluster" | "preferHighestHull" | "preferLargeSlow",
  minHull: number,      // skip targets with hull below this
  maxHull: number,      // skip targets with hull above this (e.g. PD vs fighters only)
  requireShields: bool, // skip targets with no shields
  skipShielded: bool,   // skip targets with any shields
  skipIfShieldsHolds: number, // skip if shields × damageVsShields can fully absorb the hit
  clusterRadius: number, // neighbours within this distance to count as a cluster
  minClusterSize: number, // require at least N enemies in the cluster to fire
}
```

The priority scorer runs after the filter rules. Rules that filter to zero
targets cause the turret to go idle that frame — a deliberate "hold fire"
behavior that prevents wasted shots.

## PID Homing Math (for `guided-missile`)

Runs once per tick inside the homing projectile pool update:

```
steerAccel =
    kp × (targetPos - missilePos).normalize() * missileSpeed  // proportional
  + kd × (targetVelocity)                                     // derivative

desiredVelocity = missileVelocity + steerAccel × dt
turnAngle = angleBetween(missileVelocity, desiredVelocity)
if (turnAngle > maxTurn × dt)
    slerp the velocity toward desiredVelocity by (maxTurn × dt) / turnAngle
else
    missileVelocity = desiredVelocity
missileVelocity = normalize(missileVelocity) * missileSpeed  // preserve speed
```

With `kp = 3.0, kd = 1.2, maxTurn = 1.8 rad/s`:
- Target at 10 m/s: the derivative term adds a 12 m/s sideways correction per
  second — well inside the 1.8 rad/s turn budget, so the missile locks on.
- Target at 40 m/s: derivative wants a 48 m/s correction but the turn cap
  blocks most of it, and the proportional term only catches up if the target
  continues in a straight line. A dodging scout will slip past.

The derivative term is the KEY to making this feel like a PID and not just
pursuit steering: it means the missile REACTS to how the target is moving
NOW, not just where it is.

## Visual Identity Cheat Sheet

Colors are tuned to read against the dark space backdrop at a glance.

| Weapon                | Color     | Projectile | Impact size |
|-----------------------|-----------|------------|-------------|
| point-defense-pulse   | pale blue | thin beam  | small       |
| arc-emitter           | purple    | beam       | medium      |
| flak-burst            | yellow    | bolt+trail | large (AOE) |
| guided-missile        | orange    | bolt+trail | large       |
| flak-burst-missile    | gold      | bolt+trail | huge (AOE)  |
| heavy-railgun         | white     | short beam | large+shake |
| shield-breaker        | cyan      | beam burst | medium      |
| gatling-pulse         | green     | thin beam  | small       |

Deliberate color separation: no two weapons share a hue, so the player can
always identify "which turret just fired" from the color of the tracer.
