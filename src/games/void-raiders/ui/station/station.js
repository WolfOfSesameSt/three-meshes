/**
 * Station Screen Manager — toggles between station view and mission view.
 *
 * Manages the lifecycle of all station sub-screens:
 *   - Main hub (navigation)
 *   - Galaxy Map (realm selection)
 *   - Shipyard (mothership upgrades)
 *   - Drone Bay (fleet management)
 *   - Research (unlock routine engine values)
 *
 * Imports station.css into the page.
 */

import { StationMain } from "./station-main.js";
import { StationGalaxy } from "./station-galaxy.js";
import { StationShipyard } from "./station-shipyard.js";
import { StationDrones } from "./station-drones.js";
import { StationResearch } from "./station-research.js";
import "./station.css";

export class Station {
  /**
   * @param {object} callbacks
   * @param {function} callbacks.onLaunch — called when player clicks LAUNCH
   */
  constructor(callbacks) {
    this._onLaunch = callbacks.onLaunch;
    this._currentScreen = null;

    // Create all sub-screens
    this.main = new StationMain({
      onNavigate: (screen) => this._navigate(screen),
      onLaunch: () => this._launch(),
    });

    this.galaxy = new StationGalaxy({
      onBack: () => this._navigate("main"),
    });

    this.shipyard = new StationShipyard({
      onBack: () => this._navigate("main"),
    });

    this.drones = new StationDrones({
      onBack: () => this._navigate("main"),
    });

    this.research = new StationResearch({
      onBack: () => this._navigate("main"),
    });

    this._screens = {
      main: this.main,
      galaxy: this.galaxy,
      shipyard: this.shipyard,
      drones: this.drones,
      research: this.research,
    };
  }

  /**
   * Show the station (starting at main screen).
   */
  show() {
    this._navigate("main");
  }

  /**
   * Hide all station screens.
   */
  hide() {
    for (const screen of Object.values(this._screens)) {
      screen.hide();
    }
    this._currentScreen = null;
  }

  /**
   * Navigate to a sub-screen.
   * @param {string} name — "main" | "galaxy" | "shipyard" | "drones" | "research"
   */
  _navigate(name) {
    // Hide current
    if (this._currentScreen) {
      this._screens[this._currentScreen]?.hide();
    }
    // Show new
    this._currentScreen = name;
    this._screens[name]?.show();
  }

  /**
   * Launch — hide station and trigger mission start.
   */
  _launch() {
    this.hide();
    this._onLaunch();
  }

  dispose() {
    for (const screen of Object.values(this._screens)) {
      screen.dispose();
    }
  }
}
