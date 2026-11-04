// The lecture notes list. This is the only place that knows what notes
// exist: lecture-notes/index.html and the home page are both built from it.
//
// TO ADD LECTURE NOTES:
//   1. Write lecture-notes/<slug>.html. Copy an existing one, or start from
//      the shape in posts/_template.html (adjust the ../ paths as there).
//   2. Add an entry here, newest first.
//
// `date` is ISO (YYYY-MM-DD).

window.LECTURES = [
  {
    slug: "it-consultancy-blocks-one-and-two",
    title: "IT Consultancy – Lecture Notes, Blocks One and Two",
    date: "2026-11-04",
    summary: "Management consultancy applied to IT: the consulting lifecycle, consultancy research, IT–business alignment, outsourcing and enterprise systems, plus assignment guidance.",
  },
];
