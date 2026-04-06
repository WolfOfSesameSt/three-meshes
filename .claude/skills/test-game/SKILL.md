---
name: test-game
description: Run Void Raiders test suites — unit tests, data validation, integration tests, regression tests, or the full suite
argument-hint: [system or "all"]
user-invocable: true
allowed-tools: Read Grep Glob Bash
---

# Run Game Tests

Run Vitest test suites for Void Raiders.

## Commands

```bash
# Full suite
npm test

# Specific system
npm test -- --filter $ARGUMENTS

# Data validation only
npm test -- src/games/void-raiders/data/data-validation.test.js

# Regression suite only
npm test -- src/games/void-raiders/regression/

# Balance smoke tests
npm test -- src/games/void-raiders/balance/

# With coverage report
npm run test:coverage

# Watch mode (re-run on file change)
npm run test:watch
```

## System Filter Names

| Filter | What It Tests |
|--------|--------------|
| `drones` | Drone entities, swarm logic, AI routines |
| `combat` | Damage, enemies, destruction, escalation |
| `economy` | Resources, crafting, research, progression |
| `ship` | Mothership systems, weapons, power, extraction |
| `realm` | Terrain generation, voxels, POIs |
| `data` | JSON config validation and cross-references |
| `regression` | All regression tests |
| `balance` | Balance smoke tests |
| `perf` | Performance benchmarks |

## Instructions

When running tests for $ARGUMENTS:
1. Run the appropriate test command
2. If tests fail, read the failing test and the source code it tests
3. Report: total passed, total failed, and details on each failure
4. For failures, identify whether it's a test bug or a code bug
5. If a code bug, describe the fix needed and which agent owns that code
