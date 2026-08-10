# cl61reb.github.io

A small personal site, published with GitHub Pages from `main`.

The site is not indexed: every page carries
`<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">` and
`robots.txt` disallows everything.

## Blog

`index.html` renders the post list from `assets/posts.js`. Posts are plain
HTML files in `posts/`.

To add a post:

1. Copy `posts/_template.html` to `posts/your-slug.html` and write it.
2. Add one entry to the top of the list in `assets/posts.js`:

   ```js
   { slug: "your-slug", title: "Your title", date: "2026-08-10", summary: "One line." }
   ```

Nothing else needs editing — the home page picks it up from the registry.

## Layout

| Path | What it is |
|---|---|
| `index.html` | blog home |
| `posts/` | blog posts, plus `_template.html` |
| `assets/` | styles and the small scripts that render the pages |
| `docs/` | notes on the rest of the site |
