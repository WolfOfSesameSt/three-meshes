/**
 * Station Crafting Screen — combine raw materials into components.
 *
 * Shows:
 *   - Current inventory grouped by category (raw / refined / advanced)
 *   - Available recipes with input costs, output, and CRAFT button
 *   - Greyed-out recipes the player can't afford
 */

import { gameState } from "../../economy/game-state.js";
import {
  ALL_RESOURCES,
  RESOURCE_CATEGORY,
  getResource,
  getResourcesByCategory,
} from "../../economy/resources.js";
import { ALL_RECIPES } from "../../economy/recipes.js";
import { canCraft, craft } from "../../economy/crafting.js";

const CATEGORY_LABELS = {
  [RESOURCE_CATEGORY.RAW]: "RAW MATERIALS",
  [RESOURCE_CATEGORY.REFINED]: "REFINED COMPONENTS",
  [RESOURCE_CATEGORY.ADVANCED]: "ADVANCED COMPONENTS",
};

function formatInputs(inputs) {
  return inputs
    .map((inp) => {
      const r = getResource(inp.resource);
      const name = r ? r.name : inp.resource;
      return `${inp.amount} ${name}`;
    })
    .join(", ");
}

function formatOutput(output) {
  const r = getResource(output.resource);
  const name = r ? r.name : output.resource;
  return `${output.amount} ${name}`;
}

export class StationCrafting {
  /**
   * @param {object} callbacks — { onBack() }
   */
  constructor(callbacks) {
    this.callbacks = callbacks;

    this.el = document.createElement("div");
    this.el.className = "station-screen";
    this.el.id = "station-crafting";
    this.el.innerHTML = `
      <button class="station-back" id="crafting-back">&lt; BACK</button>
      <div class="station-panel">
        <div class="station-title">REPLICATION HUB</div>
        <div class="station-subtitle">CRAFTING</div>
        <div id="crafting-inventory"></div>
        <div class="station-section-title">RECIPES</div>
        <div class="station-card-list" id="crafting-recipes"></div>
      </div>
    `;
    document.body.appendChild(this.el);

    this.el.querySelector("#crafting-back").addEventListener("click", () => {
      this.callbacks.onBack();
    });
  }

  show() {
    this._render();
    this.el.classList.add("visible");
  }

  hide() {
    this.el.classList.remove("visible");
  }

  _render() {
    this._renderInventory();
    this._renderRecipes();
  }

  _renderInventory() {
    const invEl = this.el.querySelector("#crafting-inventory");
    const categories = [
      RESOURCE_CATEGORY.RAW,
      RESOURCE_CATEGORY.REFINED,
      RESOURCE_CATEGORY.ADVANCED,
    ];

    let html = "";
    for (const cat of categories) {
      const resources = getResourcesByCategory(cat);
      const owned = resources.filter(
        (r) => (gameState.resources[r.id] || 0) > 0,
      );
      if (owned.length === 0) continue;

      html += `<div class="station-section-title">${CATEGORY_LABELS[cat]}</div>`;
      html += `<div class="crafting-inventory">`;
      for (const r of owned) {
        const amount = gameState.resources[r.id] || 0;
        html += `<div class="crafting-inv-chip"><span class="chip-dot" style="background:${r.iconColor};"></span><span class="chip-name">${r.name}</span> <span class="chip-val">${amount.toLocaleString()}</span></div>`;
      }
      html += `</div>`;
    }
    invEl.innerHTML = html;
  }

  _renderRecipes() {
    const list = this.el.querySelector("#crafting-recipes");
    list.innerHTML = ALL_RECIPES.map((recipe) => {
      const affordable = canCraft(recipe.id);
      const outRes = getResource(recipe.output.resource);
      const outColor = outRes ? outRes.iconColor : "#ffffff";

      return `
        <div class="station-card">
          <div class="card-info">
            <div class="card-name">${recipe.name}</div>
            <div class="craft-inputs">${formatInputs(recipe.inputs)}<span class="craft-arrow"> -> </span><span class="craft-output">${formatOutput(recipe.output)}</span></div>
          </div>
          <div class="card-action">
            <button class="station-btn accent" data-craft="${recipe.id}" ${affordable ? "" : "disabled"}>CRAFT</button>
          </div>
        </div>`;
    }).join("");

    // Wire craft buttons
    list.querySelectorAll("[data-craft]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const recipeId = btn.dataset.craft;
        if (craft(recipeId)) {
          this._render();
        }
      });
    });
  }

  dispose() {
    this.el.remove();
  }
}
