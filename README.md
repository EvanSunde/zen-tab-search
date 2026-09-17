# Zen Glass

A small, local command palette for Zen Browser. Press **Ctrl + Shift + Space** to search tabs, bookmarks, browser windows, and real Zen workspaces together.

## Installation — Zen edition

This edition uses a narrow Firefox Experiment API for actual Zen workspaces. It is an unsigned, locally built extension; ordinary Firefox Add-ons signing does not support Experiment APIs.

1. Open `about:config` in Zen.
2. Set `extensions.experiments.enabled` to `true`.
3. Set `xpinstall.signatures.required` to `false`.
4. Restart Zen if needed.
5. Open `about:addons`, choose the gear menu → **Install Add-on From File**, and select `zen-glass-1.0.0.xpi`.
6. Press **Ctrl + Shift + Space** on a website.

These settings permit unsigned, privileged extensions. Only install packages you trust. Installation and settings changes are left to you; the build does not change your existing browser profile. No native companion application is required.

For a temporary development installation, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select this folder's `manifest.json` after enabling Experiment APIs. Temporary installations disappear when Zen exits.

If another extension uses the shortcut, change its binding or this extension's binding in `about:addons` → gear menu → **Manage Extension Shortcuts**. On macOS the default is literal Control + Shift + Space.

## Everyday use

Type naturally. There is no need to prefix a search with “tabs” or “bookmarks.” Counts on every mode update with your query. Fuzzy matching handles missing letters, one-character spelling errors, transposed letters, and accents. Matches are ordered by **last use**, including fuzzy matches; unknown recency falls back to alphabetical order.

- **Alt+1:** All
- **Alt+2:** Tabs
- **Alt+3:** Bookmarks
- **Alt+4:** Windows
- **Alt+5:** Spaces
- **Alt+6:** Active tabs (selected tabs in each window, distinct from loaded tabs)
- **↑ / ↓, Page Up / Page Down:** Select a result
- **Enter:** Open or switch; choosing a workspace searches only its tabs
- **Ctrl+Enter:** Open a bookmark in the background
- **Ctrl+K:** Actions for the selected result
- **Tab / Shift+Tab:** Navigate controls
- **Escape:** Back out of actions or workspace scope; otherwise close

The three-dot menu provides the same actions as the keyboard menu. Workspace actions include switching directly to that workspace. Shared Essentials appear in scoped workspace searches.

Tabs can be pinned/unpinned, unloaded, closed, and moved between windows or workspaces. Active tabs must be switched away from before unloading. A tab marked “Unloaded” remains in the browser and reloads when selected. The unload action verifies that Zen actually discarded it.

Bookmarks can be opened, opened in the background, edited, or deleted. Bookmark deletion has an explicit confirmation. `> bookmark` saves the current page.

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

Tab commands apply to the tab selected before entering command mode. The command title shows its target. Commands run only on Enter. “Unload other tabs” operates in the current window and skips active, audible, pinned, and Essential tabs. Restore reopens the browser's most recently closed session item, which may be a window.

## Visuals and resource use

The overlay uses a translucent glass surface, bounded backdrop blur, readable text contrast, and dark/light themes following your system setting. It respects reduced motion. No screenshots of tabs, remote favicon fetching, external fonts, telemetry, or network search are used.

The interface is injected on demand and removed on close. The background page is nonpersistent. Browser events update the open panel; there is no polling loop. Bookmark data is cached until it changes. Results render in batches of 60. Local last-use storage is capped at 2,000 entries.

Tab recency uses the browser's `lastAccessed` value. Window/workspace recency combines observed use and tab recency. Bookmark recency starts accumulating after installation; historical browsing history is neither requested nor read. Private tab visits are not persisted. Uninstalling removes extension-owned local recency data.

## Compatibility and boundaries

Built against and integration-tested with **Zen 1.22.1b / Firefox 155.0.1 on Linux**, in a separate headless test profile. Zen's internal workspace APIs may change in later versions.

The requested shortcut opens an overlay on ordinary pages. Protected pages (for example `about:config` and restricted Mozilla pages) use a toolbar popup fallback because extension content scripts cannot run there. The toolbar icon opens the popup directly.

The palette searches within your current browser profile and only windows the extension is allowed to access. Workspace names can repeat across windows; scopes and actions retain both identifiers. Essentials are shared and cannot be moved to another workspace. Browser-protected or busy tabs can refuse unloading; the palette reports that instead of claiming success.

Opening a bookmark supports HTTP, HTTPS, FTP, and file URLs, subject to browser restrictions. Script bookmarks are not executed.

## Source and tests

No build step and no runtime dependencies. The packaged JavaScript, HTML, and CSS are the source.

Run the pure search tests with:

    node --test tests/search.test.cjs

See `TESTING.md` for the verified native-browser and interface checks. The Experiment API is contained in `experiments/api.js`; it exposes only snapshot, tab activation, workspace switching, and moving a tab into a workspace.
