#!/usr/bin/env node
// Projects the custody split forward over the next 12 months.
//
// For each day in the window:
//   - if the calendar has a custody entry, use it        -> "confirmed"
//   - otherwise fall back to the usual 3-2-2 rotation    -> "projected"
//
// So the further out you look the more the projection leans on the rotation
// rather than on anything actually agreed. Each month reports how many of
// its nights are confirmed vs projected, so the reader can see how much
// weight the number carries.
//
// Also reports the gaps - runs of consecutive days with no calendar entry -
// with a prefilled Google Calendar link to fill each one, same as the
// exception report does for the historic window.
//
// Note: data/corrections.json is bounded by validBefore (2026-08-01) and so
// never applies here. The projection window is entirely calendar-driven.
//
// Usage:
//   node scripts/build-projection.mjs <raw-future-events.json> [rangeStart] [rangeEnd]

import { writeFileSync } from "node:fs";
import { loadEvents, buildDateOwnerMap, addDays } from "./compute-custody-split.mjs";
import { usualOwner } from "./usual-schedule.mjs";

const [, , eventsPath, rangeStartArg, rangeEndArg] = process.argv;
if (!eventsPath) {
  console.error("Usage: build-projection.mjs <raw-future-events.json> [rangeStart] [rangeEnd]");
  process.exit(1);
}

// Default window: the first day of the current month, through 12 months later.
const today = new Date().toISOString().slice(0, 10);
const rangeStart = rangeStartArg || `${today.slice(0, 7)}-01`;
const rangeEnd =
  rangeEndArg ||
  (() => {
    const [y, m] = rangeStart.split("-").map(Number);
    return `${y + 1}-${String(m).padStart(2, "0")}-01`;
  })();

const OWNER_TITLE = { claire: "Claire’s nights", parent2: "Mats nights" };
const OWNER_LABEL = { claire: "Claire", parent2: "Mat" };

function googleCalendarLink(owner, startDate, endDateExclusive) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: OWNER_TITLE[owner],
    dates: `${startDate.replaceAll("-", "")}/${endDateExclusive.replaceAll("-", "")}`,
    details:
      "Added from the custody split tracker's 12-month projection - matches the usual 3-2-2 rotation for this date range.",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

const events = loadEvents(eventsPath);
const calendarMap = buildDateOwnerMap(events, rangeStart, rangeEnd);

const months = new Map();
const gapRuns = [];
let currentGap = null;

let d = rangeStart;
while (d < rangeEnd) {
  const key = d.slice(0, 7);
  if (!months.has(key)) {
    months.set(key, { month: key, claire: 0, parent2: 0, confirmed: 0, projected: 0, totalDays: 0 });
  }
  const bucket = months.get(key);

  const fromCalendar = calendarMap.get(d) || null;
  const owner = fromCalendar || usualOwner(d);
  bucket[owner]++;
  bucket.totalDays++;
  if (fromCalendar) bucket.confirmed++;
  else bucket.projected++;

  // group consecutive uncovered days of the same projected owner
  if (!fromCalendar) {
    if (currentGap && currentGap.owner === owner && currentGap.endDateExclusive === d) {
      currentGap.endDateExclusive = addDays(d, 1);
      currentGap.nights++;
    } else {
      if (currentGap) gapRuns.push(currentGap);
      currentGap = { startDate: d, endDateExclusive: addDays(d, 1), owner, nights: 1 };
    }
  } else if (currentGap) {
    gapRuns.push(currentGap);
    currentGap = null;
  }

  d = addDays(d, 1);
}
if (currentGap) gapRuns.push(currentGap);

const monthList = [...months.values()].map((m) => ({
  ...m,
  clairePct: round1((m.claire / m.totalDays) * 100),
  parent2Pct: round1((m.parent2 / m.totalDays) * 100),
}));

const totals = monthList.reduce(
  (acc, m) => {
    acc.claire += m.claire;
    acc.parent2 += m.parent2;
    acc.confirmed += m.confirmed;
    acc.projected += m.projected;
    return acc;
  },
  { claire: 0, parent2: 0, confirmed: 0, projected: 0 }
);
const totalDays = totals.claire + totals.parent2;
totals.clairePct = round1((totals.claire / totalDays) * 100);
totals.parent2Pct = round1((totals.parent2 / totalDays) * 100);
totals.totalDays = totalDays;

const gaps = gapRuns.map((g) => ({
  ...g,
  ownerLabel: OWNER_LABEL[g.owner],
  googleCalendarLink: googleCalendarLink(g.owner, g.startDate, g.endDateExclusive),
}));

const result = {
  generatedAt: new Date().toISOString(),
  rangeStart,
  rangeEnd,
  names: { claire: "Claire", parent2: "Mat" },
  months: monthList,
  totals,
  gapSummary: {
    gapDays: gaps.reduce((n, g) => n + g.nights, 0),
    gapRuns: gaps.length,
  },
  gaps,
};

const outPath = process.env.OUT_PATH;
const json = JSON.stringify(result, null, 2);
if (outPath) writeFileSync(outPath, json);
else process.stdout.write(json + "\n");
