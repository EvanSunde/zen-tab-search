/* A deliberately narrow bridge to Zen 1.22's workspace implementation. */
var { ExtensionCommon } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs");
this.zenGlass = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const ext = context.extension;
    const nativeTab = id => ext.tabManager.get(id).nativeTab;
    const owner = tab => tab.ownerGlobal || tab.documentGlobal;
    function space(win, id) {
      if (!win.gZenWorkspaces?.getWorkspaces().some(w => w.uuid === id)) throw new Error("This workspace no longer exists.");
      return win.gZenWorkspaces;
    }
    return { zenGlass: {
      async snapshot() {
        const tabs = [], workspaces = [], windows = [];
        let supported = false;
        for (const win of Services.wm.getEnumerator("navigator:browser")) {
          if (!ext.canAccessWindow(win) || !win.gBrowser) continue;
          const manager = win.gZenWorkspaces;
          const windowId = ext.windowManager.getWrapper(win).id;
          windows.push({id:windowId,focused:Services.focus.activeWindow===win});
          const spaces = manager?.getWorkspaces?.() || [];
          supported ||= !!manager;
          for (const w of spaces) workspaces.push({id:w.uuid, name:w.name || "Workspace", windowId, active:manager.activeWorkspace === w.uuid});
          const nativeTabs = manager?.allStoredTabs || win.gBrowser.tabs;
          for (const t of nativeTabs) {
            if (t.closing || t.hasAttribute("zen-empty-tab")) continue;
            // Avoid convert(): it also reads frame loaders, sharing state and other
            // expensive fields the palette never displays. These getters do not load tabs.
            tabs.push({id:ext.tabManager.getWrapper(t).id,windowId,
              title:t.label || '',url:t.linkedBrowser?.currentURI?.spec || '',
              favIconUrl:win.gBrowser.getIcon(t) || '',active:!!t.selected,pinned:!!t.pinned,
              discarded:!t.linkedPanel,audible:!!t.soundPlaying,
              lastAccessed:t.lastAccessed || 0,status:t.hasAttribute('busy')?'loading':'complete',
              workspaceId:t.getAttribute('zen-workspace-id') || '',essential:t.hasAttribute('zen-essential')});
          }
        }
        return {tabs,workspaces,windows,supported};
      },
      async favicons(urls) {
        const {PlacesUtils}=ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
        return await Promise.all(urls.slice(0,64).map(async url=>{
          try {const icon=await PlacesUtils.favicons.getFaviconForPage(Services.io.newURI(url),32);return {url,data:icon?.dataURI?.spec || ''};}
          catch {return {url,data:''};}
        }));
      },
      async activate(id) {
        const tab = nativeTab(id), win = owner(tab), idSpace = tab.getAttribute("zen-workspace-id");
        if (idSpace && !tab.hasAttribute("zen-essential") && win.gZenWorkspaces?.activeWorkspace !== idSpace) {
          await space(win,idSpace).changeWorkspaceWithID(idSpace);
        }
        win.gBrowser.selectedTab = tab;
        win.focus();
      },
      async switchWorkspace(windowId, workspaceId) {
        const win = ext.windowManager.get(windowId).window;
        await space(win,workspaceId).changeWorkspaceWithID(workspaceId);
        win.focus();
      },
      async moveToWorkspace(id, workspaceId) {
        const tab = nativeTab(id), win = owner(tab);
        if (tab.hasAttribute("zen-essential")) throw new Error("Essentials are shared across workspaces.");
        await space(win,workspaceId).moveTabToWorkspace(tab,workspaceId);
      }
    }};
  }
};
