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

async function renderSplit() {
  const data = await fetchJson(REPORT.dataUrl);
  const { months, totals, names, generatedAt, rangeStart, rangeEnd } = data;

  document.getElementById("subtitle").textContent =
    `${names.claire} vs ${names.parent2} — ${rangeStart} to ${rangeEnd} — updated ${new Date(generatedAt).toLocaleString()}`;
  document.getElementById("footer").textContent =
    `${REPORT.rangeNote} "Unassigned" = days with no matching calendar event. The exception report falls back to the usual 3-2-2 rotation where the calendar is silent.`;

  // Stat tiles
  const statRow = document.getElementById("stat-row");
  const tiles = [
    { label: names.claire, value: `${totals.clairePct}%`, color: "var(--series-claire)" },
    { label: names.parent2, value: `${totals.parent2Pct}%`, color: "var(--series-mat)" },
    { label: `${names.claire} nights`, value: totals.claire, color: "var(--series-claire)" },
    { label: `${names.parent2} nights`, value: totals.parent2, color: "var(--series-mat)" },
  ];
  if (totals.unassigned > 0) {
    tiles.push({ label: "Unassigned days", value: totals.unassigned, color: "var(--series-unassigned)" });
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
        </tr>`
      )
      .join("") +
    `<tr style="font-weight:600">
      <td>Total</td><td>${totals.claire}</td><td>${totals.parent2}</td>
      <td>${totals.unassigned}</td><td>${totals.clairePct}</td><td>${totals.parent2Pct}</td>
    </tr>`;
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

  const u = summary.unswapped;
  document.getElementById("nights-note").innerHTML =
    `Every night of the month, against who the <b>usual 3-2-2 rotation</b> would give it to. ` +
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

  document.querySelector("#nights-table tbody").innerHTML = nights
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

window.renderReportNav(REPORT.id);

renderSplit().catch((err) => {
  document.getElementById("subtitle").textContent = "Failed to load data: " + err.message;
});
renderNights().catch((err) => {
  const el = document.getElementById("nights-summary");
  if (el) el.textContent = "Failed to load night-by-night data: " + err.message;
});

renderExceptions().catch((err) => {
  document.getElementById("exception-stat-row").textContent = "Failed to load exception data: " + err.message;
});
