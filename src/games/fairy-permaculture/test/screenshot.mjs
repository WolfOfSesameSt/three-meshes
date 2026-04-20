import puppeteer from "puppeteer";

const URL = "http://localhost:5173/src/games/fairy-permaculture/index.html";
const OUT = process.argv[2] || "/tmp/fp.png";
const WAIT = 3000;

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });

const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[PAGE ERROR] ${e.message}`));

try {
  await page.goto(URL, { waitUntil: "networkidle0", timeout: 15000 });
} catch (e) {
  logs.push(`nav warn: ${e.message}`);
}
await new Promise((r) => setTimeout(r, WAIT));

const info = await page.evaluate(() => {
  const fp = window.__FP__;
  if (!fp) return { error: "no __FP__" };
  const camera = fp.rig?.camera;
  const target = fp.rig?.target;
  return {
    biomePois: fp.biomeData?.pois?.length,
    chunks: fp.biomeMount?.chunks?.length,
    cameraPos: camera ? { x: camera.position.x.toFixed(1), y: camera.position.y.toFixed(1), z: camera.position.z.toFixed(1) } : null,
    cameraTarget: target ? { x: target.x.toFixed(1), y: target.y.toFixed(1), z: target.z.toFixed(1) } : null,
    orthoL: camera?.left, orthoR: camera?.right, orthoT: camera?.top,
    fleetCount: fp.fleet?.count,
    plantCount: fp.plantManager?.count?.(),
    fairyFood: fp.fairyFood,
    unlocked: fp.treeState ? [...fp.treeState.unlocked] : [],
    day: fp.scheduler?.day,
    drawCalls: fp.renderer?.info?.render,
  };
});

await page.screenshot({ path: OUT, fullPage: false });
console.log(JSON.stringify(info, null, 2));
if (logs.length) { console.log("---LOGS---"); logs.forEach((l) => console.log(l)); }
await browser.close();
