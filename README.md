# datacarebot-theme

Shared visual theme (design tokens, navbar, cards, tables, buttons) for
robertobeanuoc's small Flask/Jinja + Bootstrap 5 apps, so they look like one
family of apps instead of each inventing its own look.

Consumers today: `datacarebot-food`, `datacarebot-chat`,
`datacarebot-activity`, `datacarebot-cgm`.

## Usage (Flask / Jinja / any static HTML)

Load Bootstrap 5, Bootstrap Icons and Inter first, then this file on top —
same CDN (jsDelivr) pattern already used for Bootstrap itself, no build step,
no local copy to keep in sync:

```html
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/robertobeanuoc/datacarebot-theme@v1.3.0/app.css">
```

Pin a version tag (`@v1.3.0`), not `@main` — a change here shouldn't be able
to silently reflow a running app. Bump the tag when you intentionally want
consumers to pick up a change, then update the pinned version in each app.

## Usage (Streamlit)

**Navbar + app-switcher: use the `webapp-theme-streamlit` package (`python/` in this repo), not a copy-pasted snippet.** This used to be a "fetch app.css yourself, strip comments, inline it" recipe repeated in each Streamlit app - which is exactly how a fix (the app-switcher's icon) landed in one app and silently not the other, since there was no single place to fix it once for both. See `python/README.md` for install + usage; in short:

```python
import streamlit as st
from webapp_theme_streamlit import inject_shared_theme, render_app_switcher

inject_shared_theme(extra_css=MY_APP_SPECIFIC_CSS)  # e.g. stMetric/stForm rules
with st.container(key="app_navbar"):
    cols = st.columns([4, 3, 2, 1])
    with cols[0]:
        st.html(f'<span class="navbar-brand">{icon} {brand}<span class="brand-accent">{accent}</span></span>')
    with cols[1]:
        render_app_switcher(current_app_id="cgm", user_groups=user["groups"], apps_label=apps_label)
    with cols[2]:
        ...  # this app's own profile popover
    with cols[3]:
        ...  # this app's own logout button
```

`inject_shared_theme()` handles fetching `app.css` (Streamlit's `st.html()`
strips `<link>` tags, so it has to be fetched and inlined into a `<style>`
tag instead) and combining it with the navbar/switcher CSS every Streamlit
app in this family needs. Streamlit's own widgets (buttons, selects) are
themed separately, since they don't carry Bootstrap's class names — fetch
`theme.toml` and write it to `~/.streamlit/config.toml` before the
Streamlit server starts; see `datacarebot-cgm`'s or
`datacarebot-chat`'s `write_streamlit_secrets.py` for a working example
(it already runs once at container startup, before `streamlit run`, to
provision the OIDC `[auth]` secrets and TLS cert the same way).

## Cross-app navigation (`apps.json` + `switcher.js`)

`apps.json` is the one place every app's identity (name, URL, icon) and
which Authentik access group grants entry to it are listed — see
`datacarebot-identity`'s `authentik/scripts/setup_app_access_control.py`
for how those groups get created and populated. Each app reads the logged-in
user's `groups` claim from its own OIDC token (request `groups` as an extra
scope — none of `openid`/`profile`/`email`/`offline_access` surface it) and
shows only the sibling apps whose `authentik_group` is in that list.

**`apps.json` is pinned to `@main`, not a version tag** — unlike `app.css`/
`theme.toml`/`switcher.js` above. It's pure data (URLs/names/groups), not
code or styling: a bad edit only breaks a menu link, not a running app's
layout, so it doesn't need the same "review a tag bump before it goes live"
gate. This also means updating a URL here needs **no redeploy of any app** —
see "Releasing an apps.json change" below for how it actually reaches
already-running apps, and how fast.

**Bootstrap/Jinja apps:** give the navbar a mount point, then load
`switcher.js` — it fetches `apps.json` itself and renders a "Apps" dropdown,
or removes the mount point entirely if the user has access to nothing else:

```html
<li class="nav-item" id="app-switcher" data-current-app="chat"></li>
<script>window.__USER_GROUPS__ = {{ session.user.groups | tojson }};</script>
<script src="https://cdn.jsdelivr.net/gh/robertobeanuoc/datacarebot-theme@v1.3.0/switcher.js" defer></script>
```

`switcher.js` itself stays pinned to a tag (it's code); only the `apps.json`
URL *inside* `switcher.js` floats on `@main`. Needs Bootstrap 5's JS bundle
on the page already (for the dropdown itself) and `data-current-app` set to
that app's `id` in `apps.json`, so it doesn't link to itself.

**Streamlit apps:** don't load `switcher.js` — Bootstrap's real dropdown JS
bundle can't be inlined via `st.html()` either (it builds Tooltip/Popover
markup from template strings containing tag-like text, which gets the whole
script stripped the same way a tag-like CSS comment does; a plain `<svg>`
icon gets stripped outright too, confirmed by inspecting the rendered DOM).
Use `render_app_switcher()` from the `webapp-theme-streamlit` package (see
"Usage (Streamlit)" above) instead - it fetches `apps.json` (pinned to
`@main`, not a tag - see above) and renders a small hand-rolled open/close
dropdown, icon and all, the same way for every Streamlit app that calls it.

## What belongs here vs. in the app

This file only has generic, reusable pieces: color tokens, navbar, page
heading, cards, the primary button, data tables, editable-table inputs,
Select2 integration, the empty-state pattern, a search input
(`.search-input-wrap` + `.search-input`), and a disclosure/collapsible
section (`.disclosure` + `.disclosure-toggle` + `.disclosure-body` - JS
just toggles a `collapsed` class on `.disclosure`, no Bootstrap JS
needed). A feature specific to one
app (e.g. a camera capture UI, a glucose-range chart) stays in that app's
own stylesheet, loaded *after* this one, so it can still use the shared
tokens (`var(--ns-primary)`, etc.) without polluting the shared file.

## Releasing a change

```bash
git commit -am "..."
./scripts/release.sh v1.10.0
```

Tags this repo, computes the Subresource Integrity (SRI) hash for `app.css`/`switcher.js` at that tag, and opens one PR per consumer app (`datacarebot-food`/`-chat`/`-activity`) bumping both the version pin and the SRI hash together - every app that loads either file pins it with an `integrity="sha384-..."` attribute (see the security audit), so the hash has to travel with the version, not be updated separately by hand. Requires the 3 consumer repos checked out as siblings of this one; review and merge each PR yourself, then redeploy (`docker compose up -d --build`) in each app - the pin is baked into the image, a plain restart won't pick it up.

Doing it by hand instead: `git tag vX.Y.Z && git push --tags`, then in each app update the pinned `@vX.Y.Z` **and** recompute+update its `integrity="sha384-..."` (`openssl dgst -sha384 -binary <file> | openssl base64 -A`, hash the local file at that tag - not the CDN, no propagation delay to race).

## Releasing an `apps.json` change

No tag, no redeploy - just commit and push to `main`:

```bash
git commit -am "..."
git push
```

Two caches sit between that push and every app actually seeing it:

1. **jsDelivr's CDN cache** for `@main` (unlike a version tag, which is
   cached indefinitely since a tag shouldn't change) refreshes every ~12h on
   its own. To force it sooner, purge that one file:
   ```bash
   curl "https://purge.jsdelivr.net/gh/robertobeanuoc/datacarebot-theme@main/apps.json"
   ```
2. **Each Streamlit app's own `@st.cache_data(ttl=60)`** on `_fetch_apps_directory()`
   (see above) - expires on its own within a minute, nothing to purge.
   Bootstrap/Jinja apps have no server-side cache for this at all: `switcher.js`
   fetches fresh on every page load, so the jsDelivr purge alone is enough
   for those.
