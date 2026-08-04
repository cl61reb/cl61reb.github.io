#!/usr/bin/env node
// Generates a ground-truth-shaped JSON file from the regular 3-2-2 rotation
// (scripts/usual-schedule.mjs), for use as the comparison baseline in
// scripts/build-exception-report.mjs.
//
// Usage:
//   node scripts/generate-usual-schedule.mjs <rangeStart> <rangeEnd> > data/usual-schedule.json

import { writeFileSync } from "node:fs";
import { usualOwner } from "./usual-schedule.mjs";
import { addDays } from "./compute-custody-split.mjs";

const [, , rangeStart, rangeEnd] = process.argv;
if (!rangeStart || !rangeEnd) {
  console.error("Usage: generate-usual-schedule.mjs <rangeStart> <rangeEnd>");
  process.exit(1);
}

const out = {};
let d = rangeStart;
while (d < rangeEnd) {
  out[d] = { owner: usualOwner(d), comment: null };
  d = addDays(d, 1);
}

const outPath = process.env.OUT_PATH;
const json = JSON.stringify(out, null, 2);
if (outPath) writeFileSync(outPath, json);
else process.stdout.write(json + "\n");
