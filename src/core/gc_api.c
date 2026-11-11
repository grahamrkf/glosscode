/* The JSON interface the UI calls through the webview. Each method takes a JSON object and returns one.

   parse      { "text": "N10 G00 X1.\r\n…", "syntax"?: "fagor8060" }   (syntax: the dialect's blockSyntax; also on tokenize
                                                                    and serialize)
              -> { "lines": [ { "tok": ["N10","G00","X1."], "raw": "N10 G00 X1." }, … ],
                   "eob": false, "eol": "\r\n", "finalEol": true }
   serialize  { "lines": [ { "tok": […], "raw": "…" } | ["N10", …], … ], "eob": true, "eol": "\r\n", "finalEol": true }
              -> { "text": "…" }
   tokenize   { "text": "g1x1." } -> { "tok": ["G1","X1."] }
*/
#include "glosscode.h"
#include "gc_util.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static char *error_json(const char *msg)
{
    gc_buf b;
    gc_buf_init(&b);
    gc_buf_puts(&b, "{\"error\":");
    gc_buf_json_str(&b, msg);
    gc_buf_putc(&b, '}');
    return gc_buf_take(&b);
}

/* Builds a document from "lines" (objects with tok and raw, or plain arrays of words) or "text". */
static gc_doc *doc_from(const gc_json *p)
{
    const gc_json *lines = gc_json_get(p, "lines");
    if (!gc_json_is_arr(lines)) {
        const char *text = gc_json_get_str(p, "text");
        return gc_doc_parse_syntax(text ? text : "", text ? strlen(text) : 0, gc_json_get_str(p, "syntax"));
    }
    gc_doc *doc = gc_doc_new();
    gc_doc_set_syntax(doc, gc_json_get_str(p, "syntax"));
    for (size_t i = 0; i < lines->n; i++) {
        const gc_json *l = lines->items[i];
        const gc_json *tok = gc_json_is_arr(l) ? l : gc_json_get(l, "tok");
        size_t n = gc_json_len(tok);
        const char **t = gc_xmalloc((n ? n : 1) * sizeof *t);
        size_t k = 0;
        for (size_t j = 0; j < n; j++)
            if (gc_json_str(tok->items[j])) t[k++] = gc_json_str(tok->items[j]);
        gc_doc_add_line(doc, t, (int)k, gc_json_get_str(l, "raw"));
        free(t);
    }
    if (gc_json_get(p, "eob")) doc->eob = gc_json_truthy(gc_json_get(p, "eob"));
    const char *eol = gc_json_get_str(p, "eol");
    if (eol && (!strcmp(eol, "\r\n") || !strcmp(eol, "\n") || !strcmp(eol, "\r"))) strcpy(doc->eol, eol);
    if (gc_json_get(p, "finalEol")) doc->final_eol = gc_json_truthy(gc_json_get(p, "finalEol"));
    return doc;
}

static void write_doc(gc_buf *b, const gc_doc *doc)
{
    gc_buf_puts(b, "{\"lines\":[");
    for (int i = 0; i < doc->nlines; i++) {
        if (i) gc_buf_putc(b, ',');
        gc_buf_puts(b, "{\"tok\":[");
        for (int k = 0; k < doc->lines[i].ntok; k++) {
            if (k) gc_buf_putc(b, ',');
            gc_buf_json_str(b, doc->lines[i].tok[k]);
        }
        gc_buf_puts(b, "],\"raw\":");
        gc_buf_json_str(b, doc->lines[i].raw ? doc->lines[i].raw : "");
        gc_buf_putc(b, '}');
    }
    gc_buf_printf(b, "],\"eob\":%s,\"eol\":", doc->eob ? "true" : "false");
    gc_buf_json_str(b, doc->eol);
    gc_buf_printf(b, ",\"finalEol\":%s}", doc->final_eol ? "true" : "false");
}

char *gc_api_call(const char *method, const char *params_json, size_t params_len)
{
    char err[200];
    gc_json *p = params_len ? gc_json_parse(params_json, params_len, err, sizeof err) : gc_json_new(GC_JOBJ);
    if (!p) return error_json(err);
    if (!gc_json_is_obj(p)) {
        gc_json_free(p);
        return error_json("parameters must be a JSON object");
    }
    gc_buf b;
    gc_buf_init(&b);
    if (!strcmp(method, "parse")) {
        const char *text = gc_json_get_str(p, "text");
        gc_doc *doc = gc_doc_parse_syntax(text ? text : "", text ? strlen(text) : 0, gc_json_get_str(p, "syntax"));
        write_doc(&b, doc);
        gc_doc_free(doc);
    } else if (!strcmp(method, "serialize")) {
        gc_doc *doc = doc_from(p);
        size_t n;
        char *text = gc_doc_serialize(doc, doc->eob, &n);
        gc_buf_puts(&b, "{\"text\":");
        gc_buf_json_str(&b, text);
        gc_buf_putc(&b, '}');
        free(text);
        gc_doc_free(doc);
    } else if (!strcmp(method, "tokenize")) {
        const char *text = gc_json_get_str(p, "text");
        int n;
        char **t = gc_tokenize_syntax(text ? text : "", text ? strlen(text) : 0, gc_json_get_str(p, "syntax"), &n);
        gc_buf_puts(&b, "{\"tok\":[");
        for (int i = 0; i < n; i++) {
            if (i) gc_buf_putc(&b, ',');
            gc_buf_json_str(&b, t[i]);
        }
        gc_buf_puts(&b, "]}");
        gc_tokens_free(t, n);
    } else {
        gc_json_free(p);
        snprintf(err, sizeof err, "unknown method \"%s\"", method);
        return error_json(err);
    }
    gc_json_free(p);
    return gc_buf_take(&b);
}
