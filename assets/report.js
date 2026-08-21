// Shared renderer for the custody reports.
//
// Every report page is the same report over a different date range, so they
// all share this file. A page only has to say which report it is:
//
//   window.REPORT_ID = "month";
//
// The matching entry in assets/reports.js supplies the data URLs and the
// footer note, and the nav bar is generated from the full registry — so a
// new report shows up in every page's nav automatically.

const NS = "http://www.w3.org/2000/svg";

const REPORT = (window.REPORTS || []).find((r) => r.id === window.REPORT_ID);
if (!REPORT) {
  throw new Error(
    `Unknown REPORT_ID "${window.REPORT_ID}" - add it to assets/reports.js, and make sure that file loads before this one.`
  );
}


function el(name, attrs) {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function monthLabel(key) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: "short" });
}

function fmtDate(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  });
}

function ownerColor(owner) {
  if (owner === "claire") return "var(--series-claire)";
  if (owner === "parent2") return "var(--series-mat)";
  return "var(--text-muted)";
}

// Cache-bust: `cache: "no-store"` only bypasses the browser cache, not the
// GitHub Pages CDN, which would otherwise serve stale data for minutes
// after a deploy. The query param makes each load a distinct edge key.
function fetchJson(url) {
  return fetch(`${url}?v=${Date.now()}`, { cache: "no-store" }).then((r) => r.json());
}

// Running totals from a fixed month, carried across the earlier reports.
//
// The forecast begins in September, so "since 1 Jan" has to pick up the year
// to date and the current month too. Months are merged by key rather than
// added blindly, so overlapping ranges cannot double count, and any month
// missing between the start and the end of this report is reported rather
// than quietly treated as zero.
function buildCumulative(config, data) {
  const byMonth = new Map();
  for (const src of [...config.sources, data]) {
    if (!src || !Array.isArray(src.months)) continue;
    for (const m of src.months) byMonth.set(m.month, { claire: m.claire, parent2: m.parent2 });
  }

  const lastMonth = data.months.length ? data.months[data.months.length - 1].month : config.since;
  const wanted = [];
  for (let k = config.since; k <= lastMonth; ) {
    wanted.push(k);
    const [y, m] = k.split("-").map(Number);
    k = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }

  const missing = wanted.filter((k) => !byMonth.has(k));
  const rows = new Map();
  let claire = 0, parent2 = 0;
  for (const k of wanted) {
    const v = byMonth.get(k);
    if (!v) continue;
    claire += v.claire;
    parent2 += v.parent2;
    const total = claire + parent2;
    rows.set(k, {
      claire,
      parent2,
      clairePct: total ? Math.round((claire * 1000) / total) / 10 : null,
      parent2Pct: total ? Math.round((parent2 * 1000) / total) / 10 : null,
    });
  }
  return { rows, missing, final: rows.get(wanted[wanted.length - 1]) || null };
}

async function renderSplit() {
  const data = await fetchJson(REPORT.dataUrl);
  const { months, totals, names, generatedAt, rangeStart, rangeEnd } = data;

  const cumConfig = REPORT.cumulative;
  const cum = cumConfig
    ? buildCumulative(
        { ...cumConfig, sources: await Promise.all(cumConfig.priorUrls.map(fetchJson)) },
        data
      )
    : null;

  document.getElementById("subtitle").textContent =
    `${names.claire} vs ${names.parent2} — ${rangeStart} to ${rangeEnd} — updated ${new Date(generatedAt).toLocaleString()}`;
  document.getElementById("footer").textContent =
    `${REPORT.rangeNote} "Unassigned" = days with no matching calendar event. The exception report falls back to the usual 3-2-2 rotation where the calendar is silent.`;

  // Stat tiles
  //
  // With a cumulative period on the page there are two total rates, so both
  // sets of tiles name their period. Without one, the labels stay bare - the
  // other reports only ever show a single period.
  const period = cum ? ` · ${REPORT.cumulative.periodLabel}` : "";
  const statRow = document.getElementById("stat-row");
  const tiles = [
    { label: `${names.claire}${period}`, value: `${totals.clairePct}%`, color: "var(--series-claire)" },
    { label: `${names.parent2}${period}`, value: `${totals.parent2Pct}%`, color: "var(--series-mat)" },
    { label: `${names.claire} nights`, value: totals.claire, color: "var(--series-claire)" },
    { label: `${names.parent2} nights`, value: totals.parent2, color: "var(--series-mat)" },
  ];
  if (totals.unassigned > 0) {
    tiles.push({ label: "Unassigned days", value: totals.unassigned, color: "var(--series-unassigned)" });
  }
  // The cumulative total rate. It is in the table too, but at the far right of
  // a table that scrolls sideways on a phone, so it needs to be up here.
  if (cum && cum.final && cum.final.clairePct !== null) {
    const since = REPORT.cumulative.shortLabel;
    tiles.push(
      { label: `${names.claire} · ${since}`, value: `${cum.final.clairePct}%`, color: "var(--series-claire)" },
      { label: `${names.parent2} · ${since}`, value: `${cum.final.parent2Pct}%`, color: "var(--series-mat)" }
    );
  }
  for (const t of tiles) {
    const tile = document.createElement("div");
    tile.className = "stat-tile";
    tile.innerHTML = `<div class="label"><span class="swatch" style="background:${t.color}"></span>${t.label}</div><div class="value">${t.value}</div>`;
    statRow.appendChild(tile);
  }

  // Legend
  document.getElementById("legend").innerHTML = [
    [names.claire, "var(--series-claire)"],
    [names.parent2, "var(--series-mat)"],
    ["Unassigned", "var(--series-unassigned)"],
  ]
    .map(([label, color]) => `<span class="item"><span class="swatch" style="background:${color}"></span>${label}</span>`)
    .join("");

  // Chart
  const svg = document.getElementById("chart");
  const tooltip = document.getElementById("tooltip");
  const W = 860, H = 320, padL = 30, padR = 10, padT = 10, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxDays = Math.max(...months.map((m) => m.totalDays), 31);
  const n = months.length;
  const gap = n > 8 ? 10 : 12;
  const barW = Math.min(48, (plotW - gap * (n - 1)) / n);
  const startX = padL + (plotW - (barW * n + gap * (n - 1))) / 2;

  [0, 0.25, 0.5, 0.75, 1].forEach((f) => {
    const y = padT + plotH * (1 - f);
    svg.appendChild(el("line", { x1: padL, x2: W - padR, y1: y, y2: y, stroke: "var(--gridline)", "stroke-width": 1 }));
    const label = el("text", { x: padL - 6, y: y + 4, class: "axis-label", "text-anchor": "end" });
    label.textContent = Math.round(maxDays * f);
    svg.appendChild(label);
  });

  months.forEach((m, i) => {
    const x = startX + i * (barW + gap);
    const scale = plotH / maxDays;
    let y = padT + plotH;
    const segs = [
      { key: "claire", value: m.claire, color: "var(--series-claire)", label: names.claire },
      { key: "parent2", value: m.parent2, color: "var(--series-mat)", label: names.parent2 },
      { key: "unassigned", value: m.unassigned, color: "var(--series-unassigned)", label: "Unassigned" },
    ].filter((s) => s.value > 0);

    segs.forEach((s, si) => {
      const segH = Math.max(0, s.value * scale - (si < segs.length - 1 ? 2 : 0));
      y -= segH + (si > 0 ? 2 : 0);
      const isTop = si === segs.length - 1;
      const rect = el("rect", {
        x, y, width: barW, height: segH, fill: s.color, class: "bar-seg",
        rx: isTop ? 4 : 0, ry: isTop ? 4 : 0,
      });
      rect.addEventListener("mousemove", (ev) => {
        const pct = m.claire + m.parent2 > 0
          ? (s.key === "unassigned" ? "" : ` (${s.key === "claire" ? m.clairePct : m.parent2Pct}%)`)
          : "";
        tooltip.textContent = `${monthLabel(m.month)} ${m.month.slice(0, 4)} — ${s.label}: ${s.value}${pct}`;
        const b = document.getElementById("chart-container").getBoundingClientRect();
        tooltip.style.left = `${ev.clientX - b.left}px`;
        tooltip.style.top = `${ev.clientY - b.top}px`;
        tooltip.style.opacity = 1;
      });
      rect.addEventListener("mouseleave", () => { tooltip.style.opacity = 0; });
      svg.appendChild(rect);
    });

    const label = el("text", { x: x + barW / 2, y: H - 8, class: "month-label", "text-anchor": "middle" });
    label.textContent = monthLabel(m.month);
    svg.appendChild(label);
  });

  // Table
  const cumCells = (row) =>
    cum
      ? `<td class="group-start">${row ? row.claire : "–"}</td>
         <td>${row ? row.parent2 : "–"}</td>
         <td>${row && row.clairePct !== null ? row.clairePct : "–"}</td>
         <td>${row && row.parent2Pct !== null ? row.parent2Pct : "–"}</td>`
      : "";

  document.querySelector("#data-table tbody").innerHTML =
    months
      .map(
        (m) => `<tr>
          <td>${monthLabel(m.month)} ${m.month.slice(0, 4)}</td>
          <td>${m.claire}</td>
          <td>${m.parent2}</td>
          <td>${m.unassigned}</td>
          <td>${m.clairePct ?? "–"}</td>
          <td>${m.parent2Pct ?? "–"}</td>
          ${cumCells(cum ? cum.rows.get(m.month) : null)}
        </tr>`
      )
      .join("") +
    `<tr style="font-weight:600">
      <td>Total</td><td>${totals.claire}</td><td>${totals.parent2}</td>
      <td>${totals.unassigned}</td><td>${totals.clairePct}</td><td>${totals.parent2Pct}</td>
      ${cumCells(cum ? cum.final : null)}
    </tr>`;

  // The cumulative columns span three reports, so say plainly what they add up
  // and flag it if a month between the start date and here is missing.
  const cumNote = document.getElementById("cumulative-note");
  if (cumNote && cum) {
    cumNote.textContent = cum.missing.length
      ? `The cumulative columns are INCOMPLETE: no data for ${cum.missing.join(", ")}. ` +
        `Those months are missing from the running total, so the percentages understate the period.`
      : `The cumulative columns are a running total of every night from 1 January 2026 to the end of that row's month, ` +
        `combining the year to date and current month reports with this one. The "Total" row is the whole period. ` +
        `Unassigned nights are excluded from the percentages.`;
    cumNote.hidden = false;
  }
}

async function renderExceptions() {
  const data = await fetchJson(REPORT.exceptionsUrl);
  const { summary, gaps } = data;

  const statRow = document.getElementById("exception-stat-row");
  for (const t of [
    { label: "Days compared", value: summary.totalDays, color: "var(--text-muted)" },
    { label: "Calendar gaps (nights)", value: summary.gapDays, color: "#b8860b" },
  ]) {
    const tile = document.createElement("div");
    tile.className = "stat-tile";
    tile.innerHTML = `<div class="label"><span class="dot" style="background:${t.color}"></span>${t.label}</div><div class="value">${t.value}</div>`;
    statRow.appendChild(tile);
  }

  document.querySelector("#gap-table tbody").innerHTML = gaps
    .map((g) => {
      const last = new Date(`${g.endDateExclusive}T00:00:00Z`);
      last.setUTCDate(last.getUTCDate() - 1);
      const range = g.nights > 1
        ? `${fmtDate(g.startDate)} – ${fmtDate(last.toISOString().slice(0, 10))}`
        : fmtDate(g.startDate);
      return `<tr>
        <td>${range}</td>
        <td>${g.nights}</td>
        <td><span class="badge"><span class="dot" style="background:${ownerColor(g.owner)}"></span>${g.ownerLabel}</span></td>
        <td><a href="${g.googleCalendarLink}" target="_blank" rel="noopener">Add to calendar →</a></td>
      </tr>`;
    })
    .join("");
  document.getElementById("gap-empty").hidden = gaps.length > 0;
  document.getElementById("gap-table").hidden = gaps.length === 0;
}

// Night-by-night table, for reports that configure one.
async function renderNights() {
  if (!REPORT.nightsUrl) return;
  const data = await fetchJson(REPORT.nightsUrl);
  const { nights, summary, names } = data;
  const label = (o) => (o === "claire" ? names.claire : o === "parent2" ? names.parent2 : "—");
  const colour = (o) =>
    o === "claire" ? "var(--series-claire)" : o === "parent2" ? "var(--series-mat)" : "var(--text-muted)";
  const badge = (o) =>
    `<span class="badge"><span class="dot" style="background:${colour(o)}"></span>${label(o)}</span>`;

  const deviationsOnly = REPORT.nightsMode === "deviations";
  const shown = deviationsOnly ? nights.filter((n) => n.status !== "match") : nights;

  const u = summary.unswapped;
  document.getElementById("nights-note").innerHTML = deviationsOnly
    ? `Only the nights that <b>differ</b> from the usual 3-2-2 rotation are listed — the other ` +
      `${summary.matching} of ${summary.nights} follow it. Departures normally come in pairs, one ` +
      `parent taking a night and giving one back, so they cancel. A departure with no matching one ` +
      `the other way is flagged as an <b>unswapped extra night</b>. These are plans, so they can ` +
      `still change.`
    : `Every night of the month, against who the <b>usual 3-2-2 rotation</b> would give it to. ` +
    `Departures from the rotation normally come in pairs — one parent takes a night and gives one back — ` +
    `so they cancel out. A departure with no matching one the other way is a night gained and not returned, ` +
    `flagged below as an <b>unswapped extra night</b>.`;

  document.getElementById("nights-summary").innerHTML = `
    <div class="nights-tally">
      <span>Actual <b>${names.claire} ${summary.actual.claire}</b> / <b>${names.parent2} ${summary.actual.parent2}</b></span>
      <span>Usual <b>${names.claire} ${summary.usual.claire}</b> / <b>${names.parent2} ${summary.usual.parent2}</b></span>
      <span>${summary.swapped} swapped ${summary.swapped === 1 ? "night" : "nights"}</span>
    </div>
    ${
      u.count
        ? `<p class="nights-alert"><b>${u.count} unswapped extra ${u.count === 1 ? "night" : "nights"} for ${label(u.owner)}.</b>
             ${label(u.owner)} has taken ${u.count === 1 ? "a night" : `${u.count} nights`} that the rotation gives to
             ${label(u.owner === "claire" ? "parent2" : "claire")}, without one coming back the other way
             — which is why the month reads ${summary.actual.claire}/${summary.actual.parent2}
             rather than ${summary.usual.claire}/${summary.usual.parent2}.</p>`
        : `<p class="nights-ok">The month balances — every departure from the rotation has a matching one the other way.</p>`
    }`;

  const emptyEl = document.getElementById("nights-empty");
  if (emptyEl) {
    emptyEl.hidden = shown.length > 0;
    document.getElementById("nights-table").hidden = shown.length === 0;
  }

  document.querySelector("#nights-table tbody").innerHTML = shown
    .map((n) => {
      const d = new Date(`${n.date}T00:00:00Z`);
      const when = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
      const flag =
        n.status === "unswapped"
          ? `<span class="badge badge-unswapped">Unswapped extra night</span>`
          : n.status === "swapped"
          ? `<span class="badge badge-reduced">Swapped</span>`
          : n.status === "unassigned"
          ? `<span class="badge badge-warn">No calendar entry</span>`
          : "";
      const note = n.note ? `<div class="comment">${n.note}</div>` : "";
      return `<tr class="${n.status === "unswapped" ? "row-unswapped" : ""}">
        <td class="date">${when}</td>
        <td>${badge(n.actual)}</td>
        <td>${badge(n.usual)}</td>
        <td>${flag}${note}</td>
      </tr>`;
    })
    .join("");
}

// Days the calendar answers twice, for reports that configure one.
async function renderAmbiguity() {
  if (!REPORT.ambiguityUrl) return;
  const data = await fetchJson(REPORT.ambiguityUrl);
  const { conflicts, summary, names } = data;
  const colour = (o) => (o === "claire" ? "var(--series-claire)" : "var(--series-mat)");

  document.getElementById("ambiguity-note").innerHTML =
    `Dates covered by a <b>${names.claire}</b> entry and a <b>${names.parent2}</b> entry at the same ` +
    `time — days the calendar contradicts itself. The split still picks a winner (most recently ` +
    `edited entry wins), but that answer is inferred rather than stated, so these are worth a look. ` +
    `Consecutive days with the same clashing entries are grouped as one.`;

  document.getElementById("ambiguity-summary").innerHTML = summary.conflictDays
    ? `<p class="nights-alert"><b>${summary.conflictDays} ambiguous ${summary.conflictDays === 1 ? "day" : "days"}</b>
         out of ${summary.daysChecked} checked, in ${summary.conflictRuns}
         ${summary.conflictRuns === 1 ? "run" : "runs"}. Deleting or shortening whichever entry is wrong
         would settle ${summary.conflictDays === 1 ? "it" : "them"}.</p>`
    : `<p class="nights-ok">${summary.daysChecked} days checked, none with a clash.</p>`;

  document.querySelector("#ambiguity-table tbody").innerHTML = conflicts
    .map((c) => {
      const last = new Date(`${c.endDateExclusive}T00:00:00Z`);
      last.setUTCDate(last.getUTCDate() - 1);
      const range = c.days > 1
        ? `${fmtDate(c.startDate)} – ${fmtDate(last.toISOString().slice(0, 10))}`
        : fmtDate(c.startDate);
      const entries = c.competing
        .map((e) => {
          const won = e.owner === c.resolvedTo && e.summary === c.resolvedBy;
          return `<div class="amb-entry${won ? " amb-won" : ""}">
                    <span class="badge"><span class="dot" style="background:${colour(e.owner)}"></span>${e.ownerName}</span>
                    <span class="amb-summary">${e.summary}</span>
                    <span class="comment">edited ${e.updated.slice(0, 10)}${won ? " · counted" : ""}</span>
                  </div>`;
        })
        .join("");
      return `<tr>
        <td class="date">${range}${c.days > 1 ? `<div class="comment">${c.days} days</div>` : ""}</td>
        <td><span class="badge"><span class="dot" style="background:${colour(c.resolvedTo)}"></span>${c.resolvedToName}</span></td>
        <td>${entries}</td>
      </tr>`;
    })
    .join("");
  document.getElementById("ambiguity-empty").hidden = conflicts.length > 0;
  document.getElementById("ambiguity-table").hidden = conflicts.length === 0;
}

window.renderReportNav(REPORT.id);

renderSplit().catch((err) => {
  document.getElementById("subtitle").textContent = "Failed to load data: " + err.message;
});
renderNights().catch((err) => {
  const el = document.getElementById("nights-summary");
  if (el) el.textContent = "Failed to load night-by-night data: " + err.message;
});

renderAmbiguity().catch((err) => {
  const el = document.getElementById("ambiguity-summary");
  if (el) el.textContent = "Failed to load ambiguity data: " + err.message;
});

renderExceptions().catch((err) => {
  document.getElementById("exception-stat-row").textContent = "Failed to load exception data: " + err.message;
});
