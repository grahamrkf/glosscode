/* The JSON interface the UI calls through the webview. Each method takes a JSON object and returns one.

   parse      { "text": "N10 G00 X1.\r\n…", "syntax"?: "fagor8060" }   (syntax: the dialect's blockSyntax; also on tokenize,
                                                                    serialize and analyze)
              -> { "lines": [ { "tok": ["N10","G00","X1."], "raw": "N10 G00 X1." }, … ],
                   "eob": false, "eol": "\r\n", "finalEol": true }
   serialize  { "lines": [ { "tok": […], "raw": "…" } | ["N10", …], … ], "eob": true, "eol": "\r\n", "finalEol": true }
              -> { "text": "…" }
   analyze    { "lines": […as above…] or "text": "…", "machine": { "type": "mill", "brand": "haas", … },
                "style": "words" | "short" }
              -> { "lines": [ { "cells": [ { "g", "e", "u"?, "d", "unk"?, "imp"?, "cm"? } ], "kind": "feed"|null,
                                "modes": { … } } ],
                   "problems": [ { "line", "id", "sev", "title", "msg", "why" } ],
                   "dialect": { "label": "…", "verified": true } }
   tokenize   { "text": "g1x1." } -> { "tok": ["G1","X1."] }
*/
#include "gc_internal.h"

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

static void kv(gc_buf *b, const char *k, const char *v, int *first)
{
    if (!*first) gc_buf_putc(b, ',');
    *first = 0;
    gc_buf_json_str(b, k);
    gc_buf_putc(b, ':');
    if (v && *v) gc_buf_json_str(b, v);
    else gc_buf_puts(b, "null");
}

static void write_modes(gc_buf *b, const gc_modes *m)
{
    int first = 1;
    gc_buf_putc(b, '{');
    kv(b, "motion", m->motion, &first);
    kv(b, "plane", m->plane, &first);
    kv(b, "units", m->units, &first);
    kv(b, "unitCode", m->unit_code, &first);
    kv(b, "distCode", m->dist_code, &first);
    kv(b, "feed", m->feed_mode, &first);
    kv(b, "feedCode", m->feed_code, &first);
    kv(b, "spin", m->spin_mode, &first);
    kv(b, "spinCode", m->spin_code, &first);
    kv(b, "comp", m->comp, &first);
    kv(b, "tlen", m->tlen, &first);
    kv(b, "wcs", m->wcs, &first);
    kv(b, "spinDir", m->spin_dir, &first);
    kv(b, "cool", m->cool, &first);
    kv(b, "torch", m->torch, &first);
    kv(b, "cycleCode", m->cycle, &first);
    kv(b, "F", m->F, &first);
    kv(b, "S", m->S, &first);
    kv(b, "T", m->T, &first);
    kv(b, "H", m->H, &first);
    gc_buf_printf(b, ",\"tlenOn\":%s,\"pos\":[", m->tlen_on ? "true" : "false");
    for (int i = 0; i < 3; i++) {
        if (i) gc_buf_putc(b, ',');
        if (m->has_pos[i]) gc_buf_num(b, m->pos[i]);
        else gc_buf_puts(b, "null");
    }
    gc_buf_puts(b, "],\"changed\":[");
    static const char *const NAMES[] = { "F", "S", "T", "H", "wcs", "motion", "plane", "unitCode", "distCode",
                                         "feedCode", "spinCode", "comp", "tlen", "cycleCode", "spinDir", "cool", "torch" };
    int n = 0;
    for (unsigned i = 0; i < sizeof NAMES / sizeof *NAMES; i++)
        if (m->changed & (1u << i)) {
            if (n++) gc_buf_putc(b, ',');
            gc_buf_json_str(b, NAMES[i]);
        }
    gc_buf_puts(b, "]}");
}

static void write_analysis(gc_buf *b, const gc_analysis *a)
{
    gc_buf_puts(b, "{\"lines\":[");
    for (int i = 0; i < a->nlines; i++) {
        if (i) gc_buf_putc(b, ',');
        gc_buf_puts(b, "{\"cells\":[");
        for (int k = 0; k < a->ncells[i]; k++) {
            const gc_cell *c = &a->cells[i][k];
            if (k) gc_buf_putc(b, ',');
            gc_buf_puts(b, "{\"g\":");
            gc_buf_json_str(b, c->g);
            gc_buf_puts(b, ",\"e\":");
            gc_buf_json_str(b, c->e);
            if (c->u) {
                gc_buf_puts(b, ",\"u\":");
                gc_buf_json_str(b, c->u);
            }
            gc_buf_puts(b, ",\"d\":");
            gc_buf_json_str(b, c->d);
            if (c->flags & GC_CELL_UNKNOWN) gc_buf_puts(b, ",\"unk\":true");
            if (c->flags & GC_CELL_IMPLIED) gc_buf_puts(b, ",\"imp\":true");
            if (c->flags & GC_CELL_COMMENT) gc_buf_puts(b, ",\"cm\":true");
            gc_buf_putc(b, '}');
        }
        gc_buf_puts(b, "],\"kind\":");
        if (a->kind[i]) gc_buf_json_str(b, a->kind[i]);
        else gc_buf_puts(b, "null");
        gc_buf_puts(b, ",\"modes\":");
        write_modes(b, &a->modes[i]);
        gc_buf_putc(b, '}');
    }
    gc_buf_puts(b, "],\"problems\":[");
    for (int i = 0; i < a->nproblems; i++) {
        const gc_problem *p = &a->problems[i];
        if (i) gc_buf_putc(b, ',');
        gc_buf_printf(b, "{\"line\":%d,\"id\":", p->line);
        gc_buf_json_str(b, p->id);
        gc_buf_puts(b, ",\"sev\":");
        gc_buf_json_str(b, p->sev);
        gc_buf_puts(b, ",\"title\":");
        gc_buf_json_str(b, p->title);
        gc_buf_puts(b, ",\"msg\":");
        gc_buf_json_str(b, p->msg);
        gc_buf_puts(b, ",\"why\":");
        gc_buf_json_str(b, p->why);
        gc_buf_putc(b, '}');
    }
    gc_buf_puts(b, "],\"dialect\":{\"label\":");
    gc_buf_json_str(b, a->dialect_label);
    gc_buf_printf(b, ",\"verified\":%s}}", a->dialect_verified ? "true" : "false");
}

char *gc_api_call(const gc_data *data, const char *method, const char *params_json, size_t params_len)
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
    } else if (!strcmp(method, "analyze")) {
        if (!data) {
            gc_json_free(p);
            return error_json("the dictionary and rules aren't loaded");
        }
        gc_doc *doc = doc_from(p);
        const gc_json *machine = gc_json_get(p, "machine");
        gc_json *empty = NULL;
        if (!gc_json_is_obj(machine)) machine = empty = gc_json_new(GC_JOBJ);
        const char *style = gc_json_get_str(p, "style");
        gc_analysis *a = gc_analyze(data, machine, doc, style && !strcmp(style, "short") ? GC_STYLE_SHORT : GC_STYLE_WORDS);
        write_analysis(&b, a);
        gc_analysis_free(a);
        gc_doc_free(doc);
        gc_json_free(empty);
    } else {
        gc_json_free(p);
        snprintf(err, sizeof err, "unknown method \"%s\"", method);
        return error_json(err);
    }
    gc_json_free(p);
    return gc_buf_take(&b);
}
