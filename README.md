# Zen Glass

A small, local command palette for Zen Browser. Press **Ctrl + Shift + Space** to search tabs, bookmarks, and browser windows together, filtered by your real Zen spaces.

## Installation — Zen edition

This edition uses a narrow Firefox Experiment API for actual Zen workspaces. It is an unsigned, locally built extension; ordinary Firefox Add-ons signing does not support Experiment APIs.

1. Build the package:

        ./build.sh

   It writes `zen-glass-<version>.xpi` next to the sources — a plain zip with `manifest.json` at its root. The script needs a shell and either `zip` or `python3`, and there is nothing to install first. `./build.sh --lite` builds the same palette without the Experiment API, for a browser that refuses privileged add-ons; see the troubleshooting note below.
2. Open `about:config` in Zen.
3. Set `extensions.experiments.enabled` to `true`.
4. Set `xpinstall.signatures.required` to `false`.
5. Restart Zen if needed.
6. Open `about:addons`, choose the gear menu → **Install Add-on From File**, and select the `.xpi` the script wrote.
7. Press **Ctrl + Shift + Space** on a website.

These settings permit unsigned, privileged extensions. Only install packages you trust. Installation and settings changes are left to you; the build does not change your existing browser profile. No native companion application is required.

If the install is refused as unsigned, that build enforces signatures regardless of the pref — ordinary release Firefox does, and some Zen builds may. Nothing in the package can work around that; the temporary installation below is then the only route, as an add-on signed for general distribution cannot carry an Experiment API.

### “Using 'experiment_apis' requires a privileged add-on”

The browser is refusing to grant the Experiment API, so the add-on will not load at all — packaged or temporary. This is a decision the browser makes before any of this code runs, and no change to the extension can override it. Check, in order:

1. `about:config`: `extensions.experiments.enabled` is still `true` and `xpinstall.signatures.required` is still `false`. Restart Zen after setting either — the values are read when the add-on manager starts, not when you load the add-on.
2. `about:profiles`: you are running the profile those preferences were set in.
3. `about:support`: whether the version changed since it last worked. Firefox only honours `extensions.experiments.enabled` in builds that do not require signing, which is why this works in Nightly, Developer Edition, and unbranded or community builds. An update that moves the browser onto a signing-required build turns the preference into a no-op, and no preference will bring it back.

If the preference no longer has any effect, build without the Experiment API:

    ./build.sh --lite

That drops `experiment_apis` from the manifest and builds `zen-glass-<version>-lite.xpi` plus a loadable `build/lite/` folder. Any build accepts it. Tabs, bookmarks, windows, search, pin, unload, close, the actions drawer, and every keyboard shortcut still work; Zen spaces and page favicons do not, so the space pills stay hidden and rows fall back to their kind glyph. It carries its own add-on id, so it can sit beside the full build.

For a temporary development installation, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select this folder's `manifest.json` after enabling Experiment APIs. Temporary installations disappear when Zen exits, which the packaged install above avoids.

If another extension uses the shortcut, change its binding or this extension's binding in `about:addons` → gear menu → **Manage Extension Shortcuts**. On macOS the default is literal Control + Shift + Space.

## Everyday use

Type naturally. There is no need to prefix a search with “tabs” or “bookmarks.” Counts on every mode update with your query. Fuzzy matching handles missing letters, one-character spelling errors, transposed letters, and accents. Matches are ordered by **last use**, including fuzzy matches; unknown recency falls back to alphabetical order.

Digits belong to your spaces and letters to the modes, so the keys that change most often are the ones you count on your fingers:

- **Alt+1 … 9:** Filter to that space, alone
- **Alt+← / Alt+→:** Walk to the space beside it, wrapping at either end
- **Alt+0:** Back to all spaces
- **Alt+Enter:** Switch the browser to the space you are filtered to, and close
- **Alt+A:** All · **Alt+T:** Tabs · **Alt+B:** Bookmarks · **Alt+W:** Windows · **Alt+L:** Active, which is every loaded tab
- **↑ / ↓, Page Up / Page Down:** Select a result
- **Enter:** Open or switch
- **Ctrl+Enter:** Open a bookmark in the background
- **Ctrl+K:** Actions for the selected result
- **Tab / Shift+Tab:** Navigate controls
- **Escape:** Back out of actions; otherwise close

Tab rows carry their own pin/unpin, unload and close buttons. A pinned tab always shows its pin, so the icon doubles as the pinned marker; every other button appears on the row under the pointer or the keyboard cursor. A button that cannot act is left out rather than greyed out — no unload on the current or an already unloaded tab, no pin on an Essential — and the remaining buttons close the gap instead of holding an empty slot. A button acts on the whole selection when its row is part of one. The three-dot menu, right-click, and Ctrl+K still open the full actions in the drawer.

Tabs can be pinned/unpinned, unloaded, closed, and moved between windows or workspaces. Active tabs must be switched away from before unloading. A tab marked “Unloaded” remains in the browser and reloads when selected. The unload action verifies that Zen actually discarded it.

Bookmarks can be opened, opened in the background, edited, or deleted. Bookmark deletion has an explicit confirmation. `> bookmark` saves the current page.

## Spaces and containers

Spaces are not a separate mode. They are colour-coded pills below the mode row, shown for All, Tabs, and Active:

- **Click** a pill to filter tabs by that space. Click further pills to widen the filter; click a lit pill to drop it again.
- **Double-click** a pill to narrow to that space alone, whatever else was lit. **Alt+1 … 9** does the same from the keyboard, in pill order, and **Alt+← / Alt+→** steps between them.
- **Ctrl+click** a pill to switch the browser to that space; **Alt+Enter** does it for the space you are filtered to. So `Alt+3` then `Alt+Enter` lands you in the third space.
- The current space is selected when the palette opens, so you start inside the space you are already in. **All spaces** or Alt+0 clears the filter. Stacking several spaces is a mouse gesture; the keyboard always lands on exactly one. The pills are the only readout of the filter; nothing repeats it below.
- Pills keep the browser's own space order. Counts follow whatever you have typed, a ring around a pill's dot marks the space the browser is showing now, and a space's own Zen icon replaces the dot when it has one.

Each tab row tags its space in that space's colour, so a widened filter still reads at a glance. Where a space or a tab uses a Firefox container, the tag carries the container's own name and colour; a space named after its container is tagged once, not twice. Zen's shared Essentials are tagged as such and stay visible under every space filter. Colours come from the container when there is one, and are otherwise derived from the space's identity, so they do not shift between sessions.

Bookmarks and windows belong to no space, so a space filter never hides them.

## Optional commands

Start with `>` to search actions. Examples:

- `> pin` / `> unpin`
- `> unload`
- `> close`
- `> move workspace Studio`
- `> switch workspace Studio`
- `> unload other`
- `> bookmark`
- `> restore`
- `> help`

`> switch workspace` and `> move workspace` still cover every space from the keyboard. Tab commands apply to the tab selected before entering command mode. The command title shows its target. Commands run only on Enter. “Unload other tabs” operates in the current window and skips active, audible, pinned, and Essential tabs. Restore reopens the browser's most recently closed session item, which may be a window.

## Visuals and resource use

The overlay uses a translucent glass surface, bounded backdrop blur, readable text contrast, and dark/light themes following your system setting. It respects reduced motion. No screenshots of tabs, remote favicon fetching, external fonts, telemetry, or network search are used.

The interface is injected on demand and removed on close. The background page is nonpersistent. Browser events update the open panel; there is no polling loop. Bookmark data is cached until it changes. Results render in batches of 60. Local last-use storage is capped at 2,000 entries.

Typing is kept off the critical path: records are held in display order so a keystroke filters without re-sorting, each record carries its word list so the typo pass never re-splits text, one pass over the results feeds the mode counts, the pill counts and the list, redraws are coalesced to one per frame, and row elements are reused from a pool. A key or click that reads the list redraws first, so nothing acts on a stale result.

Tab recency uses the browser's `lastAccessed` value. Window/workspace recency combines observed use and tab recency. Bookmark recency starts accumulating after installation; historical browsing history is neither requested nor read. Private tab visits are not persisted. Uninstalling removes extension-owned local recency data.

## Compatibility and boundaries

Built against and integration-tested with **Zen 1.22.1b / Firefox 155.0.1 on Linux**, in a separate headless test profile. Zen's internal workspace APIs may change in later versions.

The requested shortcut opens an overlay on ordinary pages. Protected pages (for example `about:config` and restricted Mozilla pages) use a toolbar popup fallback because extension content scripts cannot run there. The toolbar icon opens the popup directly.

Container names and colours are read through the contextual identities API. Without that permission, or with containers turned off, tags fall back to generated colours and nothing else changes.

The palette searches within your current browser profile and only windows the extension is allowed to access. Workspace names can repeat across windows; space filters and actions retain both identifiers. Essentials are shared and cannot be moved to another workspace. Browser-protected or busy tabs can refuse unloading; the palette reports that instead of claiming success.

Opening a bookmark supports HTTP, HTTPS, FTP, and file URLs, subject to browser restrictions. Script bookmarks are not executed.

## Source and tests

No bundler, transpiler, or runtime dependencies: the packaged JavaScript, HTML, and CSS are the source, and `build.sh` only zips them.

On Windows and Linux, Alt+B and Alt+T also reach Firefox's Bookmarks and Tools menus when the menu bar is showing. The palette claims the keystroke first while it is open.

Run the pure search tests, including the space-filter cases, with:

    node --test tests/search.test.cjs

See `TESTING.md` for the verified native-browser and interface checks. The Experiment API is contained in `experiments/api.js`; it exposes only snapshot, favicon lookup, tab activation, workspace switching, and moving a tab into a workspace.
