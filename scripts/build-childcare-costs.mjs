#!/usr/bin/env node
// Estimates the childcare bill month by month from the school's iCal feed.
//
//   node scripts/build-childcare-costs.mjs <school.ics> [rangeStart] [rangeEnd]
//
// CHARGING RULES — costed per DAY, not per week:
//
//   School holiday, Tue/Wed/Thu  kids club, KIDS_CLUB_DAY a day
//   School holiday, Mon or Fri    nothing — the club only runs Tue-Thu
//   Christmas and New Year weeks  nothing — the club is shut
//   Normal school day, Mon-Thu   after school club, AFTER_SCHOOL_DAY a day
//   Normal school day, Friday    nothing — no Friday club
//   Bank holiday                 nothing — the children are at home
//   Inset day                    nothing — the children are at home
//
// So a full holiday week is 3 x KIDS_CLUB_DAY and an ordinary school week is
// 4 x AFTER_SCHOOL_DAY. A closure inside a school week simply drops that day's
// charge, because the children are at home instead: an inset day or bank
// holiday on a Mon-Thu saves AFTER_SCHOOL_DAY, and one on a Friday costs
// nothing either way since Friday was never chargeable.
//
// The three club days are Tue, Wed and Thu, so a full holiday week is three
// charges without needing a weekly cap. A bank holiday landing on one of those
// days simply means the children are at home and that day is not charged.
//
// Because every charge belongs to one dated day, months add up exactly — no
// week is pro-rated across a month boundary.
//
// WHEN IN DOUBT: a day counts as a closure only if the feed says so; anything
// unrecognised is treated as a normal school day. Weeks where that assumption
// looks unsafe are listed in `reviews` rather than silently priced — see
// findReviewFlags below.

import { readFileSync, writeFileSync } from "node:fs";

const KIDS_CLUB_DAY = 85;          // holiday kids club, per day
const AFTER_SCHOOL_DAY = 21;       // after school club, per day, Mon-Thu
// Holiday kids club runs Tue/Wed/Thu only, so a full holiday week is three
// club days without needing a weekly cap - the days themselves decide it.
const KIDS_CLUB_OFFSETS = [1, 2, 3]; // Mon=0 … Fri=4
const AFTER_SCHOOL_WEEKDAYS = 4;   // Mon-Thu; no Friday club
// The club shuts over Christmas and New Year. Those are the week containing
// 25 December and the week containing 1 January - always two distinct,
// adjacent weeks, since the dates are exactly seven days apart.
const CLUB_CLOSED_DATES = ["12-25", "01-01"];
const HOLIDAY_WEEK_THRESHOLD = 3;  // holiday weekdays at which a week reads as a holiday week
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

function round2(n) {
  return Math.round(n * 100) / 100;
}

// True for the Christmas and New Year weeks, when the holiday club shuts.
function clubClosedWeek(weekStart) {
  for (let i = 0; i < 7; i++) {
    if (CLUB_CLOSED_DATES.includes(addDays(weekStart, i).slice(5))) return true;
  }
  return false;
}

// Charge for one weekday.
function chargeFor(kind, dayOffset, clubShut) {
  if (kind === "holiday") {
    if (clubShut) return { charge: 0, basis: "holiday, kids club shut this week" };
    return KIDS_CLUB_OFFSETS.includes(dayOffset)
      ? { charge: KIDS_CLUB_DAY, basis: "kids club" }
      : { charge: 0, basis: "holiday, no club this day" };
  }
  if (kind === "inset") return { charge: 0, basis: "inset day, at home" };
  if (kind === "bankHoliday") return { charge: 0, basis: "bank holiday, at home" };
  if (dayOffset < AFTER_SCHOOL_WEEKDAYS)
    return { charge: AFTER_SCHOOL_DAY, basis: "after school club" };
  return { charge: 0, basis: "school day, no Friday club" };
}

function buildWeeks(dayIndex, rangeStart, rangeEnd) {
  const weeks = [];
  let weekStart = mondayOf(rangeStart);
  const lastMonday = mondayOf(addDays(rangeEnd, -1));
  while (weekStart <= lastMonday) {
    // Classify the whole week first: a week is a holiday week on its own
    // shape, regardless of how much of it falls inside the reporting range.
    const raw = [];
    for (let i = 0; i < 5; i++) {
      const date = addDays(weekStart, i);
      const { kind, label } = classifyDay(dayIndex.get(date) || []);
      raw.push({ date, kind, label, offset: i });
    }
    const holidayCount = raw.filter((d) => d.kind === "holiday").length;

    const clubShut = clubClosedWeek(weekStart);
    const days = raw.map((d) => {
      const { charge, basis } = chargeFor(d.kind, d.offset, clubShut);
      return {
        date: d.date,
        kind: d.kind,
        label: d.label,
        charge,
        basis,
        inRange: d.date >= rangeStart && d.date < rangeEnd,
      };
    });

    const type =
      holidayCount >= HOLIDAY_WEEK_THRESHOLD
        ? "holiday"
        : days.some((d) => d.kind !== "school")
        ? "reduced"
        : "school";

    weeks.push({
      weekStart,
      type,
      clubShut,
      days,
      cost: round2(days.reduce((n, d) => n + d.charge, 0)),
      costInRange: round2(days.filter((d) => d.inRange).reduce((n, d) => n + d.charge, 0)),
      daysInRange: days.filter((d) => d.inRange).length,
      closedDays: days
        .filter((d) => d.kind !== "school")
        .map((d) => ({ date: d.date, kind: d.kind, label: d.label, charge: d.charge })),
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
    if (week.type === "holiday" || week.daysInRange === 0) continue;
    const closedSaysShut = week.closedDays.find((d) => /closed/i.test(d.label || ""));
    if (closedSaysShut) {
      reviews.push({
        weekStart: week.weekStart,
        kind: "closure-in-school-week",
        detail: `"${closedSaysShut.label}" on ${closedSaysShut.date} says the school is closed, but the rest of the week has no holiday entries, so the week is charged as school days (£${week.cost}). If it is really a holiday week it would be ${KIDS_CLUB_OFFSETS.length} kids club days, £${KIDS_CLUB_OFFSETS.length * KIDS_CLUB_DAY}.`,
        costedAt: week.cost,
        couldBe: KIDS_CLUB_OFFSETS.length * KIDS_CLUB_DAY,
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

  // Month roll-up. Every charge sits on a dated day, so months are exact.
  const months = new Map();
  for (const week of weeks) {
    for (const day of week.days) {
      if (!day.inRange) continue;
      const key = day.date.slice(0, 7);
      if (!months.has(key))
        months.set(key, {
          month: key, cost: 0, weekdays: 0,
          kidsClubDays: 0, afterSchoolDays: 0, schoolShutDays: 0, needsReview: false,
        });
      const m = months.get(key);
      m.cost += day.charge;
      m.weekdays++;
      if (day.charge === KIDS_CLUB_DAY) m.kidsClubDays++;
      else if (day.charge === AFTER_SCHOOL_DAY) m.afterSchoolDays++;
      // Counted separately from the charge: a shut day may be a paid kids-club
      // day, or free because it is past the weekly club allowance or the
      // children are at home.
      if (day.kind !== "school") m.schoolShutDays++;
      if (reviewWeeks.has(week.weekStart)) m.needsReview = true;
    }
  }
  const monthList = [...months.values()]
    .map((m) => ({ ...m, cost: round2(m.cost) }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const totals = {
    cost: round2(monthList.reduce((n, m) => n + m.cost, 0)),
    weekdays: monthList.reduce((n, m) => n + m.weekdays, 0),
    kidsClubDays: monthList.reduce((n, m) => n + m.kidsClubDays, 0),
    afterSchoolDays: monthList.reduce((n, m) => n + m.afterSchoolDays, 0),
    schoolShutDays: monthList.reduce((n, m) => n + m.schoolShutDays, 0),
    holidayWeeks: weeks.filter((w) => w.type === "holiday" && w.daysInRange > 0).length,
    reducedWeeks: weeks.filter((w) => w.type === "reduced" && w.daysInRange > 0).length,
    schoolWeeks: weeks.filter((w) => w.type === "school" && w.daysInRange > 0).length,
  };

  const result = {
    generatedAt: new Date().toISOString(),
    rangeStart,
    rangeEnd,
    rates: {
      kidsClubDay: KIDS_CLUB_DAY,
      afterSchoolDay: AFTER_SCHOOL_DAY,
      holidayClubDaysPerWeek: KIDS_CLUB_OFFSETS.length,
      kidsClubDayNames: KIDS_CLUB_OFFSETS.map((i) => ["Mon", "Tue", "Wed", "Thu", "Fri"][i]),
      afterSchoolWeekdays: AFTER_SCHOOL_WEEKDAYS,
    },
    source: { feedStart, feedEnd, events: events.length },
    months: monthList,
    totals,
    weeks: weeks
      .filter((w) => w.daysInRange > 0)
      .map((w) => ({
        weekStart: w.weekStart,
        type: w.type,
        cost: w.cost,
        costInRange: w.costInRange,
        daysInRange: w.daysInRange,
        clubShut: w.clubShut,
        days: w.days.map((d) => ({ date: d.date, kind: d.kind, label: d.label, charge: d.charge, basis: d.basis })),
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
