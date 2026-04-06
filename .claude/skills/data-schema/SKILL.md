---
name: data-schema
description: Create and validate JSON data schemas for Void Raiders game config files (resources, drones, weapons, enemies, routines, recipes, upgrades)
argument-hint: [file or type]
user-invocable: true
allowed-tools: Read Write Edit Grep Glob
---

# Data Schema Helper

Create or validate data-driven config files for Void Raiders. All game content is defined as JSON data in `src/games/void-raiders/data/`.

## Schema Conventions

- All IDs are `kebab-case` strings
- All numeric values use SI units where applicable (meters, seconds, joules)
- All configs have a `version` field for migration
- Arrays of objects, each with a unique `id` field
- Comments via `_comment` fields if needed (stripped at load)

## Core Data Files

### resources.json
```json
{
  "version": 1,
  "resources": [
    {
      "id": "iron-ore",
      "name": "Iron Ore",
      "category": "raw-material",
      "description": "Basic structural metal",
      "rarity": "common",
      "stackSize": 1000,
      "baseValue": 1
    }
  ]
}
```

### drones.json
```json
{
  "version": 1,
  "drones": [
    {
      "id": "worker-miner-mk1",
      "name": "Miner Mk.I",
      "type": "worker-mining",
      "baseStats": {
        "hull": 50,
        "speed": 15,
        "cargoCapacity": 100,
        "miningRate": 5
      },
      "upgradeSlots": 2,
      "buildCost": [
        { "resource": "iron-ore", "amount": 200 },
        { "resource": "plasma-core", "amount": 1 }
      ]
    }
  ]
}
```

### weapons.json
```json
{
  "version": 1,
  "weapons": [
    {
      "id": "pulse-laser-mk1",
      "name": "Pulse Laser Mk.I",
      "slot": "light",
      "damage": 10,
      "range": 500,
      "fireRate": 2.0,
      "energyCost": 5,
      "projectileSpeed": 800,
      "effectTier": 1,
      "defaultRoutine": {
        "targetPriority": "nearest",
        "fireCondition": "always",
        "fireMode": "burst"
      }
    }
  ]
}
```

### routines.json
```json
{
  "version": 1,
  "ruleValues": {
    "anchor": [
      { "id": "fixed", "label": "Fixed Point", "unlocked": true },
      { "id": "follow-mothership", "label": "Follow Mothership", "unlocked": true },
      { "id": "track-resource", "label": "Track Resource", "researchCost": [] }
    ],
    "range": [
      { "id": "tight", "value": 50, "label": "Tight (50m)", "unlocked": true },
      { "id": "standard", "value": 200, "label": "Standard (200m)", "unlocked": true }
    ],
    "priority": [],
    "action": [],
    "retreat": []
  },
  "presets": [
    {
      "id": "strip-miners",
      "name": "Strip Miners",
      "rules": {
        "anchor": "track-resource",
        "range": "tight",
        "priority": "richest",
        "action": "mine",
        "retreat": "cargo-full"
      }
    }
  ]
}
```

### enemies.json
```json
{
  "version": 1,
  "enemies": [
    {
      "id": "scout-fighter",
      "name": "Scout Fighter",
      "type": "ship",
      "stats": {
        "hull": 30,
        "speed": 40,
        "damage": 8,
        "range": 300
      },
      "behavior": "patrol",
      "spawnWeight": 10,
      "lootTable": [
        { "resource": "salvage-parts", "amount": [5, 15], "chance": 0.8 }
      ]
    }
  ]
}
```

## Validation Rules

When creating or modifying data files:
1. All referenced IDs must exist in their respective files
2. Build costs must reference valid resource IDs
3. Research costs must reference valid resource IDs
4. Loot tables must reference valid resource IDs
5. Routine presets must reference valid rule value IDs
6. No duplicate IDs within a file

## Instructions

When asked to create or validate a data file for $ARGUMENTS:
1. Check existing data files in `src/games/void-raiders/data/`
2. Follow the schema conventions above
3. Validate cross-references between files
4. Keep it simple — start minimal, expand later
