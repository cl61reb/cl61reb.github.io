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

The bottom of `index.html` (reading `data/exceptions.json`) lists every
**calendar gap** - a date range with no matching calendar event - alongside
who would normally have the kids per the **usual 3-2-2 rotation**, with a
one-click "Add to calendar" link to close the gap. Conflicts (calendar and
usual schedule both have an answer but disagree - typically a deliberate
exception like a holiday or swap) are intentionally not reported; only
missing entries are, since those are the ones worth fixing.

- `scripts/usual-schedule.mjs` defines the rotation. Each week splits into
  three blocks — Fri+Sat with parent A, Sun+Mon+Tue with parent B, Wed+Thu
  back with parent A — and the parents swap roles every week, so each gets
  7 nights per fortnight and the block run reads 3-2-2-3-2-2. Note the
  3-night block is **Sun-Mon-Tue, not Fri-Sat-Sun**: the kids change hands on
  the Sunday, so Sunday night belongs to the Mon+Tue parent. Anchored to
  Fri 2026-01-02 being Mat's Fri+Sat. Verified against the schedule
  spreadsheet for Jan-Jul 2026: 182/212 days match, and all 30 that don't
  correspond to a logged exception (half term, "Mat away", "Claire away",
  Efteling, an explicit "swap") rather than a flaw in the pattern.
- `scripts/generate-usual-schedule.mjs <start> <end>` writes a ground-truth-shaped
  JSON file from that rotation.
- `scripts/build-exception-report.mjs <raw-events.json> <ground-truth.json> <start> <end>`
  finds calendar gaps, groups consecutive same-owner gap days into a single
  run, and builds a Google Calendar "create event" link (`action=TEMPLATE`)
  for each run, writing it all to `data/exceptions.json`.
- `scripts/extract-schedule-ground-truth.py` (reads an uploaded schedule
  spreadsheet's "Data" tab) and its earlier output `data/schedule-ground-truth.json`
  are kept for reference but are no longer used.

## Known open item

Automating the weekly refresh (a Claude Routine) hit a permission error when
last attempted and was deferred — ask Claude to retry creating it.
