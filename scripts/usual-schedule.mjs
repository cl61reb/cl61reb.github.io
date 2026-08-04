// The regular custody rotation, independent of any calendar entries.
//
// Each week splits into three blocks, and the two parents swap roles every
// week, so the pattern repeats on a 14-day cycle:
//
//   Fri + Sat        -> parent A   (2 nights)
//   Sun + Mon + Tue  -> parent B   (3 nights)
//   Wed + Thu        -> parent A   (2 nights)
//
// So in any given week parent A has 4 nights (Fri, Sat, Wed, Thu) and
// parent B has 3 (Sun, Mon, Tue); the next week they swap, giving 7 nights
// each per fortnight. Read as a run of consecutive blocks the cycle is
// 3-2-2-3-2-2 - the "3-2-2" schedule.
//
// Note the 3-night block is Sun-Mon-Tue, NOT Fri-Sat-Sun: on a weekend the
// kids change hands on the Sunday, so Sunday night belongs to the parent
// who has Mon+Tue, not to the parent who had Fri+Sat.
//
// ANCHOR: for the week beginning Friday 2026-01-02, Fri+Sat is Mat's.
// Verified against the schedule spreadsheet across Jan-Jul 2026: 182/212
// days match, and every one of the 30 that don't lines up with a logged
// exception (half term, "Mat away", "Claire away", Efteling, an explicit
// "swap") rather than a flaw in the pattern.

const ANCHOR_FRIDAY = new Date("2026-01-02T00:00:00Z");
const ANCHOR_FRI_SAT_OWNER = "parent2";

export function usualOwner(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const offsetFromFriday = (dow - 5 + 7) % 7; // Fri=0,Sat=1,Sun=2,Mon=3,Tue=4,Wed=5,Thu=6
  const weekStartFriday = new Date(d.getTime() - offsetFromFriday * 86400000);
  const weeksSinceAnchor = Math.round((weekStartFriday - ANCHOR_FRIDAY) / (7 * 86400000));
  const isAnchorParity = ((weeksSinceAnchor % 2) + 2) % 2 === 0;
  const friSatOwner = isAnchorParity ? ANCHOR_FRI_SAT_OWNER : otherParent(ANCHOR_FRI_SAT_OWNER);
  const isSunMonTue = offsetFromFriday >= 2 && offsetFromFriday <= 4;
  return isSunMonTue ? otherParent(friSatOwner) : friSatOwner;
}

function otherParent(owner) {
  return owner === "parent2" ? "claire" : "parent2";
}
