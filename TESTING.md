# Verification

Tested September 17, 2026 against locally installed Zen 1.22.1b (Firefox 155.0.1), using an isolated headless profile. The user's regular browser profile was not modified.

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
- Workspace-scoped tab search and clearing its scope.
- Keyboard action-menu navigation and the selected-tab pin request.
- Optional command search.
- Empty-result state.

Dark and light screenshots were inspected. The provided preview uses illustrative fixture data; it is rendered by the same HTML, CSS, and JavaScript as the extension.

## Search tests

Eight Node tests cover fuzzy subsequences, transposition errors, accent normalization, multi-token matching, workspace/window identity, blank queries, no matches, and an 11,000-record collection. A local run filtered and ordered the 11,000-record exact-match query in approximately 10 ms. This is a search-function measurement, not a cold-open, full-browser latency, or memory benchmark.

## Remaining platform coverage

Live user-profile installation, OS-level keyboard interception, protected-page popup fallback, private-browsing opt-in, cross-window tab moves, and operation on macOS/Windows were not exercised end-to-end. No fixed RAM or CPU budget is claimed. Future Zen versions can change the private workspace APIs.
