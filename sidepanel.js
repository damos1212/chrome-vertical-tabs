const tabList = document.getElementById("tab-list");
const selectionBar = document.getElementById("selection-bar");
const selectionCount = document.getElementById("selection-count");
const closeSelectedButton = document.getElementById("close-selected");
const clearSelectionButton = document.getElementById("clear-selection");

const DEFAULT_THEME = "light";
const THEME_STORAGE_KEY = "theme";
const THEME_CACHE_KEY = "vt_theme";
const THEMES = new Set(["light", "dark", "catppuccin"]);

let dragState = null;
let dropTarget = { element: null, position: null };
let currentWindowId = null;
let isInitialized = false;
const selectedTabIds = new Set();
let lastSelectedTabId = null;

function normalizeTheme(theme) {
  return THEMES.has(theme) ? theme : DEFAULT_THEME;
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = normalizeTheme(theme);
}

function setCurrentWindowId(windowId) {
  if (windowId != null) {
    currentWindowId = windowId;
  }
}

function isCurrentWindow(windowId) {
  return currentWindowId == null || windowId === currentWindowId;
}

function getTabItems() {
  return Array.from(tabList.querySelectorAll(".tab-item"));
}

function getTabItem(tabId) {
  return tabList.querySelector(`[data-tab-id="${tabId}"]`);
}

function getTabIdList() {
  return getTabItems().map((item) => Number(item.dataset.tabId));
}

function updateSelectionBar() {
  const count = selectedTabIds.size;
  selectionCount.textContent = String(count);
  const show = count > 1;
  selectionBar.classList.toggle("hidden", !show);
  document.body.classList.toggle("has-selection", show);
}

function setSelected(tabId, selected) {
  const item = getTabItem(tabId);
  if (!item) {
    return;
  }
  if (selected) {
    selectedTabIds.add(tabId);
    item.classList.add("selected");
    item.setAttribute("aria-selected", "true");
  } else {
    selectedTabIds.delete(tabId);
    item.classList.remove("selected");
    item.setAttribute("aria-selected", "false");
  }
}

function clearSelection() {
  if (!selectedTabIds.size) {
    return;
  }
  Array.from(selectedTabIds).forEach((tabId) => {
    setSelected(tabId, false);
  });
  updateSelectionBar();
}

function selectRange(anchorId, targetId) {
  const ids = getTabIdList();
  const start = ids.indexOf(anchorId);
  const end = ids.indexOf(targetId);
  if (start === -1 || end === -1) {
    setSelected(targetId, true);
    return;
  }
  const [from, to] = start < end ? [start, end] : [end, start];
  clearSelection();
  for (let i = from; i <= to; i += 1) {
    setSelected(ids[i], true);
  }
}

function handleSelectionClick(event, tabId) {
  if (event.shiftKey) {
    if (lastSelectedTabId == null) {
      clearSelection();
      setSelected(tabId, true);
    } else {
      selectRange(lastSelectedTabId, tabId);
    }
    lastSelectedTabId = tabId;
    updateSelectionBar();
    return true;
  }
  if (event.ctrlKey || event.metaKey) {
    if (selectedTabIds.has(tabId)) {
      setSelected(tabId, false);
    } else {
      setSelected(tabId, true);
    }
    lastSelectedTabId = tabId;
    updateSelectionBar();
    return true;
  }
  return false;
}

function getSelectedTabIdsInOrder() {
  return getTabIdList().filter((tabId) => selectedTabIds.has(tabId));
}

function closeSelectedTabs() {
  const ids = getSelectedTabIdsInOrder();
  if (!ids.length) {
    return;
  }
  clearSelection();
  chrome.tabs.remove(ids);
}

function removeEmptyState() {
  const empty = tabList.querySelector(".empty-state");
  if (empty) {
    empty.remove();
  }
}

function showEmptyState() {
  if (tabList.querySelector(".tab-item") || tabList.querySelector(".empty-state")) {
    return;
  }
  const empty = document.createElement("li");
  empty.className = "empty-state";
  empty.textContent = "No tabs in this window.";
  tabList.appendChild(empty);
}

function setItemIndex(item, index) {
  item.style.setProperty("--index", index);
}

function updateIndexes() {
  getTabItems().forEach((item, index) => {
    setItemIndex(item, index);
  });
}

function setActiveTab(tabId) {
  const nextActive = getTabItem(tabId);
  if (!nextActive) {
    return;
  }
  const currentActive = tabList.querySelector(".tab-item.active");
  if (currentActive && currentActive !== nextActive) {
    currentActive.classList.remove("active");
    currentActive.setAttribute("aria-current", "false");
  }
  nextActive.classList.add("active");
  nextActive.setAttribute("aria-current", "true");
}

function updateBadgeContainer(item, tab) {
  const isMuted = Boolean(tab.mutedInfo && tab.mutedInfo.muted);
  const isAudible = Boolean(tab.audible);
  const wantsBadge = isMuted || isAudible;
  let actions = item.querySelector(".tab-actions");

  if (!wantsBadge) {
    if (actions) {
      actions.remove();
    }
    return;
  }

  if (!actions) {
    actions = document.createElement("div");
    actions.className = "tab-actions";
    item.appendChild(actions);
  }

  let badge = actions.querySelector(".badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "badge";
    actions.appendChild(badge);
  }

  if (isMuted) {
    badge.className = "badge badge-muted";
    badge.textContent = "M";
    badge.title = "Muted";
  } else {
    badge.className = "badge badge-audible";
    badge.textContent = "A";
    badge.title = "Playing audio";
  }
}

function updateTabItem(tab) {
  const item = getTabItem(tab.id);
  if (!item) {
    return;
  }
  const title = item.querySelector(".tab-title");
  if (title) {
    const text = tab.title || tab.url || "New Tab";
    title.textContent = text;
    title.title = text;
  }
  const favicon = item.querySelector(".favicon");
  if (favicon) {
    if (tab.favIconUrl) {
      favicon.style.backgroundImage = `url("${tab.favIconUrl}")`;
    } else {
      favicon.style.backgroundImage = "";
    }
  }
  if (tab.active) {
    setActiveTab(tab.id);
  }
  updateBadgeContainer(item, tab);
}

function getCachedTheme() {
  try {
    return localStorage.getItem(THEME_CACHE_KEY);
  } catch (error) {
    return null;
  }
}

function cacheTheme(theme) {
  try {
    localStorage.setItem(THEME_CACHE_KEY, normalizeTheme(theme));
  } catch (error) {
    // Ignore caching failures.
  }
}

function loadTheme() {
  const cachedTheme = getCachedTheme();
  applyTheme(cachedTheme || DEFAULT_THEME);
  if (!chrome.storage) {
    return;
  }
  chrome.storage.local.get({ [THEME_STORAGE_KEY]: cachedTheme || DEFAULT_THEME }, (result) => {
    const theme = normalizeTheme(result[THEME_STORAGE_KEY]);
    applyTheme(theme);
    cacheTheme(theme);
  });
}

if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[THEME_STORAGE_KEY]) {
      return;
    }
    const theme = normalizeTheme(changes[THEME_STORAGE_KEY].newValue);
    applyTheme(theme);
    cacheTheme(theme);
  });
}

function clearDropMarker() {
  if (!dropTarget.element) {
    return;
  }
  dropTarget.element.classList.remove("drop-above", "drop-below");
  dropTarget = { element: null, position: null };
}

function setDropMarker(element, position) {
  if (dropTarget.element === element && dropTarget.position === position) {
    return;
  }
  clearDropMarker();
  dropTarget = { element, position };
  if (position === "above") {
    element.classList.add("drop-above");
  } else {
    element.classList.add("drop-below");
  }
}

function getDropPosition(target, clientY) {
  const rect = target.getBoundingClientRect();
  return clientY - rect.top < rect.height / 2 ? "above" : "below";
}

function createBadge(text, className, title) {
  const badge = document.createElement("span");
  badge.className = `badge ${className}`;
  badge.textContent = text;
  badge.title = title;
  return badge;
}

function createTabItem(tab) {
  const item = document.createElement("li");
  item.className = "tab-item";
  item.setAttribute("role", "option");
  item.setAttribute("aria-selected", "false");
  item.dataset.tabId = String(tab.id);
  item.draggable = true;
  item.tabIndex = 0;

  if (tab.active) {
    item.classList.add("active");
    item.setAttribute("aria-current", "true");
  }

  const main = document.createElement("div");
  main.className = "tab-main";

  const favicon = document.createElement("div");
  favicon.className = "favicon";
  if (tab.favIconUrl) {
    favicon.style.backgroundImage = `url("${tab.favIconUrl}")`;
  }

  const title = document.createElement("div");
  title.className = "tab-title";
  title.textContent = tab.title || tab.url || "New Tab";
  title.title = title.textContent;

  main.appendChild(favicon);
  main.appendChild(title);

  const actions = document.createElement("div");
  actions.className = "tab-actions";
  let hasBadge = false;

  if (tab.mutedInfo && tab.mutedInfo.muted) {
    actions.appendChild(createBadge("M", "badge-muted", "Muted"));
    hasBadge = true;
  } else if (tab.audible) {
    actions.appendChild(createBadge("A", "badge-audible", "Playing audio"));
    hasBadge = true;
  }
  item.appendChild(main);
  if (hasBadge) {
    item.appendChild(actions);
  }

  item.addEventListener("click", (event) => {
    if (handleSelectionClick(event, tab.id)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    clearSelection();
    lastSelectedTabId = tab.id;
    chrome.tabs.update(tab.id, { active: true });
    chrome.windows.update(tab.windowId, { focused: true });
  });

  item.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      chrome.tabs.update(tab.id, { active: true });
      chrome.windows.update(tab.windowId, { focused: true });
    }
  });

  item.addEventListener("dragstart", (event) => {
    const selectedIds = getSelectedTabIdsInOrder();
    if (selectedIds.length > 1 && selectedTabIds.has(tab.id)) {
      dragState = { tabIds: selectedIds };
    } else {
      if (selectedTabIds.size) {
        clearSelection();
      }
      dragState = { tabIds: [tab.id] };
    }
    item.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(tab.id));
  });

  item.addEventListener("dragover", (event) => {
    if (!dragState || item.classList.contains("dragging")) {
      return;
    }
    const dragIds = dragState.tabIds || [];
    if (dragIds.includes(Number(item.dataset.tabId))) {
      return;
    }
    event.preventDefault();
    const position = getDropPosition(item, event.clientY);
    setDropMarker(item, position);
    event.dataTransfer.dropEffect = "move";
  });

  item.addEventListener("dragleave", () => {
    if (dropTarget.element === item) {
      clearDropMarker();
    }
  });

  item.addEventListener("drop", (event) => {
    if (!dragState || item.classList.contains("dragging")) {
      return;
    }
    event.preventDefault();
    const dragIds = dragState.tabIds || [];
    const targetId = Number(item.dataset.tabId);
    if (dragIds.includes(targetId)) {
      clearDropMarker();
      return;
    }
    const position = getDropPosition(item, event.clientY);
    const orderedIds = getTabIdList();
    const remainingIds = orderedIds.filter((tabId) => !dragIds.includes(tabId));
    const targetIndex = remainingIds.indexOf(targetId);
    if (targetIndex === -1) {
      clearDropMarker();
      return;
    }
    const newIndex = targetIndex + (position === "below" ? 1 : 0);
    chrome.tabs.move(dragIds, { index: newIndex });
    clearDropMarker();
  });

  item.addEventListener("dragend", () => {
    item.classList.remove("dragging");
    clearDropMarker();
    dragState = null;
  });

  return item;
}

function insertTabItem(tab) {
  if (!isCurrentWindow(tab.windowId)) {
    return;
  }
  removeEmptyState();
  if (getTabItem(tab.id)) {
    updateTabItem(tab);
    return;
  }
  const item = createTabItem(tab);
  const siblings = getTabItems();
  const targetIndex = Math.min(tab.index, siblings.length);
  if (targetIndex >= siblings.length) {
    tabList.appendChild(item);
  } else {
    tabList.insertBefore(item, siblings[targetIndex]);
  }
  updateIndexes();
}

function removeTabItem(tabId) {
  const item = getTabItem(tabId);
  if (!item) {
    return;
  }
  item.remove();
  if (selectedTabIds.has(tabId)) {
    selectedTabIds.delete(tabId);
    updateSelectionBar();
  }
  if (lastSelectedTabId === tabId) {
    lastSelectedTabId = null;
  }
  if (!getTabItems().length) {
    showEmptyState();
  } else {
    updateIndexes();
  }
}

function moveTabItem(tabId, toIndex) {
  const item = getTabItem(tabId);
  if (!item) {
    return;
  }
  const siblings = getTabItems().filter((tabItem) => tabItem !== item);
  if (toIndex >= siblings.length) {
    tabList.appendChild(item);
  } else {
    tabList.insertBefore(item, siblings[toIndex]);
  }
  updateIndexes();
}

function renderTabs(tabs) {
  tabList.textContent = "";
  if (!tabs.length) {
    showEmptyState();
    updateSelectionBar();
    return;
  }
  const fragment = document.createDocumentFragment();
  tabs.forEach((tab, index) => {
    const item = createTabItem(tab);
    setItemIndex(item, index);
    fragment.appendChild(item);
  });
  tabList.appendChild(fragment);
  updateSelectionBar();
}

async function refreshTabs() {
  const queryInfo = currentWindowId == null ? { currentWindow: true } : { windowId: currentWindowId };
  const tabs = await chrome.tabs.query(queryInfo);
  if (tabs.length) {
    setCurrentWindowId(tabs[0].windowId);
  }
  renderTabs(tabs);
  isInitialized = true;
}

tabList.addEventListener("dragover", (event) => {
  if (!dragState) {
    return;
  }
  const target = event.target.closest(".tab-item");
  if (!target) {
    event.preventDefault();
    clearDropMarker();
  }
});

tabList.addEventListener("drop", (event) => {
  if (!dragState) {
    return;
  }
  const target = event.target.closest(".tab-item");
  if (target) {
    return;
  }
  event.preventDefault();
  const dragIds = dragState.tabIds || [];
  const remainingIds = getTabIdList().filter((tabId) => !dragIds.includes(tabId));
  chrome.tabs.move(dragIds, { index: remainingIds.length });
  clearDropMarker();
});

tabList.addEventListener("click", (event) => {
  if (!event.target.closest(".tab-item")) {
    clearSelection();
  }
});

closeSelectedButton.addEventListener("click", () => {
  closeSelectedTabs();
});

clearSelectionButton.addEventListener("click", () => {
  clearSelection();
});

document.addEventListener("keydown", (event) => {
  const targetTag = event.target && event.target.tagName;
  if (targetTag === "INPUT" || targetTag === "TEXTAREA" || targetTag === "SELECT") {
    return;
  }
  if (event.key === "Escape") {
    clearSelection();
    return;
  }
  if ((event.key === "Delete" || event.key === "Backspace") && selectedTabIds.size) {
    event.preventDefault();
    closeSelectedTabs();
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (!isInitialized || !isCurrentWindow(tab.windowId)) {
    return;
  }
  insertTabItem(tab);
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (!isInitialized || !isCurrentWindow(removeInfo.windowId)) {
    return;
  }
  removeTabItem(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!isInitialized || !isCurrentWindow(tab.windowId)) {
    return;
  }
  if (!getTabItem(tabId)) {
    insertTabItem(tab);
    return;
  }
  updateTabItem(tab);
});

chrome.tabs.onMoved.addListener((tabId, moveInfo) => {
  if (!isInitialized || !isCurrentWindow(moveInfo.windowId)) {
    return;
  }
  moveTabItem(tabId, moveInfo.toIndex);
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  if (!isInitialized || !isCurrentWindow(activeInfo.windowId)) {
    return;
  }
  setActiveTab(activeInfo.tabId);
});

chrome.tabs.onDetached.addListener((tabId, detachInfo) => {
  if (!isInitialized || !isCurrentWindow(detachInfo.oldWindowId)) {
    return;
  }
  removeTabItem(tabId);
});

chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
  if (!isInitialized || !isCurrentWindow(attachInfo.newWindowId)) {
    return;
  }
  chrome.tabs.get(tabId, (tab) => {
    if (tab && isCurrentWindow(tab.windowId)) {
      insertTabItem(tab);
    }
  });
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  if (!isInitialized) {
    return;
  }
  chrome.tabs.get(addedTabId, (tab) => {
    if (!tab || !isCurrentWindow(tab.windowId)) {
      return;
    }
    removeTabItem(removedTabId);
    insertTabItem(tab);
  });
});

function initializeTabs() {
  chrome.windows.getCurrent({}, (window) => {
    if (window && window.id != null) {
      setCurrentWindowId(window.id);
    }
    refreshTabs();
  });
}

loadTheme();
initializeTabs();
