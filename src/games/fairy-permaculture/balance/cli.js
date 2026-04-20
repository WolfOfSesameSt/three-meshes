#!/usr/bin/env node
/**
 * Fairy Permaculture — progression-simulator CLI.
 *
 * Usage:
 *   npm run simulate -- --seed 42 --years 3 --profile typical \
 *       --biome bc-coastal --report out/sim-42-typical.csv
 *
 * Flags:
 *   --seed N          integer seed (default 42)
 *   --years N         game-years to simulate (default 3)
 *   --profile NAME    ideal | typical | naive | chaotic (default typical)
 *   --biome ID        biome id (default bc-coastal)
 *   --report PATH     CSV output path (default out/sim-<ts>.csv)
 *   --chart PATH      optional PNG path (skipped if node-canvas absent)
 *   --quiet           suppress stdout summary
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { runSimulation } from "./simulator.js";
import { compareToTargets, summarize } from "./targets.js";
import { runToCsv, runHeader } from "./csv.js";
import { runToPng } from "./chart.js";

function parseArgs(argv) {
  const args = {
    seed: 42,
    years: 3,
    profile: "typical",
    biome: "bc-coastal",
    report: null,
    chart: null,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--seed":    args.seed = Number(argv[++i]); break;
      case "--years":   args.years = Number(argv[++i]); break;
      case "--profile": args.profile = String(argv[++i]); break;
      case "--biome":   args.biome = String(argv[++i]); break;
      case "--report":  args.report = String(argv[++i]); break;
      case "--chart":   args.chart = String(argv[++i]); break;
      case "--quiet":   args.quiet = true; break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
      default:
        console.error(`Unknown flag: ${a}`);
        printUsage();
        process.exit(2);
    }
  }
  return args;
}

function printUsage() {
  console.error(`Usage: simulate [--seed N] [--years N] [--profile P] [--biome B] [--report PATH] [--chart PATH] [--quiet]`);
}

function defaultReportPath() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
  return resolve("out", `sim-${ts}.csv`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const t0 = Date.now();
  const run = runSimulation({
    seed: args.seed,
    years: args.years,
    profile: args.profile,
    biome: args.biome,
  });
  const elapsed = Date.now() - t0;
  const result = compareToTargets(run);

  const reportPath = resolve(args.report ?? defaultReportPath());
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, runHeader(run, result) + runToCsv(run));

  let chartOut = null;
  if (args.chart) {
    const chartPath = resolve(args.chart);
    mkdirSync(dirname(chartPath), { recursive: true });
    chartOut = await runToPng(run, chartPath);
  }

  if (!args.quiet) {
    console.log(`sim done in ${elapsed} ms — seed=${args.seed} profile=${args.profile} years=${args.years}`);
    console.log(`CSV → ${reportPath}`);
    if (chartOut) {
      if (chartOut.skipped) console.log(`PNG skipped: ${chartOut.reason}`);
      else console.log(`PNG → ${chartOut.path} (${chartOut.bytes} bytes)`);
    }
    console.log(summarize(result));
    console.log(`fairyCountFinal=${run.fairyCountFinal} unlockedFinal=${run.unlockedFinal}`);
    console.log(`yearlyYield=[${run.yearlyYield.map(n => n.toFixed(1)).join(", ")}]`);
    console.log(`branchInvestment=${JSON.stringify(run.branchInvestment)}`);
  }

  // Exit 0 regardless of target-band pass/fail — the report is the value.
  // Non-zero only on crashes (uncaught exceptions).
  process.exit(0);
}

main().catch((err) => {
  console.error("simulator failed:", err);
  process.exit(1);
});
