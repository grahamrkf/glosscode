/* Runs in the webview before the page's own scripts. It puts the app's functions under
   window.GlossCodeNative for the UI (docs/mockup/index.html) and keeps links from navigating the
   window away from the editor: they open in the default browser instead. main.c fills in the
   values in GC_INFO before injecting this. */
(function () {
  "use strict";
  var info = GC_INFO;
  var call = function (name, args) { return window[name].apply(window, args); };
  window.GlossCodeNative = {
    version: info.version,
    platform: info.platform,
    portable: info.portable,
    configDir: info.configDir,
    // Runs a core method (parse, serialize, analyze, tokenize) and resolves with its JSON result.
    core: function (method, params) { return call("gcCore", [method, params || {}]); },
    // Shows the system Open dialog; resolves with { path, name, latin1, doc } or null when cancelled.
    open: function (fromPath) { return call("gcOpen", [fromPath || null]); },
    // Writes the document; shows the Save dialog when path is null. Resolves with { path, name, bytes } or null.
    save: function (opts) { return call("gcSave", [opts]); },
    // The file named on the command line, opened like open(), or null.
    startup: function () { return call("gcStartup", []); },
    // Opens a file by path (from the recent list), like open() without the dialog.
    openPath: function (path) { return call("gcOpenPath", [String(path)]); },
    // Whether a file is still there (true or false).
    exists: function (path) { return call("gcExists", [String(path)]); },
    // The saved settings object (recent files, default machines by file type), or null; and saving it.
    settings: function () { return call("gcSettings", []); },
    saveSettings: function (obj) { return call("gcSaveSettings", [obj]); },
    openUrl: function (url) { return call("gcOpenUrl", [String(url)]); },
    setTitle: function (title) { return call("gcSetTitle", [String(title)]); },
    quit: function () { return call("gcQuit", []); }
  };
  document.documentElement.classList.add("native");
  window.open = function (url) { if (url) window.GlossCodeNative.openUrl(url); return null; };
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (/^https?:/i.test(href)) { e.preventDefault(); window.GlossCodeNative.openUrl(a.href); }
    else if (href && href.charAt(0) !== "#") e.preventDefault();
  }, true);
})();
