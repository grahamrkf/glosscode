#include "gc_util.h"

#include <float.h>
#include <math.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void *gc_xmalloc(size_t n)
{
    void *p = malloc(n ? n : 1);
    if (!p) {
        fputs("glosscode: out of memory\n", stderr);
        abort();
    }
    return p;
}

void *gc_xrealloc(void *p, size_t n)
{
    void *q = realloc(p, n ? n : 1);
    if (!q) {
        fputs("glosscode: out of memory\n", stderr);
        abort();
    }
    return q;
}

void *gc_xcalloc(size_t n, size_t size)
{
    void *p = calloc(n ? n : 1, size ? size : 1);
    if (!p) {
        fputs("glosscode: out of memory\n", stderr);
        abort();
    }
    return p;
}

char *gc_strndup(const char *s, size_t n)
{
    char *d = gc_xmalloc(n + 1);
    memcpy(d, s, n);
    d[n] = '\0';
    return d;
}

char *gc_strdup(const char *s)
{
    return gc_strndup(s, strlen(s));
}

void gc_buf_init(gc_buf *b)
{
    b->s = NULL;
    b->len = 0;
    b->cap = 0;
}

void gc_buf_free(gc_buf *b)
{
    free(b->s);
    gc_buf_init(b);
}

static void buf_grow(gc_buf *b, size_t extra)
{
    if (b->len + extra + 1 <= b->cap) return;
    size_t cap = b->cap ? b->cap : 64;
    while (cap < b->len + extra + 1) cap *= 2;
    b->s = gc_xrealloc(b->s, cap);
    b->cap = cap;
}

void gc_buf_putn(gc_buf *b, const char *s, size_t n)
{
    buf_grow(b, n);
    if (n) memcpy(b->s + b->len, s, n);
    b->len += n;
    b->s[b->len] = '\0';
}

void gc_buf_puts(gc_buf *b, const char *s)
{
    gc_buf_putn(b, s, strlen(s));
}

void gc_buf_putc(gc_buf *b, char c)
{
    gc_buf_putn(b, &c, 1);
}

void gc_buf_printf(gc_buf *b, const char *fmt, ...)
{
    va_list ap;
    va_start(ap, fmt);
    va_list ap2;
    va_copy(ap2, ap);
    int n = vsnprintf(NULL, 0, fmt, ap);
    va_end(ap);
    if (n < 0) {
        va_end(ap2);
        return;
    }
    buf_grow(b, (size_t)n);
    vsnprintf(b->s + b->len, (size_t)n + 1, fmt, ap2);
    va_end(ap2);
    b->len += (size_t)n;
}

void gc_buf_json_str(gc_buf *b, const char *s)
{
    gc_buf_putc(b, '"');
    for (const unsigned char *p = (const unsigned char *)s; *p; p++) {
        switch (*p) {
        case '"': gc_buf_puts(b, "\\\""); break;
        case '\\': gc_buf_puts(b, "\\\\"); break;
        case '\n': gc_buf_puts(b, "\\n"); break;
        case '\r': gc_buf_puts(b, "\\r"); break;
        case '\t': gc_buf_puts(b, "\\t"); break;
        case '\b': gc_buf_puts(b, "\\b"); break;
        case '\f': gc_buf_puts(b, "\\f"); break;
        default:
            if (*p < 0x20) gc_buf_printf(b, "\\u%04x", *p);
            else gc_buf_putc(b, (char)*p);
        }
    }
    gc_buf_putc(b, '"');
}

void gc_buf_num(gc_buf *b, double n)
{
    char tmp[64];
    gc_js_num(n, tmp, sizeof tmp);
    gc_buf_puts(b, tmp);
}

char *gc_buf_take(gc_buf *b)
{
    char *s = b->s ? b->s : gc_strdup("");
    gc_buf_init(b);
    return s;
}

const char *gc_buf_str(const gc_buf *b)
{
    return b->s ? b->s : "";
}

double gc_nan(void)
{
    return NAN;
}

int gc_isnan(double x)
{
    return x != x;
}

void gc_js_num(double n, char *out, size_t outsz)
{
    if (gc_isnan(n)) {
        snprintf(out, outsz, "NaN");
        return;
    }
    if (isinf(n)) {
        snprintf(out, outsz, n < 0 ? "-Infinity" : "Infinity");
        return;
    }
    if (n == 0) {
        snprintf(out, outsz, "0");
        return;
    }
    /* Shortest %e form that reads back as the same double. */
    char e[40];
    int prec;
    for (prec = 0; prec < 17; prec++) {
        snprintf(e, sizeof e, "%.*e", prec, n);
        if (strtod(e, NULL) == n) break;
    }
    /* Split into sign, digits and exponent. */
    const char *p = e;
    int neg = 0;
    if (*p == '-') {
        neg = 1;
        p++;
    }
    char digits[24];
    int nd = 0;
    for (; *p && *p != 'e'; p++)
        if (*p != '.') digits[nd++] = *p;
    digits[nd] = '\0';
    while (nd > 1 && digits[nd - 1] == '0') digits[--nd] = '\0';
    int exp10 = atoi(p + 1); /* value = 0.d1d2... * 10^(exp10+1) */
    int k = exp10 + 1;       /* position of the decimal point after the first k digits */
    char res[64];
    size_t r = 0;
    if (neg) res[r++] = '-';
    if (k >= -5 && k <= 21) {
        if (k <= 0) {
            res[r++] = '0';
            res[r++] = '.';
            for (int i = 0; i < -k; i++) res[r++] = '0';
            for (int i = 0; i < nd; i++) res[r++] = digits[i];
        } else if (k >= nd) {
            for (int i = 0; i < nd; i++) res[r++] = digits[i];
            for (int i = nd; i < k; i++) res[r++] = '0';
        } else {
            for (int i = 0; i < k; i++) res[r++] = digits[i];
            res[r++] = '.';
            for (int i = k; i < nd; i++) res[r++] = digits[i];
        }
        res[r] = '\0';
    } else {
        res[r++] = digits[0];
        if (nd > 1) {
            res[r++] = '.';
            for (int i = 1; i < nd; i++) res[r++] = digits[i];
        }
        res[r] = '\0';
        snprintf(res + r, sizeof res - r, "e%c%d", exp10 < 0 ? '-' : '+', exp10 < 0 ? -exp10 : exp10);
    }
    snprintf(out, outsz, "%s", res);
}

void gc_js_fixed(double n, int digits, char *out, size_t outsz)
{
    if (gc_isnan(n)) {
        snprintf(out, outsz, "NaN");
        return;
    }
    /* JavaScript rounds half away from zero on the exact binary value; printf matches except on exact
       ties, which a nudge of one unit in the last place settles the JavaScript way. */
    double m = n < 0 ? -n : n;
    double nudged = nextafter(m, DBL_MAX);
    char a[64], c[64];
    snprintf(a, sizeof a, "%.*f", digits, m);
    snprintf(c, sizeof c, "%.*f", digits, nudged);
    const char *pick = a;
    if (strcmp(a, c) != 0) {
        /* Only a true tie lands here; check that m sits exactly halfway. */
        double scaled = m * pow(10, digits);
        if (scaled - floor(scaled) == 0.5) pick = c;
    }
    snprintf(out, outsz, "%s%s", n < 0 ? "-" : "", pick);
}

int gc_is_digit(int c)
{
    return c >= '0' && c <= '9';
}

int gc_is_alpha(int c)
{
    return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
}

int gc_to_upper(int c)
{
    return (c >= 'a' && c <= 'z') ? c - 32 : c;
}

double gc_js_parse_float(const char *s)
{
    const char *p = s;
    while (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r' || *p == '\f' || *p == '\v') p++;
    /* Accept [+-]? digits? (. digits?)? ([eE][+-]?digits)?, needing at least one digit. */
    const char *q = p;
    if (*q == '+' || *q == '-') q++;
    if (strncmp(q, "Infinity", 8) == 0) return (*p == '-') ? -INFINITY : INFINITY;
    const char *d0 = q;
    int digits = 0;
    while (gc_is_digit(*q)) {
        q++;
        digits++;
    }
    if (*q == '.') {
        q++;
        while (gc_is_digit(*q)) {
            q++;
            digits++;
        }
    }
    (void)d0;
    if (!digits) return NAN;
    if (*q == 'e' || *q == 'E') {
        const char *e = q + 1;
        if (*e == '+' || *e == '-') e++;
        if (gc_is_digit(*e)) {
            while (gc_is_digit(*e)) e++;
            q = e;
        }
    }
    char tmp[128];
    size_t n = (size_t)(q - p);
    if (n >= sizeof tmp) {
        char *big = gc_strndup(p, n);
        double v = strtod(big, NULL);
        free(big);
        return v;
    }
    memcpy(tmp, p, n);
    tmp[n] = '\0';
    return strtod(tmp, NULL);
}

double gc_js_parse_int(const char *s)
{
    const char *p = s;
    while (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r' || *p == '\f' || *p == '\v') p++;
    int neg = 0;
    if (*p == '+' || *p == '-') {
        neg = *p == '-';
        p++;
    }
    if (!gc_is_digit(*p)) return NAN;
    double v = 0;
    while (gc_is_digit(*p)) v = v * 10 + (*p++ - '0');
    return neg ? -v : v;
}

int gc_starts_with(const char *s, const char *prefix)
{
    return strncmp(s, prefix, strlen(prefix)) == 0;
}

int gc_ends_with(const char *s, const char *suffix)
{
    size_t a = strlen(s), b = strlen(suffix);
    return a >= b && strcmp(s + a - b, suffix) == 0;
}

int gc_is_comment(const char *t)
{
    return t[0] == '(' || (t[0] == ';' && t[1]);
}

int gc_is_kw(const char *t)
{
    if (!gc_is_alpha((unsigned char)t[0]) || !gc_is_alpha((unsigned char)t[1]) || t[0] == 'N') return 0;
    return !(t[1] == 'P' && t[2] && gc_all_digits(t + 2)); /* XP1 is a word whose value is a Fagor parameter */
}

int gc_is_var_val(const char *t)
{
    if (!t || !gc_is_alpha((unsigned char)t[0])) return 0;
    const char *p = t + 1;
    if (*p == '=') return 1;
    if (*p == 'P' && gc_is_digit((unsigned char)p[1])) return 1; /* Fagor: XP1, a parameter */
    if (*p == '-' || *p == '+') {
        p++;
        if (gc_is_alpha((unsigned char)*p)) return 1; /* Okuma: Z-V10 */
    }
    return *p == '#' || *p == '[';
}

int gc_is_macro_tok(const char *t)
{
    if (!t) return 0;
    if (t[0] == '#') return 1;
    if (gc_starts_with(t, "END") && gc_is_digit((unsigned char)t[3])) return 1;
    if (gc_starts_with(t, "GOTO ")) return 1;
    if (t[0] >= 'A' && t[0] <= 'Z') {
        const char *p = t + 1;
        while ((*p >= 'A' && *p <= 'Z') || gc_is_digit((unsigned char)*p)) p++;
        if (p > t + 1 && *p == '=') return 1;
    }
    const char *kw[2] = { "IF", "WHILE" };
    for (int k = 0; k < 2; k++) {
        size_t n = strlen(kw[k]);
        if (!strncmp(t, kw[k], n) && !gc_is_alpha((unsigned char)t[n]) && !gc_is_digit((unsigned char)t[n]) && t[n] != '_') return 1;
    }
    return 0;
}

int gc_all_digits(const char *s)
{
    if (!*s) return 0;
    for (; *s; s++)
        if (!gc_is_digit(*s)) return 0;
    return 1;
}

static size_t hash_str(const char *s)
{
    size_t h = 1469598103934665603ULL & (size_t)-1;
    for (; *s; s++) h = (h ^ (unsigned char)*s) * (size_t)1099511628211ULL;
    return h;
}

void gc_map_init(gc_map *m)
{
    m->keys = NULL;
    m->vals = NULL;
    m->cap = 0;
    m->count = 0;
}

void gc_map_free(gc_map *m)
{
    for (size_t i = 0; i < m->cap; i++) free(m->keys[i]);
    free(m->keys);
    free(m->vals);
    gc_map_init(m);
}

static void map_put_raw(gc_map *m, char *key, int val)
{
    size_t i = hash_str(key) & (m->cap - 1);
    while (m->keys[i]) i = (i + 1) & (m->cap - 1);
    m->keys[i] = key;
    m->vals[i] = val;
    m->count++;
}

void gc_map_add_first(gc_map *m, const char *key, int val)
{
    if (gc_map_get(m, key, NULL)) return;
    if ((m->count + 1) * 2 > m->cap) {
        size_t oldcap = m->cap;
        char **ok = m->keys;
        int *ov = m->vals;
        m->cap = oldcap ? oldcap * 2 : 64;
        m->keys = gc_xcalloc(m->cap, sizeof *m->keys);
        m->vals = gc_xcalloc(m->cap, sizeof *m->vals);
        m->count = 0;
        for (size_t i = 0; i < oldcap; i++)
            if (ok[i]) map_put_raw(m, ok[i], ov[i]);
        free(ok);
        free(ov);
    }
    map_put_raw(m, gc_strdup(key), val);
}

int gc_map_get(const gc_map *m, const char *key, int *val)
{
    if (!m->cap) return 0;
    size_t i = hash_str(key) & (m->cap - 1);
    while (m->keys[i]) {
        if (strcmp(m->keys[i], key) == 0) {
            if (val) *val = m->vals[i];
            return 1;
        }
        i = (i + 1) & (m->cap - 1);
    }
    return 0;
}
