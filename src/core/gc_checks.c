/* The Problems panel's checks: one pass in execution order that carries the machine state and reports
   problems by rule id. Messages, titles and severities come from gcode-rules.json; the tables the rules
   read (modal groups, cycles, foreign codes…) come from the dialect. Mirrors checkProgram() in the
   mockup line for line, so the two give the same results (see tests/test_golden.c). */
#include "gc_internal.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* A number that can also be "not set" (JavaScript null). NaN is a set value, as in JavaScript. */
typedef struct {
    int set;
    double v;
} onum;

static onum onull(void)
{
    onum o = { 0, 0 };
    return o;
}

static onum oval(double v)
{
    onum o = { 1, v };
    return o;
}

enum { FEED_NONE = 0, FEED_MIN, FEED_REV, FEED_INV };

typedef struct cstate {
    onum F;
    int Fmode;
    int Fwarned, noFwarned;
    onum S;
    char spin[24];
    int spinWarned;
    char torch[24];
    int torchWarned;
    char motion[24];
    char cycle[24];
    char cycleWords[128];
    int oneShot;
    int inc;
    int feed;
    int inch;
    char plane[24];
    char comp[24];
    onum D, T, pendingT;
    int needTlo;
    char tcLine[64];
    int tloOn;
    int clamp;
    onum pos[3];
} cstate;

typedef struct word_t {
    const char *t;
    char L;
    const char *v;
    double n;
} word_t;

typedef struct vars {
    int n;
    const char *k[10];
    char v[10][320];
} vars;

static void var(vars *vs, const char *k, const char *v)
{
    if (vs->n >= 10) return;
    vs->k[vs->n] = k;
    snprintf(vs->v[vs->n], sizeof vs->v[0], "%s", v ? v : "");
    vs->n++;
}

static void varnum(vars *vs, const char *k, double v)
{
    char s[64];
    gc_js_num(v, s, sizeof s);
    var(vs, k, s);
}

typedef struct checker {
    gc_ctx *c;
    gc_analysis *a;
    int emitting;
    gc_problem *list;
    int n, cap;
    cstate st;
} checker;

static void emit(checker *ck, int li, const char *id, const vars *vs, const char *sev)
{
    if (!ck->emitting) return;
    const gc_json *r = gc_json_get(gc_json_get(ck->c->data->rules, "rules"), id);
    if (!r) return;
    const char *over = gc_json_get_str(gc_json_get(ck->c->machine, "checks"), id);
    if (over && !strcmp(over, "off")) return;
    if (over) sev = over;
    if (!sev) sev = gc_json_get_str(r, "severity");
    const char *tmpl = gc_json_get_str(r, "message");
    gc_buf m;
    gc_buf_init(&m);
    for (const char *p = tmpl ? tmpl : ""; *p;) {
        if (*p == '{') {
            const char *q = p + 1;
            while (gc_is_alpha((unsigned char)*q) || gc_is_digit((unsigned char)*q) || *q == '_') q++;
            if (*q == '}' && q > p + 1) {
                for (int i = 0; vs && i < vs->n; i++)
                    if (strlen(vs->k[i]) == (size_t)(q - p - 1) && !strncmp(vs->k[i], p + 1, (size_t)(q - p - 1))) {
                        gc_buf_puts(&m, vs->v[i]);
                        break;
                    }
                p = q + 1;
                continue;
            }
        }
        gc_buf_putc(&m, *p++);
    }
    if (ck->n == ck->cap) {
        ck->cap = ck->cap ? ck->cap * 2 : 32;
        ck->list = gc_xrealloc(ck->list, (size_t)ck->cap * sizeof *ck->list);
    }
    gc_problem *pr = &ck->list[ck->n++];
    pr->line = li;
    pr->id = gc_strdup(id);
    pr->sev = gc_strdup(sev ? sev : "info");
    const char *title = gc_json_get_str(r, "title"), *why = gc_json_get_str(r, "why");
    pr->title = gc_strdup(title ? title : "");
    pr->why = gc_strdup(why ? why : "");
    pr->msg = gc_buf_take(&m);
    gc_buf_free(&m);
}

static const char *feed_name(int f)
{
    return f == FEED_MIN ? "perMin" : f == FEED_REV ? "perRev" : f == FEED_INV ? "inverse" : "";
}

static const char *feed_code_for(const gc_ctx *c, int f)
{
    return f == FEED_MIN ? c->feed_per_min : f == FEED_REV ? c->feed_per_rev : feed_name(f);
}

static const char *feed_unit_for(int f, int inch)
{
    if (f == FEED_MIN) return inch ? "ipm" : "mmpm";
    if (f == FEED_REV) return inch ? "ipr" : "mmpr";
    return "";
}

/* `${x}` in JavaScript for an array item that may be missing. */
static const char *js_or(const char *s)
{
    return s ? s : "undefined";
}

static void fmt4(double n, char *out, size_t sz)
{
    gc_js_num(round(n * 10000) / 10000, out, sz);
}

/* ---------- One line ---------- */

typedef struct line_t {
    word_t w[256];
    int nw;
    char codes[256][24];
    int nc;
} line_t;

static int has(const line_t *ln, const char *c)
{
    for (int i = 0; i < ln->nc; i++)
        if (!strcmp(ln->codes[i], c)) return 1;
    return 0;
}

static const word_t *get(const line_t *ln, char L)
{
    for (int i = 0; i < ln->nw; i++)
        if (ln->w[i].L == L) return &ln->w[i];
    return NULL;
}

static int count(const line_t *ln, char L)
{
    int n = 0;
    for (int i = 0; i < ln->nw; i++)
        if (ln->w[i].L == L) n++;
    return n;
}

static void join_letter(const line_t *ln, char L, const char *sep, char *out, size_t sz)
{
    gc_buf b;
    gc_buf_init(&b);
    int first = 1;
    for (int i = 0; i < ln->nw; i++)
        if (ln->w[i].L == L) {
            if (!first) gc_buf_puts(&b, sep);
            gc_buf_puts(&b, ln->w[i].t);
            first = 0;
        }
    snprintf(out, sz, "%s", gc_buf_str(&b));
    gc_buf_free(&b);
}

/* Codes on the line found in list, each once, in line order, joined with " and ". Returns how many. */
static int hits_in(const line_t *ln, const gc_json *list, char *out, size_t sz)
{
    int n = 0;
    gc_buf b;
    gc_buf_init(&b);
    for (int i = 0; i < ln->nc; i++) {
        if (!gc_json_has_str(list, ln->codes[i])) continue;
        int dup = 0;
        for (int j = 0; j < i; j++)
            if (!strcmp(ln->codes[j], ln->codes[i])) dup = 1;
        if (dup) continue;
        if (n) gc_buf_puts(&b, " and ");
        gc_buf_puts(&b, ln->codes[i]);
        n++;
    }
    snprintf(out, sz, "%s", gc_buf_str(&b));
    gc_buf_free(&b);
    return n;
}

static int is_motion(const gc_ctx *c, const char *k)
{
    if (!strcmp(k, "G00") || !strcmp(k, "G01") || !strcmp(k, "G02") || !strcmp(k, "G03")) return 1;
    return c->lathe && (!strcmp(k, "G32") || !strcmp(k, "G33"));
}

static int is_arc(const char *m)
{
    return !strcmp(m, "G02") || !strcmp(m, "G03");
}

static int all_digits_signed(const char *v)
{
    if (*v == '-' || *v == '+') v++;
    return gc_all_digits(v);
}

static void check_line(checker *ck, int li)
{
    gc_ctx *c = ck->c;
    const gc_json *D = c->dialect;
    cstate *st = &ck->st;
    const gc_line *l = &c->doc->lines[li];
    int lathe = c->lathe;
    static line_t ln;
    memset(&ln, 0, sizeof ln.nw + sizeof ln.nc);
    ln.nw = ln.nc = 0;
    const char *first_all = NULL;
    for (int i = 0; i < l->ntok; i++) {
        const char *t = l->tok[i];
        if (t[0] == '(' || t[0] == '/') continue;
        if (!first_all) first_all = t;
        if (!(t[0] >= 'A' && t[0] <= 'Z') && t[0] != '#') continue; /* "%", ";" and other text that isn't a word */
        if (gc_is_alpha((unsigned char)t[0]) && gc_is_alpha((unsigned char)t[1]) && t[0] != 'N') continue; /* keyword (not a name like NA1) */
        if (gc_is_macro_tok(t)) continue;
        if (ln.nw >= 256) break;
        word_t *w = &ln.w[ln.nw++];
        w->t = t;
        w->L = t[0];
        w->v = t + 1;
        w->n = gc_js_parse_float(t + 1);
        if (w->L == 'G' || w->L == 'M') gc_pad2(t, ln.codes[ln.nc++], sizeof ln.codes[0]);
    }
    const gc_json *groups = c->groups;
    char nLabel[64];
    if (first_all && first_all[0] == 'N' && gc_is_digit((unsigned char)first_all[1]))
        snprintf(nLabel, sizeof nLabel, "%s", first_all);
    else
        snprintf(nLabel, sizeof nLabel, "line %d", li + 1);
    if (st->oneShot) {
        st->cycle[0] = '\0';
        memset(st->cycleWords, 0, sizeof st->cycleWords);
        st->oneShot = 0;
    }
    vars vs;
    char tmp[320], tmp2[320];
#define V0() (vs.n = 0)

    /* Line grammar */
    for (int i = 0; i < ln.nw; i++)
        if (!*ln.w[i].v) {
            V0();
            char Ls[2] = { ln.w[i].L, 0 };
            var(&vs, "letter", Ls);
            emit(ck, li, "empty-value", &vs, NULL);
        }
    /* Brackets that don't pair up in an expression */
    for (int i = 0; i < l->ntok; i++) {
        const char *t = l->tok[i];
        if (t[0] == '(' || t[0] == '/') continue;
        int o = 0, cl = 0;
        for (const char *q = t; *q; q++) o += *q == '[', cl += *q == ']';
        if (o == cl) continue;
        char so[16], sc[16];
        snprintf(so, sizeof so, "%d", o);
        snprintf(sc, sizeof sc, "%d", cl);
        V0();
        var(&vs, "word", t);
        var(&vs, "open", so);
        var(&vs, "close", sc);
        emit(ck, li, "unbalanced-brackets", &vs, NULL);
    }
    /* N words after the first name lines to jump to (GOTO N90, G85 NA1) */
    for (int i = 0, k = 0, pk = -1; i < l->ntok; pk = (l->tok[i][0] == '(' || l->tok[i][0] == '/') ? pk : i, i++) {
        const char *t = l->tok[i];
        if (t[0] == '(' || t[0] == '/') continue;
        if (k++ == 0 || t[0] != 'N') continue;
        char key[64];
        if (t[1] && gc_all_digits(t + 1)) {
            char n[32];
            gc_js_num(gc_js_parse_int(t + 1), n, sizeof n);
            snprintf(key, sizeof key, "N%s", n);
        } else
            snprintf(key, sizeof key, "%s", t);
        if (gc_map_get(&c->labels, key, NULL)) continue;
        V0();
        snprintf(tmp2, sizeof tmp2, "%s %s", l->tok[pk], t);
        var(&vs, "word", tmp2);
        var(&vs, "label", t);
        emit(ck, li, "missing-label", &vs, NULL);
    }
    for (int i = 0; i < ln.nw; i++) {
        char L = ln.w[i].L;
        int firstOcc = 1;
        for (int j = 0; j < i; j++)
            if (ln.w[j].L == L) firstOcc = 0;
        if (!firstOcc || L == 'G' || L == 'M' || L == 'N') continue;
        int n = count(&ln, L);
        if (n <= 1) continue;
        V0();
        char Ls[2] = { L, 0 };
        var(&vs, "letter", Ls);
        if (n == 2) var(&vs, "count", "twice");
        else {
            snprintf(tmp, sizeof tmp, "%d times", n);
            var(&vs, "count", tmp);
        }
        join_letter(&ln, L, ", ", tmp, sizeof tmp);
        var(&vs, "words", tmp);
        emit(ck, li, "dup-address", &vs, NULL);
    }
    const gc_json *mpb = gc_json_get(D, "mPerBlock");
    if (gc_json_truthy(mpb) && mpb->type == GC_JNUM && count(&ln, 'M') > mpb->num) {
        V0();
        varnum(&vs, "max", mpb->num);
        varnum(&vs, "count", count(&ln, 'M'));
        join_letter(&ln, 'M', ", ", tmp, sizeof tmp);
        var(&vs, "words", tmp);
        emit(ck, li, "m-per-block", &vs, NULL);
    }
    for (size_t g = 0; g < gc_json_len(groups); g++) {
        if (hits_in(&ln, groups->items[g], tmp, sizeof tmp) > 1) {
            V0();
            var(&vs, "codes", tmp);
            var(&vs, "group", groups->keys[g]);
            emit(ck, li, "modal-group-clash", &vs, NULL);
        }
    }
    const gc_json *mconf = gc_json_get(D, "mConflicts");
    for (size_t g = 0; g < gc_json_len(mconf); g++) {
        if (hits_in(&ln, mconf->items[g], tmp, sizeof tmp) > 1) {
            V0();
            var(&vs, "codes", tmp);
            emit(ck, li, "m-conflict", &vs, NULL);
        }
    }
    const gc_json *foreign = gc_json_get(D, "foreign");
    for (int i = 0; i < ln.nc; i++) {
        int dup = 0;
        for (int j = 0; j < i; j++)
            if (!strcmp(ln.codes[j], ln.codes[i])) dup = 1;
        if (dup) continue;
        const gc_json *f = gc_json_get(foreign, ln.codes[i]);
        if (!gc_json_truthy(f)) continue;
        V0();
        var(&vs, "text", gc_json_get_str(f, "text") ? gc_json_get_str(f, "text") : "undefined");
        emit(ck, li, "foreign-code", &vs, gc_json_get_str(f, "severity"));
    }

    /* Modes set on this line */
    {
        const gc_json *uc = gc_json_get(D, "unitCodes");
        const char *ui = "G20", *um = "G21";
        int on = 1;
        if (uc) {
            on = gc_json_truthy(uc);
            ui = gc_json_get_str(uc, "inch");
            um = gc_json_get_str(uc, "mm");
        }
        if (on && ui && has(&ln, ui)) st->inch = 1;
        if (on && um && has(&ln, um)) st->inch = 0;
    }
    const gc_json *cycles = c->cycles;
    const char *cycCode = NULL;
    for (int i = 0; i < ln.nc && !cycCode; i++)
        if (gc_json_get(cycles, ln.codes[i])) cycCode = ln.codes[i];
    const gc_json *def = cycCode ? gc_json_get(cycles, cycCode) : NULL;
    const gc_json *lblWords = gc_json_get(def, "labels");
    const gc_json *nums = gc_json_get(D, "numbers");
    const char *nd = gc_json_get_str(nums, "noDecimal");
    if (nd && !strcmp(nd, "leastIncrement")) {
        const gc_json *nwords = gc_json_get(nums, "words");
        for (int i = 0; i < ln.nw; i++) {
            const word_t *w = &ln.w[i];
            char Ls[2] = { w->L, 0 };
            if (!gc_json_has_str(nwords, Ls) || gc_json_has_str(lblWords, Ls) || !all_digits_signed(w->v)) continue;
            if (gc_js_parse_int(w->v) == 0) continue;
            const char *body = w->v[0] == '+' ? w->v + 1 : w->v;
            const gc_json *inc = gc_json_get(gc_json_get(nums, "increment"), st->inch ? "inch" : "mm");
            V0();
            var(&vs, "word", w->t);
            var(&vs, "letter", Ls);
            gc_js_fixed(gc_js_parse_int(body) * (inc && inc->type == GC_JNUM ? inc->num : gc_nan()), st->inch ? 4 : 3, tmp, sizeof tmp);
            var(&vs, "value", tmp);
            var(&vs, "unit", st->inch ? "in" : "mm");
            snprintf(tmp, sizeof tmp, "%s.", body);
            var(&vs, "intended", tmp);
            var(&vs, "amount", body);
            emit(ck, li, "missing-decimal", &vs, NULL);
        }
    }
    for (int i = 0; i < ln.nc; i++) {
        const char *k = ln.codes[i];
        if (gc_json_has_str(gc_json_get(groups, "distance"), k)) st->inc = !strcmp(k, "G91");
        if (!gc_json_get(cycles, k)) {
            if (!strcmp(k, c->feed_per_min)) st->feed = FEED_MIN;
            if (!strcmp(k, c->feed_per_rev)) st->feed = FEED_REV;
            if (!strcmp(k, "G93")) st->feed = FEED_INV;
        }
        if (!strcmp(k, "G17") || !strcmp(k, "G18") || !strcmp(k, "G19")) snprintf(st->plane, sizeof st->plane, "%s", k);
    }
    const gc_json *sc = gc_json_get(D, "speedClamp");
    const word_t *clampLine = NULL;
    if (lathe && gc_json_truthy(sc)) {
        const char *code = gc_json_get_str(sc, "code"), *wl = gc_json_get_str(sc, "word");
        if (code && has(&ln, code) && wl) clampLine = get(&ln, wl[0]);
    }
    if (clampLine) st->clamp = 1;
    if (has(&ln, "G96") && lathe && gc_json_truthy(sc) && !st->clamp) emit(ck, li, "css-no-clamp", NULL, NULL);
    const word_t *fW = get(&ln, 'F'), *sW = get(&ln, 'S');
    const gc_json *leadCodes = gc_json_get(D, "leadCodes");
    int leadHit = 0;
    for (size_t i = 0; i < gc_json_len(leadCodes); i++) {
        const char *lc = gc_json_str(leadCodes->items[i]);
        if (lc && (has(&ln, lc) || (!cycCode && !strcmp(st->motion, lc)))) leadHit = 1;
    }
    const gc_json *dwellWords = gc_json_get(D, "dwellWords");
    if (fW && !gc_json_truthy(gc_json_get(def, "leadF")) && !leadHit && !(has(&ln, "G04") && gc_json_has_str(dwellWords, "F"))) {
        st->F = oval(fW->n);
        st->Fmode = st->feed;
        st->Fwarned = st->noFwarned = 0;
        const gc_json *lim = gc_json_get(gc_json_get(gc_json_get(D, "feedPlausible"), feed_name(st->feed)), st->inch ? "inch" : "mm");
        if (lim && lim->type == GC_JNUM && fW->n > 0) {
            const char *u = feed_unit_for(st->feed, st->inch);
            gc_num f;
            gc_fmt_num(c, 'F', fW->v, st->inch, &f);
            if (st->feed == FEED_REV && fW->n > lim->num) {
                V0();
                var(&vs, "f", f.v);
                var(&vs, "unit", u);
                var(&vs, "size", "large for a per-rev feed");
                snprintf(tmp, sizeof tmp, "%s (feed per rev)", c->feed_per_rev);
                var(&vs, "mode", tmp);
                emit(ck, li, "feed-plausibility", &vs, NULL);
            }
            if (st->feed == FEED_MIN && fW->n < lim->num) {
                V0();
                var(&vs, "f", f.v);
                var(&vs, "unit", u);
                var(&vs, "size", "small for a per-minute feed");
                snprintf(tmp, sizeof tmp, "%s (feed per minute)", c->feed_per_min);
                var(&vs, "mode", tmp);
                emit(ck, li, "feed-plausibility", &vs, NULL);
            }
        }
    }
    if (sW && !clampLine) st->S = oval(sW->n);
    if (get(&ln, 'D')) st->D = oval(get(&ln, 'D')->n);
    const word_t *tW = get(&ln, 'T');
    if (tW) {
        double n;
        if (lathe) {
            char two[3] = { 0 };
            strncpy(two, tW->v, 2);
            n = gc_js_parse_int(two);
        } else {
            n = gc_js_parse_int(tW->v);
        }
        st->pendingT = oval(n);
        if (lathe) st->T = oval(n);
    }

    /* Tool change and program end with things left on */
    const char *toolChange = gc_json_get_str(D, "toolChange");
    if (!lathe && toolChange && *toolChange && has(&ln, toolChange)) {
        if (st->cycle[0] && !has(&ln, "G80")) {
            V0();
            var(&vs, "cycle", st->cycle);
            var(&vs, "event", "tool change");
            emit(ck, li, "cycle-left-on", &vs, NULL);
        }
        if (strcmp(st->comp, "G40") != 0 && !has(&ln, "G40")) {
            V0();
            var(&vs, "comp", st->comp);
            var(&vs, "event", "tool change");
            emit(ck, li, "comp-left-on", &vs, NULL);
        }
        st->T = st->pendingT;
        st->needTlo = 1;
        st->tloOn = 0;
        snprintf(st->tcLine, sizeof st->tcLine, "%s", nLabel);
    }
    if (gc_is_end(l)) {
        if (st->cycle[0] && !has(&ln, "G80")) {
            V0();
            var(&vs, "cycle", st->cycle);
            var(&vs, "event", "program end");
            emit(ck, li, "cycle-left-on", &vs, NULL);
        }
        if (strcmp(st->comp, "G40") != 0 && !has(&ln, "G40")) {
            V0();
            var(&vs, "comp", st->comp);
            var(&vs, "event", "program end");
            emit(ck, li, "comp-left-on", &vs, NULL);
        }
    }

    /* Spindle, or the torch on a plasma table. A torch with known cut on and off codes takes the
       spindle checks' place; one with none (Tormach) has no torch checks. */
    const gc_json *P = c->process;
    const gc_json *Pon = gc_json_get(P, "on"), *Poff = gc_json_get(P, "off");
    int torchKnown = P && gc_json_len(Pon) > 0;
    if (P) {
        for (int i = 0; torchKnown && i < ln.nc; i++)
            if (gc_json_has_str(Pon, ln.codes[i]) || gc_json_has_str(Poff, ln.codes[i])) {
                snprintf(st->torch, sizeof st->torch, "%s", ln.codes[i]);
                st->torchWarned = 0;
            }
        if (torchKnown && gc_is_end(l) && gc_json_has_str(Pon, st->torch)) {
            V0();
            var(&vs, "code", st->torch);
            var(&vs, "off", js_or(gc_json_str(gc_json_at(Poff, 0))));
            emit(ck, li, "torch-on-at-end", &vs, NULL);
        }
    } else for (int i = 0; i < ln.nc; i++) {
        const char *k = ln.codes[i];
        if (!strcmp(k, "M03") || !strcmp(k, "M04")) {
            if (!st->S.set) {
                V0();
                var(&vs, "code", k);
                emit(ck, li, "no-speed", &vs, NULL);
            }
            snprintf(st->spin, sizeof st->spin, "%s", k);
            st->spinWarned = 0;
        }
        if (!strcmp(k, "M05")) {
            strcpy(st->spin, "M05");
            st->spinWarned = 0;
        }
    }

    /* Tool length offset */
    const gc_json *tl = gc_json_get(D, "toolLength");
    if (gc_json_truthy(tl))
        for (int i = 0; i < ln.nc; i++) {
            if (!gc_json_has_str(gc_json_get(groups, "tool length"), ln.codes[i])) continue;
            st->tloOn = gc_json_has_str(gc_json_get(tl, "on"), ln.codes[i]);
            if (st->tloOn) {
                st->needTlo = 0;
                const char *hw = gc_json_get_str(tl, "word");
                const word_t *h = hw ? get(&ln, hw[0]) : NULL;
                if (h && !gc_is_var_val(h->t) && st->T.set) {
                    double hv = gc_js_parse_int(h->v);
                    if (!(hv == st->T.v)) {
                        V0();
                        var(&vs, "h", h->t);
                        char tn[64];
                        gc_js_num(st->T.v, tn, sizeof tn);
                        snprintf(tmp, sizeof tmp, "T%s", tn);
                        var(&vs, "t", tmp);
                        emit(ck, li, "tlo-h-mismatch", &vs, NULL);
                    }
                }
            }
        }

    /* Cutter comp */
    const char *compNew = NULL;
    for (int i = 0; i < ln.nc && !compNew; i++)
        if (!strcmp(ln.codes[i], "G41") || !strcmp(ln.codes[i], "G42")) compNew = ln.codes[i];
    if (has(&ln, "G40")) strcpy(st->comp, "G40");
    if (compNew) {
        snprintf(st->comp, sizeof st->comp, "%s", compNew);
        if (!lathe && !get(&ln, 'D') && !st->D.set) {
            V0();
            var(&vs, "code", compNew);
            emit(ck, li, "comp-no-d", &vs, NULL);
        }
    }

    /* Motion and canned cycles */
    const char *mc = NULL;
    for (int i = 0; i < ln.nc; i++)
        if (is_motion(c, ln.codes[i])) mc = ln.codes[i];
    if (has(&ln, "G80") && !(lathe && c->okuma)) {
        st->cycle[0] = '\0';
        memset(st->cycleWords, 0, sizeof st->cycleWords);
    }
    if (mc) {
        snprintf(st->motion, sizeof st->motion, "%s", mc);
        if (st->cycle[0] && !cycCode) {
            st->cycle[0] = '\0';
            memset(st->cycleWords, 0, sizeof st->cycleWords);
        }
    }
    const gc_json *modal = gc_json_get(def, "modal");
    int notModal = modal && modal->type == GC_JFALSE;
    if (cycCode) {
        if (!st->cycle[0] || notModal) memset(st->cycleWords, 0, sizeof st->cycleWords);
        snprintf(st->cycle, sizeof st->cycle, "%s", cycCode);
        st->oneShot = notModal;
    }
    if (st->cycle[0])
        for (int i = 0; i < ln.nw; i++)
            if (!strchr("GMN", ln.w[i].L)) st->cycleWords[(unsigned char)ln.w[i].L & 127] = 1;
    if (cycCode) {
        const char *name = gc_json_get_str(def, "name");
        if (!name) name = "undefined";
        const gc_json *mean = gc_json_get(D, "wordMeaning");
        const gc_json *req = gc_json_get(def, "requires");
        for (size_t i = 0; i < gc_json_len(req); i++) {
            const char *r = gc_json_str(req->items[i]);
            if (!r) continue;
            if (st->cycleWords[(unsigned char)r[0] & 127]) continue;
            if (!strcmp(r, "F") && !gc_json_truthy(gc_json_get(def, "leadF")) && st->F.set) continue;
            const char *meaning = gc_json_get_str(gc_json_get(def, "meaning"), r);
            if (!meaning || !*meaning) meaning = gc_json_get_str(mean, r);
            if (!meaning || !*meaning) meaning = "required";
            V0();
            var(&vs, "cycle", cycCode);
            var(&vs, "name", name);
            var(&vs, "word", r);
            var(&vs, "meaning", meaning);
            emit(ck, li, "cycle-missing-word", &vs, NULL);
        }
        const gc_json *choices = gc_json_get(def, "choices");
        if (gc_json_truthy(choices)) {
            int any = 0;
            for (size_t i = 0; i < gc_json_len(choices); i++)
                for (size_t j = 0; j < gc_json_len(choices->items[i]); j++) {
                    const char *s = gc_json_str(choices->items[i]->items[j]);
                    if (s && st->cycleWords[(unsigned char)s[0] & 127]) any = 1;
                }
            if (!any) {
                gc_buf b;
                gc_buf_init(&b);
                for (size_t i = 0; i < gc_json_len(choices); i++) {
                    if (i) gc_buf_puts(&b, " or ");
                    for (size_t j = 0; j < gc_json_len(choices->items[i]); j++) {
                        if (j) gc_buf_puts(&b, ", ");
                        gc_buf_puts(&b, js_or(gc_json_str(choices->items[i]->items[j])));
                    }
                }
                V0();
                var(&vs, "cycle", cycCode);
                var(&vs, "name", name);
                var(&vs, "choices", gc_buf_str(&b));
                gc_buf_free(&b);
                emit(ck, li, "cycle-missing-choice", &vs, NULL);
            }
        }
        for (int i = 0; i < ln.nw; i++) {
            char Ls[2] = { ln.w[i].L, 0 };
            int ok = strchr("NGMSTHDO", Ls[0]) != NULL || gc_json_has_str(req, Ls) ||
                     gc_json_has_str(gc_json_get(def, "optional"), Ls) || (Ls[0] == 'F' && gc_json_truthy(gc_json_get(def, "feed")));
            for (size_t j = 0; !ok && j < gc_json_len(choices); j++)
                if (gc_json_has_str(choices->items[j], Ls)) ok = 1;
            if (ok) continue;
            V0();
            var(&vs, "cycle", cycCode);
            var(&vs, "name", name);
            var(&vs, "word", ln.w[i].t);
            emit(ck, li, "cycle-stray-word", &vs, NULL);
        }
        for (size_t i = 0; i < gc_json_len(lblWords); i++) {
            const char *lw = gc_json_str(lblWords->items[i]);
            const word_t *w = lw ? get(&ln, lw[0]) : NULL;
            if (!w || gc_is_var_val(w->t)) continue;
            char n[64];
            gc_js_num(gc_js_parse_int(w->v), n, sizeof n);
            snprintf(tmp, sizeof tmp, "N%s", n);
            if (gc_map_get(&c->labels, tmp, NULL)) continue;
            V0();
            var(&vs, "word", w->t);
            var(&vs, "label", tmp);
            emit(ck, li, "missing-label", &vs, NULL);
        }
        if (gc_json_truthy(gc_json_get(def, "speed")) && !st->S.set) {
            V0();
            snprintf(tmp, sizeof tmp, "%s (", cycCode);
            size_t at = strlen(tmp);
            for (const char *p = name; *p && at < sizeof tmp - 2; p++)
                tmp[at++] = (char)((*p >= 'A' && *p <= 'Z') ? *p + 32 : *p);
            tmp[at++] = ')';
            tmp[at] = '\0';
            var(&vs, "code", tmp);
            emit(ck, li, "no-speed", &vs, NULL);
        }
    }
    const gc_json *subCalls = gc_json_get(D, "subCalls");
    for (size_t i = 0; i < gc_json_len(subCalls); i++) {
        const gc_json *s = subCalls->items[i];
        const char *target = gc_json_get_str(s, "target");
        if (!target || strcmp(target, "label") != 0 || !has(&ln, subCalls->keys[i])) continue;
        const char *sw = gc_json_get_str(s, "word");
        const word_t *w = sw ? get(&ln, sw[0]) : NULL;
        if (!w || gc_is_var_val(w->t)) continue;
        char n[64];
        gc_js_num(gc_js_parse_int(w->v), n, sizeof n);
        snprintf(tmp, sizeof tmp, "N%s", n);
        if (gc_map_get(&c->labels, tmp, NULL)) continue;
        V0();
        snprintf(tmp2, sizeof tmp2, "%s %s", subCalls->keys[i], w->t);
        var(&vs, "word", tmp2);
        var(&vs, "label", tmp);
        emit(ck, li, "missing-label", &vs, NULL);
    }
    if (has(&ln, "G04")) {
        int any = 0;
        if (dwellWords) {
            for (size_t i = 0; i < gc_json_len(dwellWords); i++) {
                const char *s = gc_json_str(dwellWords->items[i]);
                if (s && get(&ln, s[0])) any = 1;
            }
        } else {
            any = get(&ln, 'P') != NULL;
        }
        if (!any) {
            gc_buf b;
            gc_buf_init(&b);
            if (dwellWords)
                for (size_t i = 0; i < gc_json_len(dwellWords); i++) {
                    if (i) gc_buf_puts(&b, " or ");
                    gc_buf_puts(&b, js_or(gc_json_str(dwellWords->items[i])));
                }
            else
                gc_buf_puts(&b, "P");
            V0();
            var(&vs, "words", gc_buf_str(&b));
            gc_buf_free(&b);
            emit(ck, li, "dwell-no-time", &vs, NULL);
        }
        const char *dnd = gc_json_get_str(D, "dwellNoDecimal");
        const word_t *p = get(&ln, 'P');
        if (dnd && !strcmp(dnd, "ms") && p && *p->v && !strchr(p->v, '.')) {
            double ms = fabs(gc_js_parse_int(p->v));
            V0();
            var(&vs, "word", p->t);
            varnum(&vs, "ms", ms);
            fmt4(ms / 1000, tmp, sizeof tmp);
            var(&vs, "sec", tmp);
            emit(ck, li, "dwell-milliseconds", &vs, NULL);
        }
    }
    if (has(&ln, "G28") && !gc_json_truthy(gc_json_get(foreign, "G28")) &&
        gc_json_has_str(gc_json_get(groups, "distance"), "G90") && !st->inc) {
        gc_buf axes, zeros;
        gc_buf_init(&axes);
        gc_buf_init(&zeros);
        int n = 0;
        for (int i = 0; i < ln.nw; i++)
            if (strchr("XYZ", ln.w[i].L)) {
                if (n) {
                    gc_buf_putc(&axes, ' ');
                    gc_buf_putc(&zeros, ' ');
                }
                gc_buf_puts(&axes, ln.w[i].t);
                gc_buf_printf(&zeros, "%c0.", ln.w[i].L);
                n++;
            }
        if (n) {
            V0();
            var(&vs, "axes", gc_buf_str(&axes));
            var(&vs, "zeros", gc_buf_str(&zeros));
            emit(ck, li, "g28-absolute", &vs, NULL);
        }
        gc_buf_free(&axes);
        gc_buf_free(&zeros);
    }

    static const char *const NONMOVE_ALL[] = { "G04", "G10", "G28", "G30", "G50", "G52", "G53", "G65", "G92" };
    int nonMove = 0;
    for (size_t i = 0; i < sizeof NONMOVE_ALL / sizeof *NONMOVE_ALL; i++) {
        const char *k = NONMOVE_ALL[i];
        if (gc_json_get(cycles, k) || gc_json_has_str(gc_json_get(groups, "tool length"), k)) continue;
        if (has(&ln, k)) nonMove = 1;
    }
    const char *axisL = lathe ? "XZUW" : "XYZ";
    int nAxis = 0;
    for (int i = 0; i < ln.nw; i++)
        if (strchr(axisL, ln.w[i].L)) nAxis++;
    const char *centerL = !strcmp(st->plane, "G18") ? "IK" : !strcmp(st->plane, "G19") ? "JK" : "IJ";
    int nCenters = 0;
    for (int i = 0; i < ln.nw; i++)
        if (strchr(centerL, ln.w[i].L)) nCenters++;
    const char *kind = NULL;
    if (nonMove) kind = NULL;
    else if (st->cycle[0] && (cycCode || nAxis)) kind = "cycle";
    else if (nAxis || (is_arc(st->motion) && nCenters))
        kind = !strcmp(st->motion, "G00") ? "rapid" : st->motion[0] ? "feed" : NULL;
    const gc_json *cdef = st->cycle[0] ? gc_json_get(cycles, st->cycle) : NULL;
    char moveName[64];
    const char *motion = st->motion[0] ? st->motion : "null";
    if (kind && !strcmp(kind, "cycle")) snprintf(moveName, sizeof moveName, "%s cycle", st->cycle);
    else if (!strcmp(st->motion, "G01")) snprintf(moveName, sizeof moveName, "G01 move");
    else if (is_arc(st->motion)) snprintf(moveName, sizeof moveName, "%s arc", st->motion);
    else snprintf(moveName, sizeof moveName, "%s move", motion);
    int isFeed = kind && !strcmp(kind, "feed"), isCycle = kind && !strcmp(kind, "cycle"), isRapid = kind && !strcmp(kind, "rapid");
    int needsFeed = (isFeed && !gc_json_has_str(leadCodes, st->motion)) || (isCycle && gc_json_truthy(gc_json_get(cdef, "feed")));
    if (needsFeed) {
        if (!st->F.set) {
            if (!st->noFwarned) {
                V0();
                var(&vs, "move", moveName);
                emit(ck, li, "no-feed-rate", &vs, NULL);
            }
            st->noFwarned = 1;
        } else if (st->Fmode && st->Fmode != st->feed && !st->Fwarned) {
            st->Fwarned = 1;
            char fs[64];
            gc_js_num(st->F.v, fs, sizeof fs);
            gc_num f;
            gc_fmt_num(c, 'F', fs, st->inch, &f);
            V0();
            var(&vs, "f", f.v);
            var(&vs, "old", feed_code_for(c, st->Fmode));
            var(&vs, "new", feed_code_for(c, st->feed));
            const char *reading = feed_unit_for(st->feed, st->inch);
            var(&vs, "reading", *reading ? reading : feed_name(st->feed));
            emit(ck, li, "feed-mode-changed", &vs, NULL);
        }
    }
    int cuts = isFeed || (isCycle && (gc_json_truthy(gc_json_get(cdef, "spindle")) || gc_json_truthy(gc_json_get(cdef, "feed"))) &&
                          !gc_json_truthy(gc_json_get(cdef, "startsSpindle")));
    if (cuts && torchKnown && !gc_json_has_str(Pon, st->torch) && !st->torchWarned) {
        st->torchWarned = 1;
        V0();
        var(&vs, "move", moveName);
        if (st->torch[0]) snprintf(tmp, sizeof tmp, "%s is active", st->torch);
        else snprintf(tmp, sizeof tmp, "it was never turned on");
        var(&vs, "state", tmp);
        emit(ck, li, "torch-off-cut", &vs, NULL);
    }
    if (cuts && !P && strcmp(st->spin, "M03") != 0 && strcmp(st->spin, "M04") != 0 && !st->spinWarned) {
        st->spinWarned = 1;
        V0();
        var(&vs, "move", moveName);
        if (st->spin[0]) snprintf(tmp, sizeof tmp, "%s is active", st->spin);
        else snprintf(tmp, sizeof tmp, "it was never started");
        var(&vs, "spin", tmp);
        emit(ck, li, "spindle-off-feed", &vs, NULL);
    }
    const char *tlLabel = gc_json_get_str(tl, "label");
    if (!tlLabel || !*tlLabel) tlLabel = "G43 H";
    if (!lathe && st->needTlo && kind && !isCycle && get(&ln, 'Z')) {
        st->needTlo = 0;
        V0();
        var(&vs, "line", st->tcLine);
        var(&vs, "tlo", tlLabel);
        emit(ck, li, "tlo-missing", &vs, NULL);
    } else if (!lathe && st->needTlo && isCycle) {
        st->needTlo = 0;
        V0();
        var(&vs, "line", st->tcLine);
        var(&vs, "tlo", tlLabel);
        emit(ck, li, "tlo-missing", &vs, NULL);
    }

    /* Where the tool ends up (radius values for lathe X, which is a diameter) */
    onum p0[3], p1[3];
    for (int i = 0; i < 3; i++) p0[i] = p1[i] = st->pos[i];
    for (int i = 0; i < ln.nw; i++) {
        const word_t *w = &ln.w[i];
        if (!strchr(axisL, w->L)) continue;
        if (gc_is_var_val(w->t)) { /* known only when it runs */
            p1[w->L == 'U' ? 0 : w->L == 'W' ? 2 : w->L - 'X'] = onull();
            continue;
        }
        if (gc_isnan(w->n)) continue;
        double val = w->n * ((lathe && (w->L == 'X' || w->L == 'U')) ? 0.5 : 1);
        if (w->L == 'U' || w->L == 'W') {
            int ax = w->L == 'U' ? 0 : 2;
            p1[ax] = p1[ax].set ? oval(p1[ax].v + val) : onull();
        } else {
            int ax = w->L - 'X';
            if (st->inc) p1[ax] = p1[ax].set ? oval(p1[ax].v + val) : onull();
            else p1[ax] = oval(val);
        }
    }
    if (isFeed && is_arc(st->motion)) {
        int a1 = 0, a2 = 1;
        if (!strcmp(st->plane, "G18")) a2 = 2;
        else if (!strcmp(st->plane, "G19")) {
            a1 = 1;
            a2 = 2;
        }
        const char *rLs = gc_json_get_str(D, "arcRadius");
        char rL[2] = { rLs && *rLs ? rLs[0] : 'R', 0 };
        const word_t *R = get(&ln, rL[0]);
        if (!R && !nCenters) {
            V0();
            var(&vs, "code", st->motion);
            var(&vs, "radius", rL);
            snprintf(tmp, sizeof tmp, "%c and %c", centerL[0], centerL[1]);
            var(&vs, "centers", tmp);
            emit(ck, li, "arc-no-center", &vs, NULL);
        }
        if (R && nCenters) {
            gc_buf b;
            gc_buf_init(&b);
            int n = 0;
            for (int i = 0; i < ln.nw; i++)
                if (strchr(centerL, ln.w[i].L)) {
                    if (n++) gc_buf_puts(&b, " and ");
                    gc_buf_putc(&b, ln.w[i].L);
                }
            V0();
            var(&vs, "radius", rL);
            var(&vs, "centers", gc_buf_str(&b));
            gc_buf_free(&b);
            emit(ck, li, "arc-r-and-ijk", &vs, NULL);
        }
        int known = p0[a1].set && p0[a2].set && p1[a1].set && p1[a2].set;
        const gc_json *tolv = gc_json_get(gc_json_get(D, "arcTolerance"), st->inch ? "inch" : "mm");
        double tol = (tolv && tolv->type == GC_JNUM) ? tolv->num : 0.001;
        if (known) {
            int same = hypot(p1[a1].v - p0[a1].v, p1[a2].v - p0[a2].v) < tol;
            if (R && same) {
                V0();
                var(&vs, "radius", rL);
                snprintf(tmp, sizeof tmp, "%c and %c", centerL[0], centerL[1]);
                var(&vs, "centers", tmp);
                emit(ck, li, "arc-full-circle-r", &vs, NULL);
            }
            if (!R && nCenters) {
                const word_t *o1 = get(&ln, centerL[0]), *o2 = get(&ln, centerL[1]);
                double off1 = (o1 && !gc_isnan(o1->n)) ? o1->n : 0, off2 = (o2 && !gc_isnan(o2->n)) ? o2->n : 0;
                double ca = p0[a1].v + off1, cb = p0[a2].v + off2;
                double r1 = hypot(p0[a1].v - ca, p0[a2].v - cb), r2 = hypot(p1[a1].v - ca, p1[a2].v - cb);
                if (fabs(r1 - r2) > tol) {
                    V0();
                    fmt4(r1, tmp, sizeof tmp);
                    var(&vs, "r1", tmp);
                    fmt4(r2, tmp, sizeof tmp);
                    var(&vs, "r2", tmp);
                    fmt4(fabs(r1 - r2), tmp, sizeof tmp);
                    var(&vs, "diff", tmp);
                    emit(ck, li, "arc-radius-mismatch", &vs, NULL);
                }
            }
        }
    }
    if (compNew && is_arc(st->motion) && isFeed) {
        V0();
        var(&vs, "code", compNew);
        emit(ck, li, "comp-start-on-arc", &vs, NULL);
    }
    const word_t *zW = get(&ln, 'Z');
    if (!lathe && isRapid && zW && !st->inc && p1[2].set && p1[2].v < 0 && st->tloOn) {
        gc_num f;
        gc_fmt_num(c, 'Z', zW->v, st->inch, &f);
        V0();
        var(&vs, "z", f.v);
        emit(ck, li, "rapid-below-zero", &vs, NULL);
    }
    if (has(&ln, "G65")) {
        for (int i = 0; i < 3; i++) st->pos[i] = onull();
    } else if (nonMove) {
        if (has(&ln, "G28") || has(&ln, "G30") || has(&ln, "G53") || has(&ln, "G92") || has(&ln, "G50"))
            for (int i = 0; i < ln.nw; i++) {
                char L = ln.w[i].L;
                if (!strchr(axisL, L)) continue;
                int ax = L == 'U' ? 0 : L == 'W' ? 2 : L - 'X';
                st->pos[ax] = onull();
            }
    } else if (isCycle) {
        if (!lathe) {
            st->pos[0] = p1[0];
            st->pos[1] = p1[1];
        }
    } else {
        for (int i = 0; i < 3; i++) st->pos[i] = p1[i];
    }
#undef V0
}

static int sev_rank(const char *s)
{
    return !strcmp(s, "error") ? 3 : !strcmp(s, "warning") ? 2 : !strcmp(s, "info") ? 1 : 0;
}

void gc_check(gc_ctx *c, gc_analysis *a)
{
    const gc_doc *doc = c->doc;
    int n = doc->nlines;
    checker ck;
    memset(&ck, 0, sizeof ck);
    ck.c = c;
    ck.a = a;
    cstate *st = &ck.st;
    st->feed = c->lathe ? FEED_REV : FEED_MIN;
    st->inch = 1;
    strcpy(st->plane, c->lathe ? "G18" : "G17");
    strcpy(st->comp, "G40");
    char *seen = gc_xcalloc((size_t)(n ? n : 1), 1);
    /* Walk in execution order, following local subprogram calls, then check lines never reached. */
    int stack[8], depth = 0, i = 0;
    long guard = 0, limit = 5000 + 20L * n;
    while (i < n && guard++ < limit) {
        const gc_line *l = &doc->lines[i];
        ck.emitting = !seen[i];
        seen[i] = 1;
        check_line(&ck, i);
        if (gc_is_end(l)) break;
        if (gc_is_return(l) && depth) {
            i = stack[--depth];
            continue;
        }
        char tgt[48];
        int to;
        if (gc_call_target(l, tgt, sizeof tgt) && gc_map_get(&c->labels, tgt, &to) && depth < 8) {
            stack[depth++] = i + 1;
            i = to;
            continue;
        }
        i++;
    }
    for (int li = 0; li < n; li++)
        if (!seen[li]) {
            ck.emitting = 1;
            seen[li] = 1;
            check_line(&ck, li);
        }
    free(seen);
    ck.emitting = 1;
    int anyEnd = 0;
    for (int li = 0; li < n; li++)
        if (gc_is_end(&doc->lines[li])) anyEnd = 1;
    if (!anyEnd) {
        vars vs;
        vs.n = 0;
        const gc_json *ends = gc_json_get(c->dialect, "programEnds");
        gc_buf b;
        gc_buf_init(&b);
        if (ends)
            for (size_t k = 0; k < gc_json_len(ends); k++) {
                if (k) gc_buf_puts(&b, " or ");
                gc_buf_puts(&b, js_or(gc_json_str(ends->items[k])));
            }
        else
            gc_buf_puts(&b, "M30");
        var(&vs, "ends", gc_buf_str(&b));
        gc_buf_free(&b);
        emit(&ck, 0, "no-program-end", &vs, NULL);
    }
    const gc_json *foreign = gc_json_get(c->dialect, "foreign");
    for (int li = 0; li < a->nlines; li++)
        for (int k = 0; k < a->ncells[li]; k++) {
            const gc_cell *cell = &a->cells[li][k];
            if (!(cell->flags & GC_CELL_UNKNOWN)) continue;
            if ((cell->g[0] == 'G' || cell->g[0] == 'M') && gc_is_digit((unsigned char)cell->g[1])) {
                char key[64];
                gc_pad2(cell->g, key, sizeof key);
                if (gc_json_truthy(gc_json_get(foreign, key))) continue;
            }
            vars vs;
            vs.n = 0;
            var(&vs, "word", cell->g);
            emit(&ck, li, "unknown-word", &vs, NULL);
        }
    /* Stable sort: by line, then errors first. */
    for (int x = 1; x < ck.n; x++) {
        gc_problem p = ck.list[x];
        int y = x - 1;
        while (y >= 0 && (ck.list[y].line > p.line || (ck.list[y].line == p.line && sev_rank(ck.list[y].sev) < sev_rank(p.sev)))) {
            ck.list[y + 1] = ck.list[y];
            y--;
        }
        ck.list[y + 1] = p;
    }
    a->problems = ck.list;
    a->nproblems = ck.n;
}
