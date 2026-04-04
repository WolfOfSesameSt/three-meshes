/**
 * City selection screen: search bar + predefined cities + generate button.
 */

export class CitySelectUI {
  constructor(onSelect) {
    this.onSelect = onSelect;

    this.container = document.createElement("div");
    this.container.id = "city-select";
    this.container.innerHTML = `
      <div class="city-select-panel">
        <h1>KAIJU CITY</h1>
        <p class="subtitle">Select a city to destroy</p>

        <div class="search-row">
          <input type="text" id="city-search" placeholder="Search city..." />
          <button id="city-search-btn">SEARCH</button>
        </div>

        <div class="presets">
          <button class="preset-btn" data-city="Manhattan, New York">Manhattan</button>
          <button class="preset-btn" data-city="Tokyo, Japan">Tokyo</button>
          <button class="preset-btn" data-city="London, UK">London</button>
          <button class="preset-btn" data-city="Paris, France">Paris</button>
          <button class="preset-btn" data-city="Chicago, USA">Chicago</button>
          <button class="preset-btn" data-city="Sydney, Australia">Sydney</button>
        </div>

        <div class="divider"></div>

        <button id="procgen-btn" class="action-btn">RANDOM TEST CITY</button>

        <div id="city-status" class="status"></div>
      </div>
    `;
    document.body.appendChild(this.container);

    this.status = document.getElementById("city-status");

    // Event listeners
    document.getElementById("city-search-btn").addEventListener("click", () => {
      const query = document.getElementById("city-search").value.trim();
      if (query) this.onSelect({ type: "osm", query });
    });

    document.getElementById("city-search").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const query = e.target.value.trim();
        if (query) this.onSelect({ type: "osm", query });
      }
    });

    document.getElementById("procgen-btn").addEventListener("click", () => {
      this.onSelect({ type: "procgen" });
    });

    for (const btn of document.querySelectorAll(".preset-btn")) {
      btn.addEventListener("click", () => {
        this.onSelect({ type: "osm", query: btn.dataset.city });
      });
    }
  }

  setStatus(text) {
    this.status.textContent = text;
  }

  show() { this.container.style.display = "flex"; }
  hide() { this.container.style.display = "none"; }
}
