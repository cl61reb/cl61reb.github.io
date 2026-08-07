#!/usr/bin/env node
// Night-by-night comparison of who actually has the children against who the
// usual 3-2-2 rotation says would.
//
//   node scripts/build-nightly-detail.mjs <raw-events.json> <usual-schedule.json> <start> <end>
//
// Any night where the two disagree is a departure from the rotation. Those
// normally come in pairs — one parent takes a night that would have been the
// other's, and gives one back — which nets out to nothing. A departure with no
// matching one in the other direction is a night one parent has gained and not
// returned: an UNSWAPPED EXTRA NIGHT.
//
// Departures are paired off in date order, one of each parent's against the
// other's. Whatever is left over in the longer list is unswapped, and it is the
// LATEST such nights that are flagged: the earlier ones had a counterpart
// available to pair with, so the outstanding ones are the most recent.
//
// A night is only compared when both sides have an answer. A night the calendar
// says nothing about is reported as `unassigned` rather than counted as a
// departure, since a missing entry is not a swap.

import { readFileSync, writeFileSync } from "node:fs";
import { loadEvents, buildDateOwnerMap, loadCorrections, addDays } from "./compute-custody-split.mjs";

const [, , eventsPath, usualPath, rangeStartArg, rangeEndArg] = process.argv;
if (!eventsPath || !usualPath) {
  console.error("Usage: build-nightly-detail.mjs <raw-events.json> <usual-schedule.json> [start] [end]");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const rangeStart = rangeStartArg || `${today.slice(0, 7)}-01`;
const rangeEnd = rangeEndArg || addDays(rangeStart, 31);

const events = loadEvents(eventsPath);
const actualByDate = buildDateOwnerMap(events, rangeStart, rangeEnd, loadCorrections());
const usual = JSON.parse(readFileSync(usualPath, "utf8"));

// The calendar entry that decided a night, for context on the ones that differ.
function decidingEvent(date, owner) {
  const covering = events
    .filter((e) => e.owner === owner && e.start <= date && date < e.end)
    .sort((a, b) => a.updated.localeCompare(b.updated));
  return covering.length ? covering[covering.length - 1].summary : null;
}

const nights = [];
let d = rangeStart;
while (d < rangeEnd) {
  const actual = actualByDate.get(d) || null;
  const usualOwner = usual[d] ? usual[d].owner : null;
  nights.push({
    date: d,
    actual,
    usual: usualOwner,
    status: !actual ? "unassigned" : !usualOwner ? "unknown" : actual === usualOwner ? "match" : "differs",
  });
  d = addDays(d, 1);
}

// Pair departures off against each other; the remainder is unswapped.
const differs = nights.filter((n) => n.status === "differs");
const gained = {
  claire: differs.filter((n) => n.actual === "claire"),
  parent2: differs.filter((n) => n.actual === "parent2"),
};
const paired = Math.min(gained.claire.length, gained.parent2.length);
const unswappedOwner =
  gained.claire.length > gained.parent2.length ? "claire"
  : gained.parent2.length > gained.claire.length ? "parent2"
  : null;
const unswappedCount = Math.abs(gained.claire.length - gained.parent2.length);

// Earlier departures had a counterpart to pair with, so the outstanding ones
// are the latest.
const unswappedDates = new Set(
  unswappedOwner ? gained[unswappedOwner].slice(paired).map((n) => n.date) : []
);

for (const night of nights) {
  if (night.status !== "differs") continue;
  night.status = unswappedDates.has(night.date) ? "unswapped" : "swapped";
  night.note = decidingEvent(night.date, night.actual);
}

const counts = nights.reduce(
  (acc, n) => {
    if (n.actual) acc.actual[n.actual]++;
    if (n.usual) acc.usual[n.usual]++;
    acc.byStatus[n.status] = (acc.byStatus[n.status] || 0) + 1;
    return acc;
  },
  { actual: { claire: 0, parent2: 0 }, usual: { claire: 0, parent2: 0 }, byStatus: {} }
);

const result = {
  generatedAt: new Date().toISOString(),
  rangeStart,
  rangeEnd,
  names: { claire: "Claire", parent2: "Mat" },
  summary: {
    nights: nights.length,
    actual: counts.actual,
    usual: counts.usual,
    matching: counts.byStatus.match || 0,
    swapped: counts.byStatus.swapped || 0,
    unassigned: counts.byStatus.unassigned || 0,
    unswapped: {
      count: unswappedCount,
      owner: unswappedOwner,
      dates: [...unswappedDates].sort(),
    },
  },
  nights,
};

const outPath = process.env.OUT_PATH;
const json = JSON.stringify(result, null, 2);
if (outPath) writeFileSync(outPath, json);
else process.stdout.write(json + "\n");
