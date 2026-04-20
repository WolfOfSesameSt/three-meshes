/**
 * Fairy Permaculture — Run → PNG chart exporter.
 *
 * This module only produces a PNG if node-canvas is installed. It
 * isn't in this project's devDependencies (per the GDD the image
 * export is optional), so the function returns a "skipped" sentinel
 * with a clear message — the CSV is the canonical report.
 *
 * If/when `canvas` is added to devDependencies, drop the dynamic import
 * and render directly.
 */

export async function runToPng(run, outPath) {
  try {
    // Dynamic import — will throw if canvas isn't installed.
    const mod = await import("canvas");
    if (!mod?.createCanvas) throw new Error("no canvas");
    return drawAndWrite(mod, run, outPath);
  } catch (err) {
    return {
      skipped: true,
      reason: "node-canvas not installed; install `npm i -D canvas` to enable PNG output",
    };
  }
}

async function drawAndWrite(canvasMod, run, outPath) {
  const { createCanvas } = canvasMod;
  const W = 1600, H = 900;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f7f3e8";
  ctx.fillRect(0, 0, W, H);

  const { rec, days } = run;
  const padding = 60;
  const plotW = W - padding * 2;
  const plotH = H - padding * 2;

  // Fairy count — primary axis (left)
  let maxF = 1;
  for (let i = 0; i < days; i++) if (rec.fairyCount[i] > maxF) maxF = rec.fairyCount[i];
  maxF = Math.max(10, Math.ceil(maxF * 1.1));

  // Biomass — secondary axis (right)
  let maxB = 1;
  for (let i = 0; i < days; i++) if (rec.biomassStock[i] > maxB) maxB = rec.biomassStock[i];
  maxB = Math.max(100, Math.ceil(maxB * 1.1));

  // Axes
  ctx.strokeStyle = "#333";
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, padding + plotH);
  ctx.lineTo(padding + plotW, padding + plotH);
  ctx.stroke();

  // Fairy curve — warm coral
  ctx.strokeStyle = "#F28E74";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < days; i++) {
    const x = padding + (i / days) * plotW;
    const y = padding + plotH - (rec.fairyCount[i] / maxF) * plotH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Biomass curve — meadow green
  ctx.strokeStyle = "#5A7A4B";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < days; i++) {
    const x = padding + (i / days) * plotW;
    const y = padding + plotH - (rec.biomassStock[i] / maxB) * plotH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Title
  ctx.fillStyle = "#333";
  ctx.font = "bold 20px sans-serif";
  ctx.fillText(
    `Fairy Permaculture — ${run.meta.profile} | seed=${run.meta.seed} | ${run.meta.years}y`,
    padding, 30
  );
  ctx.font = "14px sans-serif";
  ctx.fillStyle = "#F28E74";
  ctx.fillText(`fairies (max ${maxF})`, padding, 52);
  ctx.fillStyle = "#5A7A4B";
  ctx.fillText(`biomass (max ${Math.round(maxB)})`, padding + 180, 52);

  const buf = canvas.toBuffer("image/png");
  const fs = await import("node:fs");
  fs.writeFileSync(outPath, buf);
  return { skipped: false, bytes: buf.length, path: outPath };
}
