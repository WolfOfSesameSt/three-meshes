# Void Raiders — Game Design Document

## Elevator Pitch

You are the commander of a pirate space station hidden deep in uncharted space. Deploy AI-controlled drone swarms aboard an upgradeable mothership to raid procedurally generated alien worlds, loot resources, and warp out before you lose everything. A single-player extraction strategy game where greed is your greatest enemy.

**Tone**: Lord of the Rings meets Dune — vast scale, ancient civilizations, mythic weight, harsh beauty. The galaxy feels old, dangerous, and full of secrets.

**Art Style**: Low-poly geometric shapes with shader effects (fresnel rims, energy shields, holographic UIs). Performance over fidelity — prioritize large drone fleets over fancy graphics.

---

## Core Fantasy

You're not a pilot. You're an AI commander. You design algorithms, plan routes, build fleets, and send them into hostile alien worlds. Your skill is in preparation and adaptation — choosing the right routines, the right loadout, the right moment to flee. Every mission ends with a decision: stay for the good loot, or get out alive.

---

## Game Flow

```
SPACE STATION (Hub)
  |
  |-- Scout: Launch probes to discover realms
  |-- Plan: Choose target, plot mothership route
  |-- Build: Construct/upgrade drones, mothership, weapons
  |-- Research: Unlock new tech, AI routines, upgrades
  |-- Manage: Handle captured leaders, spend resources, craft
  |
  v
MISSION (Real-time)
  |
  |-- Warp In: Mothership arrives via stargate
  |-- Deploy: Drone swarms launch, follow AI routines
  |-- Execute: Mine, loot, fight. Manage mothership systems + adjust routines
  |-- Extract: Summon exit stargate (spawns ~1000m away, 60s channel)
  |            Adjust course toward gate, survive the journey
  |-- Warp Out: Loot delivered to station
  |
  v
BACK TO STATION (Spend, upgrade, repeat)
```

---

## Setting

### The Galaxy

A vast, ancient galaxy viewed through a galactic map interface at the station. Realms are discovered by spending resources to launch probes. Probes return partial intel — resource types, alien advancement level, threat assessment, points of interest. Better probes reveal more.

### Realms

- **Structure**: Flat worlds enclosed by a toroidal energy sphere that generates atmosphere
- **Scale**: ~10km across. A mothership at 10 km/h takes ~1 hour to traverse
- **Generation**: Procedurally generated — terrain, settlements, resource deposits, military installations, points of interest
- **Content**: Multiple POIs within each realm — mine resource deposits, raid alien cities, assault military bases, discover hidden tech caches
- **Travel**: Connected via stargates. Each mission is a one-way trip in; you summon a new gate to leave
- **Variety**: Each realm has a unique alien species at varying technological advancement levels

### Alien Civilizations

- Unique per realm — different species, tech levels, military capability, resources
- **Ground defenses**: Turrets, troops, fortifications, shielded installations
- **Ships/fleets**: Alien vessels that scramble to intercept, pursue, and engage
- More advanced civilizations fight harder, have better loot, and may surprise you
- Start with one baseline alien force type; architecture supports adding new types easily (data-driven)

---

## The Space Station (Hub)

The persistent entity. You are the station. Motherships are tools you send out.

### Station Systems

| System | Function |
|--------|----------|
| **Galaxy Map** | Scout realms, launch probes, choose targets, plot mothership routes |
| **Shipyard** | Build and upgrade motherships |
| **Drone Bay** | Construct drones, assign upgrade slots, configure loadouts |
| **Research Lab** | Unlock new tech, AI routines, upgrades, ship modules |
| **War Room** | Design drone swarm rulesets, configure weapon firing routines |
| **Replication Hub** | Craft items, process raw materials, fabricate components |
| **Brig / Quarters** | Manage captured alien leaders (see Captured Leaders) |
| **Treasury** | Resource management, storage, spending priorities |

### Route Planning

From the station, you plot the mothership's course through the target realm:
- The mothership follows this pre-planned route autonomously during missions
- Route choices affect what you encounter: enemy density, resource richness, hidden tech
- Probes provide intel that informs route decisions (revealed POIs, threat zones, resource deposits)
- A good route is the difference between a profitable raid and a total loss

---

## The Mothership

### Overview

Your deployable vessel. Infinitely upgradeable, but if destroyed, you lose it and everything on board. A new ship must be built from the station.

### Core Systems

| System | Description |
|--------|-------------|
| **Energy Production** | Powers all systems. Higher output = more simultaneous capability |
| **Hull** | Structural integrity. When it hits zero, ship is destroyed |
| **Shields** | Absorb damage before hull takes hits. Regenerate over time |
| **Tesseract Storage** | Extradimensional container for massive resource hauling |
| **Replication Center** | On-board fabrication: ammunition, drone repair parts, self-repair |

### Weapons

- **5 weapon slots** on the mothership
- Each weapon has configurable **firing routines** (rules for when/what/how to fire)
- Weapons assist mining (blast terrain apart for drones) and combat
- **More powerful weapons must feel more powerful** — visual scale, screen shake, particle effects, sound design must all escalate with weapon tier

### Real-Time Management

During missions, the player manages:
- **Power allocation** — distribute energy between shields, weapons, replication, engines
- **Replication priorities** — ammo vs drone repairs vs hull repair
- **Drone routine adjustments** — tweak swarm behaviors mid-mission as situations change
- **Weapon routine overrides** — adjust firing priorities in response to threats

### All Properties Modifiable

Every mothership stat is upgradeable and configurable. High customizability is a core design goal. The ship should feel like yours.

### Death & Salvage

- **Mothership destroyed** = total loss of ship, drones, loot, and all on-board upgrades
- **Research tree and station resources persist** — you rebuild, not restart
- **Salvage missions** — option to warp a new ship to the wreck site and recover a percentage of lost equipment. Risk/reward: invest in salvaging or cut losses?

---

## Drones

### Types

| Type | Role |
|------|------|
| **Worker — Mining** | Extract raw materials from resource deposits |
| **Worker — Looting** | Loot structures, kidnap targets (e.g., genetic material, alien leaders) |
| **Worker — Repair** | Repair damaged drones and the mothership |
| **Offensive** | Combat — escort, patrol, intercept, assault |

### Swarms

- Drones are assigned to **swarms** (not controlled individually)
- A swarm can be a single drone or many
- You can run **multiple swarms** simultaneously, each with different rulesets
- **Fleet size**: Starts at 5 drones, upgradeable to 200
- 200 drones on screen must be computationally viable (instanced rendering, LOD, spatial partitioning)

### Upgrade Slots

- **Base drones**: 2 upgrade slots
- **Advanced drones**: Up to 8 upgrade slots
- **Slot types**: Mining tools, looting tools, weapons, engines, shields, hull upgrades
- A drone's role is defined by its **slots + swarm assignment + AI routine**

### Drone Cost

Drones are expensive to build. Losing them hurts. This creates:
- Incentive to protect your swarms
- Meaningful decisions about when to retreat
- Attachment to your fleet composition

---

## Drone AI Routines

### Philosophy

Routines are **algorithmic plans** — deterministic rules drones follow reliably. The player's skill is choosing the right algorithm for the situation. Routines are NOT direct control; they're pre-programmed behaviors you set up and adjust.

### Core Rule System

Each swarm ruleset is composed from **5 core rules** that combine to produce wide behavioral variance:

| Rule | Description | Example Values |
|------|-------------|----------------|
| **Anchor** | Spatial control point the swarm operates around | Fixed location, follow mothership, track resource node, track friendly unit, track enemy |
| **Range** | Operating radius from the anchor point | Tight cluster (50m), standard (200m), wide sweep (500m) |
| **Priority** | What to target first | Nearest resource, richest deposit, weakest enemy, strongest threat, damaged friendly, cargo value |
| **Action** | What to do when engaging a target | Mine, loot, attack, repair, escort, patrol path, intercept |
| **Retreat** | Conditions to disengage | Health below %, cargo full, proximity to overwhelming threat, mothership recall, anchor destroyed |

### Behavioral Examples (Same 5 Rules, Different Values)

| Swarm Name | Anchor | Range | Priority | Action | Retreat |
|------------|--------|-------|----------|--------|---------|
| Strip Miners | Resource node | Tight | Richest deposit | Mine | Cargo full |
| Smash & Grab | Enemy city | Wide | Cargo value | Loot | Health < 40% |
| Wolfpack | Enemy fleet | Standard | Weakest enemy | Attack | Health < 25% |
| Bodyguard | Mothership | Tight | Strongest nearby threat | Intercept | Mothership recall |
| Field Medic | Damaged friendly | Wide | Most damaged friendly | Repair | Health < 50% |
| Martyr Squad | Mothership | Tight | Incoming projectile | Intercept/sacrifice | Never |
| Scout Sweep | Fixed waypoint | Max | Nearest unknown | Patrol path | Any contact |

### Routine Progression

- **New routines are researchable** — spend a specific resource to unlock new AI algorithms
- Unlocking a routine adds new **values** to the 5 core rules (e.g., unlock "intercept projectile" as an Action)
- Start with basic values; advanced routines create more sophisticated emergent behavior
- **Easy to author** — adding a new routine = adding new rule values + behavior logic. Data-driven, modular

---

## Combat & Destruction

### Looting Requires Force

- Many structures must be **destroyed** before worker drones can loot them
- Mothership weapons or attack drones blast apart buildings, vehicles, defenses
- Worker drones then move in to extract materials from the wreckage

### Destruction Feel

- **Visceral and rewarding** — this is a core part of the fun
- Destruction feedback scales with weapon power
- Small weapons: sparks, debris, small chunks
- Large weapons: massive explosions, structural collapse, screen shake, debris fields
- Voxel-based structures enable satisfying chunked destruction (proven pattern from kaiju-city)

### Enemy Escalation

- Alien response intensifies the longer you stay in a realm
- Early: patrols, local garrison response
- Mid: reinforcement fleets arrive, ground defenses activate
- Late: overwhelming force — the game is telling you to leave
- This drives the extraction tension: stay for loot vs. flee before it's too late

---

## Extraction

The emotional heartbeat of every mission.

1. **Player decides to leave** — can be triggered at any time
2. **Stargate spawns ~1000m away** in the distance
3. **Mothership adjusts course** toward the gate
4. **60-second channel time** — gate must stabilize before you can warp
5. **Survive the journey and the wait** — enemies know you're leaving and press hard
6. **Warp out** — loot delivered to station

### The Core Tension

You always want to stay longer. One more mining pass. One more building to loot. But every second increases the risk. The exit stargate is 1000 meters away and enemies are closing in. Your shields are low. Two drones are damaged. Do you stay?

This is the game.

---

## Resources & Crafting

### Philosophy

Resources must feel meaningful and scarce. Wide variety, each with unique purposes. Start with a simple crafting tree, architecture supports scaling to deep material complexity.

### Resource Categories

| Category | Examples | Source |
|----------|----------|--------|
| **Raw Materials** | Ore, crystals, alloys, rare elements | Mining drones extract from deposits |
| **Genetic Material** | DNA samples, biological compounds, live specimens | Looting drones, kidnapping |
| **Salvage** | Alien tech components, weapon fragments, ship parts | Looting destroyed structures/ships |
| **Intelligence** | Star charts, tech schematics, cipher keys | Probes, interrogated leaders, data vaults |
| **Energy** | Fuel cells, plasma cores, exotic matter | Specialized mining, reactor salvage |
| **High-Value Targets** | Alien leaders, scientists, warlords, shamans | Looting drones capture from settlements |

### Crafting

- Station-based crafting at the Replication Hub
- Combine raw materials into components, components into upgrades/equipment
- Recipes unlocked through research tree
- Start simple (5-10 core materials), expand over time (50+ with unique purposes)
- Data-driven recipe system — easy to add new materials and recipes

---

## Captured Alien Leaders

When looting drones capture an alien leader, you choose what to do with them:

| Option | Effect | Tradeoff |
|--------|--------|----------|
| **Interrogate** | Reveals hidden info about their realm — secret resource deposits, tech caches, military positions. Intel for future missions | One-time use, leader is "spent" |
| **Ransom** | Sell back to their civilization for a large resource payout | That civilization reinforces defenses — harder next visit |
| **Conscript** | Put them to work on your station. Unique bonuses based on their civ's advancement and their role | Long-term investment, no immediate payout |
| **Trade** | Trade leaders between alien factions to manipulate political relationships | Opens diplomatic routes to realms you couldn't normally raid |

### Conscript Specializations

A leader's value depends on who they are:
- **Alien scientist** (high-tech civ) — unlocks research branches you can't access otherwise
- **Warlord** — improves drone combat routine effectiveness
- **Shaman / biologist** (primitive civ) — reveals biological resources others can't detect
- **Engineer** — improves mothership system efficiency
- **Navigator** — improves probe range and intel quality

### The Choice

Short-term gain (ransom) vs long-term investment (conscript) vs strategic play (interrogate/trade). Mirrors the core greed-vs-patience tension of extraction.

---

## Progression

### Design Goal

1,000 hours to max out. Near-infinite replayability from different build paths, route choices, and strategy decisions. Progression must feel meaningful at every stage.

### Progression Axes

| Axis | Description |
|------|-------------|
| **Research Tree** | Permanent unlocks: tech, routines, upgrades, recipes. Persists through ship loss |
| **Mothership Upgrades** | Infinite scaling — always something to improve. Lost on ship death |
| **Drone Fleet** | Scale from 5 to 200. Better drones, more slots, specialized loadouts |
| **AI Routines** | Unlock new rule values and algorithms. Deeper strategies over time |
| **Galaxy Exploration** | Probe further, discover richer/more dangerous realms |
| **Station Upgrades** | Improve crafting, storage, research speed, probe capability |
| **Captured Leaders** | Build a roster of conscripted specialists |
| **Crafting Depth** | More materials, more recipes, more complex upgrade paths |

### Roguelite Loop

- Ship death is painful but not a reset
- Research tree + station resources persist
- Rebuild is faster each time (knowledge + unlocks carry over)
- Different ship builds emerge from different progression paths
- Salvage missions add a recovery option

---

## Technical Architecture

### Stack

- **Three.js** (existing repo infrastructure)
- **Pure JavaScript** — ES6 modules, no TypeScript
- **Vite 6** — dev server and bundler

### Data-Driven Design

Everything that defines content is data, not code:

```
src/games/void-raiders/
  data/
    resources.json        — resource definitions
    recipes.json          — crafting recipes
    drones.json           — drone types, base stats, slot configs
    weapons.json          — weapon types, stats, firing patterns
    upgrades.json         — all upgrade definitions
    routines.json         — AI routine rule values and unlocks
    enemies.json          — alien force types, units, behaviors
    realms.json           — realm generation parameters
    research-tree.json    — tech tree structure and costs
    leaders.json          — leader types, traits, bonuses
```

Adding a new drone type, weapon, resource, or AI routine = adding a config entry + assets. No game logic rewrites.

### Entity-Component Architecture

Drones, weapons, upgrades, and ships are composed from shared building blocks:
- A drone = base stats + upgrade slots + swarm assignment + routine
- A weapon = base stats + firing routine + visual/audio config
- Modular systems (combat, mining, looting, crafting, research) communicate through events

### Performance Strategy (200 Drones)

- **Instanced rendering** — all drones of same type share one draw call
- **LOD (Level of Detail)** — simplified geometry at distance
- **Spatial partitioning** — only process nearby interactions
- **Shader-based animation** — vertex shader deformation for simple movement/effects
- **Object pooling** — pre-allocate drone objects, reuse on spawn/despawn

### Art Pipeline

- **Realms**: Voxel-based terrain and structures (destruction-friendly, proven in kaiju-city)
- **Ships/Drones**: Low-poly geometric meshes with shader effects
- **Effects**: Shader-driven — fresnel rims, energy shields, holographic UIs, weapon impacts
- **Textures**: LLM-generated or procedural
- **Sound**: Procedural generation, free libraries, Eleven Labs for custom SFX

### Camera

- **3rd person** behind the mothership (default)
- **Adjustable** — zoom, orbit, angle
- Strategic overview zoom for fleet management

---

## UX Principles

- **Clean and fast** — no clutter, no unnecessary chrome
- **Match the tone** — ancient sci-fi, holographic interfaces, weighty and mythic
- **Information density** — show what matters, hide what doesn't. Expand on demand
- **Station UI**: Full management interface — galaxy map, shipyard, research, war room
- **Mission UI**: Minimal HUD — mothership status, swarm status, resource counter, minimap, extraction button
- **Routine Editor**: Clear rule visualization — see exactly what each swarm will do

---

## V1 Scope — Core Loop

The minimum playable slice to test the feel:

### Included
- One procedurally generated realm (terrain, resource deposits, one alien base)
- Mothership on pre-planned route with basic systems (hull, shields, energy, 1 weapon)
- 2 drone types: mining worker + offensive
- Basic swarm ruleset (anchor, range, priority, action, retreat)
- Mining loop: drones extract resources, store in tesseract
- Combat loop: alien ground defenses + one ship type
- Stargate extraction (1000m spawn, 60s channel, survive and warp)
- Station hub: basic galaxy map, simple crafting, drone loadout
- Simple research tree (3-5 unlocks)
- Mothership death → rebuild from station
- 5 resource types
- 5-15 drones

### Deferred
- Full galaxy exploration and probing
- 200-drone swarm scaling
- Deep crafting tree (50+ materials)
- Captured alien leaders system
- Multiple alien species
- Salvage missions
- Trade/diplomacy
- Weapon routine customization
- Station upgrades
- Sound design
- Advanced shader effects

### Success Criteria for V1
The core tension works: "I want to stay for more loot but I might lose everything." Route planning feels meaningful. Drone routines feel like your strategy playing out. Extraction is tense. Progression hooks are visible.

---

## Development Approach

### Agentic Development System

A hierarchical team of specialized agents orchestrated by a Game Director agent:

```
Game Director (top-level orchestrator)
  |
  |-- Realm Engineer        — procgen, terrain, voxel systems, world building
  |-- Ship Architect        — mothership systems, upgrades, weapons, power management
  |-- Drone Commander       — drone types, swarm logic, AI routines, fleet scaling
  |-- Combat Designer       — enemy AI, difficulty scaling, weapon feel, destruction
  |-- Economy Designer      — resources, crafting, progression, balance
  |-- UX Engineer           — UI design, HUD, station interfaces, clean fast UIs
  |-- Shader Expert         — visual effects, materials, performance (already exists)
  |-- Balance Coordinator   — cross-system balancing, routine tuning, economy health
```

Each agent has:
- A **purpose file** (AGENT.md) — who they are, what they own, their tools and capabilities
- A **skills list** — specialized skills they can invoke
- **Domain ownership** — clear boundaries on what they control

### Build Order

1. **Scene scaffolding** — realm with voxel terrain, mothership, camera
2. **Mothership movement** — follows pre-planned route, basic systems
3. **Drone spawning** — instanced rendering, basic swarm movement
4. **AI routine system** — 5 core rules, basic rule evaluation loop
5. **Mining loop** — resource deposits, worker drones extract, tesseract stores
6. **Combat loop** — alien defenses, offensive drones engage, mothership weapons
7. **Extraction** — stargate summon, survive, warp out
8. **Station hub** — basic UI for loadout, route planning, spending resources
9. **Progression** — simple research tree, drone upgrades, mothership upgrades
10. **Polish** — destruction feel, shader effects, UI polish, balance pass
