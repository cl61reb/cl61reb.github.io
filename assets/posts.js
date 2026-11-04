// The blog's post list. This is the only place that knows what posts exist —
// the home page is generated from it.
//
// TO ADD A POST:
//   1. Write posts/<slug>.html. Copy an existing post, or start from the
//      shape in posts/_template.html.
//   2. Add an entry here, newest first.
//
// `date` is ISO (YYYY-MM-DD) so it sorts and formats predictably.
// `summary` is what shows on the home page — one or two sentences.

window.POSTS = [
  {
    slug: "sql-server-on-a-mac",
    title: "SQL Server on a Mac: Setup Guide",
    date: "2026-11-04",
    summary: "Run a free, full featured SQL Server on your Mac in about 20 minutes using Docker and VS Code, with a first test database and a troubleshooting table.",
  },
  {
    slug: "beginners-guide-to-investing",
    title: "A Beginner's Guide to Investing",
    date: "2026-10-10",
    summary: "ISAs, pensions and trading accounts; shares, bonds and funds; risk levels, where in the world your money goes, Acc vs Inc, and what the charges really cost.",
  },
  // {
  //   slug: "first-post",
  //   title: "A title",
  //   date: "2026-08-10",
  //   summary: "One or two sentences describing the post, shown on the home page.",
  // },
];
