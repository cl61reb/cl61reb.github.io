// Renders the homework sheets from the registry in sheets.js.
//   - On homework/index.html it fills #spelling-list and #maths-list.
//   - On the home page it fills #sheet-groups with one card per group.

(function () {
  var sheets = (window.SHEETS || []).slice().sort(function (a, b) {
    return b.date.localeCompare(a.date);
  });

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function fmtDate(iso) {
    return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, {
      day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
    });
  }

  function ofKind(kind) {
    return sheets.filter(function (s) { return s.kind === kind; });
  }

  // The section page: every sheet, grouped.
  ["spelling", "maths"].forEach(function (kind) {
    var list = document.getElementById(kind + "-list");
    if (!list) return;
    var items = ofKind(kind);
    list.innerHTML = items.length
      ? items.map(function (s) {
          return '<article class="post-item">' +
            '<h2><a href="' + esc(s.slug) + '.html">' + esc(s.title) + "</a></h2>" +
            '<p class="post-date">Made ' + fmtDate(s.date) + "</p>" +
            (s.summary ? '<p class="post-summary">' + esc(s.summary) + "</p>" : "") +
            "</article>";
        }).join("")
      : '<p class="empty">No sheets yet.</p>';
  });

  // The home page: a card per group with how many sheets it holds.
  var groups = document.getElementById("sheet-groups");
  if (groups) {
    var GROUPS = [
      { kind: "spelling", name: "Spelling sheets", blurb: "Look, say, cover, write, check, from the school's weekly lists." },
      { kind: "maths", name: "Maths sheets", blurb: "Sums, times tables and number work, ready to print." },
    ];
    groups.innerHTML = GROUPS.map(function (g) {
      var n = ofKind(g.kind).length;
      return '<a class="tool-link" href="homework/#' + g.kind + '">' +
        "<strong>" + g.name + "</strong>" +
        "<span>" + g.blurb + " " + n + " sheet" + (n === 1 ? "" : "s") + ".</span></a>";
    }).join("");
  }
})();
