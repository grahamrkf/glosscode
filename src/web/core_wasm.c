/* The core built as WebAssembly for the web app (src/web/). The web app's bridge (bridge-web.js)
   calls these in place of the program's webview bindings, so a file opened and saved in a browser
   goes through the same C code as in the program: blocks kept byte for byte, line endings, ';'
   marks and Latin-1 files all handled the same way.

   Strings go in and out through the module's memory: the caller writes bytes into a buffer from
   gcw_alloc, and each call returns a buffer it must give back with gcw_free. gcw_len() is the
   length of the last returned buffer. Built by scripts/build-wasm.sh. */
#include "glosscode.h"
#include "gc_util.h"

#include <stdlib.h>
#include <string.h>

#define EXPORT(name) __attribute__((export_name(name)))

static size_t LAST_LEN;

EXPORT("gcw_alloc") void *gcw_alloc(size_t n) { return malloc(n ? n : 1); }
EXPORT("gcw_free") void gcw_free(void *p) { free(p); }
EXPORT("gcw_len") size_t gcw_len(void) { return LAST_LEN; }

static char *done(char *s)
{
    LAST_LEN = s ? strlen(s) : 0;
    return s;
}

/* gc_api_call: method and params are NUL-terminated UTF-8; returns the JSON reply. */
EXPORT("gcw_call") char *gcw_call(const char *method, const char *params, size_t len)
{
    return done(gc_api_call(method, params, len));
}

/* A file's bytes -> { "latin1": bool, "doc": {…parse…}, "text": "…" }, like the program's open. */
EXPORT("gcw_open") char *gcw_open(const char *bytes, size_t len)
{
    int latin1 = !gc_is_utf8(bytes, len);
    char *u = NULL;
    if (latin1) {
        size_t ul;
        u = gc_latin1_to_utf8(bytes, len, &ul);
    } else {
        u = gc_strndup(bytes, len);
    }
    gc_buf p;
    gc_buf_init(&p);
    gc_buf_puts(&p, "{\"text\":");
    gc_buf_json_str(&p, u);
    gc_buf_putc(&p, '}');
    char *doc = gc_api_call("parse", gc_buf_str(&p), p.len);
    gc_buf_free(&p);
    gc_buf b;
    gc_buf_init(&b);
    gc_buf_printf(&b, "{\"latin1\":%s,\"doc\":%s,\"text\":", latin1 ? "true" : "false", doc);
    gc_buf_json_str(&b, u);
    gc_buf_putc(&b, '}');
    free(u);
    free(doc);
    return done(gc_buf_take(&b));
}

/* A document (the serialize parameters) -> the file's bytes, Latin-1 when latin1 is set.
   Returns NULL when the document can't be written; gcw_call("serialize", …) gives the error. */
EXPORT("gcw_save") char *gcw_save(const char *doc_json, size_t len, int latin1)
{
    char *res = gc_api_call("serialize", doc_json, len);
    char err[200];
    gc_json *rj = gc_json_parse(res, strlen(res), err, sizeof err);
    const char *text = gc_json_get_str(rj, "text");
    char *out = NULL;
    size_t n = 0;
    if (text) {
        n = strlen(text);
        out = latin1 ? gc_utf8_to_latin1(text, n, &n) : gc_strndup(text, n);
    }
    gc_json_free(rj);
    free(res);
    LAST_LEN = out ? n : 0;
    return out;
}
