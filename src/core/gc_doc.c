/* Reading and writing G-code text: line endings, ';' end-of-block marks, and splitting a block into
   words. Mirrors splitBlocks() and tokenize() in the mockup. */
#include "glosscode.h"
#include "gc_util.h"

#include <stdlib.h>
#include <string.h>

static int is_word_char(int c)
{
    return gc_is_alpha(c) || gc_is_digit(c) || c == '_';
}

static const char *const KEYWORDS[] = { "CALL", "RTS", "GOTO" };

static int is_space(int c)
{
    return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == '\v';
}

/* Spaces go, except one between two letters or digits ("#2 MOD 3"); upper case. */
static char *squeeze(const char *s, size_t len)
{
    char *out = gc_xmalloc(len + 1);
    size_t n = 0, i = 0;
    while (i < len && is_space((unsigned char)s[i])) i++;
    while (len > i && is_space((unsigned char)s[len - 1])) len--;
    for (; i < len; i++) {
        unsigned char ch = (unsigned char)s[i];
        if (is_space(ch)) {
            size_t j = i;
            while (j < len && is_space((unsigned char)s[j])) j++;
            if (n && is_word_char((unsigned char)out[n - 1]) && j < len && is_word_char((unsigned char)s[j])) out[n++] = ' ';
            i = j - 1;
            continue;
        }
        out[n++] = (char)gc_to_upper(ch);
    }
    out[n] = '\0';
    return out;
}

/* Up to a comment, runs of spaces made single, upper case (IF and WHILE statements). */
static char *single_spaced(const char *s, size_t len)
{
    char *out = gc_xmalloc(len + 1);
    size_t n = 0, i = 0;
    while (i < len && is_space((unsigned char)s[i])) i++;
    while (len > i && is_space((unsigned char)s[len - 1])) len--;
    for (; i < len; i++) {
        if (is_space((unsigned char)s[i])) {
            if (n && out[n - 1] != ' ') out[n++] = ' ';
            continue;
        }
        out[n++] = (char)gc_to_upper((unsigned char)s[i]);
    }
    out[n] = '\0';
    return out;
}

/* The end of a [ ] group starting at s[from] (or a '(' that cuts it short). */
static size_t group_end(const char *s, size_t len, size_t from)
{
    int d = 0;
    for (size_t e = from; e < len; e++) {
        if (s[e] == '[') d++;
        else if (s[e] == ']' && --d == 0) return e + 1;
        else if (s[e] == '(') return e;
    }
    return len;
}

/* s[i..] starts with word (any case) and the next character isn't a word character. */
static size_t match_word(const char *s, size_t len, size_t i, const char *word)
{
    size_t kl = strlen(word), j;
    if (i + kl > len) return 0;
    for (j = 0; j < kl; j++)
        if (gc_to_upper((unsigned char)s[i + j]) != word[j]) return 0;
    if (i + kl < len && is_word_char((unsigned char)s[i + kl])) return 0;
    return kl;
}

/* "NAME =" at s[k]: an Okuma variable (or extended address) being set. The length up to and including "=", or 0. */
static size_t assign_at(const char *s, size_t len, size_t k)
{
    if (k >= len || !gc_is_alpha((unsigned char)s[k]) || (k && is_word_char((unsigned char)s[k - 1]))) return 0;
    size_t e = k + 1;
    while (e < len && is_word_char((unsigned char)s[e])) e++;
    if (e - k < 2) return 0;
    while (e < len && is_space((unsigned char)s[e])) e++;
    return e < len && s[e] == '=' && !(e + 1 < len && s[e + 1] == '=') ? e + 1 - k : 0;
}

/* Where an expression starting at s[from] ends: a comment, or an address word (or assignment) outside [ ]
   that follows a complete operand. */
static size_t expr_end(const char *s, size_t len, size_t from)
{
    size_t e = from;
    int d = 0;
    char last = 0;
    while (e < len && s[e] != '(') {
        unsigned char ch = (unsigned char)s[e];
        if (ch == '[') d++;
        else if (ch == ']') d--;
        else if (!d && gc_is_alpha(ch) && (!e || !is_word_char((unsigned char)s[e - 1]) || gc_is_digit((unsigned char)s[e - 1]) || s[e - 1] == '.') &&
                 last && ((is_word_char((unsigned char)last) && last != '_') || last == '.' || last == ']')) {
            size_t k = e + 1;
            while (k < len && is_space((unsigned char)s[k])) k++;
            if ((k < len && (s[k] == '-' || s[k] == '+' || s[k] == '.' || s[k] == '#' || s[k] == '=' || gc_is_digit((unsigned char)s[k]))) ||
                assign_at(s, len, e))
                break;
        }
        if (!is_space(ch)) last = (char)ch;
        e++;
    }
    return e;
}

static void push_tok(char ***out, int *n, int *cap, char *t)
{
    if (*n == *cap) {
        *cap = *cap ? *cap * 2 : 8;
        *out = gc_xrealloc(*out, (size_t)*cap * sizeof **out);
    }
    (*out)[(*n)++] = t;
}

/* Fagor 8060/8065: a statement to the end of the line or a ';' comment. Spaces outside quotes become one,
   letters outside quotes upper case. Sets *end to where it stopped. */
static char *fagor_stmt(const char *s, size_t len, size_t from, size_t *end)
{
    char *o = gc_xmalloc(len - from + 1);
    size_t n = 0, e = from;
    int q = 0;
    for (; e < len; e++) {
        unsigned char ch = (unsigned char)s[e];
        if (ch == '"') q = !q;
        if (!q && ch == ';') break;
        if (!q && is_space(ch)) {
            if (n && o[n - 1] != ' ') o[n++] = ' ';
            continue;
        }
        o[n++] = q ? (char)ch : (char)gc_to_upper(ch);
    }
    if (n && o[n - 1] == ' ') n--;
    o[n] = '\0';
    *end = e;
    return o;
}

int gc_syntax_code(const char *syntax)
{
    if (!syntax) return GC_SYN_NONE;
    if (!strcmp(syntax, "fagor8060")) return GC_SYN_FAGOR8060;
    if (!strcmp(syntax, "fagor8055")) return GC_SYN_FAGOR8055;
    if (!strcmp(syntax, "klartext")) return GC_SYN_KLARTEXT;
    return GC_SYN_NONE;
}

/* Fagor 8055: a statement from '(' to its matching ')': spaces outside quotes made single, letters outside
   quotes upper case. Sets *end to the character after it. */
static char *fagor55_stmt(const char *s, size_t len, size_t from, size_t *end)
{
    char *o = gc_xmalloc(len - from + 1);
    size_t n = 0, e = from;
    int d = 0, q = 0;
    for (; e < len; e++) {
        unsigned char ch = (unsigned char)s[e];
        if (ch == '"') q = !q;
        if (!q) {
            if (ch == '(') d++;
            else if (ch == ')' && --d == 0) {
                o[n++] = ')';
                e++;
                break;
            }
            if (is_space(ch)) {
                if (n && o[n - 1] != ' ') o[n++] = ' ';
                continue;
            }
        }
        o[n++] = q ? (char)ch : (char)gc_to_upper(ch);
    }
    o[n] = '\0';
    if (n >= 2 && o[0] == '(' && o[1] == ' ') {
        memmove(o + 1, o + 2, n - 1);
        n--;
    }
    if (n >= 2 && o[n - 1] == ')' && o[n - 2] == ' ') {
        o[n - 2] = ')';
        o[--n] = '\0';
    }
    if (n && o[n - 1] == ' ') o[--n] = '\0';
    *end = e;
    return o;
}

/* ---------- Heidenhain Klartext (tokKlartext() in the mockup) ---------- */

static int kl_al(int c) { return gc_is_alpha(c) || c == '_'; }
static int kl_tab(int c) { return c == ' ' || c == '\t'; }

/* s[i..] spelled as word in any case: the index after it, or 0 */
static size_t kl_lit(const char *s, size_t len, size_t i, const char *word)
{
    size_t k = strlen(word);
    if (i + k > len) return 0;
    for (size_t j = 0; j < k; j++)
        if (gc_to_upper((unsigned char)s[i + j]) != word[j]) return 0;
    return i + k;
}

/* One or more spaces or tabs at s[i]: the index after them, or 0 */
static size_t kl_gap(const char *s, size_t len, size_t i)
{
    size_t e = i;
    while (e < len && kl_tab((unsigned char)s[e])) e++;
    return e > i ? e : 0;
}

/* A number as \d*\.?\d+ matches it at s[i] (the regex's first match): its length, or 0 */
static size_t kl_num(const char *s, size_t len, size_t i)
{
    size_t d = i;
    while (d < len && gc_is_digit((unsigned char)s[d])) d++;
    if (d + 1 < len && s[d] == '.' && gc_is_digit((unsigned char)s[d + 1])) {
        size_t e = d + 1;
        while (e < len && gc_is_digit((unsigned char)s[e])) e++;
        return e - i;
    }
    return d - i;
}

/* Q[LRS]?\d+ at s[i]: its length, or 0 */
static size_t kl_qpar(const char *s, size_t len, size_t i)
{
    if (i >= len || gc_to_upper((unsigned char)s[i]) != 'Q') return 0;
    size_t k = i + 1;
    if (k < len && strchr("LRS", gc_to_upper((unsigned char)s[k])) && s[k]) {
        size_t e = k + 1;
        while (e < len && gc_is_digit((unsigned char)s[e])) e++;
        if (e > k + 1) return e - i;
    }
    size_t e = k;
    while (e < len && gc_is_digit((unsigned char)s[e])) e++;
    return e > k ? e - i : 0;
}

/* A value: [-+]? and a number or Q parameter, or a sign alone when bare is set. Its length, or 0. */
static size_t kl_val(const char *s, size_t len, size_t i, int bare)
{
    size_t sg = i < len && (s[i] == '-' || s[i] == '+') ? 1 : 0, v = kl_num(s, len, i + sg);
    if (!v) v = kl_qpar(s, len, i + sg);
    if (v) return sg + v;
    return bare ? sg : 0;
}

/* The function at the start of a block (KL_HEAD): the index after it, or 0 */
static size_t kl_head(const char *s, size_t len, size_t i)
{
    size_t k, g;
    if ((k = kl_lit(s, len, i, "TOOL")) && (g = kl_gap(s, len, k)) && ((k = kl_lit(s, len, g, "CALL")) || (k = kl_lit(s, len, g, "DEF")))) {
        if ((g = kl_gap(s, len, k))) { /* the tool: "NAME", QS5, or 5 or 5.2 */
            size_t e = 0;
            if (s[g] == '"') {
                size_t q = g + 1;
                while (q < len && s[q] != '"') q++;
                if (q < len) e = q + 1;
            } else if (gc_to_upper((unsigned char)s[g]) == 'Q' && g + 1 < len && gc_to_upper((unsigned char)s[g + 1]) == 'S' && g + 2 < len && gc_is_digit((unsigned char)s[g + 2])) {
                e = g + 2;
                while (e < len && gc_is_digit((unsigned char)s[e])) e++;
            } else if (gc_is_digit((unsigned char)s[g])) {
                e = g;
                while (e < len && gc_is_digit((unsigned char)s[e])) e++;
                if (e + 1 < len && s[e] == '.' && gc_is_digit((unsigned char)s[e + 1])) {
                    e++;
                    while (e < len && gc_is_digit((unsigned char)s[e])) e++;
                }
            }
            if (e) k = e;
        }
        if ((g = kl_gap(s, len, k)) && strchr("XYZ", gc_to_upper((unsigned char)s[g])) && s[g] &&
            !(g + 1 < len && (is_word_char((unsigned char)s[g + 1]) || s[g + 1] == '+' || s[g + 1] == '-' || s[g + 1] == '.')))
            k = g + 1;
        return k;
    }
    if ((k = kl_lit(s, len, i, "BLK")) && (g = kl_gap(s, len, k)) && (k = kl_lit(s, len, g, "FORM")) && (g = kl_gap(s, len, k))) {
        size_t e, a;
        if ((e = kl_lit(s, len, g, "0.1")) && (a = kl_gap(s, len, e)) && strchr("XYZ", gc_to_upper((unsigned char)s[a])) && s[a]) return a + 1;
        if ((e = kl_lit(s, len, g, "0.2"))) return e;
        if (((e = kl_lit(s, len, g, "CYLINDER")) || (e = kl_lit(s, len, g, "ROTATION"))) && (a = kl_gap(s, len, e)) && strchr("XYZ", gc_to_upper((unsigned char)s[a])) && s[a])
            return a + 1;
        if ((e = kl_lit(s, len, g, "FILE"))) return e;
    }
    if ((k = kl_lit(s, len, i, "CYCL")) && (g = kl_gap(s, len, k)) && (k = kl_lit(s, len, g, "CALL"))) {
        size_t e;
        if ((g = kl_gap(s, len, k)) && ((e = kl_lit(s, len, g, "PAT")) || (e = kl_lit(s, len, g, "POS")))) return e;
        return k;
    }
    if ((k = kl_lit(s, len, i, "PATTERN")) && (g = kl_gap(s, len, k)) && (k = kl_lit(s, len, g, "DEF"))) return k;
    if (((k = kl_lit(s, len, i, "APPR")) || (k = kl_lit(s, len, i, "DEP"))) && (g = kl_gap(s, len, k))) {
        static const char *const A[] = { "LCT", "LT", "LN", "CT" };
        size_t e;
        for (int p = 1; p >= 0; p--) {
            size_t at = g;
            if (p) {
                if (gc_to_upper((unsigned char)s[g]) != 'P') continue;
                at = g + 1;
            }
            for (size_t a = 0; a < sizeof A / sizeof *A; a++)
                if ((e = kl_lit(s, len, at, A[a]))) return e;
        }
    }
    if ((k = kl_lit(s, len, i, "CHF"))) { /* CHF, or CHF 12, not followed by a word character or "." */
        size_t e = k, nl;
        if ((g = kl_gap(s, len, k)) && (nl = kl_num(s, len, g))) e = g + nl;
        if (e > k && (e >= len || !(is_word_char((unsigned char)s[e]) || s[e] == '.'))) return e;
        if (k >= len || !(is_word_char((unsigned char)s[k]) || s[k] == '.')) return k;
    }
    { /* a path function on its own: the whole word must be one of these */
        static const char *const P[] = { "LP", "L", "CC", "CR", "CTP", "CT", "CP", "C", "RND", "FLT", "FL", "FCT", "FC", "FPOL", "STOP" };
        size_t e = i;
        while (e < len && is_word_char((unsigned char)s[e])) e++;
        for (size_t a = 0; a < sizeof P / sizeof *P && e > i; a++)
            if (strlen(P[a]) == e - i && kl_lit(s, len, i, P[a])) return e;
    }
    return 0;
}

/* A statement that runs to a ';' (KL_WHOLE) starts at s[i] */
static int kl_whole(const char *s, size_t len, size_t i)
{
    size_t k, g;
    if ((k = kl_lit(s, len, i, "BEGIN")) && (g = kl_gap(s, len, k)) && kl_lit(s, len, g, "PGM")) return 1;
    if ((k = kl_lit(s, len, i, "END")) && (g = kl_gap(s, len, k)) && kl_lit(s, len, g, "PGM")) return 1;
    if ((k = kl_lit(s, len, i, "CALL")) && (g = kl_gap(s, len, k)) && (kl_lit(s, len, g, "LBL") || kl_lit(s, len, g, "PGM") || kl_lit(s, len, g, "SELECTED"))) return 1;
    if ((k = kl_lit(s, len, i, "LBL")) && (k >= len || !is_word_char((unsigned char)s[k]))) return 1;
    if ((k = kl_lit(s, len, i, "SEL")) && (g = kl_gap(s, len, k)) && g < len && gc_is_alpha((unsigned char)s[g])) return 1;
    if ((k = kl_lit(s, len, i, "FN"))) {
        while (k < len && kl_tab((unsigned char)s[k])) k++;
        size_t d = k;
        while (k < len && gc_is_digit((unsigned char)s[k])) k++;
        if (k > d) {
            while (k < len && kl_tab((unsigned char)s[k])) k++;
            if (k < len && s[k] == ':') return 1;
        }
    }
    if ((k = kl_qpar(s, len, i))) {
        k += i;
        while (k < len && kl_tab((unsigned char)s[k])) k++;
        if (k < len && s[k] == '=') return 1;
    }
    return 0;
}

/* s[from..to): spaces made single and trimmed, letters outside quotes upper case */
static char *kl_norm(const char *s, size_t from, size_t to)
{
    char *o = gc_xmalloc(to - from + 1);
    size_t n = 0;
    int q = 0;
    for (size_t e = from; e < to; e++) {
        unsigned char ch = (unsigned char)s[e];
        if (ch == '"') q = !q;
        if (!q && is_space(ch)) {
            if (n && o[n - 1] != ' ') o[n++] = ' ';
            continue;
        }
        o[n++] = q ? (char)ch : (char)gc_to_upper(ch);
    }
    if (n && o[n - 1] == ' ') n--;
    o[n] = '\0';
    return o;
}

/* The rest of the line from s[i], trailing spaces dropped */
static char *kl_rest(const char *s, size_t len, size_t i)
{
    size_t e = len;
    while (e > i && is_space((unsigned char)s[e - 1])) e--;
    return gc_strndup(s + i, e - i);
}

static char **tok_klartext(const char *s, size_t len, int *ntok)
{
    char **out = NULL;
    int n = 0, cap = 0;
    size_t i = 0, h;
    while (i < len && is_space((unsigned char)s[i])) i++;
    { /* the block number */
        size_t e = i;
        while (e < len && gc_is_digit((unsigned char)s[e])) e++;
        if (e > i && (e == len || is_space((unsigned char)s[e]))) {
            push_tok(&out, &n, &cap, gc_strndup(s + i, e - i));
            i = e;
            while (i < len && is_space((unsigned char)s[i])) i++;
        }
    }
    size_t cd = 0;
    { /* CYCL DEF 200 */
        size_t k, g;
        if ((k = kl_lit(s, len, i, "CYCL")) && (g = kl_gap(s, len, k)) && (k = kl_lit(s, len, g, "DEF")) && (g = kl_gap(s, len, k)) && g < len && gc_is_digit((unsigned char)s[g])) {
            k = g;
            while (k < len && gc_is_digit((unsigned char)s[k])) k++;
            if (k + 1 < len && s[k] == '.' && gc_is_digit((unsigned char)s[k + 1])) {
                k++;
                while (k < len && gc_is_digit((unsigned char)s[k])) k++;
            }
            cd = k;
        }
    }
    h = cd ? 0 : kl_head(s, len, i);
    if (i < len && s[i] == '*') { /* a structure block, as written */
        push_tok(&out, &n, &cap, kl_rest(s, len, i));
        *ntok = n;
        return out;
    }
    if (kl_whole(s, len, i)) { /* to a ';' outside quotes, with a '~' at its end kept apart */
        size_t e = i;
        int q = 0;
        for (; e < len; e++) {
            if (s[e] == '"') q = !q;
            if (!q && s[e] == ';') break;
        }
        char *t = kl_norm(s, i, e);
        size_t tl = strlen(t);
        int cont = tl && t[tl - 1] == '~';
        if (cont) {
            t[--tl] = '\0';
            if (tl && t[tl - 1] == ' ') t[--tl] = '\0';
        }
        if (tl) push_tok(&out, &n, &cap, t);
        else free(t);
        if (cont) push_tok(&out, &n, &cap, gc_strndup("~", 1));
        i = e;
    } else if (cd) { /* the cycle's number and the words of its name (letters, '_', '.', '-', '/') */
        size_t e = cd;
        for (;;) {
            size_t k = e, m;
            while (k < len && is_space((unsigned char)s[k])) k++;
            if (k >= len || !gc_is_alpha((unsigned char)s[k])) break;
            m = k + 1;
            while (m < len && (kl_al((unsigned char)s[m]) || s[m] == '.' || s[m] == '-' || s[m] == '/')) m++;
            if (m < len && !is_space((unsigned char)s[m]) && s[m] != ';' && s[m] != '~') break;
            e = m;
        }
        push_tok(&out, &n, &cap, kl_norm(s, i, e));
        i = e;
    } else if (h) {
        push_tok(&out, &n, &cap, kl_norm(s, i, h));
        i = h;
    }
    while (i < len) {
        unsigned char c = (unsigned char)s[i];
        if (is_space(c)) {
            i++;
            continue;
        }
        if (c == ';') {
            push_tok(&out, &n, &cap, kl_rest(s, len, i));
            break;
        }
        if (c == '~') {
            push_tok(&out, &n, &cap, gc_strndup("~", 1));
            i++;
            continue;
        }
        if (c == '"') {
            size_t e = i + 1;
            while (e < len && s[e] != '"') e++;
            if (e < len) e++;
            push_tok(&out, &n, &cap, gc_strndup(s + i, e - i));
            i = e;
            continue;
        }
        if (kl_al(c)) {
            size_t e = i, d, k0;
            while (e < len && kl_al((unsigned char)s[e])) e++;
            d = e;
            while (d < len && gc_is_digit((unsigned char)s[d])) d++;
            k0 = d;
            while (k0 < len && is_space((unsigned char)s[k0])) k0++;
            if (k0 < len && s[k0] == '(') { /* a pattern point: POS1 ( X+25 Y+33 Z+0 ) */
                static const char *const PT[] = { "POS", "ROW", "PAT", "FRAME", "CIRC", "PITCHCIRC" };
                int hit = 0;
                for (size_t a = 0; a < sizeof PT / sizeof *PT; a++)
                    if (strlen(PT[a]) == e - i && kl_lit(s, len, i, PT[a])) hit = 1;
                if (hit) {
                    size_t k = k0;
                    while (k < len && s[k] != ')') k++;
                    if (k < len) k++;
                    char *t = kl_norm(s, i, k), *p = strchr(t, '(');
                    size_t tl;
                    if (p) { /* " ( " becomes "(" */
                        size_t a = (size_t)(p - t), b = a + 1;
                        if (a && t[a - 1] == ' ') a--;
                        if (t[b] == ' ') b++;
                        t[a] = '(';
                        memmove(t + a + 1, t + b, strlen(t + b) + 1);
                    }
                    tl = strlen(t);
                    if (tl >= 2 && t[tl - 1] == ')' && t[tl - 2] == ' ') {
                        t[tl - 2] = ')';
                        t[tl - 1] = '\0';
                    }
                    push_tok(&out, &n, &cap, t);
                    i = k;
                    continue;
                }
            }
            if (d > e && d < len && (s[d] == '-' || s[d] == '+')) e = d; /* DR2+0.05: a name ending in digits */
            size_t v = kl_val(s, len, e, 1), k = e;
            if (!v) { /* "X +Q10", "LEN 12.5" */
                while (k < len && is_space((unsigned char)s[k])) k++;
                if (k > e) v = kl_val(s, len, k, 0);
                if (!v) k = e;
            }
            char *t = gc_xmalloc(e - i + v + 1);
            memcpy(t, s + i, e - i);
            memcpy(t + (e - i), s + k, v);
            t[e - i + v] = '\0';
            for (char *p = t; *p; p++) *p = (char)gc_to_upper((unsigned char)*p);
            push_tok(&out, &n, &cap, t);
            i = v ? k + v : e;
            continue;
        }
        size_t e = i;
        while (e < len && !is_space((unsigned char)s[e]) && !kl_al((unsigned char)s[e]) && s[e] != ';' && s[e] != '~' && s[e] != '"') e++;
        push_tok(&out, &n, &cap, gc_strndup(s + i, e - i));
        i = e;
    }
    *ntok = n;
    return out;
}

char **gc_tokenize(const char *s, size_t len, int *ntok)
{
    return gc_tokenize_syntax(s, len, NULL, ntok);
}

char **gc_tokenize_syntax(const char *s, size_t len, const char *syntax, int *ntok)
{
    char **out = NULL;
    int n = 0, cap = 0;
    size_t i = 0;
    int syn = gc_syntax_code(syntax);
    if (syn == GC_SYN_KLARTEXT) return tok_klartext(s, len, ntok);
    int fagor = syn == GC_SYN_FAGOR8060, semi = syn == GC_SYN_FAGOR8060 || syn == GC_SYN_FAGOR8055;
    /* A "/" at the start of a block is block delete (/1 to /9 on Fanuc-style controls): its own first word. */
    while (i < len && is_space((unsigned char)s[i])) i++;
    if (i < len && s[i] == '/') {
        size_t end = i + 1;
        if (end < len && gc_is_digit((unsigned char)s[end])) end++;
        push_tok(&out, &n, &cap, gc_strndup(s + i, end - i));
        i = end;
    } else
        i = 0;
    if (fagor) {
        /* A label (N10: or [NAME]) and then a $ or # statement, a %NAME or %L NAME header, or an LL or L call */
        while (i < len && is_space((unsigned char)s[i])) i++;
        if (i < len && (s[i] == 'N' || s[i] == 'n') && i + 1 < len && gc_is_digit((unsigned char)s[i + 1])) {
            size_t e = i + 1;
            while (e < len && gc_is_digit((unsigned char)s[e])) e++;
            if (e < len && s[e] == ':') {
                char *t = gc_strndup(s + i, e + 1 - i);
                t[0] = 'N';
                push_tok(&out, &n, &cap, t);
                i = e + 1;
                while (i < len && is_space((unsigned char)s[i])) i++;
            }
        }
        if (i < len && s[i] == '[') {
            size_t e = i + 1;
            while (e < len && is_word_char((unsigned char)s[e])) e++;
            if (e > i + 1 && e < len && s[e] == ']') {
                char *t = gc_strndup(s + i, e + 1 - i);
                for (char *p = t; *p; p++) *p = (char)gc_to_upper((unsigned char)*p);
                push_tok(&out, &n, &cap, t);
                i = e + 1;
                while (i < len && is_space((unsigned char)s[i])) i++;
            }
        }
        int st = i < len && (s[i] == '#' || s[i] == '$' || s[i] == '%');
        if (!st && i < len && (s[i] == 'L' || s[i] == 'l')) {
            size_t k = i + 1;
            if (k < len && (s[k] == 'L' || s[k] == 'l')) k++;
            size_t sp = k;
            while (k < len && (s[k] == ' ' || s[k] == '\t')) k++;
            st = k > sp && k < len && (gc_is_alpha((unsigned char)s[k]) || s[k] == '_');
        }
        if (st) {
            size_t e;
            char *t = fagor_stmt(s, len, i, &e);
            if (*t) push_tok(&out, &n, &cap, t);
            else free(t);
            i = e;
        }
    }
    if (syn == GC_SYN_FAGOR8055) { /* the "%comment ,MX," header line, as written */
        while (i < len && is_space((unsigned char)s[i])) i++;
        if (i < len && s[i] == '%') {
            size_t e = len;
            while (e > i && is_space((unsigned char)s[e - 1])) e--;
            push_tok(&out, &n, &cap, gc_strndup(s + i, e - i));
            i = len;
        }
    }
    while (i < len) {
        unsigned char ch = (unsigned char)s[i];
        if (ch == '(' && syn == GC_SYN_FAGOR8055) {
            size_t e;
            push_tok(&out, &n, &cap, fagor55_stmt(s, len, i, &e));
            i = e;
            continue;
        }
        if (ch == ';' && semi) { /* a comment to the end of the line */
            size_t e = len;
            while (e > i && is_space((unsigned char)s[e - 1])) e--;
            push_tok(&out, &n, &cap, gc_strndup(s + i, e - i));
            break;
        }
        if (ch == '(') {
            size_t end = i + 1;
            while (end < len && s[end] != ')') end++;
            if (end < len) end++; /* the closing ')' */
            push_tok(&out, &n, &cap, gc_strndup(s + i, end - i));
            i = end;
            continue;
        }
        if (ch == '#') { /* an assignment: up to a comment, or an address word outside [ ] */
            size_t e = expr_end(s, len, i + 1);
            push_tok(&out, &n, &cap, squeeze(s + i, e - i));
            i = e;
            continue;
        }
        if (is_space(ch)) {
            i++;
            continue;
        }
        if (!gc_is_alpha(ch)) { /* "%", ";", stray symbols or numbers: kept as written, one word per run */
            size_t e = i;
            while (e < len && !is_space((unsigned char)s[e]) && !gc_is_alpha((unsigned char)s[e]) && s[e] != '(' && s[e] != '#') e++;
            push_tok(&out, &n, &cap, gc_strndup(s + i, e - i));
            i = e;
            continue;
        }
        if (i == 0 || !is_word_char((unsigned char)s[i - 1])) {
            int stmt = match_word(s, len, i, "IF") || match_word(s, len, i, "WHILE");
            if (!stmt && match_word(s, len, i, "GOTO")) { /* "GOTO 100" (Fanuc) is a statement; "GOTO N90" is two words */
                size_t k = i + 4;
                while (k < len && (s[k] == ' ' || s[k] == '\t')) k++;
                stmt = k < len && (gc_is_digit((unsigned char)s[k]) || s[k] == '#' || s[k] == '[');
            }
            if (stmt) {
                size_t e = i;
                while (e < len && s[e] != '(') e++;
                push_tok(&out, &n, &cap, single_spaced(s + i, e - i));
                i = e;
                continue;
            }
            size_t kl = 0;
            if (i + 3 < len && gc_to_upper((unsigned char)s[i]) == 'E' && gc_to_upper((unsigned char)s[i + 1]) == 'N' &&
                gc_to_upper((unsigned char)s[i + 2]) == 'D' && gc_is_digit((unsigned char)s[i + 3])) {
                size_t e = i + 3;
                while (e < len && gc_is_digit((unsigned char)s[e])) e++;
                if (e == len || !is_word_char((unsigned char)s[e])) kl = e - i;
            }
            for (size_t k = 0; k < sizeof KEYWORDS / sizeof *KEYWORDS && !kl; k++) kl = match_word(s, len, i, KEYWORDS[k]);
            /* Okuma graphic display statements at the start of a block (DEF WORK, PS LC,[..],[..], END, CLEAR, DRAW): one word each */
            if (!kl && (n == 0 || (n == 1 && out[0][0] == '/'))) {
                static const char *const GRAPHIC[] = { "DEF", "PS", "END", "CLEAR", "DRAW" };
                int g = 0;
                for (size_t k = 0; k < sizeof GRAPHIC / sizeof *GRAPHIC && !g; k++) g = match_word(s, len, i, GRAPHIC[k]) > 0;
                if (g) {
                    size_t e = i;
                    while (e < len && s[e] != '(') e++;
                    push_tok(&out, &n, &cap, single_spaced(s + i, e - i));
                    i = e;
                    continue;
                }
            }
            if (kl) {
                char *t = gc_strndup(s + i, kl);
                for (char *p = t; *p; p++) *p = (char)gc_to_upper((unsigned char)*p);
                push_tok(&out, &n, &cap, t);
                i += kl;
                continue;
            }
            size_t as = assign_at(s, len, i);
            if (as) {
                size_t e = expr_end(s, len, i + as);
                push_tok(&out, &n, &cap, squeeze(s + i, e - i));
                i = e;
                continue;
            }
            /* An Okuma sequence name: N, a letter, up to 3 more letters or digits ("NA1") */
            if ((ch == 'N' || ch == 'n') && i + 1 < len && gc_is_alpha((unsigned char)s[i + 1])) {
                size_t e = i + 2;
                while (e < len && e < i + 5 && (gc_is_alpha((unsigned char)s[e]) || gc_is_digit((unsigned char)s[e]))) e++;
                if (e == len || !is_word_char((unsigned char)s[e])) {
                    char *t = gc_strndup(s + i, e - i);
                    for (char *p = t; *p; p++) *p = (char)gc_to_upper((unsigned char)*p);
                    push_tok(&out, &n, &cap, t);
                    i = e;
                    continue;
                }
            }
        }
        /* Fagor: a letter and a parameter (XP1, GP0, FP100) is one word */
        if (semi && i + 2 < len && (s[i + 1] == 'P' || s[i + 1] == 'p') && gc_is_digit((unsigned char)s[i + 2])) {
            size_t e = i + 2;
            while (e < len && gc_is_digit((unsigned char)s[e])) e++;
            char *t = gc_strndup(s + i, e - i);
            for (char *p = t; *p; p++) *p = (char)gc_to_upper((unsigned char)*p);
            push_tok(&out, &n, &cap, t);
            i = e;
            continue;
        }
        /* A letter, then a variable or [expression] (spaces and a sign allowed between), or else a plain number */
        size_t j = i + 1;
        while (j < len && is_space((unsigned char)s[j])) j++;
        if (j < len && s[j] == '=' && !(j + 1 < len && s[j + 1] == '=')) { /* Okuma: X=expression */
            size_t e = expr_end(s, len, j + 1);
            char *v = squeeze(s + j + 1, e - j - 1);
            char *t = gc_xmalloc(strlen(v) + 3);
            t[0] = (char)gc_to_upper(ch);
            t[1] = '=';
            strcpy(t + 2, v);
            free(v);
            push_tok(&out, &n, &cap, t);
            i = e;
            continue;
        }
        char sign = 0;
        if (j < len && (s[j] == '-' || s[j] == '+')) {
            sign = s[j++];
            while (j < len && is_space((unsigned char)s[j])) j++;
        }
        if (sign && j < len && gc_is_alpha((unsigned char)s[j])) { /* Okuma: Z-V10 */
            size_t e = expr_end(s, len, j);
            char *v = squeeze(s + j, e - j);
            char *t = gc_xmalloc(strlen(v) + 3);
            t[0] = (char)gc_to_upper(ch);
            t[1] = sign;
            strcpy(t + 2, v);
            free(v);
            push_tok(&out, &n, &cap, t);
            i = e;
            continue;
        }
        if (j < len && (s[j] == '#' || s[j] == '[')) {
            size_t e = j;
            if (s[e] == '#') {
                e++;
                if (e < len && s[e] == '[') e = group_end(s, len, e);
                else
                    while (e < len && gc_is_digit((unsigned char)s[e])) e++;
            } else
                e = group_end(s, len, e);
            char *v = squeeze(s + j, e - j);
            char *t = gc_xmalloc(strlen(v) + 3);
            size_t k = 0;
            t[k++] = (char)gc_to_upper(ch);
            if (sign) t[k++] = sign;
            strcpy(t + k, v);
            free(v);
            push_tok(&out, &n, &cap, t);
            i = e;
            continue;
        }
        size_t end = i + 1;
        if (end < len && (s[end] == '-' || s[end] == '+')) end++;
        while (end < len && (gc_is_digit((unsigned char)s[end]) || s[end] == '.')) end++;
        char *t = gc_strndup(s + i, end - i);
        for (char *p = t; *p; p++) *p = (char)gc_to_upper((unsigned char)*p);
        push_tok(&out, &n, &cap, t);
        i = end;
    }
    *ntok = n;
    return out;
}

void gc_tokens_free(char **tok, int ntok)
{
    for (int i = 0; i < ntok; i++) free(tok[i]);
    free(tok);
}

gc_doc *gc_doc_new(void)
{
    gc_doc *d = gc_xcalloc(1, sizeof *d);
    strcpy(d->eol, "\r\n");
    d->final_eol = 1;
    return d;
}

static void add_line_owned(gc_doc *doc, char **tok, int ntok, char *raw)
{
    if ((doc->nlines & (doc->nlines - 1)) == 0) {
        size_t cap = doc->nlines ? (size_t)doc->nlines * 2 : 16;
        doc->lines = gc_xrealloc(doc->lines, cap * sizeof *doc->lines);
    }
    gc_line *l = &doc->lines[doc->nlines++];
    l->tok = tok;
    l->ntok = ntok;
    l->raw = raw;
}

void gc_doc_add_line(gc_doc *doc, const char *const *tok, int ntok, const char *raw)
{
    char **copy = ntok ? gc_xmalloc((size_t)ntok * sizeof *copy) : NULL;
    gc_buf b;
    gc_buf_init(&b);
    for (int i = 0; i < ntok; i++) {
        copy[i] = gc_strdup(tok[i]);
        if (i) gc_buf_putc(&b, ' ');
        gc_buf_puts(&b, tok[i]);
    }
    char *r = raw ? gc_strdup(raw) : gc_buf_take(&b);
    gc_buf_free(&b);
    add_line_owned(doc, copy, ntok, r);
}

static int blank(const char *s, size_t n)
{
    for (size_t i = 0; i < n; i++)
        if (!is_space((unsigned char)s[i])) return 0;
    return 1;
}

/* One source line: split on ';' outside comments. Returns 1 if the line had a ';'. */
static int add_source_line(gc_doc *doc, const char *s, size_t len)
{
    if (gc_syntax_code(doc->syntax) != GC_SYN_NONE) { /* Fagor: ';' starts a comment, so it never splits a line */
        int nt;
        char **t = gc_tokenize_syntax(s, len, doc->syntax, &nt);
        add_line_owned(doc, t, nt, gc_strndup(s, len));
        return 0;
    }
    size_t start = 0;
    int depth = 0, hit = 0, blocks = 0;
    for (size_t i = 0; i < len; i++) {
        char c = s[i];
        if (c == '(') depth++;
        else if (c == ')') depth = depth > 0 ? depth - 1 : 0;
        if (c == ';' && !depth) { /* the ';' stays on its block, as written */
            int nt;
            char **t = gc_tokenize_syntax(s + start, i + 1 - start, doc->syntax, &nt);
            add_line_owned(doc, t, nt, gc_strndup(s + start, i + 1 - start));
            blocks++;
            start = i + 1;
            hit = 1;
        }
    }
    if (!blank(s + start, len - start) || !blocks) {
        int nt;
        char **t = gc_tokenize_syntax(s + start, len - start, doc->syntax, &nt);
        add_line_owned(doc, t, nt, gc_strndup(s + start, len - start));
    }
    return hit;
}

gc_doc *gc_doc_parse(const char *text, size_t len)
{
    return gc_doc_parse_syntax(text, len, NULL);
}

gc_doc *gc_doc_parse_syntax(const char *text, size_t len, const char *syntax)
{
    gc_doc *doc = gc_doc_new();
    gc_doc_set_syntax(doc, syntax);
    int found_eol = 0;
    size_t start = 0, i = 0;
    doc->final_eol = 0;
    if (len >= 3 && (unsigned char)text[0] == 0xEF && (unsigned char)text[1] == 0xBB && (unsigned char)text[2] == 0xBF)
        start = i = 3;
    while (i < len) {
        if (text[i] == '\r' || text[i] == '\n') {
            size_t eol = (text[i] == '\r' && i + 1 < len && text[i + 1] == '\n') ? 2 : 1;
            if (!found_eol) {
                memcpy(doc->eol, text + i, eol);
                doc->eol[eol] = '\0';
                found_eol = 1;
            }
            if (add_source_line(doc, text + start, i - start)) doc->eob = 1;
            i += eol;
            start = i;
            if (i == len) doc->final_eol = 1;
            continue;
        }
        i++;
    }
    if (start < len || doc->nlines == 0)
        if (add_source_line(doc, text + start, len - start)) doc->eob = 1;
    if (!found_eol) strcpy(doc->eol, "\r\n");
    return doc;
}

void gc_doc_free(gc_doc *doc)
{
    if (!doc) return;
    for (int i = 0; i < doc->nlines; i++) {
        gc_tokens_free(doc->lines[i].tok, doc->lines[i].ntok);
        free(doc->lines[i].raw);
    }
    free(doc->lines);
    free(doc);
}

void gc_doc_set_syntax(gc_doc *doc, const char *syntax)
{
    size_t n = syntax ? strlen(syntax) : 0;
    if (n >= sizeof doc->syntax) n = 0;
    memcpy(doc->syntax, syntax ? syntax : "", n);
    doc->syntax[n] = '\0';
}

static int raw_matches(const gc_doc *doc, const gc_line *l)
{
    if (!l->raw) return 0;
    int n;
    char **t = gc_tokenize_syntax(l->raw, strlen(l->raw), doc->syntax, &n);
    int same = n == l->ntok;
    for (int i = 0; same && i < n; i++) same = strcmp(t[i], l->tok[i]) == 0;
    gc_tokens_free(t, n);
    return same;
}

char *gc_doc_serialize(const gc_doc *doc, int eob, size_t *len)
{
    gc_buf b;
    gc_buf_init(&b);
    for (int i = 0; i < doc->nlines; i++) {
        const gc_line *l = &doc->lines[i];
        if (raw_matches(doc, l)) {
            /* Unchanged: keep the text as written (spacing, '%' and macro text the word list
               doesn't hold), less trailing spaces before a ';'. */
            size_t n = strlen(l->raw);
            if (eob && !(l->ntok && !strcmp(l->tok[l->ntok - 1], ";")))
                while (n && (l->raw[n - 1] == ' ' || l->raw[n - 1] == '\t')) n--;
            gc_buf_putn(&b, l->raw, n);
        } else {
            for (int j = 0; j < l->ntok; j++) {
                /* "/N30", not "/ N30"; "G00;", not "G00 ;" */
                if (j && l->tok[j - 1][0] != '/' && strcmp(l->tok[j], ";")) gc_buf_putc(&b, ' ');
                gc_buf_puts(&b, l->tok[j]);
            }
        }
        /* ';' ends every block that holds a word and doesn't end with one already; blank lines and '%' stay as they are. */
        if (eob && l->ntok && strcmp(l->tok[l->ntok - 1], ";") && !(l->ntok == 1 && !strcmp(l->tok[0], "%"))) gc_buf_putc(&b, ';');
        if (i < doc->nlines - 1 || doc->final_eol) gc_buf_puts(&b, doc->eol);
    }
    if (len) *len = b.len;
    return gc_buf_take(&b);
}

/* ---------- Text encoding ---------- */

int gc_is_utf8(const char *s, size_t len)
{
    const unsigned char *p = (const unsigned char *)s, *end = p + len;
    while (p < end) {
        unsigned char c = *p;
        size_t n = c < 0x80 ? 1 : (c >> 5) == 6 ? 2 : (c >> 4) == 14 ? 3 : (c >> 3) == 30 ? 4 : 0;
        if (!n || (size_t)(end - p) < n) return 0;
        for (size_t i = 1; i < n; i++)
            if ((p[i] & 0xC0) != 0x80) return 0;
        p += n;
    }
    return 1;
}

char *gc_latin1_to_utf8(const char *s, size_t len, size_t *outlen)
{
    gc_buf b;
    gc_buf_init(&b);
    for (size_t i = 0; i < len; i++) {
        unsigned char c = (unsigned char)s[i];
        if (c < 0x80) {
            gc_buf_putc(&b, (char)c);
        } else {
            char t[2] = { (char)(0xC0 | (c >> 6)), (char)(0x80 | (c & 0x3F)) };
            gc_buf_putn(&b, t, 2);
        }
    }
    if (outlen) *outlen = b.len;
    return gc_buf_take(&b);
}

char *gc_utf8_to_latin1(const char *s, size_t len, size_t *outlen)
{
    gc_buf b;
    gc_buf_init(&b);
    const unsigned char *p = (const unsigned char *)s, *end = p + len;
    while (p < end) {
        if (*p < 0x80) {
            gc_buf_putc(&b, (char)*p++);
        } else if ((*p >> 5) == 6 && p + 1 < end) {
            unsigned cp = ((unsigned)(p[0] & 0x1F) << 6) | (p[1] & 0x3F);
            gc_buf_putc(&b, cp < 0x100 ? (char)cp : '?');
            p += 2;
        } else {
            /* Characters Latin-1 can't hold. */
            size_t n = (*p >> 4) == 14 ? 3 : (*p >> 3) == 30 ? 4 : 1;
            gc_buf_putc(&b, '?');
            p += n;
        }
    }
    if (outlen) *outlen = b.len;
    return gc_buf_take(&b);
}
