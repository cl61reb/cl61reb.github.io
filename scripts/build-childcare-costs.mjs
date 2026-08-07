#!/usr/bin/env node
// Estimates the childcare bill month by month from the school's iCal feed.
//
// Usage:
//   node scripts/build-childcare-costs.mjs <school.ics> [rangeStart] [rangeEnd]
//
// CHARGING RULES (as given):
//   - A school-holiday week (half term, Easter, Christmas, summer) costs
//     HOLIDAY_WEEK.
//   - A normal school week costs SCHOOL_WEEK.
//   - An inset day or a one-or-two-day holiday in an otherwise normal week
//     does not make it a holiday week: it stays a school week, less
//     DAY_DISCOUNT for each closed day.
//   - A bank holiday in a normal school week likewise takes DAY_DISCOUNT off
//     for each closed day.
//
// So a week is priced off how many of its FIVE WEEKDAYS the school is shut:
//   0 closed          -> SCHOOL_WEEK
//   1-2 closed        -> SCHOOL_WEEK - DAY_DISCOUNT * closed
//   3 or more closed  -> HOLIDAY_WEEK  (the week has become a holiday)
//
// The 1-2 vs 3+ boundary is the rule "one/two days ... with no other holiday
// entries for the rest of the week" read as a threshold. In this feed no week
// actually lands on 3 or 4 - holiday weeks close all five weekdays - so the
// boundary never decides a real price here. Weeks are Monday-Sunday.
//
// MONTH ALLOCATION: a week that straddles a month boundary is classified as a
// whole (so a half-term week is a half-term week regardless of where the
// month ends), then its cost is spread evenly across its five weekdays and
// each weekday's share is booked to its own month. Weekdays outside the
// reporting range are dropped, so a part-week at either end is charged pro
// rata rather than counted whole.
//
// WHEN IN DOUBT: a day is only treated as a closure if the feed says so;
// anything unrecognised is treated as a normal school day, which is the
// cheaper, more conservative assumption. Weeks where that assumption looks
// unsafe are listed in `reviews` rather than silently priced - see
// findReviewFlags below.

import { readFileSync, writeFileSync } from "node:fs";

const HOLIDAY_WEEK = 255;
const SCHOOL_WEEK = 85;
const DAY_DISCOUNT = 21;
const HOLIDAY_WEEK_THRESHOLD = 3; // closed weekdays at which a week becomes a holiday week
const LONG_TERM_WEEKS = 9; // a run of school weeks this long suggests a missing half term

// --- iCal parsing -----------------------------------------------------------

function parseIcs(text) {
  const unfolded = text.replace(/\r?\n[ \t]/g, ""); // RFC 5545 line folding
  const events = [];
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const field = (name) => {
      const m = block.match(new RegExp(`^${name}[^:\\r\\n]*:(.*)$`, "m"));
      return m ? m[1].trim() : null;
    };
    const start = field("DTSTART");
    if (!start) continue;
    const summary = (field("SUMMARY") || "").trim();
    // All-day events in this feed are YYYYMMDD; timed ones are YYYYMMDDTHHMMSS.
    const startDate = toIsoDate(start);
    // DTEND is exclusive when present; most entries here have none (single day).
    const endRaw = field("DTEND");
    const endDate = endRaw ? toIsoDate(endRaw) : addDays(startDate, 1);
    events.push({ start: startDate, end: endDate > startDate ? endDate : addDays(startDate, 1), summary });
  }
  return events;
}

function toIsoDate(value) {
  const d = value.replace(/^.*?:/, "").trim();
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayOfWeek(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
}

function mondayOf(dateStr) {
  const offset = (dayOfWeek(dateStr) + 6) % 7; // Mon=0 … Sun=6
  return addDays(dateStr, -offset);
}

// --- day classification -----------------------------------------------------

// Order matters: "Good Friday Bank Holiday" must read as a bank holiday, not
// as a generic holiday, so bank holidays are tested first.
const BANK_HOLIDAY = /bank holiday/i;
const INSET = /inset/i;
const HOLIDAY = /holiday|half term/i;
// Entries that name the school day rather than close it. Listed so they are
// deliberately ignored rather than accidentally matching something above.
const NOT_A_CLOSURE = /afterschool|parents evening|open evening|film night|parent meeting|pupils return|last day of term|sports day|trip|photo|disco|assembly|workshop|meeting/i;

export function classifyDay(summaries) {
  let kind = "school";
  let label = null;
  for (const summary of summaries) {
    if (NOT_A_CLOSURE.test(summary) && !BANK_HOLIDAY.test(summary) && !INSET.test(summary)) continue;
    if (BANK_HOLIDAY.test(summary)) return { kind: "bankHoliday", label: summary };
    if (INSET.test(summary)) return { kind: "inset", label: summary };
    if (HOLIDAY.test(summary)) {
      kind = "holiday";
      label = summary;
    }
  }
  return { kind, label };
}

// --- costing ----------------------------------------------------------------

function priceWeek(closedCount) {
  if (closedCount >= HOLIDAY_WEEK_THRESHOLD) return { cost: HOLIDAY_WEEK, type: "holiday" };
  if (closedCount > 0)
    return { cost: SCHOOL_WEEK - DAY_DISCOUNT * closedCount, type: "reduced" };
  return { cost: SCHOOL_WEEK, type: "school" };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function buildWeeks(dayIndex, rangeStart, rangeEnd) {
  const weeks = [];
  let weekStart = mondayOf(rangeStart);
  const lastMonday = mondayOf(addDays(rangeEnd, -1));
  while (weekStart <= lastMonday) {
    const weekdays = [];
    for (let i = 0; i < 5; i++) {
      const date = addDays(weekStart, i);
      const { kind, label } = classifyDay(dayIndex.get(date) || []);
      weekdays.push({ date, kind, label, inRange: date >= rangeStart && date < rangeEnd });
    }
    const closed = weekdays.filter((d) => d.kind !== "school");
    const { cost, type } = priceWeek(closed.length);
    const inRange = weekdays.filter((d) => d.inRange);
    weeks.push({
      weekStart,
      type,
      cost,
      perWeekday: round2(cost / 5),
      weekdays,
      closedDays: closed.map((d) => ({ date: d.date, kind: d.kind, label: d.label })),
      weekdaysInRange: inRange.length,
      costInRange: round2((cost / 5) * inRange.length),
    });
    weekStart = addDays(weekStart, 7);
  }
  return weeks;
}

// --- "am I sure?" checks ----------------------------------------------------
//
// Two things would make a week's price wrong without the feed looking broken:
//
//  1. A day the feed explicitly says the school is CLOSED, in a week that is
//     otherwise priced as a normal school week. That is the shape a half term
//     takes when only its bank holiday made it into the feed.
//  2. An implausibly long unbroken run of school weeks, which is what a whole
//     missing half term looks like from the outside. Measured across the FULL
//     feed, not just the reporting range, so a run that starts or ends outside
//     the range is still caught. English terms run to roughly eight weeks, so
//     the threshold sits above that.
//
// Both are reported rather than corrected: the price stays at the cheaper
// school-week assumption, and the review list says where that may be wrong.

function findReviewFlags(weeks, allWeeks, rangeStart, rangeEnd) {
  const reviews = [];

  for (const week of weeks) {
    if (week.type === "holiday" || week.weekdaysInRange === 0) continue;
    const closedSaysShut = week.closedDays.find((d) => /closed/i.test(d.label || ""));
    if (closedSaysShut) {
      reviews.push({
        weekStart: week.weekStart,
        kind: "closure-in-school-week",
        detail: `"${closedSaysShut.label}" on ${closedSaysShut.date} says the school is closed, but the rest of the week has no holiday entries, so it is priced as a school week (£${week.cost}). If it is really a holiday week the cost would be £${HOLIDAY_WEEK}.`,
        costedAt: week.cost,
        couldBe: HOLIDAY_WEEK,
      });
    }
  }

  // Longest runs of consecutive non-holiday weeks across the whole feed.
  let runStart = null;
  let runLength = 0;
  const flagRun = (endWeekStart) => {
    if (runLength >= LONG_TERM_WEEKS && runStart <= rangeEnd && endWeekStart >= rangeStart) {
      reviews.push({
        weekStart: runStart,
        kind: "long-term-run",
        detail: `${runLength} school weeks in a row with no holiday week, from ${runStart} to ${endWeekStart}. English school terms rarely run beyond about eight weeks without a half term, so a holiday may be missing from the school feed for this stretch.`,
        runWeeks: runLength,
        runStart,
        runEnd: endWeekStart,
      });
    }
    runStart = null;
    runLength = 0;
  };
  for (const week of allWeeks) {
    if (week.type === "holiday") {
      flagRun(addDays(week.weekStart, -7));
    } else {
      if (runStart === null) runStart = week.weekStart;
      runLength++;
    }
  }
  if (runStart !== null) flagRun(allWeeks[allWeeks.length - 1].weekStart);

  return reviews.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

// --- main -------------------------------------------------------------------

function main() {
  const [, , icsPath, rangeStartArg, rangeEndArg] = process.argv;
  if (!icsPath) {
    console.error("Usage: build-childcare-costs.mjs <school.ics> [rangeStart] [rangeEnd]");
    process.exit(1);
  }

  // Default range: from the start of the current school year (Sept) through
  // the end of the month nine months out.
  const today = new Date().toISOString().slice(0, 10);
  const rangeStart = rangeStartArg || "2026-09-01";
  const rangeEnd =
    rangeEndArg ||
    (() => {
      const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + 10); // 9 whole months ahead, exclusive end
      return d.toISOString().slice(0, 10);
    })();

  const events = parseIcs(readFileSync(icsPath, "utf8"));

  // date -> [summaries]
  const dayIndex = new Map();
  for (const ev of events) {
    for (let d = ev.start; d < ev.end; d = addDays(d, 1)) {
      if (!dayIndex.has(d)) dayIndex.set(d, []);
      dayIndex.get(d).push(ev.summary);
    }
  }

  const dates = [...dayIndex.keys()].sort();
  const feedStart = dates[0];
  const feedEnd = dates[dates.length - 1];

  const weeks = buildWeeks(dayIndex, rangeStart, rangeEnd);
  const allWeeks = buildWeeks(dayIndex, mondayOf(feedStart), addDays(feedEnd, 1));
  const reviews = findReviewFlags(weeks, allWeeks, rangeStart, rangeEnd);
  const reviewWeeks = new Set(reviews.map((r) => r.weekStart));

  // Month roll-up, from each weekday's share of its week's cost.
  const months = new Map();
  for (const week of weeks) {
    for (const day of week.weekdays) {
      if (!day.inRange) continue;
      const key = day.date.slice(0, 7);
      if (!months.has(key))
        months.set(key, {
          month: key,
          cost: 0,
          weekdays: 0,
          closedDays: 0,
          holidayWeekdays: 0,
          needsReview: false,
        });
      const bucket = months.get(key);
      bucket.cost += week.perWeekday;
      bucket.weekdays++;
      if (day.kind !== "school") bucket.closedDays++;
      if (week.type === "holiday") bucket.holidayWeekdays++;
      if (reviewWeeks.has(week.weekStart)) bucket.needsReview = true;
    }
  }
  const monthList = [...months.values()]
    .map((m) => ({ ...m, cost: round2(m.cost) }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const totals = {
    cost: round2(monthList.reduce((n, m) => n + m.cost, 0)),
    weekdays: monthList.reduce((n, m) => n + m.weekdays, 0),
    closedDays: monthList.reduce((n, m) => n + m.closedDays, 0),
    holidayWeeks: weeks.filter((w) => w.type === "holiday" && w.weekdaysInRange > 0).length,
    reducedWeeks: weeks.filter((w) => w.type === "reduced" && w.weekdaysInRange > 0).length,
    schoolWeeks: weeks.filter((w) => w.type === "school" && w.weekdaysInRange > 0).length,
  };

  const result = {
    generatedAt: new Date().toISOString(),
    rangeStart,
    rangeEnd,
    rates: { holidayWeek: HOLIDAY_WEEK, schoolWeek: SCHOOL_WEEK, dayDiscount: DAY_DISCOUNT },
    source: { feedStart, feedEnd, events: events.length },
    months: monthList,
    totals,
    weeks: weeks
      .filter((w) => w.weekdaysInRange > 0)
      .map((w) => ({
        weekStart: w.weekStart,
        type: w.type,
        cost: w.cost,
        costInRange: w.costInRange,
        weekdaysInRange: w.weekdaysInRange,
        closedDays: w.closedDays,
        needsReview: reviewWeeks.has(w.weekStart),
      })),
    reviews,
  };

  const outPath = process.env.OUT_PATH;
  const json = JSON.stringify(result, null, 2);
  if (outPath) writeFileSync(outPath, json);
  else process.stdout.write(json + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
