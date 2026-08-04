#!/usr/bin/env node
// Compares the calendar-derived custody classification (compute-custody-split's
// day-by-day owner map) against a ground-truth schedule export (per-day
// Mat/Claire flags, e.g. from the "Data" tab of the shared schedule workbook)
// and reports every date where they disagree.
//
// Usage:
//   node scripts/build-exception-report.mjs <raw-events.json> <ground-truth.json> <rangeStart> <rangeEnd>
//
// ground-truth.json shape: { "YYYY-MM-DD": { "owner": "claire"|"parent2"|null, "comment": string|null }, ... }

import { readFileSync, writeFileSync } from "node:fs";
import { loadEvents, buildDateOwnerMap, addDays } from "./compute-custody-split.mjs";

const [, , eventsPath, truthPath, rangeStartArg, rangeEndArg] = process.argv;
if (!eventsPath || !truthPath) {
  console.error("Usage: build-exception-report.mjs <raw-events.json> <ground-truth.json> [rangeStart] [rangeEnd]");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const rangeStart = rangeStartArg || `${today.slice(0, 4)}-01-01`;
const rangeEnd = rangeEndArg || addDays(today, 1);

const events = loadEvents(eventsPath);
const calendarMap = buildDateOwnerMap(events, rangeStart, rangeEnd);
const truth = JSON.parse(readFileSync(truthPath, "utf8"));

const exceptions = [];
let d = rangeStart;
while (d < rangeEnd) {
  const calOwner = calendarMap.get(d) || null;
  const truthEntry = truth[d];
  const truthOwner = truthEntry ? truthEntry.owner : null;
  if (calOwner !== truthOwner) {
    exceptions.push({
      date: d,
      calendarOwner: calOwner,
      scheduleOwner: truthOwner,
      scheduleComment: truthEntry ? truthEntry.comment : null,
      type: calOwner === null ? "calendar_gap" : truthOwner === null ? "schedule_gap" : "conflict",
    });
  }
  d = addDays(d, 1);
}

const summary = {
  rangeStart,
  rangeEnd,
  totalDays: exceptions.length + (() => {
    let n = 0, dd = rangeStart;
    while (dd < rangeEnd) { n++; dd = addDays(dd, 1); }
    return n;
  })() - exceptions.length,
  exceptionCount: exceptions.length,
  byType: {
    conflict: exceptions.filter((e) => e.type === "conflict").length,
    calendar_gap: exceptions.filter((e) => e.type === "calendar_gap").length,
    schedule_gap: exceptions.filter((e) => e.type === "schedule_gap").length,
  },
};

const result = { generatedAt: new Date().toISOString(), rangeStart, rangeEnd, summary, exceptions };
const outPath = process.env.OUT_PATH;
const json = JSON.stringify(result, null, 2);
if (outPath) writeFileSync(outPath, json);
else process.stdout.write(json + "\n");
