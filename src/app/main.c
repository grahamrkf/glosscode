/* GlossCode: the program. Opens a webview window showing the UI (src/ui/, joined into one page and compiled in),
   and connects it to the core and the platform file through a handful of bound functions. Portable:
   the only OS-specific code is in src/platform/. */
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "webview/webview.h"
#include "nfd.h"

#include "glosscode.h"
#include "gc_util.h"
#include "platform.h"
#include "resources.h"

static webview_t W;
static char *STARTUP_FILE;

static const nfdu8filteritem_t FILTERS[] = {
    { "CNC programs", "nc,ngc,tap,gcode,cnc,min,ssb,eia,mpf,spf,h,txt" },
};

/* ---------- Helpers for the bindings ---------- */

static char *path_join(const char *a, const char *b)
{
    size_t la = strlen(a), lb = strlen(b);
    char *p = gc_xmalloc(la + lb + 2);
    memcpy(p, a, la);
    p[la] = plat_sep();
    memcpy(p + la + 1, b, lb + 1);
    return p;
}

static void reply(const char *id, int ok, const char *json)
{
    webview_return(W, id, ok ? 0 : 1, json);
}

static void reply_error(const char *id, const char *msg)
{
    gc_buf b;
    gc_buf_init(&b);
    gc_buf_json_str(&b, msg);
    reply(id, 0, gc_buf_str(&b));
    gc_buf_free(&b);
}

static gc_json *args_of(const char *req)
{
    char err[200];
    gc_json *a = gc_json_parse(req, strlen(req), err, sizeof err);
    if (a && !gc_json_is_arr(a)) {
        gc_json_free(a);
        a = NULL;
    }
    return a;
}

static const char *base_name(const char *path)
{
    const char *b = path;
    for (const char *p = path; *p; p++)
        if (*p == '/' || *p == '\\') b = p + 1;
    return b;
}

static nfdwindowhandle_t parent_window(void)
{
    nfdwindowhandle_t h = { NFD_WINDOW_HANDLE_TYPE_UNSET, NULL };
#ifdef _WIN32
    h.type = NFD_WINDOW_HANDLE_TYPE_WINDOWS;
    h.handle = webview_get_window(W);
#endif
    return h;
}

/* The folder part of path, or NULL. Caller frees. */
static char *folder_of(const char *path)
{
    if (!path) return NULL;
    const char *b = base_name(path);
    if (b == path) return NULL;
    return gc_strndup(path, (size_t)(b - path - 1));
}

/* Reads a G-code file and returns { path, name, latin1, doc } as JSON, or NULL with err set. */
static char *open_json(const char *path, char *err, size_t errsz)
{
    size_t len;
    char *bytes = plat_read_file(path, &len);
    if (!bytes) {
        snprintf(err, errsz, "Couldn't read %s.", path);
        return NULL;
    }
    int latin1 = !gc_is_utf8(bytes, len);
    if (latin1) {
        size_t ul;
        char *u = gc_latin1_to_utf8(bytes, len, &ul);
        free(bytes);
        bytes = u;
        len = ul;
    }
    gc_buf p;
    gc_buf_init(&p);
    gc_buf_puts(&p, "{\"text\":");
    gc_buf_json_str(&p, bytes);
    gc_buf_putc(&p, '}');
    char *doc = gc_api_call("parse", gc_buf_str(&p), p.len);
    gc_buf_free(&p);
    gc_buf b;
    gc_buf_init(&b);
    gc_buf_puts(&b, "{\"path\":");
    gc_buf_json_str(&b, path);
    gc_buf_puts(&b, ",\"name\":");
    gc_buf_json_str(&b, base_name(path));
    gc_buf_printf(&b, ",\"latin1\":%s,\"doc\":%s,\"text\":", latin1 ? "true" : "false", doc);
    /* The text too, so the UI can read it again for a control with its own block syntax (Fagor 8060) */
    gc_buf_json_str(&b, bytes);
    gc_buf_putc(&b, '}');
    free(bytes);
    free(doc);
    return gc_buf_take(&b);
}

/* ---------- Bindings ---------- */

/* gcCore(method, params) */
static void bind_core(const char *id, const char *req, void *arg)
{
    (void)arg;
    gc_json *a = args_of(req);
    const char *method = gc_json_str(gc_json_at(a, 0));
    if (!method) {
        gc_json_free(a);
        reply_error(id, "gcCore(method, params) needs a method name");
        return;
    }
    gc_buf p;
    gc_buf_init(&p);
    gc_json_write(&p, gc_json_at(a, 1));
    char *out = gc_api_call(method, gc_buf_str(&p), p.len);
    gc_buf_free(&p);
    gc_json_free(a);
    reply(id, 1, out);
    free(out);
}

/* gcOpen(fromPath) */
static void bind_open(const char *id, const char *req, void *arg)
{
    (void)arg;
    gc_json *a = args_of(req);
    char *dir = folder_of(gc_json_str(gc_json_at(a, 0)));
    gc_json_free(a);
    /* A file from the recent list may be gone, and its folder too: start in the nearest folder that's left. */
    while (dir && !plat_file_exists(dir)) {
        char *up = folder_of(dir);
        free(dir);
        dir = up;
    }
    nfdopendialogu8args_t args;
    memset(&args, 0, sizeof args);
    args.filterList = FILTERS;
    args.filterCount = 1;
    args.defaultPath = dir;
    args.parentWindow = parent_window();
    nfdu8char_t *out = NULL;
    nfdresult_t r = NFD_OpenDialogU8_With(&out, &args);
    free(dir);
    if (r == NFD_CANCEL) {
        reply(id, 1, "null");
        return;
    }
    if (r != NFD_OKAY) {
        reply_error(id, NFD_GetError() ? NFD_GetError() : "The Open dialog failed.");
        return;
    }
    char err[600];
    char *json = open_json(out, err, sizeof err);
    NFD_FreePathU8(out);
    if (json) reply(id, 1, json);
    else reply_error(id, err);
    free(json);
}

/* gcSave({ path, name, latin1, doc }) */
static void bind_save(const char *id, const char *req, void *arg)
{
    (void)arg;
    gc_json *a = args_of(req);
    const gc_json *o = gc_json_at(a, 0);
    const char *path = gc_json_get_str(o, "path");
    char *chosen = NULL;
    if (!path) {
        const char *name = gc_json_get_str(o, "name");
        nfdsavedialogu8args_t args;
        memset(&args, 0, sizeof args);
        args.filterList = FILTERS;
        args.filterCount = 1;
        args.defaultName = name;
        args.parentWindow = parent_window();
        nfdu8char_t *out = NULL;
        nfdresult_t r = NFD_SaveDialogU8_With(&out, &args);
        if (r == NFD_CANCEL) {
            gc_json_free(a);
            reply(id, 1, "null");
            return;
        }
        if (r != NFD_OKAY) {
            gc_json_free(a);
            reply_error(id, NFD_GetError() ? NFD_GetError() : "The Save dialog failed.");
            return;
        }
        chosen = gc_strdup(out);
        NFD_FreePathU8(out);
        path = chosen;
    }
    gc_buf p;
    gc_buf_init(&p);
    gc_json_write(&p, gc_json_get(o, "doc"));
    char *res = gc_api_call("serialize", gc_buf_str(&p), p.len);
    gc_buf_free(&p);
    char err[600];
    gc_json *rj = gc_json_parse(res, strlen(res), err, sizeof err);
    const char *text = gc_json_get_str(rj, "text");
    if (!text) {
        reply_error(id, gc_json_get_str(rj, "error") ? gc_json_get_str(rj, "error") : "Couldn't write the program.");
    } else {
        size_t len = strlen(text);
        char *bytes = NULL;
        if (gc_json_truthy(gc_json_get(o, "latin1"))) bytes = gc_utf8_to_latin1(text, len, &len);
        if (plat_write_file(path, bytes ? bytes : text, len, err, sizeof err) != 0) {
            reply_error(id, err);
        } else {
            gc_buf b;
            gc_buf_init(&b);
            gc_buf_puts(&b, "{\"path\":");
            gc_buf_json_str(&b, path);
            gc_buf_puts(&b, ",\"name\":");
            gc_buf_json_str(&b, base_name(path));
            gc_buf_printf(&b, ",\"bytes\":%lu}", (unsigned long)len);
            reply(id, 1, gc_buf_str(&b));
            gc_buf_free(&b);
        }
        free(bytes);
    }
    gc_json_free(rj);
    free(res);
    free(chosen);
    gc_json_free(a);
}

/* gcStartup(): the file named on the command line. */
static void bind_startup(const char *id, const char *req, void *arg)
{
    (void)req;
    (void)arg;
    if (!STARTUP_FILE) {
        reply(id, 1, "null");
        return;
    }
    char err[600];
    char *json = open_json(STARTUP_FILE, err, sizeof err);
    free(STARTUP_FILE);
    STARTUP_FILE = NULL;
    if (json) reply(id, 1, json);
    else reply_error(id, err);
    free(json);
}

/* gcOpenPath(path): opens a file from the recent list without a dialog. */
static void bind_open_path(const char *id, const char *req, void *arg)
{
    (void)arg;
    gc_json *a = args_of(req);
    const char *path = gc_json_str(gc_json_at(a, 0));
    char err[600];
    char *json = NULL;
    if (!path || !*path) snprintf(err, sizeof err, "gcOpenPath(path) needs a path");
    else json = open_json(path, err, sizeof err);
    gc_json_free(a);
    if (json) reply(id, 1, json);
    else reply_error(id, err);
    free(json);
}

/* gcExists(path): whether a file is still there, so the UI can tell a missing file from one it can't read. */
static void bind_exists(const char *id, const char *req, void *arg)
{
    (void)arg;
    gc_json *a = args_of(req);
    const char *path = gc_json_str(gc_json_at(a, 0));
    reply(id, 1, path && *path && plat_file_exists(path) ? "true" : "false");
    gc_json_free(a);
}

/* Settings (recent files, default machines by file type) live in settings.json in the settings folder.
   The UI owns the contents; this only checks that it's JSON. */
static char *settings_path(void)
{
    return path_join(plat_get_dirs()->config, "settings.json");
}

/* gcSettings(): the saved settings, or null. */
static void bind_settings(const char *id, const char *req, void *arg)
{
    (void)req;
    (void)arg;
    char *path = settings_path();
    size_t n = 0;
    char *text = plat_read_file(path, &n);
    char err[200];
    gc_json *j = text ? gc_json_parse(text, n, err, sizeof err) : NULL;
    if (text && !j) fprintf(stderr, "Ignoring %s: %s\n", path, err);
    gc_buf b;
    gc_buf_init(&b);
    if (j && gc_json_is_obj(j)) gc_json_write(&b, j);
    else gc_buf_puts(&b, "null");
    reply(id, 1, gc_buf_str(&b));
    gc_buf_free(&b);
    gc_json_free(j);
    free(text);
    free(path);
}

/* gcSaveSettings(settings) */
static void bind_save_settings(const char *id, const char *req, void *arg)
{
    (void)arg;
    gc_json *a = args_of(req);
    const gc_json *o = gc_json_at(a, 0);
    if (!o || !gc_json_is_obj(o)) {
        gc_json_free(a);
        reply_error(id, "gcSaveSettings(settings) needs an object");
        return;
    }
    gc_buf b;
    gc_buf_init(&b);
    gc_json_write(&b, o);
    gc_buf_putc(&b, '\n');
    gc_json_free(a);
    const plat_dirs *dirs = plat_get_dirs();
    char *path = settings_path();
    char err[600];
    if (plat_make_dirs(dirs->config) != 0) {
        snprintf(err, sizeof err, "Couldn't create the settings folder %s.", dirs->config);
        reply_error(id, err);
    } else if (plat_write_file(path, gc_buf_str(&b), b.len, err, sizeof err) != 0) {
        reply_error(id, err);
    } else {
        reply(id, 1, "null");
    }
    gc_buf_free(&b);
    free(path);
}

/* The personal subprogram library: one JSON file per subprogram in the library folder inside the settings folder
   (docs/subprogram-library.md). The UI owns the contents; these list, write and delete the files. */
static char *library_dir(void)
{
    return path_join(plat_get_dirs()->config, "library");
}

/* A library id is also its file name, so it may only hold lower-case letters, digits and dashes. */
static int library_id_ok(const char *s)
{
    if (!s || !*s || strlen(s) > 80) return 0;
    for (; *s; s++)
        if (!(islower((unsigned char)*s) || isdigit((unsigned char)*s) || *s == '-')) return 0;
    return 1;
}

static void add_library_file(const char *path, const char *name, void *arg)
{
    gc_buf *b = arg;
    size_t n = 0;
    char *text = plat_read_file(path, &n);
    char err[200];
    gc_json *j = text ? gc_json_parse(text, n, err, sizeof err) : NULL;
    if (!j || !gc_json_is_obj(j)) {
        fprintf(stderr, "Ignoring %s: %s\n", path, j ? "not a JSON object" : text ? err : "can't read it");
    } else {
        if (b->len > 1) gc_buf_putc(b, ',');
        gc_buf_puts(b, "{\"path\":");
        gc_buf_json_str(b, path);
        gc_buf_puts(b, ",\"name\":");
        gc_buf_json_str(b, name);
        gc_buf_puts(b, ",\"entry\":");
        gc_json_write(b, j);
        gc_buf_putc(b, '}');
    }
    gc_json_free(j);
    free(text);
}

/* gcLibrary(): [{ path, name, entry }] for each *.json in the personal library folder, in name order. */
static void bind_library(const char *id, const char *req, void *arg)
{
    (void)req;
    (void)arg;
    char *dir = library_dir();
    gc_buf b;
    gc_buf_init(&b);
    gc_buf_putc(&b, '[');
    plat_list_dir(dir, ".json", add_library_file, &b);
    gc_buf_putc(&b, ']');
    reply(id, 1, gc_buf_str(&b));
    gc_buf_free(&b);
    free(dir);
}

/* gcSaveLibrary(id, text): writes <id>.json (text must be a JSON object) and resolves with its path. */
static void bind_save_library(const char *id, const char *req, void *arg)
{
    (void)arg;
    gc_json *a = args_of(req);
    const char *lid = gc_json_str(gc_json_at(a, 0)), *text = gc_json_str(gc_json_at(a, 1));
    char err[600];
    gc_json *j = text ? gc_json_parse(text, strlen(text), err, sizeof err) : NULL;
    char *dir = library_dir(), *file = NULL, *path = NULL;
    if (!library_id_ok(lid)) {
        reply_error(id, "gcSaveLibrary(id, text) needs an id of lower-case letters, digits and dashes");
    } else if (!j || !gc_json_is_obj(j)) {
        reply_error(id, "gcSaveLibrary(id, text) needs the text of a JSON object");
    } else if (plat_make_dirs(dir) != 0) {
        snprintf(err, sizeof err, "Couldn't create the library folder %s.", dir);
        reply_error(id, err);
    } else {
        file = gc_xmalloc(strlen(lid) + 6);
        sprintf(file, "%s.json", lid);
        path = path_join(dir, file);
        if (plat_write_file(path, text, strlen(text), err, sizeof err) != 0) {
            reply_error(id, err);
        } else {
            gc_buf b;
            gc_buf_init(&b);
            gc_buf_json_str(&b, path);
            reply(id, 1, gc_buf_str(&b));
            gc_buf_free(&b);
        }
    }
    free(path);
    free(file);
    free(dir);
    gc_json_free(j);
    gc_json_free(a);
}

/* gcDeleteLibrary(id): deletes <id>.json from the personal library folder. */
static void bind_delete_library(const char *id, const char *req, void *arg)
{
    (void)arg;
    gc_json *a = args_of(req);
    const char *lid = gc_json_str(gc_json_at(a, 0));
    if (!library_id_ok(lid)) {
        gc_json_free(a);
        reply_error(id, "gcDeleteLibrary(id) needs an id of lower-case letters, digits and dashes");
        return;
    }
    char *dir = library_dir(), *file = gc_xmalloc(strlen(lid) + 6), err[600];
    sprintf(file, "%s.json", lid);
    char *path = path_join(dir, file);
    if (plat_remove_file(path, err, sizeof err) != 0) reply_error(id, err);
    else reply(id, 1, "null");
    free(path);
    free(file);
    free(dir);
    gc_json_free(a);
}

/* gcOpenUrl(url) */
static void bind_open_url(const char *id, const char *req, void *arg)
{
    (void)arg;
    gc_json *a = args_of(req);
    const char *url = gc_json_str(gc_json_at(a, 0));
    if (url) plat_open_url(url);
    gc_json_free(a);
    reply(id, 1, "null");
}

/* gcSetTitle(title) */
static void bind_set_title(const char *id, const char *req, void *arg)
{
    (void)arg;
    gc_json *a = args_of(req);
    const char *t = gc_json_str(gc_json_at(a, 0));
    if (t) webview_set_title(W, t);
    gc_json_free(a);
    reply(id, 1, "null");
}

/* gcClipboard() reads the clipboard's text (null when it holds none); gcClipboard(text) puts text on it. */
static void bind_clipboard(const char *id, const char *req, void *arg)
{
    (void)arg;
    gc_json *a = args_of(req);
    const char *t = gc_json_str(gc_json_at(a, 0));
    void *win = webview_get_window(W);
    if (t) reply(id, 1, plat_clipboard_set(win, t) ? "true" : "false");
    else {
        char *text = plat_clipboard_get(win);
        gc_buf b;
        gc_buf_init(&b);
        if (text) gc_buf_json_str(&b, text);
        else gc_buf_puts(&b, "null");
        reply(id, 1, gc_buf_str(&b));
        gc_buf_free(&b);
        free(text);
    }
    gc_json_free(a);
}

/* gcFonts(): the installed font family names, sorted, each once: ["Arial", "Cascadia Mono", ...]. */
static int cmp_name(const void *a, const void *b)
{
    return strcmp(*(char *const *)a, *(char *const *)b);
}
static void bind_fonts(const char *id, const char *req, void *arg)
{
    (void)req;
    (void)arg;
    char *all = plat_font_families();
    size_t n = 0;
    for (const char *p = all; p && *p; p++) n += *p == '\n';
    char **names = calloc(n + 1, sizeof *names);
    size_t k = 0;
    if (all && names)
        for (char *p = all, *e; *p && (e = strchr(p, '\n')) != NULL; p = e + 1) {
            *e = 0;
            if (*p) names[k++] = p;
        }
    if (k) qsort(names, k, sizeof *names, cmp_name);
    gc_buf b;
    gc_buf_init(&b);
    gc_buf_putc(&b, '[');
    for (size_t i = 0, w = 0; i < k; i++) {
        if (i && strcmp(names[i], names[i - 1]) == 0) continue;
        if (w++) gc_buf_putc(&b, ',');
        gc_buf_json_str(&b, names[i]);
    }
    gc_buf_putc(&b, ']');
    reply(id, 1, gc_buf_str(&b));
    gc_buf_free(&b);
    free(names);
    free(all);
}

/* gcSetDark(dark): the title bar and frame to match the app's light or dark theme. */
static void bind_set_dark(const char *id, const char *req, void *arg)
{
    (void)arg;
    gc_json *a = args_of(req);
    const gc_json *v = gc_json_at(a, 0);
    plat_set_dark_frame(webview_get_window(W), gc_json_truthy(v));
    gc_json_free(a);
    reply(id, 1, "null");
}

/* gcQuit(): closes the window (used by the smoke test, tests/app_smoke.html). */
static void bind_quit(const char *id, const char *req, void *arg)
{
    (void)req;
    (void)arg;
    reply(id, 1, "null");
    webview_terminate(W);
}

/* ---------- Start-up ---------- */

static char *bridge_script(const plat_dirs *dirs)
{
    const gc_resource *js = gc_find_resource("app/bridge.js");
    gc_buf info;
    gc_buf_init(&info);
    gc_buf_puts(&info, "{\"version\":");
    gc_buf_json_str(&info, GC_VERSION);
    gc_buf_puts(&info, ",\"platform\":");
    gc_buf_json_str(&info, plat_name());
    gc_buf_printf(&info, ",\"portable\":%s,\"configDir\":", dirs->portable ? "true" : "false");
    gc_buf_json_str(&info, dirs->config);
    gc_buf_putc(&info, '}');
    gc_buf out;
    gc_buf_init(&out);
    const char *src = (const char *)js->data, *hit = strstr(src, "GC_INFO;");
    if (hit) {
        gc_buf_putn(&out, src, (size_t)(hit - src));
        gc_buf_puts(&out, gc_buf_str(&info));
        gc_buf_puts(&out, hit + 7);
    } else {
        gc_buf_puts(&out, src);
    }
    gc_buf_free(&info);
    return gc_buf_take(&out);
}

/* A file:// URL for a path on disk, so a page loaded with --ui finds its css/ and js/ files beside it. Letters,
   digits and -._~/: stay as they are; Windows backslashes become slashes; anything else is %-encoded. */
static char *file_url(const char *path)
{
    char *full = plat_full_path(path);
    if (!full) return NULL;
    gc_buf b;
    gc_buf_init(&b);
    gc_buf_puts(&b, full[0] == '/' ? "file://" : "file:///");
    for (const unsigned char *p = (const unsigned char *)full; *p; p++) {
        if (*p == '\\') gc_buf_putc(&b, '/');
        else if (isalnum(*p) || strchr("-._~/:", *p)) gc_buf_putc(&b, (char)*p);
        else gc_buf_printf(&b, "%%%02X", *p);
    }
    free(full);
    return gc_buf_take(&b);
}

static void usage(void)
{
    printf("GlossCode %s\n\n"
           "Usage: glosscode [options] [file]\n\n"
           "  --ui <file>       load the UI from a page on disk (src/ui/index.html) instead of the built-in one\n"
           "  --debug           allow the webview's developer tools\n"
           "  --version         print the version and exit\n",
           GC_VERSION);
}

int gc_main(int argc, char **argv)
{
    const char *ui_file = NULL;
    int debug = 0;
    for (int i = 1; i < argc; i++) {
        if (!strcmp(argv[i], "--ui") && i + 1 < argc) ui_file = argv[++i];
        else if (!strcmp(argv[i], "--debug")) debug = 1;
        else if (!strcmp(argv[i], "--version")) {
            printf("GlossCode %s\n", GC_VERSION);
            return 0;
        } else if (!strcmp(argv[i], "--help") || !strcmp(argv[i], "-h")) {
            usage();
            return 0;
        } else if (argv[i][0] != '-' && !STARTUP_FILE) STARTUP_FILE = plat_full_path(argv[i]);
    }

    const plat_dirs *dirs = plat_get_dirs();
    char err[600];
    char *ui_url = NULL;
    if (ui_file) {
        char *page = plat_read_file(ui_file, NULL);
        ui_url = page ? file_url(ui_file) : NULL;
        free(page);
        if (!ui_url) {
            snprintf(err, sizeof err, "Couldn't read %s.", ui_file);
            plat_error_box("GlossCode can't start", err);
            return 1;
        }
    }
    if (NFD_Init() != NFD_OKAY) fprintf(stderr, "File dialogs aren't available: %s\n", NFD_GetError() ? NFD_GetError() : "");

    plat_prepare_webview(dirs);
    W = webview_create(debug, NULL);
    if (!W) {
        plat_error_box("GlossCode can't start",
                       "The window couldn't be created. On Windows, GlossCode needs the Microsoft Edge WebView2 Runtime, "
                       "which comes with Windows 10 and 11 and can be installed from microsoft.com.");
        return 1;
    }
    webview_set_title(W, "GlossCode");
    webview_set_size(W, 1360, 860, WEBVIEW_HINT_NONE);
    char *bridge = bridge_script(dirs);
    webview_init(W, bridge);
    free(bridge);
    webview_bind(W, "gcCore", bind_core, NULL);
    webview_bind(W, "gcOpen", bind_open, NULL);
    webview_bind(W, "gcSave", bind_save, NULL);
    webview_bind(W, "gcStartup", bind_startup, NULL);
    webview_bind(W, "gcOpenPath", bind_open_path, NULL);
    webview_bind(W, "gcExists", bind_exists, NULL);
    webview_bind(W, "gcSettings", bind_settings, NULL);
    webview_bind(W, "gcSaveSettings", bind_save_settings, NULL);
    webview_bind(W, "gcLibrary", bind_library, NULL);
    webview_bind(W, "gcSaveLibrary", bind_save_library, NULL);
    webview_bind(W, "gcDeleteLibrary", bind_delete_library, NULL);
    webview_bind(W, "gcOpenUrl", bind_open_url, NULL);
    webview_bind(W, "gcSetTitle", bind_set_title, NULL);
    webview_bind(W, "gcClipboard", bind_clipboard, NULL);
    webview_bind(W, "gcFonts", bind_fonts, NULL);
    webview_bind(W, "gcSetDark", bind_set_dark, NULL);
    webview_bind(W, "gcQuit", bind_quit, NULL);
    if (ui_url) webview_navigate(W, ui_url);
    else webview_set_html(W, (const char *)gc_find_resource("ui/index.html")->data);
    free(ui_url);
    webview_run(W);
    webview_destroy(W);
    NFD_Quit();
    free(STARTUP_FILE);
    return 0;
}
