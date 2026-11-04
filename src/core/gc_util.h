/* Small helpers shared by the core: a growable string buffer and number formatting that matches
   JavaScript's (the mockup is the reference for every string the core produces). Standard C only. */
#ifndef GC_UTIL_H
#define GC_UTIL_H

#include <stddef.h>

typedef struct gc_buf {
    char *s;      /* always NUL-terminated once anything is written */
    size_t len;
    size_t cap;
} gc_buf;

void gc_buf_init(gc_buf *b);
void gc_buf_free(gc_buf *b);
void gc_buf_putn(gc_buf *b, const char *s, size_t n);
void gc_buf_puts(gc_buf *b, const char *s);
void gc_buf_putc(gc_buf *b, char c);
void gc_buf_printf(gc_buf *b, const char *fmt, ...);
/* Writes s as a JSON string literal, quotes included. */
void gc_buf_json_str(gc_buf *b, const char *s);
/* Writes a number the way JavaScript's String(n) does. */
void gc_buf_num(gc_buf *b, double n);
/* Hands over the buffer's string (never NULL) and resets the buffer. */
char *gc_buf_take(gc_buf *b);
const char *gc_buf_str(const gc_buf *b);

char *gc_strdup(const char *s);
char *gc_strndup(const char *s, size_t n);
void *gc_xmalloc(size_t n);
void *gc_xrealloc(void *p, size_t n);
void *gc_xcalloc(size_t n, size_t size);

/* JavaScript's String(n): shortest digits that read back as n, "NaN", "Infinity". */
void gc_js_num(double n, char *out, size_t outsz);
/* JavaScript's n.toFixed(d) for ordinary magnitudes. */
void gc_js_fixed(double n, int digits, char *out, size_t outsz);
/* JavaScript's parseFloat(s): the longest number at the start, NaN when there is none. */
double gc_js_parse_float(const char *s);
/* JavaScript's parseInt(s, 10): optional sign and digits at the start, NaN when there are none. */
double gc_js_parse_int(const char *s);
double gc_nan(void);
int gc_isnan(double x);

int gc_is_digit(int c);
int gc_is_alpha(int c);
int gc_to_upper(int c);
int gc_starts_with(const char *s, const char *prefix);
int gc_ends_with(const char *s, const char *suffix);
/* True when every character of s is a digit and s isn't empty. */
int gc_all_digits(const char *s);
/* /^[A-Z][-+]?[#[]/: a word whose value is a macro variable or expression ("X-#101", "F[#1*2]"). */
int gc_is_var_val(const char *t);
/* A comment: "( … )" (a statement on the Fagor 8055), or "; …" to the end of a Fagor line. syntax is a
   GC_SYN_* value. Mirrors isComment(). */
int gc_is_comment(const char *t, int syntax);
/* CALL, RTS, GOTO and other keywords: two letters first, not an Okuma sequence name (NA1) or a Fagor XP1. Mirrors isKw(). */
int gc_is_kw(const char *t);
/* Macro text kept as one word: "#110=-0.035", "IF [...] GOTO 5", "WHILE [...] DO1", "END1". */
int gc_is_macro_tok(const char *t);

/* A string-to-int map (open addressing), used for N and O labels. */
typedef struct gc_map {
    char **keys;
    int *vals;
    size_t cap;
    size_t count;
} gc_map;

void gc_map_init(gc_map *m);
void gc_map_free(gc_map *m);
/* Adds key only when it isn't there yet (first one wins, like the mockup's labels()). */
void gc_map_add_first(gc_map *m, const char *key, int val);
/* Returns 1 and sets *val when found. */
int gc_map_get(const gc_map *m, const char *key, int *val);

#endif
