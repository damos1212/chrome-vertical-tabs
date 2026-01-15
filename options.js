const themeSelect = document.getElementById("theme-select");
const status = document.getElementById("status");

const DEFAULT_THEME = "light";
const THEME_STORAGE_KEY = "theme";
const THEME_CACHE_KEY = "vt_theme";
const THEMES = new Set(["light", "dark", "catppuccin"]);
let statusTimer = null;

function normalizeTheme(theme) {
  return THEMES.has(theme) ? theme : DEFAULT_THEME;
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = normalizeTheme(theme);
}

function cacheTheme(theme) {
  try {
    localStorage.setItem(THEME_CACHE_KEY, normalizeTheme(theme));
  } catch (error) {
    // Ignore caching failures.
  }
}

function showStatus(message) {
  status.textContent = message;
  status.classList.add("visible");
  if (statusTimer) {
    clearTimeout(statusTimer);
  }
  statusTimer = setTimeout(() => {
    status.classList.remove("visible");
  }, 1200);
}

function loadTheme() {
  if (!chrome.storage) {
    const fallbackTheme = normalizeTheme(localStorage.getItem(THEME_CACHE_KEY)) || DEFAULT_THEME;
    themeSelect.value = fallbackTheme;
    applyTheme(fallbackTheme);
    return;
  }
  chrome.storage.local.get({ [THEME_STORAGE_KEY]: DEFAULT_THEME }, (result) => {
    const theme = normalizeTheme(result[THEME_STORAGE_KEY]);
    themeSelect.value = theme;
    applyTheme(theme);
    cacheTheme(theme);
  });
}

themeSelect.addEventListener("change", () => {
  const theme = normalizeTheme(themeSelect.value);
  applyTheme(theme);
  cacheTheme(theme);
  if (chrome.storage) {
    chrome.storage.local.set({ [THEME_STORAGE_KEY]: theme }, () => {
      showStatus("Saved");
    });
  } else {
    showStatus("Saved");
  }
});

loadTheme();
