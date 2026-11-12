/* The JSON reader and writer declared in gc_json.h: a recursive-descent parser that keeps object keys in
   the order written, and a writer that escapes strings the way JSON.stringify does. */
#include "gc_json.h"
#include "gc_util.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    const char *p, *end;
    char *err;
    size_t errsz;
    int failed;
    int depth;
} parser;

static void fail(parser *ps, const char *msg)
{
    if (ps->failed) return;
    ps->failed = 1;
    if (ps->err && ps->errsz) snprintf(ps->err, ps->errsz, "%s", msg);
}

static void skip_ws(parser *ps)
{
    while (ps->p < ps->end && (*ps->p == ' ' || *ps->p == '\t' || *ps->p == '\n' || *ps->p == '\r')) ps->p++;
}

gc_json *gc_json_new(gc_jtype type)
{
    gc_json *v = gc_xcalloc(1, sizeof *v);
    v->type = type;
    return v;
}

static void put_utf8(gc_buf *b, unsigned long cp)
{
    char t[4];
    if (cp < 0x80) {
        gc_buf_putc(b, (char)cp);
    } else if (cp < 0x800) {
        t[0] = (char)(0xC0 | (cp >> 6));
        t[1] = (char)(0x80 | (cp & 0x3F));
        gc_buf_putn(b, t, 2);
    } else if (cp < 0x10000) {
        t[0] = (char)(0xE0 | (cp >> 12));
        t[1] = (char)(0x80 | ((cp >> 6) & 0x3F));
        t[2] = (char)(0x80 | (cp & 0x3F));
        gc_buf_putn(b, t, 3);
    } else {
        t[0] = (char)(0xF0 | (cp >> 18));
        t[1] = (char)(0x80 | ((cp >> 12) & 0x3F));
        t[2] = (char)(0x80 | ((cp >> 6) & 0x3F));
        t[3] = (char)(0x80 | (cp & 0x3F));
        gc_buf_putn(b, t, 4);
    }
}

static int hex4(parser *ps, unsigned long *out)
{
    unsigned long v = 0;
    for (int i = 0; i < 4; i++) {
        if (ps->p >= ps->end) return 0;
        char c = *ps->p++;
        v <<= 4;
        if (c >= '0' && c <= '9') v |= (unsigned long)(c - '0');
        else if (c >= 'a' && c <= 'f') v |= (unsigned long)(c - 'a' + 10);
        else if (c >= 'A' && c <= 'F') v |= (unsigned long)(c - 'A' + 10);
        else return 0;
    }
    *out = v;
    return 1;
}

static char *parse_string(parser *ps)
{
    gc_buf b;
    gc_buf_init(&b);
    ps->p++; /* opening quote */
    while (ps->p < ps->end && *ps->p != '"') {
        unsigned char c = (unsigned char)*ps->p;
        if (c < 0x20) {
            fail(ps, "control character in a string");
            break;
        }
        if (c != '\\') {
            const char *s = ps->p;
            while (ps->p < ps->end && *ps->p != '"' && *ps->p != '\\' && (unsigned char)*ps->p >= 0x20) ps->p++;
            gc_buf_putn(&b, s, (size_t)(ps->p - s));
            continue;
        }
        ps->p++;
        if (ps->p >= ps->end) break;
        char e = *ps->p++;
        switch (e) {
        case '"': gc_buf_putc(&b, '"'); break;
        case '\\': gc_buf_putc(&b, '\\'); break;
        case '/': gc_buf_putc(&b, '/'); break;
        case 'b': gc_buf_putc(&b, '\b'); break;
        case 'f': gc_buf_putc(&b, '\f'); break;
        case 'n': gc_buf_putc(&b, '\n'); break;
        case 'r': gc_buf_putc(&b, '\r'); break;
        case 't': gc_buf_putc(&b, '\t'); break;
        case 'u': {
            unsigned long cp;
            if (!hex4(ps, &cp)) {
                fail(ps, "bad \\u escape");
                break;
            }
            if (cp >= 0xD800 && cp <= 0xDBFF && ps->end - ps->p >= 6 && ps->p[0] == '\\' && ps->p[1] == 'u') {
                const char *save = ps->p;
                unsigned long lo;
                ps->p += 2;
                if (hex4(ps, &lo) && lo >= 0xDC00 && lo <= 0xDFFF) cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
                else ps->p = save;
            }
            put_utf8(&b, cp);
            break;
        }
        default: fail(ps, "bad escape in a string");
        }
        if (ps->failed) break;
    }
    if (ps->p >= ps->end) fail(ps, "unterminated string");
    else ps->p++; /* closing quote */
    return gc_buf_take(&b);
}

static gc_json *parse_value(parser *ps);

static gc_json *parse_value(parser *ps)
{
    skip_ws(ps);
    if (ps->p >= ps->end) {
        fail(ps, "unexpected end of JSON");
        return NULL;
    }
    if (++ps->depth > 200) {
        fail(ps, "JSON nested too deeply");
        return NULL;
    }
    gc_json *v = NULL;
    char c = *ps->p;
    if (c == '{') {
        v = gc_json_new(GC_JOBJ);
        ps->p++;
        skip_ws(ps);
        if (ps->p < ps->end && *ps->p == '}') {
            ps->p++;
        } else {
            for (;;) {
                skip_ws(ps);
                if (ps->p >= ps->end || *ps->p != '"') {
                    fail(ps, "expected a key");
                    break;
                }
                char *key = parse_string(ps);
                skip_ws(ps);
                if (ps->p >= ps->end || *ps->p != ':') {
                    free(key);
                    fail(ps, "expected ':'");
                    break;
                }
                ps->p++;
                gc_json *item = parse_value(ps);
                if (!item) {
                    free(key);
                    break;
                }
                /* A repeated key replaces the earlier value in place, as JSON.parse does. */
                gc_json_set(v, key, item);
                free(key);
                skip_ws(ps);
                if (ps->p < ps->end && *ps->p == ',') {
                    ps->p++;
                    continue;
                }
                if (ps->p < ps->end && *ps->p == '}') {
                    ps->p++;
                    break;
                }
                fail(ps, "expected ',' or '}'");
                break;
            }
        }
    } else if (c == '[') {
        v = gc_json_new(GC_JARR);
        ps->p++;
        skip_ws(ps);
        if (ps->p < ps->end && *ps->p == ']') {
            ps->p++;
        } else {
            for (;;) {
                gc_json *item = parse_value(ps);
                if (!item) break;
                gc_json_push(v, item);
                skip_ws(ps);
                if (ps->p < ps->end && *ps->p == ',') {
                    ps->p++;
                    continue;
                }
                if (ps->p < ps->end && *ps->p == ']') {
                    ps->p++;
                    break;
                }
                fail(ps, "expected ',' or ']'");
                break;
            }
        }
    } else if (c == '"') {
        v = gc_json_new(GC_JSTR);
        v->str = parse_string(ps);
    } else if (c == 't' && ps->end - ps->p >= 4 && !memcmp(ps->p, "true", 4)) {
        v = gc_json_new(GC_JTRUE);
        ps->p += 4;
    } else if (c == 'f' && ps->end - ps->p >= 5 && !memcmp(ps->p, "false", 5)) {
        v = gc_json_new(GC_JFALSE);
        ps->p += 5;
    } else if (c == 'n' && ps->end - ps->p >= 4 && !memcmp(ps->p, "null", 4)) {
        v = gc_json_new(GC_JNULL);
        ps->p += 4;
    } else if (c == '-' || gc_is_digit(c)) {
        const char *s = ps->p;
        if (*ps->p == '-') ps->p++;
        while (ps->p < ps->end && (gc_is_digit(*ps->p) || *ps->p == '.' || *ps->p == 'e' || *ps->p == 'E' || *ps->p == '+' || *ps->p == '-')) ps->p++;
        char *tmp = gc_strndup(s, (size_t)(ps->p - s));
        char *endp;
        v = gc_json_new(GC_JNUM);
        v->num = strtod(tmp, &endp);
        if (*endp || endp == tmp) fail(ps, "bad number");
        free(tmp);
    } else {
        fail(ps, "unexpected character in JSON");
    }
    ps->depth--;
    if (ps->failed) {
        gc_json_free(v);
        return NULL;
    }
    return v;
}

gc_json *gc_json_parse(const char *text, size_t len, char *err, size_t errsz)
{
    parser ps = { text, text + len, err, errsz, 0, 0 };
    if (err && errsz) err[0] = '\0';
    /* Skip a UTF-8 byte order mark. */
    if (len >= 3 && (unsigned char)text[0] == 0xEF && (unsigned char)text[1] == 0xBB && (unsigned char)text[2] == 0xBF) ps.p += 3;
    gc_json *v = parse_value(&ps);
    if (v) {
        skip_ws(&ps);
        if (ps.p != ps.end) {
            fail(&ps, "extra text after the JSON value");
            gc_json_free(v);
            v = NULL;
        }
    }
    if (!v && err && errsz) {
        size_t at = (size_t)(ps.p - text);
        size_t used = strlen(err);
        snprintf(err + used, errsz - used, " (at byte %lu)", (unsigned long)at);
    }
    return v;
}

void gc_json_free(gc_json *v)
{
    if (!v) return;
    for (size_t i = 0; i < v->n; i++) {
        gc_json_free(v->items[i]);
        if (v->keys) free(v->keys[i]);
    }
    free(v->items);
    free(v->keys);
    free(v->str);
    free(v);
}

gc_json *gc_json_clone(const gc_json *v)
{
    if (!v) return NULL;
    gc_json *c = gc_json_new(v->type);
    c->num = v->num;
    if (v->str) c->str = gc_strdup(v->str);
    for (size_t i = 0; i < v->n; i++) {
        if (v->type == GC_JOBJ) gc_json_set(c, v->keys[i], gc_json_clone(v->items[i]));
        else gc_json_push(c, gc_json_clone(v->items[i]));
    }
    return c;
}

static void grow(gc_json *v)
{
    if (v->n < v->cap) return;
    v->cap = v->cap ? v->cap * 2 : 4;
    v->items = gc_xrealloc(v->items, v->cap * sizeof *v->items);
    if (v->type == GC_JOBJ) v->keys = gc_xrealloc(v->keys, v->cap * sizeof *v->keys);
}

void gc_json_push(gc_json *arr, gc_json *v)
{
    grow(arr);
    arr->items[arr->n++] = v;
}

static long find_key(const gc_json *obj, const char *key)
{
    if (!obj || obj->type != GC_JOBJ) return -1;
    for (size_t i = 0; i < obj->n; i++)
        if (strcmp(obj->keys[i], key) == 0) return (long)i;
    return -1;
}

void gc_json_set(gc_json *obj, const char *key, gc_json *v)
{
    long i = find_key(obj, key);
    if (i >= 0) {
        gc_json_free(obj->items[i]);
        obj->items[i] = v;
        return;
    }
    grow(obj);
    obj->keys[obj->n] = gc_strdup(key);
    obj->items[obj->n++] = v;
}

gc_json *gc_json_get(const gc_json *obj, const char *key)
{
    long i = find_key(obj, key);
    return i < 0 ? NULL : obj->items[i];
}

gc_json *gc_json_at(const gc_json *arr, size_t i)
{
    if (!arr || arr->type != GC_JARR || i >= arr->n) return NULL;
    return arr->items[i];
}

const char *gc_json_str(const gc_json *v)
{
    return (v && v->type == GC_JSTR) ? v->str : NULL;
}

const char *gc_json_get_str(const gc_json *obj, const char *key)
{
    return gc_json_str(gc_json_get(obj, key));
}

int gc_json_is_obj(const gc_json *v)
{
    return v && v->type == GC_JOBJ;
}

int gc_json_is_arr(const gc_json *v)
{
    return v && v->type == GC_JARR;
}

int gc_json_truthy(const gc_json *v)
{
    if (!v) return 0;
    switch (v->type) {
    case GC_JNULL:
    case GC_JFALSE: return 0;
    case GC_JNUM: return v->num != 0 && !gc_isnan(v->num);
    case GC_JSTR: return v->str[0] != '\0';
    default: return 1;
    }
}

size_t gc_json_len(const gc_json *v)
{
    return (v && (v->type == GC_JARR || v->type == GC_JOBJ)) ? v->n : 0;
}

void gc_json_write(gc_buf *b, const gc_json *v)
{
    if (!v) {
        gc_buf_puts(b, "null");
        return;
    }
    switch (v->type) {
    case GC_JNULL: gc_buf_puts(b, "null"); break;
    case GC_JFALSE: gc_buf_puts(b, "false"); break;
    case GC_JTRUE: gc_buf_puts(b, "true"); break;
    case GC_JNUM:
        if (gc_isnan(v->num)) gc_buf_puts(b, "null");
        else gc_buf_num(b, v->num);
        break;
    case GC_JSTR: gc_buf_json_str(b, v->str); break;
    case GC_JARR:
        gc_buf_putc(b, '[');
        for (size_t i = 0; i < v->n; i++) {
            if (i) gc_buf_putc(b, ',');
            gc_json_write(b, v->items[i]);
        }
        gc_buf_putc(b, ']');
        break;
    case GC_JOBJ:
        gc_buf_putc(b, '{');
        for (size_t i = 0; i < v->n; i++) {
            if (i) gc_buf_putc(b, ',');
            gc_buf_json_str(b, v->keys[i]);
            gc_buf_putc(b, ':');
            gc_json_write(b, v->items[i]);
        }
        gc_buf_putc(b, '}');
        break;
    }
}
