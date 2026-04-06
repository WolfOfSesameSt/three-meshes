/**
 * Browser screenshot + console capture for visual QA.
 * Takes a screenshot and captures all console output/errors.
 *
 * Usage: node src/games/void-raiders/test/screenshot.js [output-path]
 */

import puppeteer from "puppeteer";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = process.argv[2] || path.join(__dirname, "screenshot.png");

const URL = "http://localhost:5173/src/games/void-raiders/index.html";
const WAIT_MS = parseInt(process.argv[3]) || 4000;

async function takeScreenshot() {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--enable-webgl",
      "--use-gl=angle",
      "--use-angle=swiftshader",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Capture ALL console output
  const logs = [];
  page.on("console", (msg) => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    logs.push(`[PAGE ERROR] ${err.message}`);
  });

  console.log(`Navigating to ${URL}...`);
  try {
    await page.goto(URL, { waitUntil: "networkidle0", timeout: 15000 });
  } catch (e) {
    console.log(`Navigation warning: ${e.message}`);
  }

  // Auto-launch mission if station is showing
  await new Promise((r) => setTimeout(r, 1000));
  try {
    const launched = await page.evaluate(() => {
      const btn = document.querySelector(".station-launch-btn") ||
                  Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("LAUNCH"));
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (launched) console.log("Auto-launched mission from station.");
  } catch (e) {
    console.log("No station launch button found, already in mission.");
  }

  // Open command panel if --tab flag
  if (process.argv.includes("--tab")) {
    await new Promise((r) => setTimeout(r, 2000));
    await page.keyboard.press("Tab");
    console.log("Opened command panel (TAB).");
  }

  // Check WebGL support
  const webglInfo = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return { error: "No canvas found" };
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return { error: "No WebGL context" };
    return {
      renderer: gl.getParameter(gl.RENDERER),
      vendor: gl.getParameter(gl.VENDOR),
      width: canvas.width,
      height: canvas.height,
    };
  });
  console.log("\nWebGL info:", JSON.stringify(webglInfo, null, 2));

  // Check renderer stats
  const sceneInfo = await page.evaluate(() => {
    if (!window.__renderer) return { error: "No renderer exposed" };
    return window.__renderer.info.render;
  });
  console.log("Scene info:", JSON.stringify(sceneInfo, null, 2));

  console.log(`\nWaiting ${WAIT_MS}ms for scene to settle...`);
  await new Promise((r) => setTimeout(r, WAIT_MS));

  // Read game state
  const gameState = await page.evaluate(() => {
    return window.__gameState ? window.__gameState() : "no __gameState";
  });
  console.log("\nGame state:", JSON.stringify(gameState, null, 2));

  await page.screenshot({ path: outputPath, fullPage: false });
  console.log(`\nScreenshot saved to: ${outputPath}`);

  if (logs.length > 0) {
    console.log("\nBrowser console output:");
    logs.forEach((l) => console.log(`  ${l}`));
  } else {
    console.log("\nNo console output captured.");
  }

  await browser.close();
}

takeScreenshot().catch((err) => {
  console.error("Screenshot failed:", err.message);
  process.exit(1);
});
