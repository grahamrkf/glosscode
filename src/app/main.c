/* GlossCode: the program. Opens a webview window showing the UI (docs/mockup/index.html, compiled in),
   and connects it to the core and the platform file through a handful of bound functions. Portable:
   the only OS-specific code is in src/platform/. */
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
static gc_data *DATA;
static char *STARTUP_FILE;

static const nfdu8filteritem_t FILTERS[] = {
    { "G-code programs", "nc,ngc,tap,gcode,cnc,min,ssb,eia,mpf,spf,txt" },
};

/* ---------- Data ---------- */

static void add_lib_file(const char *path, const char *name, void *arg)
{
    size_t n;
    char *text = plat_read_file(path, &n);
    char err[200];
    (void)name;
    if (text && !gc_data_add_library(DATA, text, n, (const char *)arg, err, sizeof err))
        fprintf(stderr, "Skipped library file %s: %s\n", path, err);
    free(text);
}

static char *path_join(const char *a, const char *b)
{
    size_t la = strlen(a), lb = strlen(b);
    char *p = gc_xmalloc(la + lb + 2);
    memcpy(p, a, la);
    p[la] = plat_sep();
    memcpy(p + la + 1, b, lb + 1);
    return p;
}

/* Built-in data comes from inside the program, or from a folder with --data while editing tables. */
static int load_data(const char *data_dir, char *err, size_t errsz)
{
    if (data_dir) {
        char *wp = path_join(data_dir, "gcode-words.json"), *rp = path_join(data_dir, "gcode-rules.json");
        size_t wl = 0, rl = 0;
        char *w = plat_read_file(wp, &wl), *r = plat_read_file(rp, &rl);
        if (!w || !r) snprintf(err, errsz, "Couldn't read %s and %s.", wp, rp);
        else DATA = gc_data_load(w, wl, r, rl, err, errsz);
        free(w);
        free(r);
        free(wp);
        free(rp);
        if (!DATA) return 0;
        char *lib = path_join(data_dir, "library");
        plat_list_dir(lib, ".json", add_lib_file, "builtin");
        free(lib);
    } else {
        const gc_resource *w = gc_find_resource("data/gcode-words.json"), *r = gc_find_resource("data/gcode-rules.json");
        DATA = gc_data_load((const char *)w->data, w->len, (const char *)r->data, r->len, err, errsz);
        if (!DATA) return 0;
        for (size_t i = 0; i < gc_resource_count; i++) {
            const gc_resource *res = &gc_resources[i];
            if (strncmp(res->name, "data/library/", 13) == 0 && !gc_data_add_library(DATA, (const char *)res->data, res->len, "builtin", err, errsz))
                fprintf(stderr, "Built-in library %s: %s\n", res->name, err);
        }
    }
    /* The user's own library files. */
    char *mine = path_join(plat_get_dirs()->config, "library");
    plat_list_dir(mine, ".json", add_lib_file, "personal");
    free(mine);
    return 1;
}

/* ---------- Helpers for the bindings ---------- */

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
    free(bytes);
    char *doc = gc_api_call(DATA, "parse", gc_buf_str(&p), p.len);
    gc_buf_free(&p);
    gc_buf b;
    gc_buf_init(&b);
    gc_buf_puts(&b, "{\"path\":");
    gc_buf_json_str(&b, path);
    gc_buf_puts(&b, ",\"name\":");
    gc_buf_json_str(&b, base_name(path));
    gc_buf_printf(&b, ",\"latin1\":%s,\"doc\":%s}", latin1 ? "true" : "false", doc);
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
    char *out = gc_api_call(DATA, method, gc_buf_str(&p), p.len);
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
    char *res = gc_api_call(DATA, "serialize", gc_buf_str(&p), p.len);
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

static void usage(void)
{
    printf("GlossCode %s\n\n"
           "Usage: glosscode [options] [file]\n\n"
           "  --data <folder>   load gcode-words.json, gcode-rules.json and library/ from a folder\n"
           "                    instead of the copies built into the program\n"
           "  --ui <file>       load the UI from an HTML file instead of the built-in one\n"
           "  --debug           allow the webview's developer tools\n"
           "  --version         print the version and exit\n",
           GC_VERSION);
}

int gc_main(int argc, char **argv)
{
    const char *data_dir = NULL, *ui_file = NULL;
    int debug = 0;
    for (int i = 1; i < argc; i++) {
        if (!strcmp(argv[i], "--data") && i + 1 < argc) data_dir = argv[++i];
        else if (!strcmp(argv[i], "--ui") && i + 1 < argc) ui_file = argv[++i];
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
    if (!load_data(data_dir, err, sizeof err)) {
        plat_error_box("GlossCode can't start", err);
        return 1;
    }
    char *html = NULL;
    if (ui_file) {
        html = plat_read_file(ui_file, NULL);
        if (!html) {
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
    webview_bind(W, "gcOpenUrl", bind_open_url, NULL);
    webview_bind(W, "gcSetTitle", bind_set_title, NULL);
    webview_bind(W, "gcQuit", bind_quit, NULL);
    webview_set_html(W, html ? html : (const char *)gc_find_resource("ui/index.html")->data);
    free(html);
    webview_run(W);
    webview_destroy(W);
    NFD_Quit();
    gc_data_free(DATA);
    free(STARTUP_FILE);
    return 0;
}
