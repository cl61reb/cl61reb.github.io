// The registry of reports. This is the single place that knows what reports
// exist — the menu on index.html and the nav bar on every report page are
// both generated from it.
//
// TO ADD A NEW REPORT:
//   1. Add an entry here.
//   2. Copy any report page (e.g. month.html) to <id>.html and change the
//      one line near the bottom to `window.REPORT_ID = "<your id>";`.
//   3. Generate its data with the same three scripts, pointed at the new
//      date range and the dataUrl/exceptionsUrl filenames you set below:
//        OUT_PATH=<usualScheduleUrl>  node scripts/generate-usual-schedule.mjs <start> <end>
//        OUT_PATH=<dataUrl>           node scripts/compute-custody-split.mjs <events> <start> <end>
//        OUT_PATH=<exceptionsUrl>     node scripts/build-exception-report.mjs <events> <usualScheduleUrl> <start> <end>
//   4. Add the same three commands to docs/weekly-refresh-routine.md so the
//      weekly refresh keeps it up to date.
//
// Data URLs are written ../data/… because the report pages live in /family/
// while the generated data stays at the repo root next to scripts/.
//
// No other file needs touching — the menu and every nav bar pick it up.

window.REPORTS = [
  {
    kind: "custody",
    id: "ytd",
    href: "year-to-date.html",
    title: "Year to date",
    blurb: "Jan 1 through the end of last month. Settled history — the current, incomplete month is left out so a part-month can't skew the running split.",
    dataUrl: "../data/custody-data.json",
    exceptionsUrl: "../data/exceptions.json",
    usualScheduleUrl: "../data/usual-schedule.json",
    rangeNote:
      'Computed from the "Both of us" Google Calendar, covering Jan 1 through the end of the previous month (the current, incomplete month is excluded).',
  },
  {
    kind: "custody",
    id: "month",
    href: "month.html",
    title: "This month",
    blurb: "The current calendar month. Still in progress, so the later dates are planned rather than settled.",
    dataUrl: "../data/month-data.json",
    exceptionsUrl: "../data/month-exceptions.json",
    usualScheduleUrl: "../data/month-usual-schedule.json",
    // Optional: a night-by-night table of actual vs the usual rotation.
    // Only reports that set this render one.
    nightsUrl: "../data/month-nights.json",
    rangeNote:
      'Computed from the "Both of us" Google Calendar, covering the current calendar month. The month is still in progress, so later dates are planned rather than settled.',
  },
  {
    kind: "custody",
    id: "forecast",
    href: "forecast.html",
    title: "Next 12 months",
    blurb: "A rolling year from the first of next month. These are plans, not history — they can still change.",
    dataUrl: "../data/forecast-data.json",
    exceptionsUrl: "../data/forecast-exceptions.json",
    usualScheduleUrl: "../data/forecast-usual-schedule.json",
    // A year of nights is too many to list, so this one shows only the
    // departures from the rotation rather than every night.
    nightsUrl: "../data/forecast-nights.json",
    nightsMode: "deviations",
    // Days the calendar answers twice - a Claire entry and a Mat entry at once.
    ambiguityUrl: "../data/forecast-ambiguity.json",
    // Optional: extra table columns carrying a running total from a fixed
    // month, spanning earlier reports as well as this one. The forecast starts
    // in September, so the year so far has to come from the other two reports;
    // their ranges are contiguous with this one, which is what makes the sum
    // valid. Months are merged by key, so an overlap would not double count.
    cumulative: {
      since: "2026-01",
      label: "Cumulative since 1 Jan 2026",
      priorUrls: ["../data/custody-data.json", "../data/month-data.json"],
    },
    rangeNote:
      'Computed from the "Both of us" Google Calendar, covering a rolling 12 months starting from the first day of next month. These are plans, not history - they can still change.',
  },
  {
    kind: "cost",
    id: "childcare",
    href: "childcare.html",
    title: "Childcare costs",
    blurb: "Estimated childcare bill by month, costed per day off the school calendar — kids club in the holidays, after school club in term time.",
    dataUrl: "../data/childcare-data.json",
    rangeNote:
      "Estimated from the All Saints' school calendar feed, costed per day: kids club Tue/Wed/Thu during school holidays, after school club Monday to Thursday in term time, and nothing on bank holidays, inset days, or the Christmas and New Year weeks when the club is shut.",
  },
];

// Nav is generated from the registry, so adding a report above puts it in the
// nav of every page automatically. Shared by all report renderers.
window.renderReportNav = function (currentId) {
  const nav = document.querySelector(".nav");
  if (!nav) return;
  nav.innerHTML =
    `<a href="index.html">All reports</a>` +
    window.REPORTS.map(
      (r) =>
        `<span class="nav-sep">·</span>` +
        (r.id === currentId ? `<b>${r.title}</b>` : `<a href="${r.href}">${r.title}</a>`)
    ).join("");
};
