# cl61reb.github.io

## Custody Split Tracker

`index.html` reads `data/custody-data.json` and shows the year-to-date 50/50
custody split with Mat, broken down by month.

- **Source:** the "Both of us" joint Google Calendar, events named like
  "Claire's nights" / "Mats nights" / "Claire have kids (Mat away)".
- **Compute:** `scripts/compute-custody-split.mjs` takes a JSON array of raw
  calendar events (`summary`, `start`, `end`, `updated`) and turns it into
  `data/custody-data.json`. See the comment at the top of that file for the
  exact classification and conflict-resolution rules.
- **Refresh:** a weekly Claude routine re-pulls the calendar, regenerates
  `data/custody-data.json`, and pushes the update — no manual steps needed.
- **"Unassigned" days:** a small number of dates have no matching calendar
  event (short, unlogged handover gaps). These are shown honestly rather than
  guessed at; add explicit calendar events for those days to close the gap.
