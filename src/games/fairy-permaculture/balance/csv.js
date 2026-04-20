/**
 * Fairy Permaculture — Run → CSV exporter.
 *
 * Emits a plain-text CSV with one row per day. Intentionally dependency-
 * free — just string concatenation. The CLI writes this to disk.
 */

const HEADERS = [
  "day",
  "year",
  "season",
  "fairy_count",
  "biomass_stock",
  "compost_stock",
  "honey",
  "milk",
  "fruit",
  "soil_om",
  "daily_yield",
  "unlocked_nodes",
  "stall_flag",
];

const SEASONS = ["spring", "summer", "autumn", "winter"];

export function runToCsv(run) {
  const n = run.days;
  const rec = run.rec;
  const rows = [HEADERS.join(",")];
  for (let d = 0; d < n; d++) {
    const year = Math.floor(d / 360);
    const dayInYear = d % 360;
    const seasonIndex = Math.min(3, Math.floor(dayInYear / 90));
    const season = SEASONS[seasonIndex];
    rows.push([
      d,
      year,
      season,
      rec.fairyCount[d],
      rec.biomassStock[d].toFixed(2),
      rec.compostStock[d].toFixed(3),
      rec.honeyStock[d].toFixed(2),
      rec.milkStock[d].toFixed(2),
      rec.fruitStock[d].toFixed(2),
      rec.soilOm[d].toFixed(3),
      rec.yieldUnits[d].toFixed(3),
      rec.unlockedCount[d],
      rec.stallFlag[d],
    ].join(","));
  }
  return rows.join("\n") + "\n";
}

/** Summary header to prepend to the CSV report (commented lines). */
export function runHeader(run, result = null) {
  const lines = [];
  lines.push(`# Fairy Permaculture simulator run`);
  lines.push(`# seed=${run.meta.seed} profile=${run.meta.profile} biome=${run.meta.biome} years=${run.meta.years}`);
  lines.push(`# days=${run.days} fairyCountFinal=${run.fairyCountFinal} unlockedFinal=${run.unlockedFinal}`);
  lines.push(`# yearlyYield=[${run.yearlyYield.map(n => n.toFixed(1)).join(", ")}]`);
  lines.push(`# branchInvestment=${JSON.stringify(run.branchInvestment)}`);
  lines.push(`# stocksFinal=${JSON.stringify(run.stocksFinal, null, 0)}`);
  lines.push(`# stallEvents=${run.stallEvents.length} runawayEvents=${run.runawayEvents.length}`);
  if (result) {
    lines.push(`# pass=${result.pass} tolerance=${result.tolerance}`);
    for (const d of result.deviations) {
      lines.push(`# ${d.status.toUpperCase()} ${d.metric}@${d.at}: value=${typeof d.value === 'number' ? d.value.toFixed(1) : d.value} band=[${d.band.join(', ')}] Δ=${d.delta.toFixed(2)}`);
    }
  }
  return lines.join("\n") + "\n";
}
