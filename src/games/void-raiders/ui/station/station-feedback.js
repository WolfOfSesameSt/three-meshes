/**
 * Station UI feedback — sounds + visual flash effects for purchases,
 * upgrades, research, and denied actions.
 *
 * Call these from any station screen to get consistent audio + visual feedback.
 */

// Audio manager reference — set by main.js
let _audio = null;
let _preloaded = false;

const UI_SOUNDS = {
  "ui-click": "/audio/sfx/ui-click.mp3",
  "ui-alert": "/audio/sfx/ui-alert.mp3",
  "ui-upgrade": "/audio/sfx/ui-upgrade.mp3",
  "ui-purchase": "/audio/sfx/ui-purchase.mp3",
  "ui-denied": "/audio/sfx/ui-denied.mp3",
  "ui-research": "/audio/sfx/ui-research.mp3",
  "ui-build-drone": "/audio/sfx/ui-build-drone.mp3",
};

/**
 * Set the audio manager reference (called once from main.js).
 */
export function setAudioManager(audioManager) {
  _audio = audioManager;
}

/**
 * Play a non-spatial UI sound.
 * Auto-initializes the AudioContext and preloads UI sounds on first call.
 */
function playUI(name) {
  if (!_audio) return;
  // Init context on first user interaction (station clicks happen before LAUNCH)
  _audio.initFromUserGesture();
  // Lazy-preload UI sounds and start station music on first interaction
  if (!_preloaded) {
    _preloaded = true;
    _audio.preload(UI_SOUNDS);
    _audio.playMusic("/audio/music/station-theme.mp3", { fadeDuration: 1 });
  }
  _audio.playUI(name);
}

/**
 * Flash a button green with a brief "SUCCESS" state.
 */
function flashSuccess(button) {
  button.classList.add("station-btn-success");
  setTimeout(() => button.classList.remove("station-btn-success"), 600);
}

/**
 * Flash a button red with a brief "DENIED" state.
 */
function flashDenied(button) {
  button.classList.add("station-btn-denied");
  setTimeout(() => button.classList.remove("station-btn-denied"), 600);
}

/**
 * Show a floating "+resource" text that fades upward.
 */
function showFloatingText(text, x, y, color = "#44dd88") {
  const el = document.createElement("div");
  el.className = "station-float-text";
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.color = color;
  document.body.appendChild(el);
  // Animate upward and fade
  requestAnimationFrame(() => {
    el.style.transform = "translateY(-40px)";
    el.style.opacity = "0";
  });
  setTimeout(() => el.remove(), 800);
}

// ─── High-Level Feedback Functions ──────────────────────────

/**
 * Successful purchase (drone build, resource spend).
 */
export function feedbackPurchase(button, itemName) {
  playUI("ui-purchase");
  flashSuccess(button);
  if (button) {
    const rect = button.getBoundingClientRect();
    showFloatingText(`Built ${itemName}`, rect.left + rect.width / 2, rect.top, "#44dd88");
  }
}

/**
 * Successful upgrade (mothership stat increase).
 */
export function feedbackUpgrade(button, statName) {
  playUI("ui-upgrade");
  flashSuccess(button);
  if (button) {
    const rect = button.getBoundingClientRect();
    showFloatingText(`${statName} upgraded!`, rect.left + rect.width / 2, rect.top, "#4a9eff");
  }
}

/**
 * Successful research unlock.
 */
export function feedbackResearch(button, researchName) {
  playUI("ui-research");
  flashSuccess(button);
  if (button) {
    const rect = button.getBoundingClientRect();
    showFloatingText(`Unlocked: ${researchName}`, rect.left + rect.width / 2, rect.top, "#aa66ff");
  }
}

/**
 * Successful craft completion.
 */
export function feedbackCraft(button, itemName) {
  playUI("ui-purchase");
  flashSuccess(button);
  if (button) {
    const rect = button.getBoundingClientRect();
    showFloatingText(`Crafted ${itemName}`, rect.left + rect.width / 2, rect.top, "#ffaa30");
  }
}

/**
 * Drone built.
 */
export function feedbackBuildDrone(button, droneName) {
  playUI("ui-build-drone");
  flashSuccess(button);
  if (button) {
    const rect = button.getBoundingClientRect();
    showFloatingText(`${droneName} built!`, rect.left + rect.width / 2, rect.top, "#44dd88");
  }
}

/**
 * Denied / can't afford.
 */
export function feedbackDenied(button) {
  playUI("ui-denied");
  flashDenied(button);
}

/**
 * Generic button click.
 */
export function feedbackClick() {
  playUI("ui-click");
}
