# Upgrade / Tech Tree — parchment panel spec

**Status:** design-only. An implementation agent will later create `scenes/tech_tree_panel.tscn`, `scripts/tech_tree_panel.gd`, and `data/tech_tree_nodes.json`.

**Purpose:** Give the player a legible, *felt* map of the 7 food-chain branches, where they are on each, what's next, and where the cross-branch climax convergences sit. The tree doubles as a **goal selector** — clicking a node pins it as the current goal and jumps the camera to a relevant location.

## Source of truth

- `data/branches.json` — the canonical node graph (already exists, 7 branches + root + climax, 6 nodes per branch).
- `autoload/progression.gd::BUILD_CATALOG` — costs / labor for build-gated nodes.
- `data/tech_tree_nodes.json` *(new, to be generated)* — **visual-layout only** overlay: `{id, x, y, icon, summary, camera_pin, suggested_tier}`. Keeping the graph in `branches.json` and the layout here lets designers rebalance costs without touching screen positions.

## Visual layout

Parchment-themed full-screen panel. Tree grows **from root at the bottom center upward**, branching out like an espaliered fruit tree (permaculture pun intentional).

```
                       ╔═══════════════ CLIMAX ═══════════════╗
                       ║  cx-food-forest  cx-biodynamic       ║
                       ║  cx-mob-grazing  cx-seed-vault       ║
                       ║             cx-watershed             ║
                       ╚══════════════════════════════════════╝
                                       ▲
       ┌─────────┬─────────┬───────────┼───────────┬─────────┬─────────┐
       │    A    │    B    │    C      │     D     │    E    │    F    │    G
       │Pollen-  │Berries  │Livestock  │Aquaculture│ Grain   │ Fungi   │ Water
       │ ators   │Orchard  │           │           │         │         │
     a6│       b6│       c6│         d6│         e6│       f6│       g6│
     a5│       b5│       c5│         d5│         e5│       f5│       g5│
     a4│ HONEY b4│       c4│         d4│         e4│       f4│       g4│
     a3│       b3│FRUIT    │         d3│         e3│       f3│       g3│
     a2│       b2│       c3│MILK     d2│         e2│       f2│       g2│
     a1│       b1│       c2│         d1│         e1│       f1│       g1│
       └─────────┴─────────┴─────────  ┴──────────┴─────────┴─────────┘
                                 ▲           ▲             ▲
                                 └── Root ring (r1..r4) ───┘
                                              ▲
                                       ▽ PLAYER START
```

Approximate pixel positions (1600×900 panel, parchment frame inside 80 px margin):

| Node | x | y | note |
|---|---|---|---|
| r1 (compost) | 800 | 760 | hub — bottom center |
| r2 (pioneers) | 720 | 700 | feeds branches A, B, C, E, F |
| r3 (worm-bin) | 640 | 700 | sibling of r2 |
| r4 (swale) | 880 | 700 | gates D + G |
| a1..a6 (pollinators) | 200 | 600→100 | leftmost column |
| b1..b6 (berries) | 400 | 600→100 | |
| c1..c6 (livestock) | 600 | 600→100 | |
| d1..d6 (aquaculture) | 800 | 600→100 | centered behind root |
| e1..e6 (grain) | 1000 | 600→100 | |
| f1..f6 (fungi) | 1200 | 600→100 | |
| g1..g6 (water) | 1400 | 600→100 | |
| climax band | 400..1400 | 80 | horizontal ribbon at top |

Edges drawn as hand-inked curved lines between nodes (bezier, 2 px, ink color `Palette.COMPOST`). Locked edges are dashed. Climax convergence edges from multiple branches merge into a single node — rendered as a braided ink knot.

## Node states

| State | Visual | Rule |
|---|---|---|
| Locked | faded ink (30 % alpha), small padlock corner badge | prerequisites unmet |
| Available | full ink + soft honey glow pulsing at 0.5 Hz | prerequisites met, not unlocked |
| In-progress | honey glow + a small circular progress ring around the icon (0–100 %) | currently being built / researched |
| Unlocked | full color icon + small checkmark stamp | complete, ≥ 1 instance exists |
| Fully mastered | gold-foil border + tiny laurel sprig | node's `product` (HONEY/MILK/FRUIT…) is at ≥ 5 throughput/day OR the node has been used in a climax convergence |

All glow / pulse tweens clamp through `Palette.clamp_happy()`. No greys.

## Node art

Each node is a ~64×64 icon in hand-inked parchment style. Describe, don't draw:

- **r1** — a smoking compost heap with a fork stuck in.
- **r2** — five overlapping wildflower silhouettes (yarrow, dandelion, nettle, clover, comfrey).
- **a1–a6** — bee tube block → bumblebee nest → corridor of flowers → Warré hive → stacked hives → crowned queen.
- **b1–b6** — single berry → cluster of canes → blueberry urn-flower → crabapple branch → full apple tree → clustered nuts.
- **c1..c6** — chicken silhouette → duck → goat with udder → Dexter cow → pig under oak → cascade of 3 animals moving right.
- **d1..d6** — spade over pond → reed fringe → trout+crayfish → watercress → duck-on-pond with fish below → leaping salmon.
- **e1..e6** — clover mat → corn+bean+squash triplet → potato mound → buckwheat head → packet of seeds labeled L → vault door.
- **f1..f6** — jar of forest duff → wine-cap on wood chips → oyster on alder log → shiitake on maple log → spore cloud → Johnson-Su tower.
- **g1..g6** — single swale line → keyline fan → hugel mound → downspout into rain-garden → dam silhouette → watershed contour map.
- **climax icons** — biodynamic horn, layered food-forest cross-section, cow-chicken-pig trio, seed vault, braided stream.

## Hover behavior

On pointer-enter, a parchment tooltip (`ui/parchment_tooltip.tscn`-style) fades in beside the node (150 ms). Contents:

- Header: node name, branch name, product (if any — HONEY / FRUIT / MILK).
- Summary: from `branches.json::description`.
- **Prerequisites**: list with colored dots (green = met, red = missing).
- **Unlocks**: plants / animals / buildings / roles / actions from `branches.json::unlocks`.
- **Cost**: read from `Progression.BUILD_CATALOG` for any `buildings:*` entry. "Free (knowledge)" otherwise.
- **Status**: locked / available / in-progress (%) / unlocked.

Tooltip anchors to the side with more screen room. Audio: soft `hover-tick.mp3` at -18 dB.

## Click behavior

- **Available node** → parchment sheet flips down with a long description, "Pin as next goal" button, and (if build-gated) "Build now" button.
- **Pin as goal** → closes panel, sets `Progression.pinned_goal = node_id`, the HUD banner ticks to the pinned goal's nudge, and the minimap drops a honey-glow pin at `camera_pin`.
- **Build now** → closes panel, opens the right-click-ground build flow preset to this structure.
- **Unlocked node** → flips to a celebration sheet: date first achieved, output stats, related bestiary cards. Click "Visit" to fly camera to `camera_pin`.

## Convergence locks

Climax nodes gate on multiple branches. Render them at the top as a separate ribbon so players can see the summit.

Current locks (from `branches.json`):

| Climax node | Requires |
|---|---|
| cx-biodynamic | a4 + c3 + e4 |
| cx-food-forest | b6 + f4 + g3 |
| cx-mob-grazing | c6 + e1 + g2 |
| cx-seed-vault | b5 + e6 + f4 |
| cx-watershed | g6 |

Recommended new lock (this spec proposes, not in branches.json yet):

- **cx-food-forest v2** → require B5+ AND F4+ AND G3+ AND `farm_vitality > 0.6`. The vitality gate means you can't unlock climax by cheesing one branch — the land itself has to be alive.

## Implementation sketch (for the future impl agent)

- `scenes/tech_tree_panel.tscn` — Control root, full-screen, parchment bg texture, a `Node2D` subtree for nodes/edges, a `RichTextLabel` panel for tooltip, a `Panel` for the detail flip-sheet.
- `scripts/tech_tree_panel.gd` — loads `branches.json` + `tech_tree_nodes.json`, builds node widgets, wires signals, reads `Progression` state.
- `data/tech_tree_nodes.json` — array of `{id, x, y, icon, summary, camera_pin: Vector2, suggested_tier: int}`. Keep layout data decoupled from graph data.
- Hotkey: `T` toggles the panel. HUD button `[Tree]` also opens it.
- Must cite `Palette` for every color. DESIGN-CHECK required.

Sources consulted: `data/branches.json`, `autoload/progression.gd`, `DESIGN.md §Progression rings`, feedback_visceral_world_progression.md, feedback_happy_palette_mandatory.md.
