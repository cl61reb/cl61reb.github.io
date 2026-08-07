#!/usr/bin/env node
// Regenerates every report's data in one command.
//
//   node scripts/refresh-all.mjs <raw-events.json> [--school-ics <path>] [--dry-run]
//
// <raw-events.json> is the joint Google Calendar, reduced to
// [{ summary, start, end, updated }, …]. It has to be supplied rather than
// fetched: that calendar is reachable only through the Google Calendar MCP
// connector, which an agent can call and a plain script cannot. Everything
// else — the four date ranges, all the generator scripts, and the school
// calendar download — is handled here.
//
// The events file must span histStart..forecastEnd, i.e. Jan 1 of the current
// year through 13 months out. The script checks and refuses to write a report
// its input can't cover, rather than emitting a confidently wrong one.
//
// Ranges are derived from today, so this stays correct as months roll over:
//
//   year to date  Jan 1 this year      → first of this month
//   this month    first of this month  → first of next month
//   forecast      first of next month  → 12 months later
//   childcare     CHILDCARE_START      → first of the month 9 months out
//
// The first three are contiguous and must not overlap; the script asserts it.

import { existsSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(SCRIPTS, "..");
const DATA = join(REPO, "data");

const SCHOOL_ICS_URL = "https://allsaintsttl.greenhousecms.co.uk/ical.ics";
const CHILDCARE_START = "2026-09-01"; // start of the school year this report covers
const CHILDCARE_MONTHS_AHEAD = 9;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const icsFlag = args.indexOf("--school-ics");
const suppliedIcs = icsFlag !== -1 ? args[icsFlag + 1] : null;
const eventsPath = args.find((a) => !a.startsWith("--") && a !== suppliedIcs);

if (!eventsPath) {
  console.error("Usage: refresh-all.mjs <raw-events.json> [--school-ics <path>] [--dry-run]");
  process.exit(1);
}
if (!existsSync(eventsPath)) {
  console.error(`Events file not found: ${eventsPath}`);
  process.exit(1);
}

// --- date helpers -----------------------------------------------------------

const firstOfMonth = (d) => `${d.slice(0, 7)}-01`;
function shiftMonths(isoFirstOfMonth, n) {
  const d = new Date(`${isoFirstOfMonth}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

const today = new Date().toISOString().slice(0, 10);
const thisMonth = firstOfMonth(today);

const ranges = {
  ytd: { start: `${today.slice(0, 4)}-01-01`, end: thisMonth },
  month: { start: thisMonth, end: shiftMonths(thisMonth, 1) },
  forecast: { start: shiftMonths(thisMonth, 1), end: shiftMonths(thisMonth, 13) },
  childcare: { start: CHILDCARE_START, end: shiftMonths(thisMonth, CHILDCARE_MONTHS_AHEAD + 1) },
};

// The custody windows tile: no gaps, no double counting.
if (ranges.ytd.end !== ranges.month.start || ranges.month.end !== ranges.forecast.start) {
  console.error("Internal error: custody ranges are not contiguous.");
  process.exit(1);
}

// --- input coverage check ---------------------------------------------------

const events = JSON.parse(readFileSync(eventsPath, "utf8"));
if (!Array.isArray(events) || events.length === 0) {
  console.error(`${eventsPath} is not a non-empty JSON array of events.`);
  process.exit(1);
}
for (const e of events.slice(0, 5)) {
  if (!e || typeof e.summary !== "string" || !e.start || !e.end) {
    console.error("Events must be objects with summary, start, end (and ideally updated).");
    process.exit(1);
  }
}
const covered = {
  from: events.reduce((min, e) => (e.start < min ? e.start : min), events[0].start).slice(0, 10),
  to: events.reduce((max, e) => (e.end > max ? e.end : max), events[0].end).slice(0, 10),
};
const needed = { from: ranges.ytd.start, to: ranges.forecast.end };
const shortfall = [];
if (covered.from > needed.from) shortfall.push(`starts ${covered.from}, need ${needed.from}`);
if (covered.to < needed.to) shortfall.push(`ends ${covered.to}, need ${needed.to}`);

// --- runner -----------------------------------------------------------------

const results = [];
function run(label, outFile, script, scriptArgs) {
  const out = join(DATA, outFile);
  if (dryRun) {
    results.push({ label, outFile, status: "skipped (dry run)" });
    return true;
  }
  const r = spawnSync(process.execPath, [join(SCRIPTS, script), ...scriptArgs], {
    env: { ...process.env, OUT_PATH: out },
    encoding: "utf8",
  });
  if (r.status !== 0) {
    results.push({ label, outFile, status: "FAILED", detail: (r.stderr || "").trim().split("\n").pop() });
    return false;
  }
  results.push({ label, outFile, status: "ok" });
  return true;
}

console.log(`refresh-all — today ${today}`);
console.log(`events: ${eventsPath} (${events.length} events, ${covered.from} → ${covered.to})\n`);

if (shortfall.length) {
  console.error("The events file does not cover the range these reports need:");
  for (const s of shortfall) console.error(`  - it ${s}`);
  console.error("\nRe-pull the calendar over the full span and try again. Nothing was written.");
  process.exit(2);
}

// --- custody reports --------------------------------------------------------

const custody = [
  // label, range key, rotation file, split file, exceptions file, nightly file (optional)
  ["Year to date", "ytd", "usual-schedule.json", "custody-data.json", "exceptions.json", null],
  ["This month", "month", "month-usual-schedule.json", "month-data.json", "month-exceptions.json", "month-nights.json"],
  ["Next 12 months", "forecast", "forecast-usual-schedule.json", "forecast-data.json", "forecast-exceptions.json", null],
];

let ok = true;
for (const [label, key, usualFile, dataFile, excFile, nightsFile] of custody) {
  const { start, end } = ranges[key];
  ok = run(`${label} · rotation`, usualFile, "generate-usual-schedule.mjs", [start, end]) && ok;
  ok = run(`${label} · split`, dataFile, "compute-custody-split.mjs", [eventsPath, start, end]) && ok;
  ok = run(`${label} · exceptions`, excFile, "build-exception-report.mjs", [eventsPath, join(DATA, usualFile), start, end]) && ok;
  if (nightsFile)
    ok = run(`${label} · nights`, nightsFile, "build-nightly-detail.mjs", [eventsPath, join(DATA, usualFile), start, end]) && ok;
}

// --- childcare costs --------------------------------------------------------

let icsPath = suppliedIcs;
let schoolNote = null;
if (!icsPath && !dryRun) {
  // curl, not fetch(): Node's global fetch ignores HTTPS_PROXY, so in a
  // sandbox that only reaches the internet through a proxy it fails with a
  // 403 while curl succeeds.
  const candidate = join(mkdtempSync(join(tmpdir(), "school-")), "school.ics");
  const r = spawnSync("curl", ["-sS", "-L", "--max-time", "60", "-o", candidate,
                               "-w", "%{http_code}", SCHOOL_ICS_URL], { encoding: "utf8" });
  const code = (r.stdout || "").trim();
  if (r.status !== 0) {
    schoolNote = `COULD NOT FETCH: ${(r.stderr || "curl failed").trim().split("\n").pop()}`;
  } else if (code !== "200") {
    schoolNote = `COULD NOT FETCH: HTTP ${code}` +
      (code === "403"
        ? ` — the environment probably lacks "${new URL(SCHOOL_ICS_URL).hostname}" under Network access → Custom → Allowed domains`
        : "");
  } else if (!readFileSync(candidate, "utf8").includes("BEGIN:VCALENDAR")) {
    schoolNote = "COULD NOT FETCH: response is not an iCalendar file";
  } else {
    icsPath = candidate;
    schoolNote = `fetched from ${SCHOOL_ICS_URL}`;
  }
}

if (icsPath) {
  ok = run("Childcare costs", "childcare-data.json", "build-childcare-costs.mjs",
           [icsPath, ranges.childcare.start, ranges.childcare.end]) && ok;
} else if (!dryRun) {
  results.push({
    label: "Childcare costs",
    outFile: "childcare-data.json",
    status: "SKIPPED",
    detail: "school calendar unavailable — existing data left untouched",
  });
  ok = false;
}

// --- summary ----------------------------------------------------------------

console.log("ranges");
for (const [k, v] of Object.entries(ranges)) {
  console.log(`  ${k.padEnd(10)} ${v.start} → ${v.end}`);
}
if (schoolNote) console.log(`\nschool calendar: ${schoolNote}`);

console.log("\nreports");
for (const r of results) {
  const mark = r.status === "ok" ? "  ok  " : r.status.startsWith("skipped") ? "  --  " : "  !!  ";
  console.log(`${mark}${r.label.padEnd(28)} ${r.outFile}${r.detail ? `  (${r.detail})` : ""}`);
}

if (!dryRun) {
  console.log("\nheadlines");
  for (const [label, file] of [
    ["Year to date", "custody-data.json"],
    ["This month", "month-data.json"],
    ["Next 12 months", "forecast-data.json"],
  ]) {
    try {
      const d = JSON.parse(readFileSync(join(DATA, file), "utf8"));
      console.log(`  ${label.padEnd(16)} Claire ${d.totals.claire} / Mat ${d.totals.parent2}` +
                  `  (${d.totals.clairePct}% / ${d.totals.parent2Pct}%)` +
                  (d.totals.unassigned ? `  ${d.totals.unassigned} unassigned` : ""));
    } catch { /* reported above */ }
  }
  try {
    const n = JSON.parse(readFileSync(join(DATA, "month-nights.json"), "utf8")).summary;
    if (n.unswapped.count) {
      const who = n.unswapped.owner === "claire" ? "Claire" : "Mat";
      console.log(`  ${"Unswapped".padEnd(16)} ${n.unswapped.count} extra night(s) for ${who}: ${n.unswapped.dates.join(", ")}`);
    } else {
      console.log(`  ${"Unswapped".padEnd(16)} none — this month balances against the rotation`);
    }
  } catch { /* reported above */ }
  try {
    const c = JSON.parse(readFileSync(join(DATA, "childcare-data.json"), "utf8"));
    const avg = c.totals.cost / c.months.length;
    console.log(`  ${"Childcare".padEnd(16)} £${c.totals.cost.toFixed(2)} over ${c.months.length} months` +
                ` (avg £${avg.toFixed(2)})` +
                (c.reviews.length ? `  ${c.reviews.length} week(s) to check` : "  nothing flagged"));
  } catch { /* reported above */ }
}

console.log(ok ? "\nAll reports refreshed." : "\nFinished WITH PROBLEMS — see the marked lines above.");
process.exit(ok ? 0 : 1);
