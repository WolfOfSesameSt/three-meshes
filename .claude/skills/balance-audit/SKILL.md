---
name: balance-audit
description: Audit game balance across Void Raiders systems — check resource flows, damage curves, progression pacing, and identify degenerate strategies
argument-hint: [system or area]
user-invocable: true
allowed-tools: Read Grep Glob
---

# Balance Audit

Analyze game balance for Void Raiders by reading data files and checking cross-system interactions.

## Audit Checklist

### Resource Flow
- [ ] Every resource has at least one source and one sink
- [ ] No resource accumulates infinitely without a use
- [ ] Rare resources gate meaningful upgrades (not just more of the same)
- [ ] Mission yield / ship value ratio: 5-15% (losing a ship hurts but is recoverable)

### Combat
- [ ] Damage / HP ratios create fights lasting 5-30 seconds (not instant, not tedious)
- [ ] Enemy escalation curve matches intended timeline (light → overwhelming over 15 min)
- [ ] Extraction 60-second window is survivable but tense at appropriate gear levels
- [ ] No weapon dominates all situations

### Progression
- [ ] Time between meaningful upgrades: 2-5 missions
- [ ] No dead zones where nothing interesting unlocks for 10+ missions
- [ ] Research tree has multiple viable paths (not one obvious order)
- [ ] Fleet scaling 5 → 200 feels gradual and earned

### Drone Routines
- [ ] No single routine preset dominates all scenarios
- [ ] Each of the 5 core rules has values that are situationally best
- [ ] Advanced routines (researched) are powerful but not strictly better
- [ ] Swarm composition matters (pure combat and pure mining both viable but risky)

### Economy
- [ ] Crafting recipes don't have bottleneck resources that gate everything
- [ ] Drone replacement cost: 10-30% of average mission yield per drone
- [ ] Probe costs scale with intel quality (cheap basic, expensive detailed)
- [ ] Captured leader options are all viable (no always-correct choice)

## How to Audit $ARGUMENTS

1. Read all data files in `src/games/void-raiders/data/`
2. Trace the specific system's numbers through interconnected systems
3. Identify imbalances, dominant strategies, or dead ends
4. Report findings with specific recommended number changes
5. Consider edge cases: what does a min-maxer exploit? What frustrates a casual player?

## Output Format

```
## Balance Audit: [System]

### Findings
1. [Issue]: [Description]. Current: X. Recommended: Y. Reason: Z.
2. ...

### Healthy
- [Thing that's working well and why]

### Risks
- [Potential future issue as content expands]
```
