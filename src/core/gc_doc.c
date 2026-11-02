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

char **gc_tokenize(const char *s, size_t len, int *ntok)
{
    char **out = NULL;
    int n = 0, cap = 0;
    size_t i = 0;
    /* A "/" at the start of a block is block delete (/1 to /9 on Fanuc-style controls): its own first word. */
    while (i < len && is_space((unsigned char)s[i])) i++;
    if (i < len && s[i] == '/') {
        size_t end = i + 1;
        if (end < len && gc_is_digit((unsigned char)s[end])) end++;
        push_tok(&out, &n, &cap, gc_strndup(s + i, end - i));
        i = end;
    } else
        i = 0;
    while (i < len) {
        unsigned char ch = (unsigned char)s[i];
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
        if (!gc_is_alpha(ch)) {
            i++;
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
    size_t start = 0;
    int depth = 0, hit = 0, blocks = 0;
    for (size_t i = 0; i < len; i++) {
        char c = s[i];
        if (c == '(') depth++;
        else if (c == ')') depth = depth > 0 ? depth - 1 : 0;
        if (c == ';' && !depth) {
            int nt;
            char **t = gc_tokenize(s + start, i - start, &nt);
            add_line_owned(doc, t, nt, gc_strndup(s + start, i - start));
            blocks++;
            start = i + 1;
            hit = 1;
        }
    }
    if (!blank(s + start, len - start) || !blocks) {
        int nt;
        char **t = gc_tokenize(s + start, len - start, &nt);
        add_line_owned(doc, t, nt, gc_strndup(s + start, len - start));
    }
    return hit;
}

gc_doc *gc_doc_parse(const char *text, size_t len)
{
    gc_doc *doc = gc_doc_new();
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

static int raw_matches(const gc_line *l)
{
    if (!l->raw) return 0;
    int n;
    char **t = gc_tokenize(l->raw, strlen(l->raw), &n);
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
        if (raw_matches(l)) {
            /* Unchanged: keep the text as written (spacing, '%' and macro text the word list
               doesn't hold), less trailing spaces before a ';'. */
            size_t n = strlen(l->raw);
            if (eob)
                while (n && (l->raw[n - 1] == ' ' || l->raw[n - 1] == '\t')) n--;
            gc_buf_putn(&b, l->raw, n);
        } else {
            for (int j = 0; j < l->ntok; j++) {
                if (j && l->tok[j - 1][0] != '/') gc_buf_putc(&b, ' '); /* "/N30", not "/ N30" */
                gc_buf_puts(&b, l->tok[j]);
            }
        }
        /* ';' ends every block that holds a word; blank lines and '%' stay as they are. */
        if (eob && l->ntok) gc_buf_putc(&b, ';');
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
