# Verification

Tested September 17, 2026 against locally installed Zen 1.22.1b (Firefox 155.0.1), using an isolated headless profile. The user's regular browser profile was not modified. The space pills, colour-coded tags, and inline row actions added later that day were verified separately; see the last section.

## Real Zen integration

Passed against actual browser APIs:

- Enumerating tabs, bookmarks, windows, and named Zen workspaces.
- Pinning and unpinning a tab.
- Unloading an inactive tab, verified by `discarded === true`.
- Activating an unloaded tab.
- Rejecting an attempt to unload the active tab.
- Creating, editing, enumerating, and deleting a test bookmark.
- Moving a tab to another real Zen workspace.
- Activating that tab across workspaces and verifying the active workspace ID.
- Explicit workspace switching.
- Injecting the on-demand overlay into a real page.
- Loading the iframe's actual extension data through authenticated runtime messaging.
- Overlay rendering and authenticated loading on a page with restrictive `default-src`, `frame-src`, and `style-src` policies.
- Rejecting a forged overlay token.
- Toggling the overlay closed and removing its state.
- Closing a tab and confirming its removal from the snapshot.

## Interface behavior

Passed in the Zen renderer with deterministic fixture data:

- Initial mixed-category results.
- Fuzzy matching across tabs and bookmarks.
- Strict descending last-use ordering.
- Matching category counts.
- Alt-number mode switching.
- Workspace-scoped tab search and clearing its scope, as the mode then worked; superseded by the space pills below.
- Keyboard action-menu navigation and the selected-tab pin request.
- Optional command search.
- Empty-result state.

Dark and light screenshots were inspected. The provided preview uses illustrative fixture data; it is rendered by the same HTML, CSS, and JavaScript as the extension.

## Search tests

Fifteen Node tests cover fuzzy subsequences, transposition errors, accent normalization, multi-token matching, workspace/window identity, single- and multi-space filters, shared Essentials, an empty filter, blank queries, no matches, the pre-split word list, the pre-sorted fast path, and an 11,000-record collection. A local run filtered and ordered the 11,000-record exact-match query in approximately 10 ms. This is a search-function measurement, not a cold-open, full-browser latency, or memory benchmark.

## Space pills, tags, and inline row actions

Added September 17, 2026. Exercised in headless Chromium against the real `panel.html`, `panel.css`, `panel.js`, and `search.js`, with the extension messaging layer replaced by fixture data. Not re-verified against a live Zen profile; the checks below are interface behaviour only.

- Opening with the current space pre-selected, from the focused window's active workspace.
- Filtering by one space, stacking a second pill, dropping a pill, and clearing through **All spaces** and Alt+0.
- Double-clicking a pill narrowing to that space alone, both from one lit pill and from two.
- Pills holding the browser's workspace order while recency reorders the results.
- Alt+Shift+1 … 9 toggling pills, and Alt+1 … 5 reaching the five remaining modes.
- Ctrl+click on a pill issuing `switchWorkspace` for the right window and workspace, then dismissing.
- Pill counts, mode counts, and the result list following both the query and the filter.
- Pills shown for All, Tabs, and Active; hidden for Bookmarks and Windows, and hidden entirely when workspaces are unavailable.
- Space rows no longer appearing in All, while bookmarks and windows stay visible under a space filter.
- Space, container, and Essential tags rendering in their colours in dark and light schemes, with no duplicate tag when a space and its container share a name.
- Inline pin, unload, and close applying to one tab, and to a whole multi-selection with matching labels.
- A pinned tab showing its pin with nothing hovered, every other button appearing only under the pointer or the cursor, and the row's buttons shifting to close the gap left by one that cannot act (measured as the action strip's width: 0, one button, or four).
- No unload button on the current or an already unloaded tab, no pin on an Essential, and no tab buttons at all on bookmarks, windows, or commands.
- Pressing Enter immediately after a keystroke acting on the freshly typed query, not the previous frame's list.
- Side drawer, command mode, and the help panel unaffected, with no console errors in any pass.

### Typing cost

Measured in the same harness with 900 tabs, 4,000 bookmarks, and 6 spaces, under 6x CPU throttling, comparing against the build before the space work:

- Typing nine characters: 811 ms before, 392 ms now.
- Nine backspaces: 670 ms before, 423 ms now.
- Median input handler: 28 ms before, 0.8 ms now; median frame including layout and paint: 36 ms before, 26 ms now.
- A query matching nothing, the worst case for the typo pass: 72 ms per frame before, 28 ms now.

These are throttled headless Chromium numbers on fixture data, not Zen measurements, and they compare relative cost rather than claiming absolute latency.

A live Zen run is still needed for real container identities, real workspace icons, and Ctrl+click actually switching the browser.

## Remaining platform coverage

Live user-profile installation, OS-level keyboard interception, protected-page popup fallback, private-browsing opt-in, cross-window tab moves, and operation on macOS/Windows were not exercised end-to-end. No fixed RAM or CPU budget is claimed. Future Zen versions can change the private workspace APIs.
