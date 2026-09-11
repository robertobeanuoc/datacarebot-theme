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
 *   <script src="https://cdn.jsdelivr.net/gh/robertobeanuoc/datacarebot-theme@v1.9.0/switcher.js" defer></script>
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

      // Built with the DOM API - never string-templated into innerHTML -
      // because apps.json is fetched from a public repo (@main, not a
      // pinned tag - see above) with no allowlist on its fields. brand/
      // accent/icon go through textContent/className, which render
      // whatever bytes they contain as inert text/class-list tokens, never
      // as markup, however they're spelled - so a compromised apps.json
      // can't inject HTML/JS this way. url still needs an explicit scheme
      // check on top of that: .href isn't a markup sink, but it IS a URL
      // sink - it would happily run a "javascript:" URI on click even set
      // via the DOM API, which textContent-style escaping does nothing
      // against.
      var list = document.createElement("ul");
      list.className = "dropdown-menu dropdown-menu-end";
      apps.forEach(function (app) {
        if (!/^https:\/\//.test(app.url || "")) return;

        var icon = document.createElement("i");
        icon.className = "bi " + (app.icon || "") + " me-2";

        var link = document.createElement("a");
        link.className = "dropdown-item";
        link.href = app.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.appendChild(icon);
        link.appendChild(document.createTextNode((app.brand || "") + (app.accent || "")));

        var item = document.createElement("li");
        item.appendChild(link);
        list.appendChild(item);
      });
      if (!list.children.length) {
        mount.remove();
        return;
      }

      var toggle = document.createElement("a");
      toggle.className = "nav-link dropdown-toggle";
      toggle.href = "#";
      toggle.setAttribute("role", "button");
      toggle.setAttribute("data-bs-toggle", "dropdown");
      toggle.setAttribute("aria-expanded", "false");
      var toggleIcon = document.createElement("i");
      toggleIcon.className = "bi bi-grid-3x3-gap-fill me-1";
      toggle.appendChild(toggleIcon);
      toggle.appendChild(document.createTextNode("Apps"));

      var dropdown = document.createElement("div");
      dropdown.className = "dropdown";
      dropdown.appendChild(toggle);
      dropdown.appendChild(list);

      mount.replaceChildren(dropdown);
    })
    .catch(function () {
      mount.remove();
    });
})();
