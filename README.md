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
calendar-derived split against an authoritative schedule spreadsheet, day by
day, and lists every date where they disagree.

- `scripts/extract-schedule-ground-truth.py <schedule.xlsx> <start> <end> <out.json>`
  pulls a per-day Mat/Claire owner map from the "Data" tab of the schedule
  workbook (columns: Day, Date, Mat, Claire, Comments).
- `scripts/build-exception-report.mjs <raw-events.json> <ground-truth.json> <start> <end>`
  diffs it against the calendar classification and writes
  `data/exceptions.json`, distinguishing **conflicts** (both sources have an
  answer but disagree) from **calendar gaps** (schedule has an answer, no
  calendar event covers the date).
- The ground-truth extraction is a manual step (re-run it when a new schedule
  spreadsheet is provided) — it isn't pulled automatically like the calendar
  is.

## Known open item

Automating the weekly refresh (a Claude Routine) hit a permission error when
last attempted and was deferred — ask Claude to retry creating it.
