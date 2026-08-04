#!/usr/bin/env node
// Finds every date range with no matching calendar event ("calendar gaps"),
// looks up who would normally have the kids from a ground-truth schedule
// (e.g. the usual 3-2-2 rotation - see usual-schedule.mjs), groups
// consecutive gap days under the same owner into a single run, and builds a
// Google Calendar "create event" link for each run so the gap can be closed
// with one click. Conflicts (calendar and schedule both have an answer but
// disagree) are intentionally not reported here - only missing entries are.
//
// Usage:
//   node scripts/build-exception-report.mjs <raw-events.json> <ground-truth.json> <rangeStart> <rangeEnd>
//
// ground-truth.json shape: { "YYYY-MM-DD": { "owner": "claire"|"parent2"|null, "comment": string|null }, ... }

import { readFileSync, writeFileSync } from "node:fs";
import { loadEvents, buildDateOwnerMap, addDays, loadCorrections } from "./compute-custody-split.mjs";

const [, , eventsPath, truthPath, rangeStartArg, rangeEndArg] = process.argv;
if (!eventsPath || !truthPath) {
  console.error("Usage: build-exception-report.mjs <raw-events.json> <ground-truth.json> [rangeStart] [rangeEnd]");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const rangeStart = rangeStartArg || `${today.slice(0, 4)}-01-01`;
const rangeEnd = rangeEndArg || addDays(today, 1);

const events = loadEvents(eventsPath);
const calendarMap = buildDateOwnerMap(events, rangeStart, rangeEnd, loadCorrections());
const truth = JSON.parse(readFileSync(truthPath, "utf8"));

const OWNER_TITLE = { claire: "Claire’s nights", parent2: "Mats nights" };
const OWNER_LABEL = { claire: "Claire", parent2: "Mat" };

function googleCalendarLink(owner, startDate, endDateExclusive) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: OWNER_TITLE[owner],
    dates: `${startDate.replaceAll("-", "")}/${endDateExclusive.replaceAll("-", "")}`,
    details: "Added from the custody split tracker's exception report - matches the usual 3-2-2 rotation for this date range.",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Walk the range day by day, collecting calendar gaps (no matching event,
// but the schedule has an answer), and group consecutive same-owner gap
// days into runs.
const runs = [];
let current = null;
let totalDays = 0;
let d = rangeStart;
while (d < rangeEnd) {
  totalDays++;
  const calOwner = calendarMap.get(d) || null;
  const truthOwner = truth[d] ? truth[d].owner : null;
  const isGap = calOwner === null && truthOwner !== null;

  if (isGap && current && current.owner === truthOwner && current.endDateExclusive === d) {
    current.endDateExclusive = addDays(d, 1);
    current.nights += 1;
  } else {
    if (current) runs.push(current);
    current = isGap ? { startDate: d, endDateExclusive: addDays(d, 1), owner: truthOwner, nights: 1 } : null;
  }
  d = addDays(d, 1);
}
if (current) runs.push(current);

const gaps = runs.map((r) => ({
  ...r,
  ownerLabel: OWNER_LABEL[r.owner],
  googleCalendarLink: googleCalendarLink(r.owner, r.startDate, r.endDateExclusive),
}));

const summary = {
  rangeStart,
  rangeEnd,
  totalDays,
  gapDays: gaps.reduce((n, g) => n + g.nights, 0),
  gapRuns: gaps.length,
};

const result = { generatedAt: new Date().toISOString(), rangeStart, rangeEnd, summary, gaps };
const outPath = process.env.OUT_PATH;
const json = JSON.stringify(result, null, 2);
if (outPath) writeFileSync(outPath, json);
else process.stdout.write(json + "\n");
