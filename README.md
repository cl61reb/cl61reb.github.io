# cl61reb.github.io

## Custody Split Tracker

`index.html` reads `data/custody-data.json` and shows the 50/50 custody split
with Mat, broken down by month, from Jan 1 through the end of the *previous*
month (the current, still-incomplete month is excluded).

- **Source:** the "Both of us" joint Google Calendar, events named like
  "Claire's nights" / "Mats nights" / "Claire have kids (Mat away)". A parent
  being marked "away" (e.g. "Mat Away") with no other custody keyword is
  attributed to the *other* parent's nights.
- **Compute:** `scripts/compute-custody-split.mjs` takes a JSON array of raw
  calendar events (`summary`, `start`, `end`, `updated`) and turns it into
  `data/custody-data.json`. See the comment at the top of that file for the
  exact classification and conflict-resolution rules.
- **Refresh:** intended to run weekly (re-pull the calendar, regenerate
  `data/custody-data.json`, push) — not yet automated, see below.
- **"Unassigned" days:** a small number of dates have no matching calendar
  event (short, unlogged handover gaps). These are shown honestly rather than
  guessed at; add explicit calendar events for those days to close the gap.

## Exception report

The bottom of `index.html` (reading `data/exceptions.json`) cross-checks the
calendar against the **usual 3-2-2 rotation** - not a spreadsheet - day by
day, and lists every date where they disagree. Since the usual schedule is a
pure recurring pattern, every real-life departure from it (holidays, swaps,
away trips, genuine calendar mistakes) shows up as an exception to review.

- `scripts/usual-schedule.mjs` defines the rotation: the weekend (Fri-Sat-Sun,
  3 nights) alternates each week; the parent without the weekend gets Mon-Tue
  (2 nights) while the weekend owner keeps Wed-Thu too (2 nights) - so each
  parent's block sizes over a 2-week cycle read 3-2-2-3-2-2, a 7/7 split.
  Anchored to a confirmed date (2026-01-02, a Mat weekend); verified against
  the calendar for Jan-Feb 2026 with a 100% match before the first logged
  exception.
- `scripts/generate-usual-schedule.mjs <start> <end>` writes a ground-truth-shaped
  JSON file from that rotation.
- `scripts/build-exception-report.mjs <raw-events.json> <ground-truth.json> <start> <end>`
  diffs the calendar classification against it and writes
  `data/exceptions.json`, distinguishing **conflicts** (calendar names a
  different parent than usual) from **calendar gaps** (no calendar event
  covers the date at all).
- `scripts/extract-schedule-ground-truth.py` (reads an uploaded schedule
  spreadsheet's "Data" tab) and its earlier output `data/schedule-ground-truth.json`
  are kept for reference but are no longer what the exception report compares
  against.

## Known open item

Automating the weekly refresh (a Claude Routine) hit a permission error when
last attempted and was deferred — ask Claude to retry creating it.
