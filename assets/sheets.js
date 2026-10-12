// The homework sheets list. This is the only place that knows what sheets
// exist: homework/index.html and the home page are both built from it.
//
// TO ADD A SHEET:
//   1. Write homework/<slug>.html. Copy an existing sheet of the same kind;
//      a one page sheet is a fixed 794 x 1122 px "paper" so it prints on A4.
//   2. Add an entry here, newest first.
//
// `kind` is "spelling" or "maths" and decides which group it is listed in.
// `date` is the day the sheet was made (YYYY-MM-DD).

window.SHEETS = [
  {
    slug: "year1-spellings-all-of-one",
    kind: "spelling",
    title: "Year 1 spellings: all, of, one",
    date: "2026-10-11",
    summary: "all, of, one, here, popcorn, proud, toy, spray. Look and say, trace, write, cover and write, check.",
  },
  {
    slug: "year3-spellings-wb-05-10-26",
    kind: "spelling",
    title: "Year 3 spellings, week beginning 05.10.26",
    date: "2026-10-11",
    summary: "Words ending in ment, with a box to find the root word hiding inside each one.",
  },
  {
    slug: "maths-adding-and-subtracting",
    kind: "maths",
    title: "Maths: adding and subtracting",
    date: "2026-10-11",
    summary: "Sixteen sums in two columns, adding and taking away ones, then tens.",
  },
  {
    slug: "words-ending-in-ment-practice",
    kind: "spelling",
    title: "Spelling Practice: Words Ending in ment",
    date: "2026-10-05",
    summary: "A longer practice pack: root words, missing letters, unscramble, fill the gap, spot the spelling, plus answers for grown ups.",
  },
  {
    slug: "year3-spellings-wb-28-09-26",
    kind: "spelling",
    title: "Year 3 spellings, week beginning 28.09.26",
    date: "2026-10-04",
    summary: "October, friendship, everyone, everybody, something, behind, anywhere, with a compound words activity.",
  },
  {
    slug: "year1-spellings-feel-food",
    kind: "spelling",
    title: "Year 1 spellings: feel, food, sort",
    date: "2026-10-04",
    summary: "feel, food, sort, down, go, my, into, out. Look and say, trace, write, cover and write, check.",
  },
  {
    slug: "two-times-table",
    kind: "maths",
    title: "2 times table practice",
    date: "2026-10-04",
    summary: "Count in 2s, the table in order, a mixed up round and two story problems.",
  },
  {
    slug: "comparing-and-ordering-numbers",
    kind: "maths",
    title: "Comparing and ordering numbers",
    date: "2026-10-04",
    summary: "Write <, > or = between pairs of numbers, then put rows of numbers in order.",
  },
  {
    slug: "homework-25-09-26",
    kind: "maths",
    title: "Homework 25.09.26",
    date: "2026-10-04",
    summary: "Adding and taking away 1, 10 and 100, plus a challenge round.",
  },
];
