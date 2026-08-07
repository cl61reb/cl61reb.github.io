---
name: refresh-reports
description: Refresh every report on the custody/childcare tracker site (cl61reb.github.io) with current calendar data, then commit, push, and verify the deploy. Use when asked to refresh, rerun, or update the reports, the tracker, the split, or the childcare costs — including bare requests like "rerun" or "refresh".
---

# Refresh all reports

Regenerates all four reports, pushes, and confirms the site actually
published. `scripts/refresh-all.mjs` does everything except pull the joint
Google Calendar — that needs the Google Calendar connector, which the script
can't call.

## 1. Pull the joint calendar

Work out the span first: **Jan 1 of the current year** through **13 months
after the start of this month**. On 7 Aug 2026 that is `2026-01-01` →
`2027-09-01`.

Read calendar `u69j9parrfr023fp7r6gu2s098@group.calendar.google.com`
("Both of us") over that span with `pageSize: 250`. One call will not
return it all:

- Split the span into chunks of roughly six months and call once per chunk.
- Responses too large to return inline are written to a file — read that file
  rather than retrying with a narrower range.

Reduce every chunk to `summary`, `start`, `end`, `updated`, and combine into
one JSON array:

```bash
jq -c '.events[] | {summary, start: (.start.date // .start.dateTime),
                    end: (.end.date // .end.dateTime), updated}' CHUNK.json >> /tmp/ev.jsonl
jq -s 'unique_by("\(.summary)|\(.start)|\(.end)")' /tmp/ev.jsonl > /tmp/raw-events.json
```

`start`/`end` may be a date or a dateTime; the `//` handles both. De-duplicate,
because chunk boundaries overlap.

## 2. Run the refresh

```bash
node scripts/refresh-all.mjs /tmp/raw-events.json
```

It derives all four date ranges from today, regenerates every data file,
downloads the school calendar for the childcare costs, and prints the
headline figures. Exit code is non-zero if anything failed.

Two failures to read rather than skim:

- **"does not cover the range"** — the calendar pull was too narrow. Nothing
  was written. Re-pull over the full span; do not work around it by editing
  the ranges.
- **Childcare "COULD NOT FETCH: HTTP 403"** — the environment is missing
  `allsaintsttl.greenhousecms.co.uk` under Network access → Custom → Allowed
  domains. The other reports still refresh. Say so plainly in your summary;
  the childcare figures will be stale.

## 3. Commit and push

Only if `git diff` shows changes. `generatedAt` timestamps alone are not a
change worth committing — check whether any real figures moved:

```bash
git diff -- data/ | grep -E '^[-+]' | grep -v generatedAt | grep -vE '^(---|\+\+\+)'
```

If that is empty, skip the commit entirely and say the data was already
current. Otherwise commit and push to `main` (GitHub Pages serves straight
from it; no PR).

## 4. Verify the deploy — do not skip

GitHub Pages intermittently builds the **previous** commit, which leaves the
site silently stale. This has happened repeatedly on this repo.

Wait ~90s, then list recent workflow runs and confirm a "pages build and
deployment" run exists whose `head_sha` equals the commit you just pushed
**and** whose conclusion is `success`. If the newest run has a different SHA,
push an empty commit (`git commit --allow-empty`) to force a rebuild and check
again, up to 3 times.

## 5. Report back

Give the four headline figures (year to date, this month, next 12 months,
childcare total and monthly average), anything on the childcare review list,
any calendar gaps, whether you pushed, and the confirmed deploy SHA. If a step
failed, say so plainly rather than glossing over it.

## Don't

- Edit anything in `scripts/` — this is a data refresh, not a code change.
- Add entries to `data/corrections.json`. It is bounded by
  `validBefore: 2026-08-01`; the spreadsheet behind it is not valid on or
  after that date, and the loader drops anything that is.
- Write to the user's Google Calendar. Read only.
