// Sends anyone who arrives at a /family/ page without the access parameter
// back to the blog home.
//
//   https://cl61reb.github.io/family/?k=xM5sUFAbWY0m
//
// Once the parameter has been seen it is remembered for the rest of the
// browser session, so links between the report pages work without repeating
// it. Closing the tab clears that.
//
// THIS IS A SPEED BUMP, NOT A LOCK. It stops someone who was casually sent a
// bare link; it stops nothing else:
//
//   - the check is JavaScript running in the visitor's own browser, so the
//     page has already been downloaded in full before it fires. Turning
//     JavaScript off skips it entirely;
//   - curl, wget and any scraper ignore it — they never run the script;
//   - the token is committed to a PUBLIC repository, so it is readable at
//     github.com/cl61reb/cl61reb.github.io/blob/main/assets/gate.js;
//   - the JSON under /data/ is served directly and is not gated at all.
//
// Anything that actually needs to be private needs a host that checks
// credentials before serving the bytes.

(function () {
  var PARAM = "k";
  var TOKEN = "xM5sUFAbWY0m";
  var FLAG = "family-access";

  try {
    var supplied = new URLSearchParams(window.location.search).get(PARAM);
    if (supplied === TOKEN) {
      sessionStorage.setItem(FLAG, TOKEN);
      return;
    }
    if (sessionStorage.getItem(FLAG) === TOKEN) return;
  } catch (e) {
    // sessionStorage can throw in private modes; fall through to redirect.
  }

  // replace() so the back button doesn't bounce between here and the blog.
  window.location.replace("../index.html");
})();
