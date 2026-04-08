/**
 * Void Raiders — Music Laboratory
 *
 * A dev tool for configuring the game's four musical situations
 * (station, mission, combat, extraction), auditioning candidate tracks,
 * and generating new music via ElevenLabs.
 *
 * When the user clicks "Save Configuration", the merged config is
 * written to localStorage under "vr-music-config-v1". The main game
 * (main.js → music-config.js) reads from the same key, so saved
 * changes take effect on the next situation transition.
 */

import {
  MUSIC_SITUATIONS,
  DEFAULT_MUSIC_CONFIG,
  getMusicConfig,
  saveMusicConfig,
  resetMusicConfig,
} from "../audio/music-config.js";

// ───────────────────────────────────────────────────────────────
// State
// ───────────────────────────────────────────────────────────────

/** Current (possibly-unsaved) working config. */
let workingConfig = structuredClone(getMusicConfig());
/** Snapshot of the last saved config, for the dirty flag. */
let savedConfig = structuredClone(getMusicConfig());
/** Which situation is currently selected in the left column. */
let selectedSituation = "station";
/** All music files on disk, loaded from /__music_lab/list. */
let availableFiles = [];
/** ElevenLabs budget, loaded alongside files. */
let budget = { totalCreditsUsed: 0, limit: 50000, generations: [] };
/** Currently active mood tags in the composer. */
const selectedTags = new Set();

const MOOD_TAGS = [
  "dark", "hopeful", "tense", "calm", "frantic", "heroic",
  "mysterious", "triumphant", "melancholy", "driving", "ambient", "orchestral",
  "synthwave", "cinematic", "ominous", "uplifting",
];

// ───────────────────────────────────────────────────────────────
// DOM refs
// ───────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const els = {
  situations: $("situations"),
  editorTitle: $("editor-title"),
  editor: $("editor"),
  editDescription: $("edit-description"),
  editFade: $("edit-fade"),
  currentTrackDisplay: $("current-track-display"),
  fileList: $("file-list"),
  budgetUsed: $("budget-used"),
  budgetLimit: $("budget-limit"),
  budgetRemaining: $("budget-remaining"),
  saveBtn: $("save-btn"),
  resetBtn: $("reset-btn"),

  moodTags: $("mood-tags"),
  composerDescription: $("composer-description"),
  composerDuration: $("composer-duration"),
  composerName: $("composer-name"),
  composerCost: $("composer-cost"),
  promptPreview: $("prompt-preview"),
  buildPromptBtn: $("build-prompt-btn"),
  planBtn: $("plan-btn"),
  generateBtn: $("generate-btn"),
  composerStatus: $("composer-status"),

  playerBar: $("player-bar"),
  audioPlayer: $("audio-player"),
  nowPlaying: $("now-playing"),
  playerClose: $("player-close"),

  overlay: $("overlay"),
  overlayTitle: $("overlay-title"),
  overlayMsg: $("overlay-msg"),
};

// ───────────────────────────────────────────────────────────────
// API helpers
// ───────────────────────────────────────────────────────────────

async function apiGet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `${url} → ${res.status}`);
  return json;
}

async function loadFilesAndBudget() {
  try {
    const data = await apiGet("/__music_lab/list");
    availableFiles = data.files;
    budget = data.budget;
    renderBudget();
    renderFileList();
  } catch (e) {
    console.error("Failed to load files:", e);
    els.budgetUsed.textContent = "ERR";
  }
}

// ───────────────────────────────────────────────────────────────
// Render — left column (situations)
// ───────────────────────────────────────────────────────────────

function isSituationDirty(key) {
  const w = workingConfig[key];
  const s = savedConfig[key];
  return (
    w.track !== s.track ||
    w.description !== s.description ||
    Number(w.fadeDuration) !== Number(s.fadeDuration)
  );
}

function anyDirty() {
  return MUSIC_SITUATIONS.some(isSituationDirty);
}

function renderSituations() {
  els.situations.innerHTML = "";
  for (const key of MUSIC_SITUATIONS) {
    const cfg = workingConfig[key];
    const dirty = isSituationDirty(key);
    const card = document.createElement("div");
    card.className = "situation" +
      (key === selectedSituation ? " active" : "") +
      (dirty ? " dirty" : "");
    card.innerHTML = `
      <div class="label">
        <span>${cfg.label}</span>
        ${dirty ? '<span class="badge">UNSAVED</span>' : ""}
      </div>
      <div class="description">${escapeHtml(cfg.description)}</div>
      <div class="track">
        <button class="play-btn" data-play="${cfg.track}" title="Play">▶</button>
        <span class="file">${filenameFrom(cfg.track)}</span>
      </div>
    `;
    card.addEventListener("click", (e) => {
      if (e.target.closest("[data-play]")) return;
      selectedSituation = key;
      renderSituations();
      renderEditor();
    });
    card.querySelector("[data-play]").addEventListener("click", (e) => {
      e.stopPropagation();
      playTrack(cfg.track, `${cfg.label} — ${filenameFrom(cfg.track)}`);
    });
    els.situations.appendChild(card);
  }

  els.saveBtn.disabled = !anyDirty();
  els.saveBtn.textContent = anyDirty() ? "Save Configuration *" : "Save Configuration";
}

// ───────────────────────────────────────────────────────────────
// Render — middle column (editor)
// ───────────────────────────────────────────────────────────────

function renderEditor() {
  const cfg = workingConfig[selectedSituation];
  els.editorTitle.textContent = `Edit: ${cfg.label}`;
  els.editor.style.display = "block";
  els.editDescription.value = cfg.description;
  els.editFade.value = cfg.fadeDuration;
  els.currentTrackDisplay.textContent = filenameFrom(cfg.track);
  renderFileList();
}

function renderFileList() {
  if (!els.editor || els.editor.style.display === "none") return;
  const cfg = workingConfig[selectedSituation];
  const currentFilename = filenameFrom(cfg.track);
  els.fileList.innerHTML = "";

  if (availableFiles.length === 0) {
    els.fileList.innerHTML = '<div class="file-item" style="color:#6868a0; cursor:default;">No music files found in public/audio/music/</div>';
    return;
  }

  for (const file of availableFiles) {
    const item = document.createElement("div");
    const isCurrent = file.filename === currentFilename;
    item.className = "file-item" + (isCurrent ? " current" : "");
    const metaParts = [];
    if (file.prompt) metaParts.push(truncate(file.prompt, 90));
    if (file.generatedAt) metaParts.push(file.generatedAt.slice(0, 10));
    item.innerHTML = `
      <div class="fname">
        <button class="play-btn" data-play="${file.url}">▶</button>
        <span class="name">${file.filename}</span>
        ${isCurrent ? '<span style="color:#60d0a0; font-size:9px;">CURRENT</span>' : ""}
      </div>
      ${metaParts.length ? `<div class="fmeta">${escapeHtml(metaParts.join(" · "))}</div>` : ""}
    `;
    item.addEventListener("click", (e) => {
      if (e.target.closest("[data-play]")) return;
      workingConfig[selectedSituation].track = file.url;
      renderSituations();
      renderEditor();
    });
    item.querySelector("[data-play]").addEventListener("click", (e) => {
      e.stopPropagation();
      playTrack(file.url, file.filename);
    });
    els.fileList.appendChild(item);
  }
}

// ───────────────────────────────────────────────────────────────
// Render — budget
// ───────────────────────────────────────────────────────────────

function renderBudget() {
  els.budgetUsed.textContent = budget.totalCreditsUsed.toLocaleString();
  els.budgetLimit.textContent = budget.limit.toLocaleString();
  els.budgetRemaining.textContent = (budget.limit - budget.totalCreditsUsed).toLocaleString();
}

// ───────────────────────────────────────────────────────────────
// Editor field bindings
// ───────────────────────────────────────────────────────────────

els.editDescription.addEventListener("input", (e) => {
  workingConfig[selectedSituation].description = e.target.value;
  renderSituations();
});
els.editFade.addEventListener("input", (e) => {
  workingConfig[selectedSituation].fadeDuration = parseFloat(e.target.value) || 0;
  renderSituations();
});

// ───────────────────────────────────────────────────────────────
// Audio player
// ───────────────────────────────────────────────────────────────

function playTrack(url, label) {
  els.audioPlayer.src = url;
  els.audioPlayer.play().catch((e) => console.warn("Play failed:", e));
  els.nowPlaying.textContent = label || url;
  els.playerBar.classList.add("visible");
}

els.playerClose.addEventListener("click", () => {
  els.audioPlayer.pause();
  els.audioPlayer.src = "";
  els.playerBar.classList.remove("visible");
});

// ───────────────────────────────────────────────────────────────
// Composer — mood tags
// ───────────────────────────────────────────────────────────────

function renderTags() {
  els.moodTags.innerHTML = "";
  for (const tag of MOOD_TAGS) {
    const el = document.createElement("div");
    el.className = "tag" + (selectedTags.has(tag) ? " active" : "");
    el.textContent = tag;
    el.addEventListener("click", () => {
      if (selectedTags.has(tag)) selectedTags.delete(tag);
      else selectedTags.add(tag);
      renderTags();
    });
    els.moodTags.appendChild(el);
  }
}

// ───────────────────────────────────────────────────────────────
// Composer — prompt builder
// ───────────────────────────────────────────────────────────────

/**
 * Turn a free-form description + mood tags into an ElevenLabs-friendly
 * music prompt. The style is modelled on the existing prompts in
 * .budget.json: mood tags, instruments, atmosphere, short clauses.
 */
function buildPrompt() {
  const desc = els.composerDescription.value.trim();
  if (!desc) {
    els.composerStatus.className = "status-line err";
    els.composerStatus.textContent = "Write a description first.";
    return;
  }
  const tags = Array.from(selectedTags);
  const parts = [];
  if (tags.length) parts.push(tags.join(", "));
  parts.push(desc);
  parts.push("instrumental, sci-fi game soundtrack, cinematic production, looping composition");
  const prompt = parts.join(", ");
  els.promptPreview.textContent = prompt;
  els.composerStatus.className = "status-line ok";
  els.composerStatus.textContent = "Prompt ready. You can edit it directly before generating.";
  // Auto-suggest a filename if empty
  if (!els.composerName.value.trim()) {
    const suggested = slugify(desc.split(/\s+/).slice(0, 5).join("-"));
    if (suggested) els.composerName.value = suggested;
  }
}

els.buildPromptBtn.addEventListener("click", buildPrompt);

// ───────────────────────────────────────────────────────────────
// Composer — cost estimate
// ───────────────────────────────────────────────────────────────

function updateCost() {
  const duration = Number(els.composerDuration.value) || 30;
  const mins = Math.ceil(duration / 60);
  const cost = mins * 500;
  els.composerCost.textContent = `Est. cost: ${cost} credits (${mins} min × 500)`;
}
els.composerDuration.addEventListener("input", updateCost);

// ───────────────────────────────────────────────────────────────
// Composer — plan (free) + generate
// ───────────────────────────────────────────────────────────────

function getCurrentPrompt() {
  // Allow direct edits to the prompt preview box
  const txt = els.promptPreview.textContent.trim();
  if (!txt || txt.startsWith("Click \"Build Prompt\"")) return null;
  return txt;
}

els.planBtn.addEventListener("click", async () => {
  const prompt = getCurrentPrompt() || els.composerDescription.value.trim();
  if (!prompt) {
    els.composerStatus.className = "status-line err";
    els.composerStatus.textContent = "Need a prompt or description first.";
    return;
  }
  showOverlay("Previewing composition…", "Asking ElevenLabs for a free composition plan.");
  try {
    const data = await apiPost("/__music_lab/plan", { prompt });
    els.composerStatus.className = "status-line info";
    if (data.plan) {
      const sections = Array.isArray(data.plan.sections) ? data.plan.sections : [];
      const summary = sections.length
        ? sections.map((s, i) => `${i + 1}. ${s.section_name || s.name || "section"}`).join("  ")
        : "Plan received.";
      els.composerStatus.textContent = `Plan: ${summary}`;
    } else {
      els.composerStatus.textContent = "Plan received (check devtools for details).";
      console.log("Plan raw:", data.raw);
    }
  } catch (e) {
    els.composerStatus.className = "status-line err";
    els.composerStatus.textContent = `Plan failed: ${e.message}`;
  } finally {
    hideOverlay();
  }
});

els.generateBtn.addEventListener("click", async () => {
  const prompt = getCurrentPrompt();
  if (!prompt) {
    els.composerStatus.className = "status-line err";
    els.composerStatus.textContent = "Click 'Build Prompt' first, or type one manually.";
    return;
  }
  const duration = Number(els.composerDuration.value) || 30;
  const name = els.composerName.value.trim();
  if (!name) {
    els.composerStatus.className = "status-line err";
    els.composerStatus.textContent = "Give the track a filename.";
    return;
  }

  const estimatedCost = Math.ceil(duration / 60) * 500;
  if (!confirm(`Generate "${name}.mp3" (${duration}s)?\n\nEstimated cost: ${estimatedCost} credits.\nThis will call ElevenLabs and consume real credits.`)) {
    return;
  }

  showOverlay(
    "Generating music…",
    `Calling ElevenLabs for "${name}.mp3" (${duration}s). This usually takes 20–40 seconds.`
  );
  try {
    const data = await apiPost("/__music_lab/generate", { prompt, duration, name });
    budget = data.budget;
    renderBudget();
    await loadFilesAndBudget();
    els.composerStatus.className = "status-line ok";
    els.composerStatus.textContent = `Generated ${data.filename} (${data.credits} credits). Now available in the track library.`;
    // Auto-play the new track
    playTrack(data.url, data.filename);
  } catch (e) {
    els.composerStatus.className = "status-line err";
    els.composerStatus.textContent = `Generate failed: ${e.message}`;
  } finally {
    hideOverlay();
  }
});

// ───────────────────────────────────────────────────────────────
// Save / reset
// ───────────────────────────────────────────────────────────────

els.saveBtn.addEventListener("click", () => {
  saveMusicConfig(workingConfig);
  savedConfig = structuredClone(workingConfig);
  // Notify any open game tab in the same window
  window.dispatchEvent(new CustomEvent("vr-music-config-changed"));
  renderSituations();
  flashStatus("Saved! The game will pick up changes on the next situation transition.", "ok");
});

els.resetBtn.addEventListener("click", () => {
  if (!confirm("Reset all situations to their default descriptions, tracks, and fade durations?")) return;
  resetMusicConfig();
  workingConfig = structuredClone(DEFAULT_MUSIC_CONFIG);
  savedConfig = structuredClone(DEFAULT_MUSIC_CONFIG);
  window.dispatchEvent(new CustomEvent("vr-music-config-changed"));
  renderSituations();
  renderEditor();
  flashStatus("Reset to defaults.", "info");
});

function flashStatus(msg, kind) {
  els.composerStatus.className = `status-line ${kind}`;
  els.composerStatus.textContent = msg;
}

// ───────────────────────────────────────────────────────────────
// Overlay helpers
// ───────────────────────────────────────────────────────────────

function showOverlay(title, msg) {
  els.overlayTitle.textContent = title;
  els.overlayMsg.textContent = msg;
  els.overlay.classList.add("visible");
}
function hideOverlay() {
  els.overlay.classList.remove("visible");
}

// ───────────────────────────────────────────────────────────────
// Utilities
// ───────────────────────────────────────────────────────────────

function filenameFrom(url) {
  return url?.split("/").pop() || url || "—";
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[c]);
}
function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

// ───────────────────────────────────────────────────────────────
// Init
// ───────────────────────────────────────────────────────────────

async function init() {
  renderTags();
  updateCost();
  await loadFilesAndBudget();
  renderSituations();
  renderEditor();
}

init();
