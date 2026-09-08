/*
 * Cross-app navigation switcher for the Bootstrap/Jinja apps (Streamlit apps
 * render their own equivalent in Python - see README.md's "Usage
 * (Streamlit)" section, since injecting Bootstrap's dropdown JS into
 * Streamlit's DOM has the same fragility as the CSS injection it already
 * works around elsewhere).
 *
 * Usage: give the navbar a mount point and tell it which app it's running
 * in and what groups the logged-in user has (both server-rendered, since
 * this script has no way to know either on its own):
 *
 *   <li class="nav-item" id="app-switcher" data-current-app="chat"></li>
 *   <script>window.__USER_GROUPS__ = {{ session.user.groups | tojson }};</script>
 *   <script src="https://cdn.jsdelivr.net/gh/robertobeanuoc/datacarebot-theme@v1.3.0/switcher.js" defer></script>
 *
 * Needs Bootstrap 5's JS bundle already on the page for the dropdown to
 * open (every app in this family already loads it for the navbar collapse
 * behavior, except datacarebot-chat's chat_agent/index.html, which
 * doesn't use any other Bootstrap JS component yet - add the bundle there
 * too, not a second copy of dropdown-only JS).
 *
 * Renders nothing (removes the mount point) if the user has none of the
 * other apps' groups, rather than showing an empty "Apps" menu.
 */
(function () {
  // Pinned to @main, not a version tag like this script itself - apps.json is pure data
  // (URLs/names/groups), so a change to it doesn't need a tag bump + re-pin in every app to go
  // live. See README.md's "Releasing an apps.json change".
  var APPS_URL = "https://cdn.jsdelivr.net/gh/robertobeanuoc/datacarebot-theme@main/apps.json";

  var mount = document.getElementById("app-switcher");
  if (!mount) return;

  var currentAppId = mount.dataset.currentApp || "";
  var userGroups = window.__USER_GROUPS__ || [];

  // no-store: jsDelivr serves apps.json with Cache-Control: max-age=604800
  // (7 days) even on the @main pin - without this, a browser that already
  // fetched it once keeps using that copy for a week regardless of how
  // often the file itself changes, silently showing stale app names/URLs
  // (caught live: a browser kept showing pre-rename app names and LAN IPs
  // for apps already moved behind the Cloudflare tunnel). This only
  // bypasses the BROWSER's cache for this one small fetch - jsDelivr's own
  // edge cache (which a repo push/purge does invalidate) still applies.
  fetch(APPS_URL, { cache: "no-store" })
    .then(function (resp) { return resp.json(); })
    .then(function (data) {
      var apps = (data.apps || []).filter(function (app) {
        return app.id !== currentAppId && userGroups.indexOf(app.authentik_group) !== -1;
      });
      if (apps.length === 0) {
        mount.remove();
        return;
      }

      var items = apps
        .map(function (app) {
          return (
            '<li><a class="dropdown-item" href="' + app.url + '" target="_blank" rel="noopener noreferrer">' +
            '<i class="bi ' + app.icon + ' me-2"></i>' + app.brand + app.accent +
            "</a></li>"
          );
        })
        .join("");

      mount.innerHTML =
        '<div class="dropdown">' +
        '<a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">' +
        '<i class="bi bi-grid-3x3-gap-fill me-1"></i>Apps' +
        "</a>" +
        '<ul class="dropdown-menu dropdown-menu-end">' + items + "</ul>" +
        "</div>";
    })
    .catch(function () {
      mount.remove();
    });
})();
