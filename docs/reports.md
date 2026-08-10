# Reports

Full documentation for everything under `/family/`. This lives here rather
than in the repo's `README.md` on purpose: the README is the repo's landing
page and the text search engines index for it, so it describes only the blog.
See "What this file is doing in `docs/`" at the bottom.

## Custody Split Tracker

`family/year-to-date.html` reads `data/custody-data.json` and shows the 50/50 custody split
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

The bottom of `family/year-to-date.html` (reading `data/exceptions.json`) lists every
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

## Site layout

The site is two separate things sharing one repo:

- **`/`** — a blog. `index.html` renders its post list from `assets/posts.js`;
  posts live in `posts/`, and `posts/_template.html` is the starting shape.
  Add a post by writing the HTML and adding one entry to the registry.
- **`/family/`** — the custody and childcare reports. **Deliberately not linked
  from the blog**, reachable only by knowing the URL.

Nothing is indexable: every page carries
`<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">` and
`robots.txt` disallows everything.

### Access gate on /family/

Family pages load `assets/gate.js` first. It looks for `?k=<token>` in the URL,
remembers it in `sessionStorage` for the rest of the browser session so the
links between reports keep working, and otherwise sends the visitor to the blog
home.

The working link is **`/family/?k=xM5sUFAbWY0m`**.

Tested: a bare URL and a wrong token both redirect; the right token loads and
click-through then works without repeating it; a fresh session redirects again.

**It is a speed bump, not a lock**, and the same test run shows why — with
JavaScript disabled the page loads normally, `curl` returns it in full, and
`/data/*.json` is served ungated regardless. The token is also committed to a
public repo, so it is readable by anyone who opens `assets/gate.js` on GitHub.
It stops someone casually forwarded a bare link. That is all it does.

> **Unlinked is not private.** The repo is public, so anyone browsing
> github.com/cl61reb/cl61reb.github.io can see `family/` and every data file in
> it, and `robots.txt` is a request that well-behaved crawlers honour rather
> than an access control. Anyone with the URL can read the reports. Real
> privacy needs either a private repo (GitHub Pages needs a paid plan to
> publish from one) or a host with password protection, such as Cloudflare
> Pages or Netlify.

`family/index.html` is a menu of the reports, each card showing that report's
headline figures read live from its own data — so it doubles as a dashboard.

| Page | Range | Data |
|---|---|---|
| `index.html` | — | blog home, reads `assets/posts.js` |
| `family/index.html` | — | report menu, reads all of the below |
| `family/year-to-date.html` | Jan 1 → end of the **previous** month | `data/custody-data.json`, `data/exceptions.json` |
| `family/month.html` | the **current** calendar month | `data/month-data.json`, `data/month-exceptions.json` |
| `family/forecast.html` | rolling 12 months from the **first day of next month** | `data/forecast-data.json`, `data/forecast-exceptions.json` |
| `family/childcare.html` | Sept 2026 → end of the month **9 months out** | `data/childcare-data.json` |

Generated data stays at the repo root in `data/`, next to `scripts/`, so the
report pages reference it as `../data/…`. The refresh pipeline is unaffected by
the page move.

The report windows are contiguous and don't overlap: year-to-date stops where
the current month begins, and the forecast starts where it ends.

`month.html` and `forecast.html` cover plans as much as history, so their
numbers can still change. `data/corrections.json` applies only to
`year-to-date.html`: it is bounded to before 2026-08-01, which is at or
before both other windows.

### How the pages fit together

Every report is the *same report over a different date range* — same scripts,
same logic, same layout — so they share one renderer:

- **`assets/reports.js`** — the registry. The single place that knows what
  reports exist. Both the menu and the nav bar on every page are generated
  from it.
- **`assets/report.js`** — renders any report. A page says only
  `window.REPORT_ID = "month";` and this looks the rest up in the registry.
- **`assets/menu.js`** — renders the menu cards on `index.html`.
- **`assets/report.css`** — shared styles.

## Childcare costs

`childcare.html` estimates the childcare bill month by month from the school's
own iCal feed (`https://allsaintsttl.greenhousecms.co.uk/ical.ics`) — a
different source and a different shape from the custody reports, so it has its
own renderer in `assets/childcare.js`.

`scripts/build-childcare-costs.mjs <school.ics> <start> <end>` costs each day:

| Day | Charge |
|---|---|
| School holiday, **Tue/Wed/Thu** | £85 kids club |
| School holiday, Mon or Fri | £0 — club only runs Tue–Thu |
| **Christmas and New Year weeks** | £0 — kids club shut |
| School day, Mon–Thu | £21 after school club |
| School day, Friday | £0 — no Friday club |
| Bank holiday | £0 — children at home |
| Inset day | £0 — children at home |

So a full holiday week is 3 × £85 = £255 and an ordinary school week
4 × £21 = £84. A closure inside a term week simply drops that day's charge, and
a bank holiday landing on a club day just means the children are at home.

Because the club days are specific weekdays rather than a weekly allowance,
every charge sits on a dated day and months add up exactly — nothing is
pro-rated across a month boundary. The two shut weeks are found as the week
containing 25 December and the week containing 1 January; those dates are seven
days apart, so they are always two distinct adjacent weeks.

**When the feed is unclear, a day is treated as a normal school day** — the
cheaper assumption — and the week is added to a review list shown on the page
rather than silently priced. Two things trigger a review:

- a day the feed says is *closed* sitting in an otherwise normal week (the
  shape a half term takes when only its bank holiday made it into the feed);
- a run of 9+ school weeks with no holiday, which is what a whole missing half
  term looks like from outside. English terms run to about eight weeks, so the
  threshold sits just above.

Both were tested by deleting a half term from a copy of the feed and confirming
they fire; on the real feed neither does.

**Network access:** the school domain is not in the default allowlist, so the
cloud environment needs `allsaintsttl.greenhousecms.co.uk` under **Network
access → Custom → Allowed domains** (keeping the default package-manager list
ticked). Without it the fetch fails with a 403 from the egress proxy.

## Night-by-night check (this month)

The bottom of `month.html` (reading `data/month-nights.json`) lists every night
of the month with who actually has the children and who the usual 3-2-2
rotation would give it to.

Departures from the rotation normally come in pairs — one parent takes a night
and gives one back — so they cancel. `scripts/build-nightly-detail.mjs` pairs
them off in date order; whatever is left in the longer list is a night gained
and not returned, flagged in red as an **unswapped extra night**. The latest
such nights are the ones flagged, since the earlier ones had a counterpart
available to pair with.

A night the calendar says nothing about is reported as unassigned rather than
counted as a departure — a missing entry is not a swap.

The table is registry-driven: it appears only on reports whose entry in
`assets/reports.js` sets `nightsUrl`, which is why the year-to-date and
forecast pages do not grow one.

## Forecast checks

The bottom of `forecast.html` carries two checks over the next 12 months.

**Deviations from the schedule** (`data/forecast-nights.json`) — the same
night-by-night comparison the month report uses, but with `nightsMode:
"deviations"` in the registry so only the nights that differ are listed; a
year of matching nights would bury them. Unswapped extra nights are flagged
red exactly as on the month page.

**Ambiguous calendar entries** (`data/forecast-ambiguity.json`) — dates covered
by a Claire entry *and* a Mat entry at once, produced by
`scripts/build-ambiguity-report.mjs`. These are neither gaps nor swaps: the
calendar contradicts itself. The split still resolves them (most recently
edited entry wins, then the weekend-Sunday rule, then corrections), but the
answer is inferred rather than stated, so each is listed with every competing
entry, its last-edited date, and which one was counted. Consecutive days
sharing the same clash are grouped into one run.

Both are registry-driven (`nightsUrl` / `ambiguityUrl`), so they appear only
where configured — the year-to-date page has neither.

### Adding a new report

1. Add an entry to `assets/reports.js` (id, href, title, blurb, and the three
   data URLs).
2. Copy any report page to `<id>.html` and change its one config line to
   `window.REPORT_ID = "<your id>";`.
3. Generate its data with the same three scripts, pointed at the new date
   range — see the comment at the top of `assets/reports.js` for the exact
   commands.
4. Add those three commands to `docs/weekly-refresh-routine.md` so the weekly
   refresh keeps it current.

Nothing else needs editing: the new report appears in the menu and in every
existing page's nav automatically. This was verified by adding a throwaway
fourth report and confirming it showed up everywhere without touching any
other page.

## Corrections (`data/corrections.json`)

A short, explicit list of days where the joint calendar is demonstrably wrong
and the schedule spreadsheet records what actually happened. Applied last, so
they win over both the calendar and the weekend-Sunday rule.

**The spreadsheet is authoritative only up to `validBefore` (2026-08-01).**
Corrections dated on or after it are dropped on load, and no new ones should
be added from that spreadsheet - from 2026-08-01 onward the calendar is the
only source. Currently three entries, all Feb/Mar 2026: a half-term week, and
a Sat/Sun pair during a trip where the calendar's dates contradict its own
title. With these applied the split matches the spreadsheet on all 212 days
of Jan-Jul 2026.

## Refreshing everything at once

```bash
node scripts/refresh-all.mjs <raw-events.json>
```

Regenerates all four reports in one command. It derives the four date ranges
from today, runs every generator, downloads the school calendar for the
childcare costs, prints the headline figures, and exits non-zero if anything
failed.

The one thing it cannot do is pull the joint Google Calendar — that is only
reachable through the Google Calendar MCP connector, so the reduced events
array has to be handed in. It must span Jan 1 of the current year through 13
months out; the script checks first and **refuses to write anything** if the
input is too narrow, rather than emitting a confidently wrong report.

Ask Claude to *"refresh all reports"* and the **`refresh-reports` skill**
(`.claude/skills/refresh-reports/`) drives the whole thing: the calendar pull,
this script, the commit and push, and the deploy verification.

Notes:
- The school calendar is fetched with `curl`, not Node's `fetch` — the latter
  ignores `HTTPS_PROXY`, so it fails with a 403 in a proxied sandbox where
  curl succeeds.
- If the childcare fetch 403s, the other three reports still refresh and the
  script says so; only the costs go stale.

## Weekly refresh

Data is regenerated by a scheduled Claude Routine (weekly, Monday morning).
The exact prompt it runs, its settings, and the reasoning behind its
constraints live in [`weekly-refresh-routine.md`](weekly-refresh-routine.md)
— use that to recreate or edit the Routine.

Between runs you can refresh on demand by asking Claude to rerun it.

## What this file is doing in `docs/`

This was `README.md` until it was moved here. A repo's rendered README is its
landing page on github.com and the text Google indexes for
`github.com/cl61reb/cl61reb.github.io`, so anyone searching the handle used to
be met with "shows the 50/50 custody split with Mat", the school's calendar
URL, and the `/family/` access token, all in the first screenful. The README
now covers the blog only.

**Be clear about what that did and did not achieve.** It changes the first
thing a casual visitor reads and the snippet a search engine can show. It does
not hide anything: this file, `family/`, and every file in `data/` are still
browsable by anyone who opens the repo, and the previous README text remains in
the git history. The repo is public, so the content is public.

The only change that actually makes this private is making the repository
private — see the note under "Access gate" above for what that costs and which
hosts support it.
