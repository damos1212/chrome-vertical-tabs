(function () {
  try {
    var theme = localStorage.getItem("vt_theme");
    if (theme) {
      document.documentElement.dataset.theme = theme;
    }
  } catch (error) {
    // Ignore storage access failures.
  }
})();
