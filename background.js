function enableSidePanelOnClick() {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
}

const openedWindows = new Set();

function openSidePanel(windowId) {
  if (!chrome.sidePanel || !chrome.sidePanel.open) {
    return;
  }
  chrome.sidePanel.open({ windowId }, () => {
    if (chrome.runtime.lastError) {
      // Best-effort: some Chrome builds require a user gesture.
    }
  });
}

function openSidePanelForWindow(windowId) {
  if (windowId == null || openedWindows.has(windowId)) {
    return;
  }
  openedWindows.add(windowId);
  openSidePanel(windowId);
}

function openSidePanelForAllWindows() {
  chrome.tabs.query({}, (tabs) => {
    const seen = new Set();
    for (const tab of tabs) {
      if (tab.windowId == null || seen.has(tab.windowId)) {
        continue;
      }
      seen.add(tab.windowId);
      openSidePanelForWindow(tab.windowId);
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  enableSidePanelOnClick();
  openSidePanelForAllWindows();
});

chrome.runtime.onStartup.addListener(() => {
  enableSidePanelOnClick();
  openSidePanelForAllWindows();
});

chrome.tabs.onCreated.addListener((tab) => {
  openSidePanelForWindow(tab.windowId);
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (removeInfo.isWindowClosing) {
    openedWindows.delete(removeInfo.windowId);
  }
});
