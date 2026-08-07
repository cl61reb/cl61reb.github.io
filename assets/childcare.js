// Renderer for the childcare cost report.
//
// One measure (cost per month), so the chart is a single series: no legend,
// values labelled directly on the bars. Months whose price rests on an
// assumption that might be wrong are marked, and the reasons are listed in
// full underneath rather than left implicit in the total.

const REPORT = window.REPORTS.find((r) => r.id === "childcare");
const NS = "http://www.w3.org/2000/svg";

function el(name, attrs) {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function gbp(n, withPence = false) {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: withPence ? 2 : 0,
    maximumFractionDigits: withPence ? 2 : 0,
  });
}

function monthLabel(key) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: "short" });
}

function fmtDate(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

const WEEK_LABEL = {
  holiday: "Holiday week",
  reduced: "School week, days off",
  school: "School week",
};

async function main() {
  const res = await fetch(`${REPORT.dataUrl}?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${REPORT.dataUrl} → ${res.status}`);
  const data = await res.json();
  const { months, totals, rates, reviews, weeks, rangeStart, rangeEnd, generatedAt } = data;

  document.getElementById("subtitle").textContent =
    `${fmtDate(rangeStart)} to ${fmtDate(rangeEnd)} — updated ${new Date(generatedAt).toLocaleString()}`;
  document.getElementById("footer").textContent =
    `${REPORT.rangeNote} Every charge belongs to a dated day, so months add up exactly and no week is split across a month boundary.`;

  document.getElementById("rates").innerHTML = `
    Costed per day. <b>School holidays</b> — kids club at
    <b>${gbp(rates.kidsClubDay)}</b> a day, ${rates.kidsClubDayNames.join("/")} only.
    <b>Term time</b> — after school club at <b>${gbp(rates.afterSchoolDay)}</b> a day,
    Monday to Thursday; no Friday club.
    <b>Bank holidays and inset days</b> — nothing, the children are at home.
    <b>Christmas and New Year weeks</b> — nothing, the kids club is shut.
    So a full holiday week is ${gbp(rates.holidayClubDaysPerWeek * rates.kidsClubDay)}
    and an ordinary school week ${gbp(rates.afterSchoolWeekdays * rates.afterSchoolDay)}.`;

  // --- stat tiles ---
  const monthlyAvg = totals.cost / months.length;
  const tiles = [
    { label: `Total, ${months.length} months`, value: gbp(totals.cost), color: "var(--series-claire)" },
    { label: "Average per month", value: gbp(monthlyAvg), color: "var(--series-claire)" },
    { label: `Kids club days · ${gbp(rates.kidsClubDay)}`, value: totals.kidsClubDays, color: "var(--series-mat)" },
    { label: `After school days · ${gbp(rates.afterSchoolDay)}`, value: totals.afterSchoolDays, color: "var(--series-claire)" },
  ];
  if (reviews.length) {
    tiles.push({ label: "Need checking", value: reviews.length, color: "#b8860b" });
  }
  const statRow = document.getElementById("stat-row");
  for (const t of tiles) {
    const tile = document.createElement("div");
    tile.className = "stat-tile";
    tile.innerHTML = `<div class="label"><span class="swatch" style="background:${t.color}"></span>${t.label}</div><div class="value">${t.value}</div>`;
    statRow.appendChild(tile);
  }

  // --- monthly cost chart ---
  const svg = document.getElementById("chart");
  const tooltip = document.getElementById("tooltip");
  const W = 860, H = 320, padL = 46, padR = 10, padT = 22, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxCost = Math.max(...months.map((m) => m.cost));
  const scaleMax = Math.ceil(maxCost / 100) * 100;
  const n = months.length, gap = 12;
  const barW = Math.min(56, (plotW - gap * (n - 1)) / n);
  const startX = padL + (plotW - (barW * n + gap * (n - 1))) / 2;

  [0, 0.25, 0.5, 0.75, 1].forEach((f) => {
    const y = padT + plotH * (1 - f);
    svg.appendChild(el("line", { x1: padL, x2: W - padR, y1: y, y2: y, stroke: "var(--gridline)", "stroke-width": 1 }));
    const label = el("text", { x: padL - 8, y: y + 4, class: "axis-label", "text-anchor": "end" });
    label.textContent = gbp(scaleMax * f);
    svg.appendChild(label);
  });

  months.forEach((m, i) => {
    const x = startX + i * (barW + gap);
    const h = (m.cost / scaleMax) * plotH;
    const y = padT + plotH - h;
    const rect = el("rect", {
      x, y, width: barW, height: h, rx: 4, ry: 4,
      fill: m.needsReview ? "#b8860b" : "var(--series-claire)",
      class: "bar-seg",
    });
    rect.addEventListener("mousemove", (ev) => {
      tooltip.textContent =
        `${monthLabel(m.month)} ${m.month.slice(0, 4)} — ${gbp(m.cost, true)}` +
        (m.schoolShutDays ? ` · ${m.schoolShutDays} day${m.schoolShutDays === 1 ? "" : "s"} school shut` : "");
      const b = document.getElementById("chart-container").getBoundingClientRect();
      tooltip.style.left = `${ev.clientX - b.left}px`;
      tooltip.style.top = `${ev.clientY - b.top}px`;
      tooltip.style.opacity = 1;
    });
    rect.addEventListener("mouseleave", () => { tooltip.style.opacity = 0; });
    svg.appendChild(rect);

    const value = el("text", { x: x + barW / 2, y: y - 6, class: "bar-value", "text-anchor": "middle" });
    value.textContent = gbp(m.cost);
    svg.appendChild(value);

    const label = el("text", { x: x + barW / 2, y: H - 8, class: "month-label", "text-anchor": "middle" });
    label.textContent = monthLabel(m.month);
    svg.appendChild(label);
  });

  // --- month table ---
  document.querySelector("#month-table tbody").innerHTML =
    months
      .map(
        (m) => `<tr>
          <td>${monthLabel(m.month)} ${m.month.slice(0, 4)}</td>
          <td>${gbp(m.cost, true)}</td>
          <td>${m.kidsClubDays || ""}</td>
          <td>${m.afterSchoolDays}</td>
          <td>${m.schoolShutDays}</td>
          <td>${m.needsReview ? '<span class="badge badge-warn">check</span>' : ""}</td>
        </tr>`
      )
      .join("") +
    `<tr style="font-weight:600">
      <td>Total</td><td>${gbp(totals.cost, true)}</td><td>${totals.kidsClubDays}</td>
      <td>${totals.afterSchoolDays}</td><td>${totals.schoolShutDays}</td><td></td>
    </tr>`;

  // --- week detail ---
  const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  document.querySelector("#week-table tbody").innerHTML = weeks
    .map((w) => {
      const chips = w.days
        .map((d, i) => {
          const cls = d.charge === rates.kidsClubDay ? "day-club"
                    : d.charge === rates.afterSchoolDay ? "day-as"
                    : "day-free";
          const amount = d.charge ? gbp(d.charge) : "—";
          const why = d.label ? `${d.label} — ${d.basis}` : d.basis;
          return `<span class="day-chip ${cls}" title="${d.date}: ${why}">
                    <span class="day-name">${DAY_NAMES[i]}</span> ${amount}</span>`;
        })
        .join("");
      const note = w.days
        .filter((d) => d.label)
        .map((d) => `${DAY_NAMES[w.days.indexOf(d)]} ${d.label}`)
        .join(" · ");
      return `<tr>
        <td>${fmtDate(w.weekStart)}</td>
        <td><span class="badge ${w.type === "holiday" ? "badge-holiday" : w.type === "reduced" ? "badge-reduced" : ""}">${WEEK_LABEL[w.type]}</span>${w.clubShut ? '<div><span class="badge badge-shut">club shut</span></div>' : ""}</td>
        <td>${gbp(w.cost)}${w.daysInRange < 5 ? `<div class="comment">${gbp(w.costInRange, true)} in range</div>` : ""}</td>
        <td class="day-cell">${chips}${note ? `<div class="comment day-note">${note}</div>` : ""}</td>
      </tr>`;
    })
    .join("");

  // --- things that might be wrong ---
  const reviewBody = document.getElementById("reviews");
  if (!reviews.length) {
    reviewBody.innerHTML = `<p class="empty">Nothing looks off — every week in this range is priced directly from a school calendar entry 🎉</p>`;
  } else {
    reviewBody.innerHTML = reviews
      .map(
        (r) => `<div class="review-item">
          <div class="review-head"><span class="badge badge-warn">check</span> Week of ${fmtDate(r.weekStart)}</div>
          <p>${r.detail}</p>
        </div>`
      )
      .join("");
  }
}

window.renderReportNav("childcare");
main().catch((err) => {
  document.getElementById("subtitle").textContent = "Failed to load data: " + err.message;
});
