/* The web app's stand-in for the program's bridge (src/app/bridge.js). It runs before the page's own
   scripts and puts the same functions under window.GlossCodeNative, so the UI (src/ui/index.html)
   works just as it does in the program:
   - Reading and writing programs goes through the C core, built as WebAssembly (core.wasm, from
     src/web/core_wasm.c), so unchanged blocks, line endings, ';' marks and Latin-1 files are kept
     exactly as the program keeps them.
   - Open and Save use the browser's file pickers. Where the browser has the File System Access API
     (Chrome, Edge), Save writes back to the file that was opened and the recent list can reopen it.
     Elsewhere (Firefox, Safari), Open reads a copy of the file and Save downloads one; the recent list
     reopens the copy kept in the browser.
   - Settings (recent programs, machine profiles, appearance…) and the personal subprogram library are
     kept in the browser's IndexedDB, for this site only.
   scripts/build-site.mjs copies this file into the app folder and fills in __GC_VERSION__. */
(function () {
  "use strict";
  var VERSION = "__GC_VERSION__";
  var HAS_FSA = typeof window.showOpenFilePicker === "function" && typeof window.showSaveFilePicker === "function";
  var EXTS = [".nc", ".ngc", ".tap", ".gcode", ".cnc", ".min", ".ssb", ".eia", ".mpf", ".spf", ".h", ".txt"];
  var PICKER_TYPES = [{ description: "CNC programs", accept: { "text/plain": EXTS } }];
  var enc = new TextEncoder(), dec = new TextDecoder();

  /* ---------- The core (WebAssembly) ---------- */
  var core = null;
  var coreReady = null;
  function loadCore() {
    if (coreReady) return coreReady;
    var mem = function () { return new DataView(core.memory.buffer); };
    // The core uses snprintf and friends from wasi-libc, which bring in a few WASI calls it never
    // really makes (nothing is printed); they're answered here so the module can be instantiated.
    var wasi = {
      fd_write: function (fd, iovs, n, out) {
        var d = mem(), total = 0;
        for (var i = 0; i < n; i++) total += d.getUint32(iovs + i * 8 + 4, true);
        d.setUint32(out, total, true);
        return 0;
      },
      fd_close: function () { return 0; },
      fd_seek: function () { return 70; },   // ESPIPE
      proc_exit: function (code) { throw new Error("The core stopped (" + code + ")."); }
    };
    var imports = { wasi_snapshot_preview1: new Proxy(wasi, { get: function (t, k) { return k in t ? t[k] : function () { return 52; }; } }) };
    var url = new URL("core.wasm", document.baseURI || location.href);
    coreReady = (WebAssembly.instantiateStreaming
      ? WebAssembly.instantiateStreaming(fetch(url), imports).catch(function () {
          return fetch(url).then(function (r) { return r.arrayBuffer(); }).then(function (b) { return WebAssembly.instantiate(b, imports); });
        })
      : fetch(url).then(function (r) { return r.arrayBuffer(); }).then(function (b) { return WebAssembly.instantiate(b, imports); })
    ).then(function (res) {
      core = res.instance.exports;
      if (core._initialize) core._initialize();
      return core;
    });
    return coreReady;
  }
  function put(bytes) {   // copies bytes (plus a NUL) into the core's memory
    var p = core.gcw_alloc(bytes.length + 1);
    var m = new Uint8Array(core.memory.buffer, p, bytes.length + 1);
    m.set(bytes); m[bytes.length] = 0;
    return p;
  }
  function take(p) {      // the bytes of a buffer the core returned, then frees it
    if (!p) return null;
    var out = new Uint8Array(core.memory.buffer, p, core.gcw_len()).slice();
    core.gcw_free(p);
    return out;
  }
  function call(method, params) {
    return loadCore().then(function () {
      var m = put(enc.encode(method)), b = enc.encode(JSON.stringify(params || {})), p = put(b);
      var out = take(core.gcw_call(m, p, b.length));
      core.gcw_free(m); core.gcw_free(p);
      return JSON.parse(dec.decode(out));
    });
  }
  function readBytes(bytes) {   // a file's bytes -> { latin1, doc, text }
    return loadCore().then(function () {
      var p = put(bytes);
      var out = take(core.gcw_open(p, bytes.length));
      core.gcw_free(p);
      return JSON.parse(dec.decode(out));
    });
  }
  function writeBytes(doc, latin1) {   // a document -> the file's bytes
    return loadCore().then(function () {
      var b = enc.encode(JSON.stringify(doc)), p = put(b);
      var out = take(core.gcw_save(p, b.length, latin1 ? 1 : 0));
      core.gcw_free(p);
      if (out) return out;
      return call("serialize", doc).then(function (r) { throw new Error(r && r.error || "Couldn't write the program."); });
    });
  }

  /* ---------- Browser storage (IndexedDB) ---------- */
  // kv: "settings"; files: path -> { path, name, handle?, bytes? }; library: id -> JSON text
  var dbReady = null;
  function db() {
    if (dbReady) return dbReady;
    dbReady = new Promise(function (resolve, reject) {
      var r = indexedDB.open("glosscode-app", 1);
      r.onupgradeneeded = function () {
        var d = r.result;
        d.createObjectStore("kv");
        d.createObjectStore("files", { keyPath: "path" });
        d.createObjectStore("library");
      };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error("The browser's storage isn't available, so settings can't be kept.")); };
    });
    return dbReady;
  }
  function tx(store, mode, fn) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction(store, mode), s = t.objectStore(store), out;
        var req = fn(s);
        if (req) req.onsuccess = function () { out = req.result; };
        t.oncomplete = function () { resolve(out); };
        t.onerror = t.onabort = function () { reject(t.error || new Error("The browser's storage refused the change.")); };
      });
    });
  }
  var get = function (store, key) { return tx(store, "readonly", function (s) { return s.get(key); }); };
  var all = function (store) { return tx(store, "readonly", function (s) { return s.getAll(); }); };
  var keys = function (store) { return tx(store, "readonly", function (s) { return s.getAllKeys(); }); };
  var set = function (store, value, key) { return tx(store, "readwrite", function (s) { return key === undefined ? s.put(value) : s.put(value, key); }); };
  var del = function (store, key) { return tx(store, "readwrite", function (s) { return s.delete(key); }); };

  /* ---------- Files ---------- */
  // A browser gives no folder paths, so each file gets a name of its own for the recent list: its file
  // name, or "name (2)" when another file of the same name is already in the list.
  function pathFor(name, handle) {
    return all("files").then(function (list) {
      var same = list.filter(function (f) { return handle ? !!f.handle : !f.handle; });
      var check = handle
        ? Promise.all(same.map(function (f) { return f.handle.isSameEntry(handle).catch(function () { return false; }); }))
        : Promise.resolve(same.map(function (f) { return f.name === name; }));
      return check.then(function (hits) {
        var i = hits.indexOf(true);
        if (i >= 0) return same[i].path;
        var taken = {}; list.forEach(function (f) { taken[f.path] = true; });
        var p = name, n = 2;
        while (taken[p]) p = name + " (" + n++ + ")";
        return p;
      });
    });
  }
  function permitted(handle, mode) {
    return handle.queryPermission({ mode: mode }).then(function (s) {
      return s === "granted" ? true : handle.requestPermission({ mode: mode }).then(function (s2) { return s2 === "granted"; });
    });
  }
  function opened(path, name, bytes) {
    return readBytes(bytes).then(function (r) { r.path = path; r.name = name; return r; });
  }
  function fromHandle(handle) {
    return handle.getFile().then(function (file) {
      return Promise.all([pathFor(file.name, handle), file.arrayBuffer()]).then(function (a) {
        return set("files", { path: a[0], name: file.name, handle: handle }).then(function () {
          return opened(a[0], file.name, new Uint8Array(a[1]));
        });
      });
    });
  }
  function fromUpload(file) {
    return file.arrayBuffer().then(function (buf) {
      var bytes = new Uint8Array(buf);
      return pathFor(file.name, null).then(function (path) {
        return set("files", { path: path, name: file.name, bytes: bytes }).then(function () { return opened(path, file.name, bytes); });
      });
    });
  }
  function pickUpload() {   // Open without the File System Access API: the browser's file input
    return new Promise(function (resolve, reject) {
      var input = document.createElement("input");
      input.type = "file";
      input.accept = EXTS.join(",");
      input.style.display = "none";
      var done = false;
      var finish = function (f) { if (done) return; done = true; input.remove(); f ? fromUpload(f).then(resolve, reject) : resolve(null); };
      input.addEventListener("change", function () { finish(input.files && input.files[0]); });
      input.addEventListener("cancel", function () { finish(null); });
      document.body.appendChild(input);
      input.click();
    });
  }
  function download(name, bytes) {
    var url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
    var a = document.createElement("a");
    a.href = url; a.download = name; a.style.display = "none";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
  var aborted = function (e) { return e && e.name === "AbortError"; };

  function open(fromPath) {
    if (!HAS_FSA) return pickUpload();
    return (fromPath ? get("files", fromPath).catch(function () { return null; }) : Promise.resolve(null)).then(function (from) {
      var opts = { types: PICKER_TYPES, id: "programs" };
      if (from && from.handle) opts.startIn = from.handle;
      return window.showOpenFilePicker(opts).catch(function (e) {
        if (aborted(e)) return null;
        if (opts.startIn) { delete opts.startIn; return window.showOpenFilePicker(opts); }
        throw e;
      });
    }).then(function (handles) { return handles && handles[0] ? fromHandle(handles[0]) : null; }, function (e) { if (aborted(e)) return null; throw e; });
  }
  function openPath(path) {
    return get("files", path).then(function (f) {
      if (!f) throw new Error(path + " isn't kept in this browser any more.");
      if (f.handle) {
        return permitted(f.handle, "read").then(function (ok) {
          if (!ok) throw new Error("The browser wasn't allowed to read " + f.name + ".");
          return f.handle.getFile();
        }).then(function (file) { return file.arrayBuffer(); }).then(function (b) { return opened(f.path, f.name, new Uint8Array(b)); });
      }
      return opened(f.path, f.name, f.bytes);
    });
  }
  function exists(path) {
    return get("files", path).then(function (f) {
      if (!f) return false;
      if (!f.handle) return true;
      // Only look when reading is already allowed; otherwise opening it asks, and says so if it's gone.
      return f.handle.queryPermission({ mode: "read" }).then(function (s) {
        if (s !== "granted") return true;
        return f.handle.getFile().then(function () { return true; }, function (e) { return !(e && e.name === "NotFoundError"); });
      });
    });
  }
  function save(o) {
    return writeBytes(o.doc, o.latin1).then(function (bytes) {
      return (o.path ? get("files", o.path) : Promise.resolve(null)).then(function (f) {
        // Back into the file it came from
        if (f && f.handle) {
          return permitted(f.handle, "readwrite").then(function (ok) {
            if (!ok) throw new Error("The browser wasn't allowed to save " + f.name + ". Use Save As to save a copy.");
            return f.handle.createWritable();
          }).then(function (w) { return w.write(bytes).then(function () { return w.close(); }); })
            .then(function () { return { path: f.path, name: f.name, bytes: bytes.length }; });
        }
        // A new file (Save As, a new program, or a copy that came from a file input)
        if (HAS_FSA) {
          return window.showSaveFilePicker({ suggestedName: o.name || (f && f.name) || "program.nc", types: PICKER_TYPES, id: "programs" })
            .then(function (handle) {
              return handle.createWritable().then(function (w) { return w.write(bytes).then(function () { return w.close(); }); })
                .then(function () { return handle.getFile(); })
                .then(function (file) {
                  return pathFor(file.name, handle).then(function (path) {
                    return set("files", { path: path, name: file.name, handle: handle }).then(function () { return { path: path, name: file.name, bytes: bytes.length }; });
                  });
                });
            }, function (e) { if (aborted(e)) return null; throw e; });
        }
        // No File System Access API: download it, and keep the copy for the recent list
        var name = (f && f.name) || o.name || "program.nc";
        download(name, bytes);
        return (f ? Promise.resolve(f.path) : pathFor(name, null)).then(function (path) {
          return set("files", { path: path, name: name, bytes: bytes }).then(function () { return { path: path, name: name, bytes: bytes.length }; });
        });
      });
    });
  }

  /* Programs opened with the installed app (file handling): the first one opens at start-up, any later
     ones as they come. */
  var launched = [], onLaunch = null, launchWait = null;
  if ("launchQueue" in window && window.launchQueue) {
    window.launchQueue.setConsumer(function (params) {
      var files = (params && params.files) || [];
      files.forEach(function (h) { if (h && h.kind === "file") (onLaunch ? onLaunch(h) : launched.push(h)); });
      if (launchWait) launchWait();
    });
  }
  function startup() {
    return new Promise(function (resolve) {
      var t = setTimeout(resolve, 400);
      launchWait = function () { clearTimeout(t); resolve(); };
      if (launched.length) launchWait();
    }).then(function () {
      launchWait = null;
      var first = launched.shift();
      var rest = launched.splice(0);
      onLaunch = function (h) {
        fromHandle(h).then(function (r) { if (window.openFileResult) window.openFileResult(r); }, function (e) { if (window.setMsg) window.setMsg(String(e && e.message || e), true); });
      };
      rest.forEach(onLaunch);
      return first ? fromHandle(first) : null;
    });
  }

  /* ---------- Settings and the subprogram library ---------- */
  function settings() { return get("kv", "settings").then(function (o) { return o || null; }); }
  function saveSettings(obj) { return set("kv", JSON.parse(JSON.stringify(obj)), "settings").then(function () { return true; }); }
  function library() {
    return keys("library").then(function (ids) {
      return Promise.all(ids.map(function (id) { return get("library", id); })).then(function (texts) {
        var out = [];
        ids.forEach(function (id, i) {
          try { out.push({ path: "library/" + id + ".json", name: id + ".json", entry: JSON.parse(texts[i]) }); } catch (e) { /* skip a bad one */ }
        });
        return out;
      });
    });
  }
  function saveLibrary(id, text) {
    if (!/^[a-z0-9-]+$/.test(id)) return Promise.reject(new Error("saveLibrary(id, text) needs an id of lower-case letters, digits and dashes"));
    var o;
    try { o = JSON.parse(text); } catch (e) { o = null; }
    if (!o || typeof o !== "object" || Array.isArray(o)) return Promise.reject(new Error("saveLibrary(id, text) needs the text of a JSON object"));
    return set("library", String(text), id).then(function () { return "library/" + id + ".json"; });
  }
  function deleteLibrary(id) { return del("library", id).then(function () { return true; }); }

  /* ---------- The rest ---------- */
  var openWindow = window.open.bind(window);
  var api = {
    version: VERSION,
    platform: "web",
    portable: false,
    configDir: "this browser",
    fileAccess: HAS_FSA ? "files" : "copies",
    core: call,
    open: open,
    save: save,
    startup: startup,
    openPath: openPath,
    exists: exists,
    settings: settings,
    saveSettings: saveSettings,
    library: library,
    saveLibrary: saveLibrary,
    deleteLibrary: deleteLibrary,
    openUrl: function (url) { openWindow(String(url), "_blank", "noopener"); return Promise.resolve(true); },
    setTitle: function () { return Promise.resolve(true); },
    setDark: function (dark) {
      var m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute("content", dark ? "#1f2329" : "#f3f4f6");
      return Promise.resolve(true);
    },
    quit: function () { window.close(); return Promise.resolve(true); }
  };
  // The installed fonts, where the browser can list them (Chrome and Edge ask first).
  if (typeof window.queryLocalFonts === "function") {
    api.fonts = function () {
      return window.queryLocalFonts().then(function (list) {
        var seen = {};
        list.forEach(function (f) { seen[f.family] = true; });
        return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b); });
      });
    };
  }
  window.GlossCodeNative = api;
  loadCore().catch(function () { /* reported when a file is opened */ });

  // A program with changes that aren't saved: the browser asks before the page is closed or reloaded.
  window.addEventListener("beforeunload", function (e) {
    var tabs = typeof TABS !== "undefined" ? TABS : [];   // eslint-disable-line no-undef
    if (tabs.some(function (t) { return t.docVer !== t.savedVer; })) { e.preventDefault(); e.returnValue = ""; }
  });

  // Works offline once loaded: the service worker (sw.js) keeps a copy of every file of this version.
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () { /* online only */ }); });
  }
})();
