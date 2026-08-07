// Renders the report menu on index.html from the registry in reports.js.
//
// Each card loads that report's own data file so the menu doubles as a
// dashboard: you see the headline split and any calendar gaps without
// opening the report. A report that fails to load says so on its card
// rather than silently showing nothing.

function fetchJson(url) {
  return fetch(`${url}?v=${Date.now()}`, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });
}

function fmtRange(startStr, endExclusiveStr) {
  const start = new Date(`${startStr}T00:00:00Z`);
  const end = new Date(`${endExclusiveStr}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1); // inclusive last day, for reading
  const opts = { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" };
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
}

async function renderCard(report) {
  const card = document.createElement("a");
  card.className = "menu-card";
  card.href = report.href;
  card.innerHTML = `
    <div class="menu-card-head">
      <h2>${report.title}</h2>
      <span class="menu-arrow" aria-hidden="true">→</span>
    </div>
    <p class="menu-blurb">${report.blurb}</p>
    <div class="menu-figures"><span class="menu-loading">Loading…</span></div>`;
  document.getElementById("menu").appendChild(card);

  const figures = card.querySelector(".menu-figures");
  try {
    const [data, exceptions] = await Promise.all([
      fetchJson(report.dataUrl),
      fetchJson(report.exceptionsUrl).catch(() => null),
    ]);
    const t = data.totals;
    const gapDays = exceptions && exceptions.summary ? exceptions.summary.gapDays : 0;

    figures.innerHTML = `
      <div class="menu-range">${fmtRange(data.rangeStart, data.rangeEnd)}</div>
      <div class="menu-split">
        <span class="menu-stat"><span class="swatch" style="background:var(--series-claire)"></span>${data.names.claire} <b>${t.clairePct}%</b> <span class="menu-nights">${t.claire} nights</span></span>
        <span class="menu-stat"><span class="swatch" style="background:var(--series-mat)"></span>${data.names.parent2} <b>${t.parent2Pct}%</b> <span class="menu-nights">${t.parent2} nights</span></span>
      </div>
      <div class="menu-bar" role="img" aria-label="${data.names.claire} ${t.clairePct}%, ${data.names.parent2} ${t.parent2Pct}%">
        <span style="width:${t.clairePct}%;background:var(--series-claire)"></span>
        <span style="width:${t.parent2Pct}%;background:var(--series-mat)"></span>
      </div>
      ${
        gapDays > 0
          ? `<div class="menu-flag menu-flag-warn">${gapDays} night${gapDays === 1 ? "" : "s"} with no calendar entry</div>`
          : `<div class="menu-flag">Every day has a calendar entry</div>`
      }`;
  } catch (err) {
    figures.innerHTML = `<div class="menu-flag menu-flag-warn">Couldn't load this report's data (${err.message})</div>`;
  }
}

for (const report of window.REPORTS) renderCard(report);
