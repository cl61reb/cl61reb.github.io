// Shrinks an A4 homework sheet to fit the screen width. Printing ignores
// this (sheets.css resets the zoom), so paper copies are always full size.
(function () {
  var scale = document.querySelector(".sheet-scale");
  if (!scale) return;
  var PAPER = 794;
  function fit() {
    var room = document.documentElement.clientWidth - 32;
    scale.style.zoom = room < PAPER ? String(room / PAPER) : "";
  }
  fit();
  window.addEventListener("resize", fit);
})();
