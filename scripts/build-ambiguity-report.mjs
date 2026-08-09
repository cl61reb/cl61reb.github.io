#!/usr/bin/env node
// Finds dates the calendar answers twice — days covered by a Claire entry AND
// a Mat entry at the same time.
//
//   node scripts/build-ambiguity-report.mjs <raw-events.json> [start] [end]
//
// These are not gaps and not swaps: they are days where the calendar
// contradicts itself. Something still has to win, and the split does pick a
// winner (most recently edited entry, then the weekend-Sunday rule, then any
// manual correction). But the winner is inferred, not stated, so a day decided
// this way deserves a human glance in a way an unambiguous day does not.
//
// Consecutive days with the same competing entries are grouped into one run,
// since a fortnight-long overlap is one disagreement rather than fourteen.

import { writeFileSync } from "node:fs";
import { loadEvents, buildDateOwnerMap, loadCorrections, addDays } from "./compute-custody-split.mjs";

const [, , eventsPath, rangeStartArg, rangeEndArg] = process.argv;
if (!eventsPath) {
  console.error("Usage: build-ambiguity-report.mjs <raw-events.json> [start] [end]");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const rangeStart = rangeStartArg || `${today.slice(0, 7)}-01`;
const rangeEnd = rangeEndArg || addDays(rangeStart, 365);

const events = loadEvents(eventsPath);
const resolved = buildDateOwnerMap(events, rangeStart, rangeEnd, loadCorrections());
const NAME = { claire: "Claire", parent2: "Mat" };

const days = [];
let total = 0;
let d = rangeStart;
while (d < rangeEnd) {
  total++;
  const covering = events.filter((e) => e.start <= d && d < e.end);
  if (new Set(covering.map((e) => e.owner)).size > 1) {
    days.push({
      date: d,
      resolvedTo: resolved.get(d) || null,
      competing: covering
        .map((e) => ({ owner: e.owner, summary: e.summary, updated: e.updated, start: e.start, end: e.end }))
        .sort((a, b) => a.updated.localeCompare(b.updated)),
    });
  }
  d = addDays(d, 1);
}

// Group runs of consecutive days that share the same competing entries.
const conflicts = [];
for (const day of days) {
  const key = day.competing.map((e) => `${e.owner}|${e.summary}`).sort().join("~");
  const last = conflicts[conflicts.length - 1];
  if (last && last.key === key && addDays(last.endDateExclusive, -1) === addDays(day.date, -1)) {
    last.endDateExclusive = addDays(day.date, 1);
    last.days++;
    continue;
  }
  conflicts.push({
    key,
    startDate: day.date,
    endDateExclusive: addDays(day.date, 1),
    days: 1,
    resolvedTo: day.resolvedTo,
    resolvedToName: day.resolvedTo ? NAME[day.resolvedTo] : null,
    // The entry the split actually went with: latest-updated on the winning side.
    resolvedBy: (() => {
      const winners = day.competing.filter((e) => e.owner === day.resolvedTo);
      return winners.length ? winners[winners.length - 1].summary : null;
    })(),
    competing: day.competing.map((e) => ({ ...e, ownerName: NAME[e.owner] })),
  });
}
for (const c of conflicts) delete c.key;

const result = {
  generatedAt: new Date().toISOString(),
  rangeStart,
  rangeEnd,
  names: NAME,
  summary: {
    daysChecked: total,
    conflictDays: days.length,
    conflictRuns: conflicts.length,
  },
  conflicts,
};

const outPath = process.env.OUT_PATH;
const json = JSON.stringify(result, null, 2);
if (outPath) writeFileSync(outPath, json);
else process.stdout.write(json + "\n");
