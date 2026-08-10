// Renders the blog home page from the post registry in posts.js.

function fmtDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

const posts = [...(window.POSTS || [])].sort((a, b) => b.date.localeCompare(a.date));
const list = document.getElementById("posts");

if (!posts.length) {
  list.innerHTML = `<p class="empty">No posts yet.</p>`;
} else {
  list.innerHTML = posts
    .map(
      (p) => `<article class="post-item">
        <h2><a href="posts/${p.slug}.html">${p.title}</a></h2>
        <p class="post-date">${fmtDate(p.date)}</p>
        ${p.summary ? `<p class="post-summary">${p.summary}</p>` : ""}
      </article>`
    )
    .join("");
}
