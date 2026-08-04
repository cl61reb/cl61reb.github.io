#!/usr/bin/env node
// Computes the year-to-date, month-by-month custody split from a joint
// Google Calendar export.
//
// Input: JSON array of events (fields: summary, start, end, updated), e.g.
//   node scripts/compute-custody-split.mjs raw-events.json > data/custody-data.json
//
// Classification rules:
//   - An event counts as a custody block only if its summary names one of
//     the two parents (CLAIRE_PATTERN / PARENT2_PATTERN) AND contains one of
//     the custody keywords below (night/weekend/have kids/kids away). This
//     filters out unrelated events that merely mention a name (birthdays,
//     "Claire in Uni", school pickups, etc.)
//   - Away-inversion: an event naming a parent and "away" but with no other
//     custody keyword (e.g. "Mat Away", "Mat Away back for 5", "Claire Away")
//     is attributed to the OTHER parent - "Mat away" means it's Claire's
//     nights, and vice versa. This does not apply when "kids" is also in the
//     summary ("Claire weekends - Claire and kids away..." already matches
//     the "weekend" keyword above and means Claire has the kids herself;
//     "kids away with Mat" matches the "kids away" keyword above and means
//     Mat has the kids).
//   - All-day events use Google Calendar's [start, end) convention: the
//     event covers every date from start up to but excluding end.
//   - Overlapping custody events (rare, e.g. an explicit "kids away" block
//     vs. a later-added "nights" entry covering the same night) are
//     resolved by last-updated-wins: events are applied in order of their
//     `updated` timestamp, so the most recently edited entry always
//     determines who has the kids on a given date.
//   - Dates in range with no matching event are counted as "unassigned"
//     rather than guessed, so gaps in the calendar show up honestly.

import { readFileSync, writeFileSync } from "node:fs";

const CLAIRE_NAME = /claire/i;
const PARENT2_NAME = /\bmats?\b/i;
const CUSTODY_KEYWORD = /night|weekend|have kids|kids away/i;
const AWAY_ONLY = /\baway\b/i;

function toDateOnly(value) {
  // "2026-07-01" or "2026-07-26T00:00:00+01:00" -> "2026-07-01"
  return value.slice(0, 10);
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function classifyOwner(summary) {
  const claireMatch = summary.match(CLAIRE_NAME);
  const parent2Match = summary.match(PARENT2_NAME);

  if (CUSTODY_KEYWORD.test(summary)) {
    if (claireMatch && !parent2Match) return "claire";
    if (parent2Match && !claireMatch) return "parent2";
    if (claireMatch && parent2Match) {
      // Both names appear (e.g. "Mats nights Claire Away..." or "Claire have
      // kids (Mat away)") - the parent whose name is mentioned first owns
      // the event; the other name is incidental context.
      return claireMatch.index < parent2Match.index ? "claire" : "parent2";
    }
    return null; // neither name mentioned
  }

  if (AWAY_ONLY.test(summary) && !/kids/i.test(summary)) {
    if (claireMatch && !parent2Match) return "parent2"; // Claire away -> Mat's nights
    if (parent2Match && !claireMatch) return "claire"; // Mat away -> Claire's nights
  }

  return null;
}

export function loadEvents(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return raw
    .map((e) => {
      const owner = classifyOwner(e.summary || "");
      if (!owner) return null;
      let start = toDateOnly(e.start);
      let end = toDateOnly(e.end);
      if (end <= start) end = addDays(start, 1); // guard against zero/negative-length timed events
      return { owner, start, end, updated: e.updated || "1970-01-01T00:00:00Z", summary: e.summary };
    })
    .filter(Boolean);
}

export function buildDateOwnerMap(events, rangeStart, rangeEnd) {
  const sorted = [...events].sort((a, b) => a.updated.localeCompare(b.updated));
  const map = new Map();
  for (const ev of sorted) {
    let d = ev.start < rangeStart ? rangeStart : ev.start;
    const stop = ev.end > rangeEnd ? rangeEnd : ev.end;
    while (d < stop) {
      map.set(d, ev.owner);
      d = addDays(d, 1);
    }
  }
  return map;
}

function monthKey(dateStr) {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

function computeSplit(events, rangeStart, rangeEnd, names) {
  const ownerByDate = buildDateOwnerMap(events, rangeStart, rangeEnd);
  const months = new Map();

  let d = rangeStart;
  while (d < rangeEnd) {
    const key = monthKey(d);
    if (!months.has(key)) months.set(key, { month: key, claire: 0, parent2: 0, unassigned: 0 });
    const bucket = months.get(key);
    const owner = ownerByDate.get(d);
    if (owner === "claire") bucket.claire++;
    else if (owner === "parent2") bucket.parent2++;
    else bucket.unassigned++;
    d = addDays(d, 1);
  }

  const monthList = [...months.values()].map((m) => {
    const totalAssigned = m.claire + m.parent2;
    return {
      ...m,
      totalDays: m.claire + m.parent2 + m.unassigned,
      clairePct: totalAssigned ? round1((m.claire / totalAssigned) * 100) : null,
      parent2Pct: totalAssigned ? round1((m.parent2 / totalAssigned) * 100) : null,
    };
  });

  const totals = monthList.reduce(
    (acc, m) => {
      acc.claire += m.claire;
      acc.parent2 += m.parent2;
      acc.unassigned += m.unassigned;
      return acc;
    },
    { claire: 0, parent2: 0, unassigned: 0 }
  );
  const totalAssigned = totals.claire + totals.parent2;
  totals.clairePct = totalAssigned ? round1((totals.claire / totalAssigned) * 100) : null;
  totals.parent2Pct = totalAssigned ? round1((totals.parent2 / totalAssigned) * 100) : null;

  return {
    generatedAt: new Date().toISOString(),
    rangeStart,
    rangeEnd,
    names,
    months: monthList,
    totals,
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function main() {
  const [, , inputPath, rangeStartArg, rangeEndArg] = process.argv;
  if (!inputPath) {
    console.error("Usage: compute-custody-split.mjs <raw-events.json> [rangeStart] [rangeEnd]");
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);
  const rangeStart = rangeStartArg || `${today.slice(0, 4)}-01-01`;
  const rangeEnd = rangeEndArg || addDays(today, 1); // rangeEnd is exclusive -> include today

  const events = loadEvents(inputPath);
  const result = computeSplit(events, rangeStart, rangeEnd, { claire: "Claire", parent2: "Mat" });

  const outPath = process.env.OUT_PATH;
  const json = JSON.stringify(result, null, 2);
  if (outPath) writeFileSync(outPath, json);
  else process.stdout.write(json + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
