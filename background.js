// ZenSearch — Background Service

browser.commands.onCommand.addListener(async (command) => {
  if (command !== "open-zensearch") return;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) browser.tabs.sendMessage(tab.id, { type: "TOGGLE_SEARCH" }).catch(() => {});
});

browser.action.onClicked.addListener((tab) => {
  if (tab?.id) browser.tabs.sendMessage(tab.id, { type: "TOGGLE_SEARCH" }).catch(() => {});
});

browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch((err) => sendResponse({ error: err.message }));
  return true;
});

async function handleMessage(msg) {
  switch (msg.type) {

    case "GET_TABS": {
      const tabs = await browser.tabs.query({});
      // Build tab group map — graceful fallback if tabGroups API absent
      let groupMap = {};
      try {
        if (typeof browser.tabGroups !== "undefined") {
          const groups = await browser.tabGroups.query({});
          for (const g of groups) {
            groupMap[g.id] = { title: g.title || "", color: g.color || "" };
          }
        }
      } catch (_) {}
      return tabs.map((t) => ({
        id: t.id,
        windowId: t.windowId,
        title: t.title || "",
        url: t.url || "",
        favIconUrl: t.favIconUrl || "",
        audible: t.audible || false,
        pinned: t.pinned || false,
        discarded: t.discarded || false,
        active: t.active || false,
        groupId: t.groupId ?? -1,
        groupTitle: (t.groupId != null && t.groupId !== -1) ? (groupMap[t.groupId]?.title || "") : "",
        groupColor: (t.groupId != null && t.groupId !== -1) ? (groupMap[t.groupId]?.color || "") : "",
      }));
    }

    // Loaded tabs only — all tabs that are not discarded/suspended
    case "GET_ACTIVE": {
      const tabs = await browser.tabs.query({ discarded: false });
        // const tabs = await browser.tabs.query({ active: true });  //  Active tabs only — one per window
      let groupMap = {};
      try {
        if (typeof browser.tabGroups !== "undefined") {
          const groups = await browser.tabGroups.query({});
          for (const g of groups) groupMap[g.id] = { title: g.title || "", color: g.color || "" };
        }
      } catch (_) {}
      return tabs.map((t) => ({
        id: t.id,
        windowId: t.windowId,
        title: t.title || "",
        url: t.url || "",
        favIconUrl: t.favIconUrl || "",
        audible: t.audible || false,
        pinned: t.pinned || false,
        discarded: t.discarded || false,
        active: true,
        groupId: t.groupId ?? -1,
        groupTitle: (t.groupId != null && t.groupId !== -1) ? (groupMap[t.groupId]?.title || "") : "",
        groupColor: (t.groupId != null && t.groupId !== -1) ? (groupMap[t.groupId]?.color || "") : "",
      }));
    }

    case "GET_BOOKMARKS": {
      const tree = await browser.bookmarks.getTree();
      const list = [];
      function walk(nodes, path) {
        for (const n of nodes) {
          if (n.url) list.push({ id: n.id, title: n.title || "", url: n.url, folder: path });
          else if (n.children) walk(n.children, n.title ? (path ? path + " › " + n.title : n.title) : path);
        }
      }
      walk(tree, "");
      return list;
    }

    case "GET_HISTORY": {
      const items = await browser.history.search({
        text: msg.query || "",
        maxResults: 25,
        startTime: Date.now() - 30 * 24 * 60 * 60 * 1000,
      });
      return items.map((h) => ({
        title: h.title || "",
        url: h.url || "",
        visitCount: h.visitCount || 0,
        lastVisitTime: h.lastVisitTime || 0,
      }));
    }

    case "GET_WINDOWS": {
      const wins = await browser.windows.getAll({ populate: true });
      return wins.map((w) => ({
        id: w.id,
        focused: w.focused,
        tabCount: w.tabs?.length || 0,
        activeTabTitle: w.tabs?.find((t) => t.active)?.title || "Window " + w.id,
        favIconUrl: w.tabs?.find((t) => t.active)?.favIconUrl || "",
      }));
    }

    case "SWITCH_TAB":
      await browser.tabs.update(msg.tabId, { active: true });
      await browser.windows.update(msg.windowId, { focused: true });
      return { ok: true };

    case "CLOSE_TAB":
      await browser.tabs.remove(msg.tabId);
      return { ok: true };

    case "PIN_TAB":
      await browser.tabs.update(msg.tabId, { pinned: msg.pinned });
      return { ok: true };

    case "DISCARD_TAB":
      await browser.tabs.discard(msg.tabId);
      return { ok: true };

    case "UNLOAD_ALL": {
      const allTabs = await browser.tabs.query({ currentWindow: true });
      let count = 0;
      for (const tab of allTabs) {
        if (!tab.active && !tab.discarded) {
          try { await browser.tabs.discard(tab.id); count++; } catch (_) {}
        }
      }
      return { count };
    }

    case "RESTORE_TAB":
      await browser.sessions.restore(msg.sessionId);
      return { ok: true };

    case "FOCUS_WINDOW":
      await browser.windows.update(msg.windowId, { focused: true });
      return { ok: true };

    default:
      return { error: "Unknown message: " + msg.type };
  }
}
