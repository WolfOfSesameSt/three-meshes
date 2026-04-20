/**
 * Fairy Permaculture — goal / quest tracker.
 *
 * Replaces the vague "goal-of-the-moment" text with a proper checklist
 * the player can read and watch tick off. Each goal is observable:
 * it has a `check(world)` function that returns `{ progress, done }`.
 *
 * Goals are **ordered**; the tracker surfaces the first unfinished one
 * as the "active" goal for the bottom HUD. A small checklist panel
 * lives top-center so the player can see the whole tutorial arc.
 */

export function createGoals({ container }) {
  const root = document.createElement("div");
  root.id = "fp-goals";
  root.style.cssText = `
    position: absolute; z-index: 180;
    top: 14px; left: 50%; transform: translateX(-50%);
    min-width: 360px; max-width: 520px;
    padding: 10px 16px;
    background: #F2E6C9; border: 2px solid #C9B88A;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    font-family: Georgia, serif; color: #3A2815;
    font-size: 13px; line-height: 1.55;
    pointer-events: none;
  `;
  container.appendChild(root);

  // Goal list — ordered. Each has a `check(world) -> { progress, done }`.
  const goals = [
    {
      id: "g1-harvest",
      label: "Harvest 3 berries (fairy food)",
      hint: "Click the dark-green salmonberry bushes. Berries feed fairies, not the compost.",
      check(w) {
        const n = w.farmTotals.fruitPicked ?? 0;
        return { progress: Math.min(n, 3), target: 3, done: n >= 3 };
      },
    },
    {
      id: "g1b-chop",
      label: "Chop 2 comfrey plants for biomass",
      hint: "The taller, leafier plants are comfrey. Clicking them chops-and-drops biomass to feed the pile.",
      check(w) {
        // Each chop drops ~8 kg; two chops ≥ 14 kg into biomass.
        const kg = w.farmTotals.biomass ?? 0;
        return { progress: Math.min(kg, 14), target: 14, done: kg >= 14 };
      },
    },
    {
      id: "g2-feed-pile",
      label: "Feed the compost pile (3 loads of greens + browns)",
      hint: "Click the pile → panel → + Greens / + Browns. Aim for 20–40 C:N and 50–65 % moisture.",
      check(w) {
        const n = w.farmTotals.pileFeeds ?? 0;
        return { progress: Math.min(n, 3), target: 3, done: n >= 3 };
      },
    },
    {
      id: "g3-pile-hot",
      label: "Watch the pile heat up",
      hint: "A healthy pile needs greens + browns + a minute of patience.",
      check(w) {
        const state = w.pile?.state;
        const hotSeen = w.farmTotals.pileHotSeen ?? (state === "hot" || state === "turn-window" || state === "cooling" || state === "curing" || state === "finished");
        if (hotSeen) w.farmTotals.pileHotSeen = true;
        return { done: !!w.farmTotals.pileHotSeen };
      },
    },
    {
      id: "g4-harvest-compost",
      label: "Harvest finished compost",
      hint: "Wait for the pile to finish, then click to scoop it.",
      check(w) {
        const bags = w.farmTotals.compostHarvested ?? 0;
        return { done: bags > 0 };
      },
    },
    {
      id: "g5-press-t",
      label: "Open the Branch Tree (press T)",
      hint: "It shows what's unlocked and what's next on the food chain.",
      check(w) {
        return { done: !!w.flags?.openedTree };
      },
    },
  ];

  function render(world) {
    const items = goals.map((g) => {
      const r = g.check(world) ?? { done: false };
      const status = r.done ? "✓" : "◦";
      const progress = r.target != null && !r.done ? ` (${r.progress}/${r.target})` : "";
      const style = r.done
        ? "color: #7A9A5A; text-decoration: line-through;"
        : "color: #3A2815; font-weight: bold;";
      return `<li style="${style}">${status} ${escape(g.label)}${progress}</li>`;
    });

    // First unfinished goal gets a hint line below the list.
    const active = goals.find((g) => {
      const r = g.check(world) ?? { done: false };
      return !r.done;
    });

    root.innerHTML = `
      <div style="font-size: 12px; color: #8B6845; font-weight: bold; letter-spacing: 0.5px;">
        FIRST GOALS
      </div>
      <ul style="margin: 6px 0 0 0; padding: 0 0 0 16px; list-style: none;">
        ${items.join("")}
      </ul>
      ${active ? `<div style="margin-top: 6px; font-style: italic; color: #8B6845; font-size: 12px;">${escape(active.hint)}</div>` : `<div style="margin-top: 6px; font-weight: bold; color: #7A9A5A;">All first goals complete. The farm is yours.</div>`}
    `;
  }

  return {
    render,
    get activeGoalId() {
      return null;
    },
  };
}

function escape(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}
