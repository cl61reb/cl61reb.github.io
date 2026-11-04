// Renders lecture notes from the registry in lectures.js.
//   - On lecture-notes/index.html it fills #lecture-list with every entry.
//   - On the home page it fills #lecture-card with a single link card.
(function () {
  var items = (window.LECTURES || []).slice().sort(function (a, b) {
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

  var list = document.getElementById("lecture-list");
  if (list) {
    list.innerHTML = items.length
      ? items.map(function (n) {
          return '<article class="post-item">' +
            '<h2><a href="' + esc(n.slug) + '.html">' + esc(n.title) + "</a></h2>" +
            '<p class="post-date">' + fmtDate(n.date) + "</p>" +
            (n.summary ? '<p class="post-summary">' + esc(n.summary) + "</p>" : "") +
            "</article>";
        }).join("")
      : '<p class="empty">No lecture notes yet.</p>';
  }

  var card = document.getElementById("lecture-card");
  if (card && items.length) {
    card.innerHTML = '<a class="tool-link" href="lecture-notes/">' +
      "<strong>" + esc(items[0].title) + "</strong>" +
      "<span>" + (items[0].summary ? esc(items[0].summary) + " " : "") +
      (items.length > 1 ? "+ " + (items.length - 1) + " more." : "") + "</span></a>";
  }
})();
