// The regular custody rotation, independent of any calendar entries: a
// repeating 14-day (2-week) cycle where the weekend (Fri-Sat-Sun, 3 nights)
// alternates between parents each week, and within a week the parent who
// does NOT have the weekend gets Mon-Tue instead (2 nights) while the
// weekend-owner also keeps Wed-Thu (2 nights):
//
//   Week A: Mon-Tue = other parent (2) | Wed-Thu = weekend owner (2) | Fri-Sun = weekend owner (3)
//   Week B: same shape, weekend owner flips
//
// i.e. each parent's block sizes over a 2-week cycle read 3-2-2-3-2-2,
// split 7/7 - a "3-2-2" schedule. Verified against the joint calendar for
// Jan-Feb 2026 (100% match before the first logged exception - a half-term
// trip) - see the exception report for where real life has since diverged
// from this baseline.
//
// ANCHOR: 2026-01-02 (a Friday) is a confirmed "parent2" (Mat) weekend.

const ANCHOR_FRIDAY = new Date("2026-01-02T00:00:00Z");
const ANCHOR_WEEKEND_OWNER = "parent2";

export function usualOwner(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const offsetFromFriday = (dow - 5 + 7) % 7; // Fri=0,Sat=1,Sun=2,Mon=3,Tue=4,Wed=5,Thu=6
  const weekStartFriday = new Date(d.getTime() - offsetFromFriday * 86400000);
  const weeksSinceAnchor = Math.round((weekStartFriday - ANCHOR_FRIDAY) / (7 * 86400000));
  const isAnchorParity = ((weeksSinceAnchor % 2) + 2) % 2 === 0;
  const weekendOwner = isAnchorParity ? ANCHOR_WEEKEND_OWNER : otherParent(ANCHOR_WEEKEND_OWNER);
  const isMonOrTue = offsetFromFriday === 3 || offsetFromFriday === 4;
  return isMonOrTue ? otherParent(weekendOwner) : weekendOwner;
}

function otherParent(owner) {
  return owner === "parent2" ? "claire" : "parent2";
}
